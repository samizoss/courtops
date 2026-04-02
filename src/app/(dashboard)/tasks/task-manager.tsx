'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { TaskStatus, TaskPriority, TaskType } from '@/types/database'

interface TaskWithProfile {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  task_type: TaskType
  assigned_to: string | null
  due_date: string | null
  completed_at: string | null
  created_at: string
  assigned_profile: { full_name: string } | null
}

interface StaffMember {
  id: string
  full_name: string
}

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const typeOptions: { value: TaskType; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'content', label: 'Content' },
  { value: 'janitorial', label: 'Janitorial' },
  { value: 'sales', label: 'Sales' },
  { value: 'events', label: 'Events' },
  { value: 'facility', label: 'Facility' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'other', label: 'Other' },
]

const statusOptions: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'todo', label: 'To Do', color: 'bg-gray-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-600' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-600' },
  { value: 'done', label: 'Done', color: 'bg-green-600' },
]

const priorityColor: Record<string, string> = {
  high: 'text-red-400 bg-red-500/10',
  medium: 'text-yellow-400 bg-yellow-500/10',
  low: 'text-gray-400 bg-gray-500/10',
}

const statusColor: Record<string, string> = {
  todo: 'bg-gray-700',
  in_progress: 'bg-blue-600',
  blocked: 'bg-red-600',
  done: 'bg-green-600',
}

type FilterTab = 'open' | 'done' | 'all'

export function TaskManager({
  initialTasks,
  orgId,
  staff,
}: {
  initialTasks: TaskWithProfile[]
  orgId: string
  staff: StaffMember[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState<FilterTab>('open')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const filtered = tasks.filter((t) => {
    if (filter === 'open') return t.status !== 'done'
    if (filter === 'done') return t.status === 'done'
    return true
  })

  const openCount = tasks.filter((t) => t.status !== 'done').length
  const doneCount = tasks.filter((t) => t.status === 'done').length

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const form = new FormData(e.currentTarget)

    const { data, error: err } = await supabase
      .from('tasks')
      .insert({
        org_id: orgId,
        title: form.get('title') as string,
        description: (form.get('description') as string) || null,
        priority: form.get('priority') as TaskPriority,
        task_type: form.get('task_type') as TaskType,
        assigned_to: (form.get('assigned_to') as string) || null,
        due_date: (form.get('due_date') as string) || null,
        status: 'todo',
      })
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name)')
      .single()

    if (err) {
      setError(err.message)
    } else if (data) {
      setTasks((prev) => [data, ...prev])
      setShowForm(false)
    }
    setLoading(false)
  }

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'done') updates.completed_at = new Date().toISOString()
    else updates.completed_at = null

    const { error: err } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)

    if (!err) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null }
            : t
        )
      )
    }
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>, taskId: string) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const form = new FormData(e.currentTarget)

    const { data, error: err } = await supabase
      .from('tasks')
      .update({
        title: form.get('title') as string,
        description: (form.get('description') as string) || null,
        priority: form.get('priority') as TaskPriority,
        task_type: form.get('task_type') as TaskType,
        assigned_to: (form.get('assigned_to') as string) || null,
        due_date: (form.get('due_date') as string) || null,
        status: form.get('status') as TaskStatus,
      })
      .eq('id', taskId)
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name)')
      .single()

    if (err) {
      setError(err.message)
    } else if (data) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data : t)))
      setEditingId(null)
    }
    setLoading(false)
  }

  async function handleDelete(taskId: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const { error: err } = await supabase.from('tasks').delete().eq('id', taskId)

    if (!err) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      setEditingId(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Tasks</h2>
          <p className="text-gray-400 text-sm mt-1">{openCount} open · {doneCount} completed</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null) }}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New Task
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {([
          ['open', `Open (${openCount})`],
          ['done', `Done (${doneCount})`],
          ['all', 'All'],
        ] as [FilterTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === key
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* New task form */}
      {showForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-4">
          <h3 className="text-sm font-semibold text-white mb-4">New Task</h3>
          <TaskForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            loading={loading}
            staff={staff}
          />
        </div>
      )}

      {/* Task list */}
      {!filtered.length ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400">
            {filter === 'done' ? 'No completed tasks yet.' : 'No open tasks.'}
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800/50">
          {filtered.map((task) => {
            const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
            const isEditing = editingId === task.id

            if (isEditing) {
              return (
                <div key={task.id} className="p-5">
                  <TaskForm
                    task={task}
                    onSubmit={(e) => handleSaveEdit(e, task.id)}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => handleDelete(task.id)}
                    loading={loading}
                    staff={staff}
                  />
                </div>
              )
            }

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-800/30 transition-colors group"
              >
                {/* Quick complete checkbox */}
                <button
                  onClick={() => handleStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    task.status === 'done'
                      ? 'border-green-500 bg-green-500/20 text-green-400'
                      : 'border-gray-600 hover:border-gray-400'
                  }`}
                  title={task.status === 'done' ? 'Mark undone' : 'Mark done'}
                >
                  {task.status === 'done' && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                {/* Task info */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditingId(task.id)}>
                  <p className={`text-sm truncate ${task.status === 'done' ? 'text-gray-500 line-through' : 'text-white'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityColor[task.priority]}`}>
                      {task.priority}
                    </span>
                    {task.status !== 'todo' && task.status !== 'done' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${statusColor[task.status]}`}>
                        {task.status === 'in_progress' ? 'in progress' : task.status}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600">{task.task_type}</span>
                    {task.assigned_profile && (
                      <span className="text-[10px] text-gray-500">{task.assigned_profile.full_name}</span>
                    )}
                  </div>
                </div>

                {/* Due date */}
                {task.due_date && (
                  <span className={`text-xs flex-shrink-0 ${overdue ? 'text-red-400 font-medium' : 'text-gray-500'}`}>
                    {overdue ? 'OVERDUE ' : ''}
                    {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}

                {/* Status quick-change buttons (visible on hover) */}
                {task.status !== 'done' && (
                  <div className="hidden group-hover:flex gap-1 flex-shrink-0">
                    {statusOptions
                      .filter((s) => s.value !== task.status && s.value !== 'done')
                      .map((s) => (
                        <button
                          key={s.value}
                          onClick={() => handleStatusChange(task.id, s.value)}
                          className={`text-[10px] px-2 py-0.5 rounded text-white/80 hover:text-white transition-colors ${s.color}`}
                          title={`Move to ${s.label}`}
                        >
                          {s.label}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskForm({
  task,
  onSubmit,
  onCancel,
  onDelete,
  loading,
  staff,
}: {
  task?: TaskWithProfile
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  onDelete?: () => void
  loading: boolean
  staff: StaffMember[]
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
        <input
          name="title"
          required
          defaultValue={task?.title}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="What needs to be done?"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
        <textarea
          name="description"
          rows={2}
          defaultValue={task?.description ?? ''}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="Additional details..."
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Priority</label>
          <select
            name="priority"
            defaultValue={task?.priority ?? 'medium'}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {priorityOptions.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
          <select
            name="task_type"
            defaultValue={task?.task_type ?? 'other'}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {typeOptions.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Assign to</label>
          <select
            name="assigned_to"
            defaultValue={task?.assigned_to ?? ''}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Due date</label>
          <input
            name="due_date"
            type="date"
            defaultValue={task?.due_date ?? ''}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {task && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
          <div className="flex gap-2">
            {statusOptions.map((s) => (
              <label key={s.value} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={s.value}
                  defaultChecked={task.status === s.value}
                  className="sr-only peer"
                />
                <span className={`text-xs px-2.5 py-1 rounded-lg border transition-colors peer-checked:text-white peer-checked:border-transparent ${s.color} border-gray-700 text-gray-400 peer-checked:opacity-100 opacity-60 hover:opacity-80`}>
                  {s.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Saving...' : task ? 'Save Changes' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
        >
          Cancel
        </button>
        {task && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-sm font-medium rounded-lg transition-colors ml-auto"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
