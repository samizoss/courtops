-- Migration 012 — Same silent-RLS bug as migration 011, on profiles. The
-- Roster operational toggle and Settings → Team active toggle were calling
-- supabase.from('profiles').update(...) directly, which RLS filtered to zero
-- rows. EditStaffModal worked because it goes through update_staff_profile
-- (SECURITY DEFINER RPC). Owners/admins can now UPDATE profiles in their org;
-- users can update their own profile (forward-looking — no UI today, but
-- sensible).

CREATE POLICY "Owners and admins update org profiles"
  ON profiles
  FOR UPDATE
  USING (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
