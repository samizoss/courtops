'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/toast'

export interface ContentAudienceRow {
  id: string
  org_id: string
  name: string
  display_order: number
  is_active: boolean
}

interface Props {
  audiences: ContentAudienceRow[]
  orgId: string
  canEdit: boolean
}

export function AudiencesSettings({ audiences, orgId, canEdit }: Props) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ContentAudienceRow[]>(audiences)
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(audiences.map((a) => [a.id, a.name]))
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const sorted = [...rows].sort(
    (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)
  )
  const active = sorted.filter((r) => r.is_active)
  const archived = sorted.filter((r) => !r.is_active)

  function isDirty(row: ContentAudienceRow): boolean {
    const draft = drafts[row.id]
    return draft !== undefined && draft !== row.name
  }

  async function handleSave(row: ContentAudienceRow) {
    const draft = drafts[row.id]
    if (draft === undefined) return
    if (!draft.trim()) {
      toast('Audience name is required.', 'error')
      return
    }

    setBusyId(row.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('content_audiences')
        .update({ name: draft.trim() })
        .eq('id', row.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update returned no rows (blocked by RLS?)')
      }

      const updated = data[0] as ContentAudienceRow
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      setDrafts((prev) => ({ ...prev, [row.id]: updated.name }))
      toast('Audience saved.')
    } catch (err) {
      console.error('Failed to save audience:', err)
      toast('Failed to save audience. Please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleMove(row: ContentAudienceRow, direction: -1 | 1) {
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
          supabase.from('content_audiences').update({ display_order: c.newOrder }).eq('id', c.id).select()
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
      console.error('Failed to reorder audiences:', err)
      toast('Failed to reorder audiences. Please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSetActive(row: ContentAudienceRow, isActive: boolean) {
    setBusyId(row.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('content_audiences')
        .update({ is_active: isActive })
        .eq('id', row.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update returned no rows (blocked by RLS?)')
      }

      const updated = data[0] as ContentAudienceRow
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      toast(isActive ? 'Audience restored.' : 'Audience archived.')
    } catch (err) {
      console.error('Failed to update audience status:', err)
      toast('Failed to update audience status. Please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) {
      toast('Audience name is required.', 'error')
      return
    }

    setAdding(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const nextOrder =
        rows.length > 0 ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0

      const { data, error } = await supabase
        .from('content_audiences')
        .insert({
          org_id: orgId,
          name: newName.trim(),
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
      console.error('Failed to add audience:', err)
      toast('Failed to add audience. Please try again.', 'error')
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
        <h2 className="text-2xl font-bold">Audiences</h2>
        <p className="text-gray-400 text-sm mt-1">
          Who content is aimed at — members, prospects, the public. Every planned piece of
          content picks one, so keep this list short and meaningful.
        </p>
      </div>

      {/* Active audiences */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Active Audiences</h3>
        </div>
        {active.length === 0 ? (
          <div className="px-5 py-4">
            <p className="text-sm text-gray-500">No audiences yet. Add your first one below.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {active.map((row, idx) => {
              const draft = drafts[row.id] ?? row.name
              const dirty = isDirty(row)
              const busy = busyId === row.id

              return (
                <div key={row.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <div className="flex gap-1 shrink-0">
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

                    <input
                      type="text"
                      value={draft}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      disabled={!canEdit || busyId === row.id}
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-60"
                    />

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

      {/* Archived audiences */}
      {archived.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold">Archived Audiences</h3>
          </div>
          <div className="divide-y divide-gray-800/50">
            {archived.map((row) => (
              <div
                key={row.id}
                className="px-5 py-3 flex items-center justify-between gap-3 opacity-50"
              >
                <span className="text-sm text-white font-medium truncate">{row.name}</span>
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

      {/* Add audience */}
      {canEdit && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h3 className="text-lg font-semibold mb-4">Add Audience</h3>
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              placeholder="e.g. Prospective Members"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={adding}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {adding ? 'Adding...' : 'Add Audience'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
