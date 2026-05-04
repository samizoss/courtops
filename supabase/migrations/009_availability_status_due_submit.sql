-- Migration 009 — Availability cell status (Available/Unavailable explicit toggles),
-- window due dates, and per-staffer-per-window submission tracking.
--
-- Geneva walkthrough 2026-04-28 follow-ups #3, #4, #5:
--
-- 1. Re-add `is_unavailable` to availability_entries. Migration 006 dropped it
--    when the model flipped to opt-in. Geneva's feedback after seeing the
--    opt-in UI: she wants two explicit affordances per cell — "Available all
--    day" (green) and "Unavailable all day" (red). They're mutually exclusive
--    states (UI enforces it) but live in two columns so both states are
--    truly explicit and a row with neither bool set is meaningfully different
--    from a deleted row only because of saved hours/notes — which we delete.
--
-- 2. `due_date` on availability_windows. Geneva: "I am hounding people for
--    their availability — give me a deadline I can put on the window."
--    Optional. Shown on the window pill ("Due May 15") and in the open-window
--    form as a third date input.
--
-- 3. New table `availability_submissions` — one row per (window, user) with
--    submitted_at timestamp. UI uses this to (a) flip cells inside a window
--    that the user submitted to read-only for that user, (b) show a
--    "Submit availability" or "Edit submission" button, (c) show admins a
--    "X/Y submitted" count on each window pill. Edit reopens the submission
--    by deleting the row if the window is still open; if the window is
--    locked the edit is blocked (UI-side; users would have to use shift-swap
--    instead, which doesn't exist yet but the message stands).

-- 1. Add is_unavailable BACK to availability_entries.
ALTER TABLE availability_entries
  ADD COLUMN is_unavailable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN availability_entries.is_unavailable IS
  'Explicit "I cannot work this day" flag. Mutually exclusive with is_available (UI-enforced). Both false = no submission.';

-- 2. Add due_date to availability_windows.
ALTER TABLE availability_windows
  ADD COLUMN due_date DATE;

COMMENT ON COLUMN availability_windows.due_date IS
  'Optional deadline for staff to submit availability inside this window. Null = no deadline.';

-- 3. New table for per-staffer-per-window submission state.
CREATE TABLE availability_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  window_id UUID NOT NULL REFERENCES availability_windows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (window_id, user_id)
);

ALTER TABLE availability_submissions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own submission row; admins can manage anyone's in
-- their org. Using a single FOR ALL policy keyed on org_id covers select,
-- insert, update, delete uniformly within org scope.
CREATE POLICY "Users manage own submission, admins manage org"
  ON availability_submissions
  FOR ALL
  USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE INDEX idx_availability_submissions_window ON availability_submissions(window_id);
CREATE INDEX idx_availability_submissions_user ON availability_submissions(user_id);
CREATE INDEX idx_availability_submissions_org ON availability_submissions(org_id);
