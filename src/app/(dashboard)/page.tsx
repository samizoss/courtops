export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { TaskCheckbox } from './dashboard-interactive'

function getRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function activityIcon(type: string): string {
  switch (type) {
    case 'call': return '\u{1F4DE}'
    case 'text': return '\u{1F4AC}'
    case 'email': return '\u2709'
    case 'in_person': return '\u{1F91D}'
    case 'voicemail': return '\u{1F4E8}'
    case 'note': return '\u{1F4DD}'
    case 'status_change': return '\u{1F504}'
    case 'system': return '\u2699'
    default: return '\u25CF'
  }
}

export default async function DashboardPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const role = userOrg.role
  const canSeePipeline = role === 'owner'
  const canSeeTasks = role === 'owner' || role === 'admin'

  // Build queries based on role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queries: any[] = [
    // 0: checklist completions today (everyone)
    supabase.from('checklist_completions').select('*', { count: 'exact', head: true }).eq('completed_date', today),
    // 1: total checklist items (everyone)
    supabase.from('checklist_items').select('*', { count: 'exact', head: true }),
    // 2: unread notifications (everyone)
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userOrg.userId).eq('read', false),
    // 3: who's clocked in (everyone)
    supabase.from('time_clock').select('id, user_id, clock_in, profile:profiles(full_name, avatar_url)').is('clock_out', null).order('clock_in', { ascending: true }),
    // 4: pending time off (everyone)
    supabase.from('time_off_requests').select('id, start_date, end_date, reason, status, profile:profiles(full_name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
  ]

  // Pipeline queries (owner only)
  if (canSeePipeline) {
    queries.push(
      // 5: total leads
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      // 6: new leads
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'new'),
      // 7: overdue leads
      supabase.from('leads').select('*', { count: 'exact', head: true }).lt('next_action_date', today).not('status', 'in', '("converted","lost","archived")'),
      // 8: cadence due
      supabase.from('leads').select('id, name, pipeline_type, current_stage_id, next_action_date, assigned_to, assigned_profile:profiles!leads_assigned_to_fkey(full_name), stage:pipeline_stages!leads_current_stage_id_fkey(name, cadence_days)').lte('next_action_date', today).not('status', 'in', '("converted","lost","archived")').order('next_action_date', { ascending: true }).limit(15),
      // 9: recent activity
      supabase.from('activities').select('id, activity_type, notes, created_at, lead:leads(id, name)').order('created_at', { ascending: false }).limit(10),
    )
  }

  // Task queries (owner + admin)
  if (canSeeTasks) {
    queries.push(
      // open tasks count
      supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['todo', 'in_progress', 'blocked']),
      // my tasks today
      supabase.from('tasks').select('id, title, priority, due_date, status').eq('assigned_to', userOrg.userId).in('status', ['todo', 'in_progress', 'blocked']).lte('due_date', today).order('priority', { ascending: true }).order('due_date', { ascending: true }).limit(10),
    )
  }

  const results = await Promise.allSettled(queries)
  const val = (i: number) => results[i]?.status === 'fulfilled' ? results[i].value : { count: 0, data: [] }

  // Everyone sees these
  const completionsToday = val(0).count ?? 0
  const totalChecklistItems = val(1).count ?? 0
  const unreadNotifications = val(2).count ?? 0
  const clockedIn = val(3).data ?? []
  const pendingTimeOff = val(4).data ?? []

  // Pipeline (owner only)
  let totalLeads = 0, newLeads = 0, overdueLeads = 0
  let cadenceDue: Record<string, unknown>[] = []
  let recentActivities: Record<string, unknown>[] = []
  if (canSeePipeline) {
    totalLeads = val(5).count ?? 0
    newLeads = val(6).count ?? 0
    overdueLeads = val(7).count ?? 0
    cadenceDue = (val(8).data ?? []) as Record<string, unknown>[]
    recentActivities = (val(9).data ?? []) as Record<string, unknown>[]
  }

  // Tasks (owner + admin)
  let openTasks = 0
  let myTasks: Record<string, unknown>[] = []
  if (canSeeTasks) {
    const taskOffset = canSeePipeline ? 10 : 5
    openTasks = val(taskOffset).count ?? 0
    myTasks = (val(taskOffset + 1).data ?? []) as Record<string, unknown>[]
  }

  // Build stat cards based on role
  const cards: { label: string; value: string | number; sub: string; color: string; href?: string }[] = [
    {
      label: "Today's Checklists",
      value: `${completionsToday}/${totalChecklistItems}`,
      sub: `${totalChecklistItems ? Math.round((completionsToday / totalChecklistItems) * 100) : 0}% complete`,
      color: 'border-green-500',
    },
  ]

  if (canSeePipeline) {
    cards.push(
      { label: 'New Leads', value: newLeads, sub: `${totalLeads} total in pipeline`, color: 'border-blue-500' },
      { label: 'Overdue Follow-ups', value: overdueLeads, sub: 'Need action today', color: overdueLeads > 0 ? 'border-red-500' : 'border-gray-700' },
    )
  }

  if (canSeeTasks) {
    cards.push({ label: 'Open Tasks', value: openTasks, sub: 'Across all types', color: 'border-orange-500' })
  }

  cards.push({
    label: 'Unread Notifications',
    value: unreadNotifications,
    sub: unreadNotifications > 0 ? 'View notifications' : 'All caught up',
    color: unreadNotifications > 0 ? 'border-purple-500' : 'border-gray-700',
    href: '/notifications',
  })

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((card) => {
          const inner = (
            <>
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{card.label}</p>
              <p className="text-3xl font-bold mt-2">{card.value}</p>
              <p className="text-gray-500 text-sm mt-1">{card.sub}</p>
            </>
          )
          if (card.href) {
            return (
              <Link key={card.label} href={card.href} className={`bg-gray-900 rounded-xl p-5 border-l-4 ${card.color} hover:bg-gray-800 transition-colors`}>
                {inner}
              </Link>
            )
          }
          return (
            <div key={card.label} className={`bg-gray-900 rounded-xl p-5 border-l-4 ${card.color}`}>
              {inner}
            </div>
          )
        })}
      </div>

      {/* Cadence Due Today (owner only) */}
      {canSeePipeline && cadenceDue.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-5 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Cadence Due Today</h3>
            <Link href="/pipeline/overdue" className="text-xs text-orange-400 hover:text-orange-300 transition-colors">View all overdue</Link>
          </div>
          <div className="divide-y divide-gray-800/50">
            {cadenceDue.map((lead) => {
              const stage = lead.stage as { name: string; cadence_days: number | null } | null
              const assignedProfile = lead.assigned_profile as { full_name: string } | null
              const nextDate = lead.next_action_date as string
              const daysOverdue = Math.floor((Date.now() - new Date(nextDate).getTime()) / 86400000)
              return (
                <div key={lead.id as string} className="flex items-center gap-3 py-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${daysOverdue > 3 ? 'bg-red-500' : daysOverdue > 0 ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                  <Link href={`/pipeline/${lead.id}`} className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate hover:text-orange-400 transition-colors">{lead.name as string}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {lead.pipeline_type ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 uppercase">{String(lead.pipeline_type)}</span> : null}
                      {stage ? <span className="text-[10px] text-gray-500">{stage.name}</span> : null}
                      {assignedProfile ? <span className="text-[10px] text-gray-600">{assignedProfile.full_name}</span> : null}
                    </div>
                  </Link>
                  <span className={`text-xs flex-shrink-0 font-medium ${daysOverdue > 3 ? 'text-red-400' : daysOverdue > 0 ? 'text-yellow-400' : 'text-blue-400'}`}>
                    {daysOverdue > 0 ? `${daysOverdue}d overdue` : 'Due today'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom Grid */}
      <div className={`grid grid-cols-1 ${canSeePipeline ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6 mt-8`}>
        {/* Who's On Shift (everyone) */}
        <div className="bg-gray-900 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Who&apos;s On Shift</h3>
          {!clockedIn || clockedIn.length === 0 ? (
            <p className="text-gray-500 text-sm">No one clocked in</p>
          ) : (
            <div className="space-y-3">
              {(clockedIn as Record<string, unknown>[]).map((entry) => {
                const profile = (entry.profile ?? entry.profiles) as { full_name: string; avatar_url: string | null } | null
                const name = profile?.full_name ?? 'Unknown'
                const avatarUrl = profile?.avatar_url
                const clockInTime = new Date(entry.clock_in as string).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                return (
                  <div key={entry.id as string} className="flex items-center gap-3">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-300">{name.charAt(0).toUpperCase()}</div>
                    )}
                    <div>
                      <p className="text-sm text-gray-200">{name}</p>
                      <p className="text-xs text-gray-500">Since {clockInTime}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pending Time Off (everyone sees) */}
          {(pendingTimeOff as Record<string, unknown>[]).length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-800">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pending Time Off</h4>
              <div className="space-y-2">
                {(pendingTimeOff as Record<string, unknown>[]).map((req) => {
                  const profile = req.profile as { full_name: string } | null
                  return (
                    <div key={req.id as string} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-300">{profile?.full_name ?? 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{req.start_date as string} — {req.end_date as string}</p>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">Pending</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* My Tasks Today (owner + admin) */}
        {canSeeTasks && (
          <div className="bg-gray-900 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">My Tasks Today</h3>
              <Link href="/tasks" className="text-xs text-orange-400 hover:text-orange-300 transition-colors">View all</Link>
            </div>
            {myTasks.length === 0 ? (
              <p className="text-gray-500 text-sm">No tasks due today</p>
            ) : (
              <div className="space-y-2">
                {myTasks.map((task) => (
                  <TaskCheckbox
                    key={task.id as string}
                    task={{ id: task.id as string, title: task.title as string, priority: task.priority as string, due_date: task.due_date as string, status: task.status as string }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Activity (owner only) */}
        {canSeePipeline && (
          <div className="bg-gray-900 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Recent Activity</h3>
              <Link href="/pipeline" className="text-xs text-orange-400 hover:text-orange-300 transition-colors">View all</Link>
            </div>
            {recentActivities.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => {
                  const lead = activity.lead as { id: string; name: string } | null
                  const notes = activity.notes as string | null
                  return (
                    <div key={activity.id as string} className="flex items-start gap-3">
                      <span className="text-base mt-0.5 shrink-0">{activityIcon(activity.activity_type as string)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400 capitalize">{(activity.activity_type as string).replace('_', ' ')}</span>
                          {lead && (
                            <>
                              <span className="text-xs text-gray-600">&middot;</span>
                              <Link href={`/pipeline/${lead.id}`} className="text-xs text-orange-400 hover:text-orange-300 truncate transition-colors">{lead.name}</Link>
                            </>
                          )}
                        </div>
                        {notes && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{notes}</p>}
                        <p className="text-[10px] text-gray-600 mt-0.5">{getRelativeTime(activity.created_at as string)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
