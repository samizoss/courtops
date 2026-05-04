export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { TeamSettings } from './team-settings'

export default async function TeamSettingsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role === 'staff') {
    redirect('/')
  }

  const [{ data: profiles }, { data: invites }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('org_id', userOrg.orgId)
      .order('full_name'),
    supabase
      .from('org_invites')
      .select('*, inviter:profiles!org_invites_invited_by_fkey(full_name)')
      .eq('org_id', userOrg.orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
  ])

  return (
    <TeamSettings
      profiles={profiles ?? []}
      invites={invites ?? []}
      currentUser={userOrg}
    />
  )
}
