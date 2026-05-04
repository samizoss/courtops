-- Migration 010 — shifts.published_at for the draft -> published state machine.
-- Null = draft (admin-only visibility). Non-null = published (visible to staff).
--
-- Why: Geneva needs to use the magic-schedule button to propose a whole month
-- of shifts at once, review them, edit some, then publish. Today shifts are
-- visible the moment they're inserted — there's no review buffer.

ALTER TABLE shifts
  ADD COLUMN published_at TIMESTAMPTZ NULL;

-- Backfill existing rows so nothing currently in production gets hidden from staff.
UPDATE shifts SET published_at = created_at WHERE published_at IS NULL;

CREATE INDEX idx_shifts_published_at_org ON shifts(org_id, published_at);

COMMENT ON COLUMN shifts.published_at IS
  'When the shift became visible to staff. NULL = draft (only admins see it). Manual admin assigns default to now() on insert; magic-schedule inserts default to NULL so admin can review before publishing.';
