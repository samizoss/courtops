-- Feature 1.6: Operational staff toggle
-- Separates operational staff (on schedule) from system users (dev/consultant accounts)
ALTER TABLE profiles ADD COLUMN is_operational_staff BOOLEAN NOT NULL DEFAULT true;

-- ASAP fix #3: Missed Clock In flag
-- Marks clock records that were entered retroactively by staff
ALTER TABLE time_clock ADD COLUMN is_manual_entry BOOLEAN NOT NULL DEFAULT false;

-- ASAP fix #4: Admin-only note on clock records + edit tracking
ALTER TABLE time_clock ADD COLUMN admin_note TEXT;
ALTER TABLE time_clock ADD COLUMN last_edited_by UUID REFERENCES profiles(id);
ALTER TABLE time_clock ADD COLUMN last_edited_at TIMESTAMPTZ;

-- ASAP fix #4: Full audit log of clock edits
CREATE TABLE time_clock_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_clock_id UUID NOT NULL REFERENCES time_clock(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id),
  edited_by UUID NOT NULL REFERENCES profiles(id),
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL CHECK (action IN ('create', 'edit', 'delete')),
  old_values JSONB,
  new_values JSONB,
  reason TEXT
);

CREATE INDEX idx_time_clock_edits_time_clock_id ON time_clock_edits(time_clock_id);
CREATE INDEX idx_time_clock_edits_org_id ON time_clock_edits(org_id);

ALTER TABLE time_clock_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view edit history for their org"
  ON time_clock_edits FOR SELECT
  USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can insert edit log entries"
  ON time_clock_edits FOR INSERT
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Feature 1.5: Clock notes visibility setting
-- Controls whether staff-added clock notes are visible to all staff or admin-only
ALTER TABLE org_settings ADD COLUMN clock_notes_visibility TEXT NOT NULL DEFAULT 'all_staff'
  CHECK (clock_notes_visibility IN ('all_staff', 'admin_only'));
