-- Migration 013 — profiles.is_hidden for developer/test accounts.
--
-- We had three orthogonal flags that overlapped poorly:
--   is_active            — soft-delete, account hidden from views, ~login-blocked
--   is_operational_staff — appears in scheduling/availability/hours
--   (none)               — hidden from Roster / Team Settings entirely
--
-- This adds the third axis. is_hidden=true → never appears in Roster, Team
-- Settings, or any operational view. Used for the 3 sami+* dev accounts.
-- Different from is_active because the account remains functional (Sami can
-- still log in to test); different from is_operational_staff because non-op
-- staff (Travis, Kevin, Mike) DO need to appear in Roster.

ALTER TABLE profiles
  ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_hidden IS 'Developer / test accounts: omit from all staff-facing UI lists. Different from is_active (soft-delete) and is_operational_staff (off the schedule). Account remains functional.';

-- Backfill: hide the dev accounts so The Jar's roster shows real staff only.
UPDATE profiles
SET is_hidden = true
WHERE email IN (
  'sami+adminview@samizoss.com',
  'sami+staffview@samizoss.com',
  'Admin@samizoss.com'
);
