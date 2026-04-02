'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface TaskItem {
  id: string
  title: string
  priority: string
  due_date: string | null
  status: string
}

export function TaskCheckbox({ task }: { task: TaskItem }) {
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      await supabase
        .from('tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', task.id)
      setDone(true)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const priorityColors: Record<string, string> = {
    high: 'bg-red-500/20 text-red-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    low: 'bg-green-500/20 text-green-400',
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 opacity-50">
        <span className="text-green-500">&#10003;</span>
        <span className="text-sm text-gray-500 line-through">{task.title}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/60 hover:bg-gray-800 transition-colors">
      <button
        onClick={handleToggle}
        disabled={loading}
        className="w-5 h-5 rounded border border-gray-600 hover:border-orange-500 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
        aria-label={`Mark "${task.title}" as done`}
      >
        {loading && (
          <span className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${priorityColors[task.priority] ?? 'bg-gray-700 text-gray-400'}`}>
            {task.priority}
          </span>
          {task.due_date && (
            <span className="text-xs text-gray-500">
              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
