export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { GeneralSettings } from './general-settings'

export default async function GeneralSettingsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role === 'staff') {
    redirect('/')
  }

  const [{ data: org }, { data: orgSettings }] = await Promise.all([
    supabase.from('orgs').select('*').eq('id', userOrg.orgId).single(),
    supabase.from('org_settings').select('*').eq('org_id', userOrg.orgId).single(),
  ])

  if (!org) return null

  return <GeneralSettings org={org} orgSettings={orgSettings} />
}
