-- Migration 008 — Split full_name into first_name + last_name on profiles
--
-- Why:
-- Sami's feedback during the 2026-05-04 Geneva walkthrough cycle: showing a
-- combined "full name" everywhere is confusing — first/last as separate fields
-- is "so much more helpful." We split storage but KEEP full_name populated
-- (derived from first + last on every write via the RPC) so existing display
-- code that reads full_name continues to work without sweeping changes.
--
-- Backfill: first_name = first whitespace-delimited token, last_name = the
-- remainder (or empty string when the existing full_name is a single token).

ALTER TABLE profiles
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name TEXT;

UPDATE profiles
SET
  first_name = CASE
    WHEN full_name IS NULL OR btrim(full_name) = '' THEN ''
    WHEN position(' ' IN btrim(full_name)) = 0 THEN btrim(full_name)
    ELSE split_part(btrim(full_name), ' ', 1)
  END,
  last_name = CASE
    WHEN full_name IS NULL OR btrim(full_name) = '' THEN ''
    WHEN position(' ' IN btrim(full_name)) = 0 THEN ''
    ELSE btrim(substring(btrim(full_name) FROM position(' ' IN btrim(full_name)) + 1))
  END;

COMMENT ON COLUMN profiles.first_name IS 'Staff first name. Authoritative — full_name is derived from first_name || '' '' || last_name on save.';
COMMENT ON COLUMN profiles.last_name IS 'Staff last name. May be empty for single-name placeholders. full_name is derived from first_name || '' '' || last_name on save.';

-- Replace update_staff_profile RPC: it now takes p_first_name + p_last_name
-- (instead of p_full_name) and writes all three columns. full_name is always
-- derived as trim(first || ' ' || last) so display code keeps working.

DROP FUNCTION IF EXISTS update_staff_profile(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT[]);

CREATE OR REPLACE FUNCTION update_staff_profile(
  p_profile_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
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
  derived_full_name TEXT;
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

  derived_full_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  UPDATE profiles
  SET first_name = COALESCE(p_first_name, first_name),
      last_name = COALESCE(p_last_name, last_name),
      full_name = derived_full_name,
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
