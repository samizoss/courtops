export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { LeadDetail } from './lead-detail'
import { notFound } from 'next/navigation'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', userOrg.orgId)

  return <LeadDetail lead={lead} staff={staff ?? []} currentUserId={userOrg.userId} />
}
