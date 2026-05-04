export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { IntegrationSettings } from './integration-settings'

export default async function IntegrationsSettingsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role === 'staff') {
    redirect('/')
  }

  const [{ data: orgSettings }, { data: org }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('*')
      .eq('org_id', userOrg.orgId)
      .single(),
    supabase
      .from('orgs')
      .select('courtreserve_org_id')
      .eq('id', userOrg.orgId)
      .single(),
  ])

  return (
    <IntegrationSettings
      orgSettings={orgSettings}
      courtreserveOrgId={org?.courtreserve_org_id ?? ''}
      orgId={userOrg.orgId}
    />
  )
}
