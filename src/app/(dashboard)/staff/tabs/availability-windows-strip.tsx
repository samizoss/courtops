'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import type { AvailabilityWindow, AvailabilitySubmission } from '@/types/database'
import { fmtShortDate } from '@/lib/calendar'

interface Props {
  windows: AvailabilityWindow[]
  submissions: AvailabilitySubmission[]
  operationalCount: number
  isAdmin: boolean
  orgId: string
  userId: string
}

export function AvailabilityWindowsStrip({
  windows,
  submissions,
  operationalCount,
  isAdmin,
  orgId,
  userId,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [showOpen, setShowOpen] = useState(false)
  const [saving, setSaving] = useState(false)
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

  const open = windows.filter((w) => w.status === 'open')
  const recentlyLocked = windows.filter((w) => w.status === 'locked').slice(0, 2)

  // Per-window submitted user count (used for the X/Y badge admins see).
  function submittedCount(windowId: string): number {
    return submissions.filter((s) => s.window_id === windowId).length
  }

  async function openWindow(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('availability_windows').insert({
        org_id: orgId,
        label: form.label.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        due_date: form.due_date || null,
        status: 'open',
        opened_by: userId,
      })
      if (error) throw error
      toast('Availability window opened')
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

  async function deleteWindow(id: string, label: string, submittedCount: number) {
    const submittedWarning = submittedCount > 0
      ? `\n\n${submittedCount} staff have already submitted availability for this window. Their submission records will be deleted (entries themselves stay).`
      : ''
    if (!confirm(`Delete window "${label}"?${submittedWarning}\n\nAvailability entries inside the date range stay — only the window itself goes away. This can't be undone.`)) return
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
              totalCount={operationalCount}
            >
              {isAdmin && (
                <>
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
              totalCount={operationalCount}
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
            onClick={() => setShowOpen((v) => !v)}
            className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showOpen ? 'Cancel' : '+ Open window'}
          </button>
        )}
      </div>

      {showOpen && (
        <form onSubmit={openWindow} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
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
          <div className="sm:col-span-4 flex justify-end">
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
          title="Staffers who have submitted availability for this window"
        >
          {submittedCount}/{totalCount} submitted
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
