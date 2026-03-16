export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'

export default async function TasksPage() {
  const supabase = await createClient()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name)')
    .in('status', ['todo', 'in_progress', 'blocked'])
    .order('priority', { ascending: true })
    .order('due_date', { ascending: true })

  const priorityColor: Record<string, string> = {
    high: 'text-red-400 bg-red-500/10',
    medium: 'text-yellow-400 bg-yellow-500/10',
    low: 'text-gray-400 bg-gray-500/10',
  }

  const statusColor: Record<string, string> = {
    todo: 'bg-gray-700',
    in_progress: 'bg-blue-600',
    blocked: 'bg-red-600',
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <p className="text-gray-400 text-sm mt-1">{tasks?.length ?? 0} open tasks</p>
      </div>

      {!tasks?.length ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400">No open tasks.</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800/50">
          {tasks.map((task) => {
            const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
            return (
              <div key={task.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-800/30 transition-colors">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor[task.status]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityColor[task.priority]}`}>
                      {task.priority}
                    </span>
                    <span className="text-[10px] text-gray-600">{task.task_type}</span>
                    {task.assigned_profile && (
                      <span className="text-[10px] text-gray-500">{task.assigned_profile.full_name}</span>
                    )}
                  </div>
                </div>
                {task.due_date && (
                  <span className={`text-xs flex-shrink-0 ${overdue ? 'text-red-400 font-medium' : 'text-gray-500'}`}>
                    {overdue ? 'OVERDUE ' : ''}
                    {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
