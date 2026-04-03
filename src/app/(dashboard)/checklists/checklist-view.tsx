'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/components/toast'

interface Completion {
  id: string
  completed_by: string | null
  completed_by_name: string | null
  completed_at: string
  notes: string | null
}

interface ChecklistItem {
  id: string
  label: string
  sort_order: number
  completed: boolean
  completion: Completion | null
}

interface Props {
  orgId: string
  userId: string
  isAdmin: boolean
  readOnly?: boolean
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function ChecklistView({ checklist, orgId, userId, readOnly = false }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [notesItemId, setNotesItemId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const completedCount = checklist.items.filter((i) => i.completed).length
  const totalCount = checklist.items.length
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  async function toggleItem(item: ChecklistItem) {
    if (!item.completed && notesItemId === item.id) {
      return completeWithNotes(item)
    }

    setLoading(item.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      if (item.completed && item.completion) {
        const { error } = await supabase.from('checklist_completions').delete().eq('id', item.completion.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('checklist_completions').insert({
          item_id: item.id,
          org_id: orgId,
          completed_by: userId,
          completed_date: new Date().toISOString().split('T')[0],
        })
        if (error) throw error
      }
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update checklist', 'error')
    } finally {
      setLoading(null)
    }
  }

  async function completeWithNotes(item: ChecklistItem) {
    setLoading(item.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { error } = await supabase.from('checklist_completions').insert({
        item_id: item.id,
        org_id: orgId,
        completed_by: userId,
        completed_date: new Date().toISOString().split('T')[0],
        notes: noteText.trim() || null,
      })
      if (error) throw error
      setNotesItemId(null)
      setNoteText('')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setLoading(null)
    }
  }

  async function updateNotes(completion: Completion) {
    setLoading(completion.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { error } = await supabase
        .from('checklist_completions')
        .update({ notes: noteText.trim() || null })
        .eq('id', completion.id)
      if (error) throw error
      toast('Note saved')
      setNotesItemId(null)
      setNoteText('')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save note', 'error')
    } finally {
      setLoading(null)
    }
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
          <div key={item.id} className="px-5 py-3">
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <button
                onClick={() => !readOnly && toggleItem(item)}
                disabled={readOnly || loading === item.id}
                className={`mt-0.5 flex-shrink-0 ${readOnly ? 'cursor-default' : ''}`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    item.completed ? 'bg-green-600 border-green-600' : 'border-gray-600 hover:border-gray-400'
                  }`}
                >
                  {item.completed && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Label + meta */}
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${item.completed ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                  {item.label}
                </span>

                {/* Who completed + when (visible to admins, or to the person who did it) */}
                {item.completed && item.completion && (
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-gray-600">
                      {item.completion.completed_by_name ?? 'Someone'} &middot; {formatTime(item.completion.completed_at)}
                    </span>
                    {item.completion.notes && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 italic">
                        {item.completion.notes}
                      </span>
                    )}
                  </div>
                )}

                {/* Notes input when editing */}
                {notesItemId === item.id && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note (optional)..."
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (item.completed && item.completion) {
                            updateNotes(item.completion)
                          } else {
                            completeWithNotes(item)
                          }
                        }
                        if (e.key === 'Escape') {
                          setNotesItemId(null)
                          setNoteText('')
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (item.completed && item.completion) {
                          updateNotes(item.completion)
                        } else {
                          completeWithNotes(item)
                        }
                      }}
                      className="px-2 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setNotesItemId(null); setNoteText('') }}
                      className="px-2 py-1 text-gray-500 hover:text-gray-300 text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {loading === item.id && (
                  <span className="text-xs text-gray-600">saving...</span>
                )}

                {/* Add/edit note button */}
                {!readOnly && notesItemId !== item.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setNotesItemId(item.id)
                      setNoteText(item.completion?.notes ?? '')
                    }}
                    className="p-1 text-gray-600 hover:text-gray-400 transition-colors"
                    title={item.completion?.notes ? 'Edit note' : 'Add note'}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
