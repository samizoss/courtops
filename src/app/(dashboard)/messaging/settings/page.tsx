export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { MessagingSettings } from './messaging-settings'

export default async function MessagingSettingsPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  const { data: config } = await supabase
    .from('org_messaging_config')
    .select('*')
    .eq('org_id', userOrg.orgId)
    .single()

  return (
    <MessagingSettings
      config={config}
      orgId={userOrg.orgId}
    />
  )
}
