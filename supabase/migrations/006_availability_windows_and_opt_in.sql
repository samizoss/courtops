-- Migration 006 — Availability windows (release/lock workflow), opt-in availability,
-- and target weekly hours on profiles.
--
-- 1. Admin opens a window covering a date range; staff submits inside; admin
--    locks before building the schedule. Locked = read-only for staff.
-- 2. Inverts is_unavailable -> is_available so blank = no submission and
--    is_available = true is an explicit opt-in.
-- 3. target_weekly_hours reserved on profiles for the future hours-target
--    comparison in the Schedule Builder hours summary (no UI yet).

CREATE TABLE availability_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'locked')),
  opened_by UUID REFERENCES profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES profiles(id),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

ALTER TABLE availability_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage org availability windows"
  ON availability_windows
  FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_availability_windows_org_status
  ON availability_windows(org_id, status);
CREATE INDEX idx_availability_windows_dates
  ON availability_windows(start_date, end_date);

ALTER TABLE availability_entries
  ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT false;

UPDATE availability_entries
SET is_available = NOT is_unavailable;

ALTER TABLE availability_entries DROP COLUMN is_unavailable;

ALTER TABLE profiles
  ADD COLUMN target_weekly_hours NUMERIC(5, 2);

COMMENT ON COLUMN profiles.target_weekly_hours IS
  'Target hours/week for scheduling reference. Null = no target set.';
