'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import type {
  AvailabilityWindow,
  AvailabilitySubmission,
  AvailabilityWindowAssignee,
  Profile,
} from '@/types/database'
import { fmtShortDate } from '@/lib/calendar'

interface Props {
  windows: AvailabilityWindow[]
  submissions: AvailabilitySubmission[]
  assignees: AvailabilityWindowAssignee[]
  /** Full list to populate the picker (active+visible profiles, including non-schedulable). */
  profiles: Profile[]
  /** Defaults the assignee selection for *first ever* windows. After that, carry-forward from previous window. */
  operationalProfiles: Profile[]
  isAdmin: boolean
  orgId: string
  userId: string
}

export function AvailabilityWindowsStrip({
  windows,
  submissions,
  assignees,
  profiles,
  operationalProfiles,
  isAdmin,
  orgId,
  userId,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [showOpen, setShowOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manageWindowId, setManageWindowId] = useState<string | null>(null)

  // Default assignee set for a brand-new window: previous window's assignees
  // if any windows exist, else all schedulable+visible staff. Computed once
  // when the form opens, not each render.
  const defaultAssigneeIds = useMemo(() => {
    if (windows.length > 0) {
      // Newest-first sort already happens at the page level (start_date desc).
      // Take the *most recent* window's assignees.
      const newestWindowId = windows[0].id
      const ids = assignees.filter((a) => a.window_id === newestWindowId).map((a) => a.user_id)
      if (ids.length > 0) return new Set(ids)
    }
    return new Set(operationalProfiles.map((p) => p.id))
  }, [windows, assignees, operationalProfiles])

  const [form, setForm] = useState(() => {
    const now = new Date()
    const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const lastOfNext = new Date(now.getFullYear(), now.getMonth() + 2, 0)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      label: firstOfNext.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      start_date: fmt(firstOfNext),
      end_date: fmt(lastOfNext),
      due_date: '',
    }
  })
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(defaultAssigneeIds)

  // When the user opens the form, refresh the picker selection from the
  // most recent default — keeps month-over-month carry-forward intuitive.
  function openForm() {
    setSelectedAssignees(new Set(defaultAssigneeIds))
    setShowOpen(true)
  }

  const open = windows.filter((w) => w.status === 'open')
  const recentlyLocked = windows.filter((w) => w.status === 'locked').slice(0, 2)

  // Per-window assignee count: how many staffers ARE expected to submit for this window.
  function assigneeCount(windowId: string): number {
    return assignees.filter((a) => a.window_id === windowId).length
  }
  function submittedCount(windowId: string): number {
    return submissions.filter((s) => s.window_id === windowId).length
  }

  function toggleAssignee(profileId: string) {
    setSelectedAssignees((prev) => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  async function openWindow(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: created, error } = await supabase
        .from('availability_windows')
        .insert({
          org_id: orgId,
          label: form.label.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          due_date: form.due_date || null,
          status: 'open',
          opened_by: userId,
        })
        .select()
        .single()
      if (error || !created) throw error || new Error('Window create failed')

      // Insert assignees in one batch.
      if (selectedAssignees.size > 0) {
        const rows = Array.from(selectedAssignees).map((uid) => ({
          org_id: orgId,
          window_id: created.id,
          user_id: uid,
        }))
        const { error: assigneeErr } = await supabase.from('availability_window_assignees').insert(rows)
        if (assigneeErr) {
          toast(`Window opened but assignee save failed: ${assigneeErr.message}`, 'error')
          console.error(assigneeErr)
        }
      }

      toast(`Availability window opened (${selectedAssignees.size} expected to submit)`)
      setShowOpen(false)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open window', 'error')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function lockWindow(id: string, label: string) {
    if (!confirm(`Lock "${label}"? Staff will no longer be able to edit availability inside this window.`)) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('availability_windows')
        .update({ status: 'locked', locked_by: userId, locked_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      toast('Window locked')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to lock window', 'error')
      console.error(err)
    }
  }

  async function unlockWindow(id: string) {
    if (!confirm('Unlock this window? Staff will be able to edit availability inside it again.')) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('availability_windows')
        .update({ status: 'open', locked_by: null, locked_at: null })
        .eq('id', id)
      if (error) throw error
      toast('Window reopened')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to unlock window', 'error')
      console.error(err)
    }
  }

  async function deleteWindow(id: string, label: string, subCount: number) {
    const submittedWarning =
      subCount > 0
        ? `\n\n${subCount} staff have already submitted availability for this window. Their submission records will be deleted (entries themselves stay).`
        : ''
    if (
      !confirm(
        `Delete window "${label}"?${submittedWarning}\n\nAvailability entries inside the date range stay — only the window itself goes away. This can't be undone.`
      )
    )
      return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('availability_windows').delete().eq('id', id)
      if (error) throw error
      toast('Window deleted')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete window', 'error')
      console.error(err)
    }
  }

  if (open.length === 0 && recentlyLocked.length === 0 && !isAdmin) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-500">
        No open availability windows. Wait for an admin to open one.
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Windows</span>
          {open.map((w) => (
            <WindowPill
              key={w.id}
              w={w}
              showSubmitted={isAdmin}
              submittedCount={submittedCount(w.id)}
              totalCount={assigneeCount(w.id)}
            >
              {isAdmin && (
                <>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/staff?tab=availability&window=${w.id}`
                      navigator.clipboard.writeText(url).then(
                        () => toast('Link copied — paste into your group chat'),
                        () => toast('Failed to copy link', 'error')
                      )
                    }}
                    className="ml-1.5 text-[10px] text-gray-400 hover:text-green-400 underline"
                    title="Copy a link staff can use to submit their availability"
                  >
                    Copy link
                  </button>
                  <button
                    onClick={() => setManageWindowId(w.id)}
                    className="ml-1.5 text-[10px] text-gray-400 hover:text-blue-400 underline"
                  >
                    Manage assignees
                  </button>
                  <button
                    onClick={() => lockWindow(w.id, w.label)}
                    className="ml-1.5 text-[10px] text-gray-400 hover:text-orange-400 underline"
                  >
                    Lock
                  </button>
                  <button
                    onClick={() => deleteWindow(w.id, w.label, submittedCount(w.id))}
                    className="ml-1.5 text-[10px] text-gray-500 hover:text-red-400 underline"
                  >
                    Delete
                  </button>
                </>
              )}
            </WindowPill>
          ))}
          {recentlyLocked.map((w) => (
            <WindowPill
              key={w.id}
              w={w}
              showSubmitted={isAdmin}
              submittedCount={submittedCount(w.id)}
              totalCount={assigneeCount(w.id)}
            >
              {isAdmin && (
                <>
                  <button
                    onClick={() => unlockWindow(w.id)}
                    className="ml-1.5 text-[10px] text-gray-400 hover:text-orange-400 underline"
                  >
                    Unlock
                  </button>
                  <button
                    onClick={() => deleteWindow(w.id, w.label, submittedCount(w.id))}
                    className="ml-1.5 text-[10px] text-gray-500 hover:text-red-400 underline"
                  >
                    Delete
                  </button>
                </>
              )}
            </WindowPill>
          ))}
          {open.length === 0 && recentlyLocked.length === 0 && (
            <span className="text-xs text-gray-500">No windows yet.</span>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => (showOpen ? setShowOpen(false) : openForm())}
            className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showOpen ? 'Cancel' : '+ Open window'}
          </button>
        )}
      </div>

      {showOpen && (
        <form onSubmit={openWindow} className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Label</label>
              <input
                type="text"
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. May 2026"
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Start date</label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">End date</label>
              <input
                type="date"
                required
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Due date (optional)</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">
              Expected to submit ({selectedAssignees.size} of {profiles.length})
              <span className="ml-2 text-gray-600 normal-case">— defaults from previous window</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto p-2 bg-gray-800/50 border border-gray-700 rounded">
              {profiles.map((p) => {
                const checked = selectedAssignees.has(p.id)
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer hover:bg-gray-700/40 px-1.5 py-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAssignee(p.id)}
                      className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="truncate">{p.full_name}</span>
                    {!p.is_operational_staff && (
                      <span className="text-[9px] text-gray-600 ml-auto" title="Not on schedule">
                        off
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
            <div className="flex justify-between mt-1.5">
              <button
                type="button"
                onClick={() => setSelectedAssignees(new Set(operationalProfiles.map((p) => p.id)))}
                className="text-[10px] text-gray-400 hover:text-orange-400 underline"
              >
                All on-schedule staff
              </button>
              <button
                type="button"
                onClick={() => setSelectedAssignees(new Set())}
                className="text-[10px] text-gray-400 hover:text-red-400 underline"
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {saving ? 'Opening...' : 'Open window'}
            </button>
          </div>
        </form>
      )}

      {manageWindowId && (
        <ManageAssigneesModal
          window={windows.find((w) => w.id === manageWindowId)!}
          assignees={assignees.filter((a) => a.window_id === manageWindowId)}
          profiles={profiles}
          orgId={orgId}
          onClose={() => setManageWindowId(null)}
          onSaved={() => {
            setManageWindowId(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function ManageAssigneesModal({
  window: w,
  assignees,
  profiles,
  orgId,
  onClose,
  onSaved,
}: {
  window: AvailabilityWindow
  assignees: AvailabilityWindowAssignee[]
  profiles: Profile[]
  orgId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(assignees.map((a) => a.user_id))
  )
  const [saving, setSaving] = useState(false)

  function toggle(profileId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const existing = new Set(assignees.map((a) => a.user_id))
      const toAdd = Array.from(selected).filter((id) => !existing.has(id))
      const toRemove = Array.from(existing).filter((id) => !selected.has(id))

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('availability_window_assignees')
          .delete()
          .eq('window_id', w.id)
          .in('user_id', toRemove)
        if (error) throw error
      }
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('availability_window_assignees')
          .insert(toAdd.map((uid) => ({ org_id: orgId, window_id: w.id, user_id: uid })))
        if (error) throw error
      }
      toast(`Assignees updated (${selected.size} expected to submit)`)
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update assignees', 'error')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Manage assignees</h3>
            <p className="text-xs text-gray-500">
              {w.label} · who&apos;s expected to submit availability
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">
            ×
          </button>
        </div>
        <div className="px-5 py-4 space-y-2">
          {profiles.map((p) => {
            const checked = selected.has(p.id)
            return (
              <label
                key={p.id}
                className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer hover:bg-gray-800/40 px-2 py-1.5 rounded"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(p.id)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
                />
                <span>{p.full_name}</span>
                <span className="ml-auto text-[10px] text-gray-500">{p.role}</span>
                {!p.is_operational_staff && (
                  <span className="text-[10px] text-gray-600" title="Not on schedule">off</span>
                )}
              </label>
            )
          })}
        </div>
        <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded transition-colors"
          >
            {saving ? 'Saving...' : `Save (${selected.size} selected)`}
          </button>
        </div>
      </div>
    </div>
  )
}

function WindowPill({
  w,
  children,
  showSubmitted,
  submittedCount,
  totalCount,
}: {
  w: AvailabilityWindow
  children?: React.ReactNode
  showSubmitted: boolean
  submittedCount: number
  totalCount: number
}) {
  const start = new Date(w.start_date + 'T12:00:00')
  const end = new Date(w.end_date + 'T12:00:00')
  const due = w.due_date ? new Date(w.due_date + 'T12:00:00') : null
  return (
    <span
      className={`inline-flex items-center text-[11px] px-2 py-1 rounded font-medium ${
        w.status === 'open'
          ? 'bg-green-500/15 text-green-300 border border-green-500/25'
          : 'bg-gray-700/50 text-gray-400 border border-gray-700'
      }`}
    >
      <span>{w.label}</span>
      <span className="ml-1.5 text-[10px] opacity-70">
        {fmtShortDate(start)}–{fmtShortDate(end)}
      </span>
      {due && (
        <span
          className={`ml-1.5 text-[10px] ${
            w.status === 'open' ? 'text-amber-300' : 'text-gray-500'
          }`}
          title="Submission deadline"
        >
          Due {fmtShortDate(due)}
        </span>
      )}
      {showSubmitted && totalCount > 0 && (
        <span
          className={`ml-1.5 text-[10px] ${
            w.status === 'open' ? 'text-blue-300' : 'text-gray-500'
          }`}
          title="Submitted / expected to submit"
        >
          {submittedCount}/{totalCount} submitted
        </span>
      )}
      {showSubmitted && totalCount === 0 && (
        <span className="ml-1.5 text-[10px] text-gray-500" title="No assignees set">
          (no assignees)
        </span>
      )}
      <span
        className={`ml-1.5 text-[9px] uppercase tracking-wide ${
          w.status === 'open' ? 'text-green-400' : 'text-gray-500'
        }`}
      >
        {w.status}
      </span>
      {children}
    </span>
  )
}
