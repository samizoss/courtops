export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { StaffModule } from './staff-module'

export default async function StaffPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
  // Pull availability + shifts for -1 week to +6 weeks. Calendar consumers
  // refetch on navigation to cover further horizons.
  const availabilityRangeStart = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
  const availabilityRangeEnd = new Date(now.getTime() + 42 * 86400000).toISOString().split('T')[0]

  const isAdmin = userOrg.role === 'owner' || userOrg.role === 'admin'

  // Build the shifts query — admins see drafts AND published; non-admins only see published.
  const shiftsQuery = supabase
    .from('shifts')
    .select('*, profile:profiles!shifts_user_id_fkey(full_name)')
    .gte('shift_date', availabilityRangeStart)
    .lte('shift_date', availabilityRangeEnd)
    .order('shift_date')
    .order('start_time')
  const shiftsScopedQuery = isAdmin ? shiftsQuery : shiftsQuery.not('published_at', 'is', null)

  const [
    { data: profiles },
    { data: activeClocks },
    { data: timeOffRequests },
    { data: shifts },
    { data: shiftSwaps },
    { data: availability },
    { data: availabilityEntries },
    { data: availabilityWindows },
    { data: availabilitySubmissions },
    { data: availabilityWindowAssignees },
    { data: recentClocks },
    { data: orgSettings },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('org_id', userOrg.orgId).eq('is_active', true).eq('is_hidden', false).order('full_name'),
    supabase.from('time_clock').select('*, profile:profiles!time_clock_user_id_fkey(full_name)').is('clock_out', null),
    supabase.from('time_off_requests').select('*, profile:profiles!time_off_requests_user_id_fkey(full_name), reviewer:profiles!time_off_requests_reviewed_by_fkey(full_name)').order('created_at', { ascending: false }).limit(20),
    shiftsScopedQuery,
    supabase.from('shift_swaps').select('*').eq('org_id', userOrg.orgId).in('status', ['open', 'claimed']).order('created_at', { ascending: false }),
    supabase.from('availability').select('*, profile:profiles!availability_user_id_fkey(full_name)').order('day_of_week'),
    supabase.from('availability_entries').select('*').eq('org_id', userOrg.orgId).gte('entry_date', availabilityRangeStart).lte('entry_date', availabilityRangeEnd),
    supabase.from('availability_windows').select('*').eq('org_id', userOrg.orgId).gte('end_date', availabilityRangeStart).lte('start_date', availabilityRangeEnd).order('start_date', { ascending: false }),
    supabase.from('availability_submissions').select('*').eq('org_id', userOrg.orgId),
    supabase.from('availability_window_assignees').select('*').eq('org_id', userOrg.orgId),
    supabase.from('time_clock').select('*, profile:profiles!time_clock_user_id_fkey(full_name)').gte('clock_in', weekAgo).order('clock_in', { ascending: false }).limit(50),
    supabase.from('org_settings').select('open_time, close_time, open_days, staff_arrive_before_min, staff_depart_after_min, daily_hours, clock_notes_visibility, week_start_day, min_shift_hours, min_coverage_count, default_target_hours').eq('org_id', userOrg.orgId).single(),
  ])

  const clockNotesVisibility = (orgSettings?.clock_notes_visibility as 'all_staff' | 'admin_only' | undefined) ?? 'all_staff'
  const weekStartDay = (orgSettings?.week_start_day as number | undefined) ?? 0
  const orgHours = orgSettings
    ? {
        open_time: orgSettings.open_time,
        close_time: orgSettings.close_time,
        open_days: orgSettings.open_days,
        staff_arrive_before_min: orgSettings.staff_arrive_before_min,
        staff_depart_after_min: orgSettings.staff_depart_after_min,
        daily_hours: orgSettings.daily_hours,
      }
    : undefined

  const schedulingSettings = orgSettings
    ? {
        min_shift_hours: Number(orgSettings.min_shift_hours) || 3,
        min_coverage_count: Number(orgSettings.min_coverage_count) || 1,
        default_target_hours: Number(orgSettings.default_target_hours) || 20,
      }
    : undefined

  return (
    <StaffModule
      profiles={profiles ?? []}
      activeClocks={activeClocks ?? []}
      timeOffRequests={timeOffRequests ?? []}
      shifts={shifts ?? []}
      shiftSwaps={shiftSwaps ?? []}
      availability={availability ?? []}
      availabilityEntries={availabilityEntries ?? []}
      availabilityWindows={availabilityWindows ?? []}
      availabilitySubmissions={availabilitySubmissions ?? []}
      availabilityWindowAssignees={availabilityWindowAssignees ?? []}
      recentClocks={recentClocks ?? []}
      currentUser={userOrg}
      orgHours={orgHours}
      schedulingSettings={schedulingSettings}
      clockNotesVisibility={clockNotesVisibility}
      weekStartDay={weekStartDay}
    />
  )
}
