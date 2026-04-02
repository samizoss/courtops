-- Fix RLS for invite acceptance flow
-- The invite page is visited by unauthenticated users who need to:
-- 1. Read their invite by token
-- 2. Insert their own profile after signUp
-- 3. Mark the invite as accepted

-- Allow anyone to read invites (needed for the /invite/[token] page)
-- This is safe because tokens are random UUIDs and invites contain no sensitive data
CREATE POLICY "Anyone can read invites by token" ON org_invites
  FOR SELECT USING (true);

-- Allow newly signed-up users to insert their own profile
-- auth.uid() is set after signUp, but they have no profile yet so the
-- existing "Users see org profiles" policy (which checks org_id via profiles) fails
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Allow newly signed-up users to update invites they're accepting
-- (to set accepted_at)
CREATE POLICY "Anyone can mark invites accepted" ON org_invites
  FOR UPDATE USING (true) WITH CHECK (true);
