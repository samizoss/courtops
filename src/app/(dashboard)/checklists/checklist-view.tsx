'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface ChecklistItem {
  id: string
  label: string
  sort_order: number
  completed: boolean
  completion: { id: string; completed_by: string; completed_at: string; notes: string } | null
}

interface Props {
  orgId: string
  checklist: {
    id: string
    name: string
    shift: string
    items: ChecklistItem[]
  }
}

const shiftColors: Record<string, string> = {
  opening: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  midday: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  closing: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  custom: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
}

export function ChecklistView({ checklist, orgId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const completedCount = checklist.items.filter((i) => i.completed).length
  const totalCount = checklist.items.length
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  async function toggleItem(item: ChecklistItem) {
    setLoading(item.id)

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    if (item.completed && item.completion) {
      await supabase.from('checklist_completions').delete().eq('id', item.completion.id)
    } else {
      await supabase.from('checklist_completions').insert({
        item_id: item.id,
        org_id: orgId,
        completed_date: new Date().toISOString().split('T')[0],
      })
    }

    setLoading(null)
    router.refresh()
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <div className="p-5 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{checklist.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${shiftColors[checklist.shift]}`}>
            {checklist.shift}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm text-gray-400">{completedCount}/{totalCount}</span>
        </div>
      </div>

      <div className="divide-y divide-gray-800/50">
        {checklist.items.map((item) => (
          <button
            key={item.id}
            onClick={() => toggleItem(item)}
            disabled={loading === item.id}
            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-800/50 transition-colors text-left"
          >
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                item.completed
                  ? 'bg-green-600 border-green-600'
                  : 'border-gray-600'
              }`}
            >
              {item.completed && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={`text-sm ${item.completed ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
              {item.label}
            </span>
            {loading === item.id && (
              <span className="ml-auto text-xs text-gray-600">saving...</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
