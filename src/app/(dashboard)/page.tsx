export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'

async function getStats(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today = new Date().toISOString().split('T')[0]

  const [
    { count: totalLeads },
    { count: newLeads },
    { count: overdueLeads },
    { count: completionsToday },
    { count: totalChecklistItems },
    { count: openTasks },
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).lt('next_action_date', today).not('status', 'in', '("converted","lost","archived")'),
    supabase.from('checklist_completions').select('*', { count: 'exact', head: true }).eq('completed_date', today),
    supabase.from('checklist_items').select('*', { count: 'exact', head: true }),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['todo', 'in_progress', 'blocked']),
  ])

  return {
    totalLeads: totalLeads ?? 0,
    newLeads: newLeads ?? 0,
    overdueLeads: overdueLeads ?? 0,
    checklistProgress: totalChecklistItems ? Math.round(((completionsToday ?? 0) / totalChecklistItems) * 100) : 0,
    completionsToday: completionsToday ?? 0,
    totalChecklistItems: totalChecklistItems ?? 0,
    openTasks: openTasks ?? 0,
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const stats = await getStats(supabase)

  const cards = [
    { label: 'Today\'s Checklists', value: `${stats.completionsToday}/${stats.totalChecklistItems}`, sub: `${stats.checklistProgress}% complete`, color: 'border-green-500' },
    { label: 'New Leads', value: stats.newLeads, sub: `${stats.totalLeads} total in pipeline`, color: 'border-blue-500' },
    { label: 'Overdue Follow-ups', value: stats.overdueLeads, sub: 'Need action today', color: stats.overdueLeads > 0 ? 'border-red-500' : 'border-gray-700' },
    { label: 'Open Tasks', value: stats.openTasks, sub: 'Across all types', color: 'border-orange-500' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`bg-gray-900 rounded-xl p-5 border-l-4 ${card.color}`}>
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{card.label}</p>
            <p className="text-3xl font-bold mt-2">{card.value}</p>
            <p className="text-gray-500 text-sm mt-1">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
