export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { ContentCalendarView } from './content-calendar'

export default async function ContentPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  // Get content for current month ± 1 month
  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split('T')[0]

  const [{ data: content }, { data: staff }] = await Promise.all([
    supabase
      .from('content_calendar')
      .select('*, assigned_profile:profiles!content_calendar_assigned_to_fkey(full_name)')
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date')
      .order('scheduled_time'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', userOrg.orgId)
      .eq('is_active', true)
      .order('full_name'),
  ])

  return (
    <ContentCalendarView
      initialContent={content ?? []}
      orgId={userOrg.orgId}
      staff={staff ?? []}
    />
  )
}
