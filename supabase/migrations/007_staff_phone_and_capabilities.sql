-- Migration 007 — Phone + capabilities on profiles, plus an RPC to safely
-- update profile fields (including auth.users.email) from the client.
--
-- Why:
-- 1. Geneva needs to enter real phone numbers + last names for the staff seeded
--    as placeholders during the May walkthrough. The Roster + Team Settings
--    pages had no edit affordance — this unlocks it.
-- 2. Some staff never work the front desk (instructors, league leaders). A
--    single shift role per staffer was too coarse. capabilities[] tags what a
--    staffer CAN do; magic-schedule will assign shifts only to staff whose
--    capabilities include the shift's role.
-- 3. The RPC exists because profiles.email and auth.users.email must stay in
--    sync; a client-side update of profiles.email alone leaves the user unable
--    to log in with the new address. SECURITY DEFINER + caller-role check.

ALTER TABLE profiles
  ADD COLUMN phone TEXT,
  ADD COLUMN capabilities TEXT[] NOT NULL DEFAULT ARRAY['front-desk']::TEXT[];

COMMENT ON COLUMN profiles.phone IS 'E.164 or human-readable phone for staff contact + future Twilio SMS.';
COMMENT ON COLUMN profiles.capabilities IS
  'What kinds of work this staffer can do (front-desk, coaching, instructor, league-leader, management, other). Magic-schedule auto-assigns shifts only to staff whose capabilities include the shift role.';

UPDATE profiles
SET capabilities = ARRAY['management']::TEXT[]
WHERE role IN ('owner', 'admin');

CREATE OR REPLACE FUNCTION update_staff_profile(
  p_profile_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_role TEXT,
  p_target_weekly_hours NUMERIC,
  p_capabilities TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_role TEXT;
  caller_org UUID;
  target_org UUID;
  current_email TEXT;
  email_changed BOOLEAN;
BEGIN
  IF caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT role, org_id INTO caller_role, caller_org
  FROM profiles WHERE id = caller_id;

  IF caller_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('error', 'Only admins can edit staff');
  END IF;

  SELECT org_id, email INTO target_org, current_email
  FROM profiles WHERE id = p_profile_id;

  IF target_org IS NULL THEN
    RETURN jsonb_build_object('error', 'Staff member not found');
  END IF;

  IF target_org <> caller_org THEN
    RETURN jsonb_build_object('error', 'Cross-org edit not allowed');
  END IF;

  email_changed := lower(p_email) <> lower(current_email);

  IF email_changed THEN
    UPDATE auth.users
    SET email = p_email,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = p_profile_id;
  END IF;

  UPDATE profiles
  SET full_name = COALESCE(p_full_name, full_name),
      email = COALESCE(p_email, email),
      phone = p_phone,
      role = COALESCE(p_role, role),
      target_weekly_hours = p_target_weekly_hours,
      capabilities = COALESCE(p_capabilities, capabilities)
  WHERE id = p_profile_id;

  RETURN jsonb_build_object(
    'success', true,
    'email_changed', email_changed
  );
END;
$$;

REVOKE ALL ON FUNCTION update_staff_profile FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_staff_profile TO authenticated;
