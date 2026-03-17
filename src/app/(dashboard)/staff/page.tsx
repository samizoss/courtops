export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { StaffModule } from './staff-module'

export default async function StaffPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const [
    { data: profiles },
    { data: activeClocks },
    { data: timeOffRequests },
    { data: shifts },
    { data: availability },
    { data: recentClocks },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('org_id', userOrg.orgId).order('full_name'),
    supabase.from('time_clock').select('*, profile:profiles(full_name)').is('clock_out', null),
    supabase.from('time_off_requests').select('*, profile:profiles(full_name), reviewer:profiles!time_off_requests_reviewed_by_fkey(full_name)').order('created_at', { ascending: false }).limit(20),
    supabase.from('shifts').select('*, profile:profiles(full_name)').gte('shift_date', today).lte('shift_date', weekFromNow).order('shift_date').order('start_time'),
    supabase.from('availability').select('*, profile:profiles(full_name)').order('day_of_week'),
    supabase.from('time_clock').select('*, profile:profiles(full_name)').gte('clock_in', weekAgo).order('clock_in', { ascending: false }).limit(50),
  ])

  return (
    <StaffModule
      profiles={profiles ?? []}
      activeClocks={activeClocks ?? []}
      timeOffRequests={timeOffRequests ?? []}
      shifts={shifts ?? []}
      availability={availability ?? []}
      recentClocks={recentClocks ?? []}
      currentUser={userOrg}
    />
  )
}
