import { createClient } from '@/lib/supabase/server'

/**
 * Get the current user's org_id from their profile.
 * Call from server components only.
 */
export async function getUserOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return {
    userId: user.id,
    orgId: profile.org_id as string,
    role: profile.role as string,
    fullName: profile.full_name as string,
  }
}
