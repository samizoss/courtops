'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/toast'

export interface ContentPillarRow {
  id: string
  org_id: string
  name: string
  description: string | null
  color: string | null
  display_order: number
  is_active: boolean
  created_at: string
}

interface Draft {
  name: string
  description: string
  color: string | null
}

interface Props {
  pillars: ContentPillarRow[]
  orgId: string
  canEdit: boolean
}

const DEFAULT_COLOR = '#f97316'

function draftFromRow(row: ContentPillarRow): Draft {
  return {
    name: row.name,
    description: row.description ?? '',
    color: row.color,
  }
}

export function PillarsSettings({ pillars, orgId, canEdit }: Props) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ContentPillarRow[]>(pillars)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(pillars.map((p) => [p.id, draftFromRow(p)]))
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLOR)

  const sorted = [...rows].sort(
    (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)
  )
  const active = sorted.filter((r) => r.is_active)
  const archived = sorted.filter((r) => !r.is_active)

  function isDirty(row: ContentPillarRow): boolean {
    const draft = drafts[row.id]
    if (!draft) return false
    return (
      draft.name !== row.name ||
      draft.description !== (row.description ?? '') ||
      (draft.color ?? '') !== (row.color ?? '')
    )
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function handleSave(row: ContentPillarRow) {
    const draft = drafts[row.id]
    if (!draft) return
    if (!draft.name.trim()) {
      toast('Pillar name is required.', 'error')
      return
    }

    setBusyId(row.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('content_pillars')
        .update({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          color: draft.color,
        })
        .eq('id', row.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update returned no rows (blocked by RLS?)')
      }

      const updated = data[0] as ContentPillarRow
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      setDrafts((prev) => ({ ...prev, [row.id]: draftFromRow(updated) }))
      toast('Pillar saved.')
    } catch (err) {
      console.error('Failed to save pillar:', err)
      toast('Failed to save pillar. Please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleMove(row: ContentPillarRow, direction: -1 | 1) {
    // One move at a time — concurrent moves would compute against stale orders.
    if (busyId) return
    const idx = active.findIndex((r) => r.id === row.id)
    const otherIdx = idx + direction
    if (idx < 0 || otherIdx < 0 || otherIdx >= active.length) return

    setBusyId(row.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      // Reassign sequential display_order across the whole active list after
      // the swap — self-heals any duplicate orders instead of depending on a
      // two-row value swap staying consistent.
      const newList = [...active]
      ;[newList[idx], newList[otherIdx]] = [newList[otherIdx], newList[idx]]
      const changes = newList
        .map((r, i) => ({ id: r.id, oldOrder: r.display_order, newOrder: i }))
        .filter((c) => c.oldOrder !== c.newOrder)

      const results = await Promise.all(
        changes.map((c) =>
          supabase.from('content_pillars').update({ display_order: c.newOrder }).eq('id', c.id).select()
        )
      )
      if (results.some((res) => res.error || !res.data?.length)) {
        // Some writes may have landed — reload so the UI matches the DB.
        toast('Reorder hit an error — refreshing to stay in sync', 'error')
        window.location.reload()
        return
      }

      const orderById = new Map(newList.map((r, i) => [r.id, i]))
      setRows((prev) =>
        prev.map((r) => (orderById.has(r.id) ? { ...r, display_order: orderById.get(r.id)! } : r))
      )
    } catch (err) {
      console.error('Failed to reorder pillars:', err)
      toast('Failed to reorder pillars. Please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSetActive(row: ContentPillarRow, isActive: boolean) {
    setBusyId(row.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('content_pillars')
        .update({ is_active: isActive })
        .eq('id', row.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update returned no rows (blocked by RLS?)')
      }

      const updated = data[0] as ContentPillarRow
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      toast(isActive ? 'Pillar restored.' : 'Pillar archived.')
    } catch (err) {
      console.error('Failed to update pillar status:', err)
      toast('Failed to update pillar status. Please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) {
      toast('Pillar name is required.', 'error')
      return
    }

    setAdding(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const nextOrder =
        rows.length > 0 ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0

      const { data, error } = await supabase
        .from('content_pillars')
        .insert({
          org_id: orgId,
          name: newName.trim(),
          description: newDescription.trim() || null,
          color: newColor,
          display_order: nextOrder,
          is_active: true,
        })
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Insert returned no rows (blocked by RLS?)')
      }

      window.location.reload()
    } catch (err) {
      console.error('Failed to add pillar:', err)
      toast('Failed to add pillar. Please try again.', 'error')
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/settings/content"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          &larr; Back to Content Settings
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">Pillars</h2>
        <p className="text-gray-400 text-sm mt-1">
          Content pillars are the recurring themes your calendar is planned around. Order them
          by priority — archiving keeps history intact without offering the pillar for new posts.
        </p>
      </div>

      {/* Active pillars */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Active Pillars</h3>
        </div>
        {active.length === 0 ? (
          <div className="px-5 py-4">
            <p className="text-sm text-gray-500">No pillars yet. Add your first one below.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {active.map((row, idx) => {
              const draft = drafts[row.id] ?? draftFromRow(row)
              const dirty = isDirty(row)
              const busy = busyId === row.id

              return (
                <div key={row.id} className="px-5 py-4">
                  <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                    {canEdit && (
                      <div className="flex lg:flex-col gap-1 shrink-0 order-last lg:order-first">
                        <button
                          onClick={() => handleMove(row, -1)}
                          disabled={idx === 0 || busy}
                          title="Move up"
                          className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-30 text-gray-300 text-xs rounded transition-colors"
                        >
                          &uarr;
                        </button>
                        <button
                          onClick={() => handleMove(row, 1)}
                          disabled={idx === active.length - 1 || busy}
                          title="Move down"
                          className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-30 text-gray-300 text-xs rounded transition-colors"
                        >
                          &darr;
                        </button>
                      </div>
                    )}

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Name</label>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) => updateDraft(row.id, { name: e.target.value })}
                          disabled={!canEdit || busyId === row.id}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Description</label>
                        <input
                          type="text"
                          value={draft.description}
                          onChange={(e) => updateDraft(row.id, { description: e.target.value })}
                          disabled={!canEdit || busyId === row.id}
                          placeholder="Optional"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div className="shrink-0">
                      <label className="block text-xs text-gray-400 mb-1">Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={draft.color ?? DEFAULT_COLOR}
                          onChange={(e) => updateDraft(row.id, { color: e.target.value })}
                          disabled={!canEdit || busyId === row.id}
                          className="h-9 w-10 p-1 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer disabled:opacity-60"
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-gray-700"
                          style={{ backgroundColor: draft.color ?? DEFAULT_COLOR }}
                        />
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleSave(row)}
                          disabled={!dirty || busy}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          {busy ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => handleSetActive(row, false)}
                          disabled={busy}
                          className="px-3 py-2 bg-gray-800 hover:bg-red-600/20 border border-gray-700 hover:border-red-600/40 disabled:opacity-50 text-gray-400 hover:text-red-400 text-xs font-medium rounded-lg transition-colors"
                        >
                          Archive
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Archived pillars */}
      {archived.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold">Archived Pillars</h3>
          </div>
          <div className="divide-y divide-gray-800/50">
            {archived.map((row) => (
              <div
                key={row.id}
                className="px-5 py-3 flex items-center justify-between gap-3 opacity-50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full border border-gray-700 shrink-0"
                    style={{ backgroundColor: row.color ?? DEFAULT_COLOR }}
                  />
                  <span className="text-sm text-white font-medium truncate">{row.name}</span>
                  {row.description && (
                    <span className="text-xs text-gray-500 truncate">{row.description}</span>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleSetActive(row, true)}
                    disabled={busyId === row.id}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-green-600/20 border border-gray-700 hover:border-green-600/40 disabled:opacity-50 text-gray-300 hover:text-green-400 text-xs font-medium rounded-lg transition-colors shrink-0"
                  >
                    {busyId === row.id ? 'Working...' : 'Restore'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add pillar */}
      {canEdit && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h3 className="text-lg font-semibold mb-4">Add Pillar</h3>
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                placeholder="e.g. Community Spotlight"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div className="shrink-0">
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-10 p-1 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {adding ? 'Adding...' : 'Add Pillar'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
