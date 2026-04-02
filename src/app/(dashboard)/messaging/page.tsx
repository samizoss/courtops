export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { MessagingInbox } from './messaging-inbox'

export default async function MessagingPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  // Get all messages grouped by lead, with the most recent message per lead
  const { data: messages } = await supabase
    .from('messages')
    .select('*, lead:leads(id, name, phone, status)')
    .order('sent_at', { ascending: false })
    .limit(200)

  // Get messaging config for budget display
  const { data: config } = await supabase
    .from('org_messaging_config')
    .select('*')
    .eq('org_id', userOrg.orgId)
    .single()

  return (
    <MessagingInbox
      initialMessages={messages ?? []}
      config={config}
      orgId={userOrg.orgId}
    />
  )
}
