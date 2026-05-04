-- Migration 014 — extend update_staff_profile RPC to also set is_hidden so
-- the EditStaffModal can flip dev/test profiles invisible from the UI.
-- Drop all existing overloads first since prior migrations stacked them.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT format('DROP FUNCTION IF EXISTS public.update_staff_profile(%s);', oidvectortypes(p.proargtypes)) AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_staff_profile'
  LOOP
    EXECUTE fn.stmt;
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION update_staff_profile(
  p_profile_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_role TEXT,
  p_target_weekly_hours NUMERIC,
  p_capabilities TEXT[],
  p_is_hidden BOOLEAN DEFAULT NULL
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

  derived_full_name := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  UPDATE profiles
  SET first_name = COALESCE(p_first_name, first_name),
      last_name  = COALESCE(p_last_name, last_name),
      full_name  = CASE WHEN derived_full_name <> '' THEN derived_full_name ELSE full_name END,
      email      = COALESCE(p_email, email),
      phone      = p_phone,
      role       = COALESCE(p_role, role),
      target_weekly_hours = p_target_weekly_hours,
      capabilities = COALESCE(p_capabilities, capabilities),
      is_hidden  = COALESCE(p_is_hidden, is_hidden)
  WHERE id = p_profile_id;

  RETURN jsonb_build_object(
    'success', true,
    'email_changed', email_changed
  );
END;
$$;

REVOKE ALL ON FUNCTION update_staff_profile FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_staff_profile TO authenticated;
