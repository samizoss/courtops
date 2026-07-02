export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { ChannelsSettings, type ContentChannelRow } from './channels-settings'

export default async function ChannelsSettingsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role === 'staff') {
    redirect('/')
  }
  const canEdit = userOrg.role === 'owner' || userOrg.role === 'admin'

  const { data: channels } = await supabase
    .from('content_channels')
    .select('*')
    .eq('org_id', userOrg.orgId)
    .order('display_order')
    .order('created_at')

  return (
    <ChannelsSettings
      channels={(channels ?? []) as ContentChannelRow[]}
      orgId={userOrg.orgId}
      canEdit={canEdit}
    />
  )
}
