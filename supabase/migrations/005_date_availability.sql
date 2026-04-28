-- Date-specific availability entries (Phase 1.1 — Monthly availability submission)
-- Replaces the implicit "weekly recurring" model for actual schedule planning.
-- The existing `availability` table stays (used as "default weekly availability")
-- — this is the per-date submission Geneva actually uses to build the schedule.
--
-- Free-text `shifts` field matches Geneva's existing format: "7 - 230",
-- "5 - 7, 10 - 230, 5-630", "open - 9", "anytime", etc. We do not parse it
-- — admins read it on the consolidated view and use it to build the schedule.

CREATE TABLE availability_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  shifts TEXT,                    -- free-text like "7 - 230" or "open - 9, 5 - close"
  is_unavailable BOOLEAN NOT NULL DEFAULT false,  -- explicit "I cannot work this day"
  notes TEXT,                     -- optional context for admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id, entry_date)
);

ALTER TABLE availability_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage org availability entries"
  ON availability_entries
  FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_availability_entries_org_date
  ON availability_entries(org_id, entry_date);

CREATE INDEX idx_availability_entries_user_date
  ON availability_entries(user_id, entry_date);
