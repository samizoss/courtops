-- Migration 015 — availability_window_assignees: per-window list of staff
-- expected to submit availability for that window.
--
-- Why: Sami flagged 2026-05-04 that "is_operational_staff" was conflating
-- two concepts — "schedulable" (can work shifts) and "expected to submit
-- availability monthly". Travis is schedulable (could work front desk
-- someday) but doesn't submit availability monthly. Mike isn't schedulable
-- at all. The current "X/Y submitted" counter shows Y = all schedulable
-- staff, which inflates the denominator with people who shouldn't be
-- expected to submit.
--
-- Solution: keep schedulable as a profile flag (is_operational_staff,
-- now UI-labelled "On schedule"). Add this per-window assignee list
-- alongside it. When admin opens a new window, assignees default to the
-- previous window's assignees (carry-forward — important for large clubs
-- that don't want to re-pick every month).

CREATE TABLE availability_window_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  window_id UUID NOT NULL REFERENCES availability_windows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(window_id, user_id)
);

ALTER TABLE availability_window_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see org window assignees"
  ON availability_window_assignees
  FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Owners and admins manage org window assignees"
  ON availability_window_assignees
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE INDEX idx_window_assignees_window ON availability_window_assignees(window_id);
CREATE INDEX idx_window_assignees_user ON availability_window_assignees(user_id);

-- Backfill: existing open + locked windows get every currently-schedulable,
-- non-hidden staffer in their org as an assignee, so the counter doesn't
-- read "0/0 submitted" the moment this ships.
INSERT INTO availability_window_assignees (org_id, window_id, user_id)
SELECT w.org_id, w.id, p.id
FROM availability_windows w
JOIN profiles p
  ON p.org_id = w.org_id
  AND p.is_operational_staff = true
  AND p.is_active = true
  AND p.is_hidden = false
ON CONFLICT (window_id, user_id) DO NOTHING;

COMMENT ON TABLE availability_window_assignees IS
  'Staff expected to submit availability for a specific window. Defaults from the previous window''s assignees on creation (carry-forward). Decoupled from is_operational_staff so per-window adjustments are possible.';
