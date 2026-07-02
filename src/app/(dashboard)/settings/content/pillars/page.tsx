export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { PillarsSettings, type ContentPillarRow } from './pillars-settings'

export default async function PillarsSettingsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role === 'staff') {
    redirect('/')
  }
  const canEdit = userOrg.role === 'owner' || userOrg.role === 'admin'

  const { data: pillars } = await supabase
    .from('content_pillars')
    .select('*')
    .eq('org_id', userOrg.orgId)
    .order('display_order')
    .order('name')

  return (
    <PillarsSettings
      pillars={(pillars ?? []) as ContentPillarRow[]}
      orgId={userOrg.orgId}
      canEdit={canEdit}
    />
  )
}
