export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { AudiencesSettings, type ContentAudienceRow } from './audiences-settings'

export default async function AudiencesSettingsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role === 'staff') {
    redirect('/')
  }
  const canEdit = userOrg.role === 'owner' || userOrg.role === 'admin'

  const { data: audiences } = await supabase
    .from('content_audiences')
    .select('*')
    .eq('org_id', userOrg.orgId)
    .order('display_order')
    .order('name')

  return (
    <AudiencesSettings
      audiences={(audiences ?? []) as ContentAudienceRow[]}
      orgId={userOrg.orgId}
      canEdit={canEdit}
    />
  )
}
