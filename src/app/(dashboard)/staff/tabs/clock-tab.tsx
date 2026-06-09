'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import type { Profile, TimeClock } from '@/types/database'

interface ClockWithProfile extends TimeClock {
  profile?: { full_name: string }
}

interface Props {
  activeClocks: ClockWithProfile[]
  recentClocks: ClockWithProfile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  profiles: Profile[]
  isAdmin: boolean
  clockNotesVisibility?: 'all_staff' | 'admin_only'
}

function formatDuration(minutes: number | null) {
  if (!minutes) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function elapsed(clockInIso: string): string {
  const min = Math.floor((Date.now() - new Date(clockInIso).getTime()) / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Converts ISO string to the value format expected by datetime-local input.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ClockTab({ activeClocks, recentClocks, currentUser, profiles, isAdmin, clockNotesVisibility = 'all_staff' }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [showMissed, setShowMissed] = useState(false)
  const [editingClock, setEditingClock] = useState<ClockWithProfile | null>(null)

  const myClock = activeClocks.find(c => c.user_id === currentUser.userId)
  const isClockedIn = !!myClock

  async function handleClockAction() {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      if (isClockedIn) {
        // Preserve any existing notes (e.g. from a missed-entry log) on clock out.
        // - If the user typed nothing in the textbox: don't touch the notes field.
        // - If they typed something: append it to existing notes with a [clock-out] tag
        //   so the original context (e.g. "forgot at start") survives.
        const typed = notes.trim()
        const existing = (myClock.notes ?? '').trim()
        const update: { clock_out: string; notes?: string } = {
          clock_out: new Date().toISOString(),
        }
        if (typed) {
          update.notes = existing ? `${existing}\n[clock-out] ${typed}` : typed
        }
        const { error } = await supabase.from('time_clock').update(update).eq('id', myClock.id)
        if (error) throw error
        toast('Clocked out')
      } else {
        const { error } = await supabase.from('time_clock').insert({
          org_id: currentUser.orgId,
          user_id: currentUser.userId,
          clock_in: new Date().toISOString(),
          notes: notes || null,
        })
        if (error) throw error
        toast('Clocked in')
      }

      setNotes('')
      // Hard reload so the clocked-in/out state and hours summary are guaranteed fresh
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save clock entry', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Whether to show someone else's staff-added note to the current user.
  function canSeeNote(clock: ClockWithProfile): boolean {
    if (isAdmin) return true
    if (clock.user_id === currentUser.userId) return true
    return clockNotesVisibility === 'all_staff'
  }

  return (
    <div className="space-y-6">
      {/* My clock action */}
      <div className={`bg-gray-900 rounded-xl p-6 border-l-4 ${isClockedIn ? 'border-green-500' : 'border-gray-700'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-lg font-semibold">{currentUser.fullName}</p>
            <p className="text-sm text-gray-400">
              {isClockedIn
                ? `Clocked in since ${formatTime(myClock.clock_in)} (${elapsed(myClock.clock_in)})`
                : 'Not clocked in'
              }
            </p>
          </div>
          <div className={`w-3 h-3 rounded-full ${isClockedIn ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
        </div>

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isClockedIn ? 'Clock out notes (optional)...' : 'Clock in notes (optional)...'}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={handleClockAction}
            disabled={loading}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
              isClockedIn
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
            } disabled:opacity-50`}
          >
            {loading ? 'Saving...' : isClockedIn ? 'Clock Out' : 'Clock In'}
          </button>
        </div>

        {!isClockedIn && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setShowMissed(true)}
              className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
            >
              Forgot to clock in? Log a missed entry →
            </button>
          </div>
        )}
      </div>

      {/* Who's clocked in now */}
      {activeClocks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Currently On Shift</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeClocks.map((clock) => (
              <div key={clock.id} className="bg-gray-900 rounded-lg p-3 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">{clock.profile?.full_name}</p>
                  <p className="text-xs text-gray-500">Since {formatTime(clock.clock_in)} ({elapsed(clock.clock_in)})</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hours Summary (admin only) */}
      {isAdmin && <HoursSummary orgId={currentUser.orgId} profiles={profiles} />}

      {/* Recent clock history */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Recent Clock History</h3>
        {recentClocks.length === 0 ? (
          <p className="text-gray-500 text-sm">No clock entries yet.</p>
        ) : (
          <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800/50">
            {recentClocks.map((clock) => {
              const showNote = clock.notes && canSeeNote(clock)
              return (
                <div key={clock.id} className="flex items-start gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-white">{clock.profile?.full_name}</p>
                      {clock.is_manual_entry && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                          Manual entry
                        </span>
                      )}
                      {clock.last_edited_at && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400" title={`Edited ${new Date(clock.last_edited_at).toLocaleString()}`}>
                          Edited
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{formatDate(clock.clock_in)}</p>
                    {showNote && (
                      <p className="text-xs text-gray-400 mt-1 italic">&ldquo;{clock.notes}&rdquo;</p>
                    )}
                    {isAdmin && clock.admin_note && (
                      <p className="text-xs text-purple-400 mt-1 italic">
                        <span className="text-[10px] uppercase font-semibold tracking-wider mr-1 not-italic">Admin:</span>
                        &ldquo;{clock.admin_note}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-gray-300">
                      {formatTime(clock.clock_in)} {clock.clock_out ? `— ${formatTime(clock.clock_out)}` : '— active'}
                    </p>
                    <p className="text-xs text-gray-500">{formatDuration(clock.total_minutes)}</p>
                    {isAdmin && (
                      <button
                        onClick={() => setEditingClock(clock)}
                        className="text-xs text-orange-400 hover:text-orange-300 mt-1 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showMissed && (
        <MissedClockInModal
          currentUser={currentUser}
          onClose={() => setShowMissed(false)}
          onSaved={() => {
            setShowMissed(false)
            // Hard reload — router.refresh() doesn't always pick up fresh server data
            window.location.reload()
          }}
        />
      )}

      {editingClock && (
        <EditClockModal
          clock={editingClock}
          currentUser={currentUser}
          onClose={() => setEditingClock(null)}
          onSaved={() => {
            setEditingClock(null)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}

function MissedClockInModal({
  currentUser,
  onClose,
  onSaved,
}: {
  currentUser: { userId: string; orgId: string }
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const nowLocal = toDatetimeLocal(new Date().toISOString())
  const defaultClockIn = toDatetimeLocal(new Date(Date.now() - 60 * 60 * 1000).toISOString())
  const [clockIn, setClockIn] = useState(defaultClockIn)
  const [clockOut, setClockOut] = useState('')
  const [noteText, setNoteText] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!clockIn) return
    const clockInDate = new Date(clockIn)
    const now = new Date()
    if (clockInDate > now) {
      toast('Clock-in time cannot be in the future', 'error')
      return
    }
    let clockOutIso: string | null = null
    if (clockOut) {
      const clockOutDate = new Date(clockOut)
      if (clockOutDate <= clockInDate) {
        toast('Clock-out must be after clock-in', 'error')
        return
      }
      if (clockOutDate > now) {
        toast('Clock-out time cannot be in the future', 'error')
        return
      }
      clockOutIso = clockOutDate.toISOString()
    }

    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('time_clock').insert({
        org_id: currentUser.orgId,
        user_id: currentUser.userId,
        clock_in: clockInDate.toISOString(),
        clock_out: clockOutIso,
        notes: noteText || null,
        is_manual_entry: true,
      })
      if (error) throw error
      toast('Missed clock-in logged')
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSave}
        className="bg-gray-900 rounded-xl max-w-md w-full p-6 space-y-4 border border-gray-800"
      >
        <div>
          <h3 className="text-lg font-semibold text-white">Log Missed Clock-In</h3>
          <p className="text-sm text-gray-400 mt-1">
            Enter when you actually started working. An admin may review this entry.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Clock in time *</label>
          <input
            required
            type="datetime-local"
            value={clockIn}
            max={nowLocal}
            onChange={(e) => setClockIn(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Clock out time <span className="text-gray-500 font-normal">(optional — leave empty if still working)</span>
          </label>
          <input
            type="datetime-local"
            value={clockOut}
            max={nowLocal}
            min={clockIn}
            onChange={(e) => setClockOut(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Note <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Forgot to clock in at start of shift"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Log Entry'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditClockModal({
  clock,
  currentUser,
  onClose,
  onSaved,
}: {
  clock: ClockWithProfile
  currentUser: { userId: string; orgId: string }
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [clockIn, setClockIn] = useState(toDatetimeLocal(clock.clock_in))
  const [clockOut, setClockOut] = useState(clock.clock_out ? toDatetimeLocal(clock.clock_out) : '')
  const [noteText, setNoteText] = useState(clock.notes ?? '')
  const [adminNote, setAdminNote] = useState(clock.admin_note ?? '')
  const [reason, setReason] = useState('')

  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete this clock entry for ${clock.profile?.full_name}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      await supabase.from('time_clock_edits').insert({
        time_clock_id: clock.id,
        org_id: currentUser.orgId,
        edited_by: currentUser.userId,
        action: 'delete',
        old_values: {
          clock_in: clock.clock_in,
          clock_out: clock.clock_out,
          notes: clock.notes,
          admin_note: clock.admin_note,
        },
        new_values: null,
        reason: reason || null,
      })

      const { error } = await supabase.from('time_clock').delete().eq('id', clock.id)
      if (error) throw error
      toast('Clock entry deleted')
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!clockIn) return
    const clockInDate = new Date(clockIn)
    const clockOutDate = clockOut ? new Date(clockOut) : null
    if (clockOutDate && clockOutDate <= clockInDate) {
      toast('Clock-out must be after clock-in', 'error')
      return
    }

    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const oldValues = {
        clock_in: clock.clock_in,
        clock_out: clock.clock_out,
        notes: clock.notes,
        admin_note: clock.admin_note,
      }
      const newValues = {
        clock_in: clockInDate.toISOString(),
        clock_out: clockOutDate?.toISOString() ?? null,
        notes: noteText || null,
        admin_note: adminNote || null,
      }

      const { error: updateError } = await supabase
        .from('time_clock')
        .update({
          ...newValues,
          last_edited_by: currentUser.userId,
          last_edited_at: new Date().toISOString(),
        })
        .eq('id', clock.id)
      if (updateError) throw updateError

      await supabase.from('time_clock_edits').insert({
        time_clock_id: clock.id,
        org_id: currentUser.orgId,
        edited_by: currentUser.userId,
        action: 'edit',
        old_values: oldValues,
        new_values: newValues,
        reason: reason || null,
      })

      toast('Clock record updated')
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSave}
        className="bg-gray-900 rounded-xl max-w-md w-full p-6 space-y-4 border border-gray-800"
      >
        <div>
          <h3 className="text-lg font-semibold text-white">Edit Clock Record</h3>
          <p className="text-sm text-gray-400 mt-1">
            {clock.profile?.full_name} · {formatDate(clock.clock_in)}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Clock in *</label>
          <input
            required
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Clock out <span className="text-gray-500 font-normal">(leave empty for active shift)</span>
          </label>
          <input
            type="datetime-local"
            value={clockOut}
            min={clockIn}
            onChange={(e) => setClockOut(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Staff note <span className="text-gray-500 font-normal">(what staff entered)</span>
          </label>
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-purple-400 mb-1">
            Admin note <span className="text-gray-500 font-normal">(visible only to admins)</span>
          </label>
          <input
            type="text"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Internal note about this shift"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Reason for edit <span className="text-gray-500 font-normal">(optional, logged in audit history)</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Fixed forgotten clock-out"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50 rounded-lg transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete entry'}
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function HoursSummary({ orgId, profiles }: { orgId: string; profiles: Profile[] }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{ user_id: string; total_minutes: number }[] | null>(null)

  // Default to current pay period (last 14 days)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(Date.now() - 13 * 86400000)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

  async function loadSummary() {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('time_clock')
        .select('user_id, clock_in, clock_out, total_minutes')
        .eq('org_id', orgId)
        .gte('clock_in', `${startDate}T00:00:00`)
        .lte('clock_in', `${endDate}T23:59:59`)
        .not('clock_out', 'is', null)

      if (error) throw error

      // Aggregate by user
      const byUser: Record<string, number> = {}
      for (const row of data ?? []) {
        const mins = row.total_minutes ?? Math.floor((new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 60000)
        byUser[row.user_id] = (byUser[row.user_id] || 0) + mins
      }

      const result = Object.entries(byUser)
        .map(([user_id, total_minutes]) => ({ user_id, total_minutes }))
        .sort((a, b) => b.total_minutes - a.total_minutes)

      setSummary(result)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load hours', 'error')
    } finally {
      setLoading(false)
    }
  }

  const nameMap: Record<string, string> = {}
  profiles.forEach(p => { nameMap[p.id] = p.full_name })

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Hours Summary</h3>
      <div className="bg-gray-900 rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={loadSummary}
            disabled={loading}
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Load Hours'}
          </button>
        </div>

        {summary !== null && (
          summary.length === 0 ? (
            <p className="text-gray-500 text-sm">No clock entries for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 text-xs font-medium text-gray-500">Staff Member</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">Total Hours</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">Avg/Day</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => {
                    const h = Math.floor(row.total_minutes / 60)
                    const m = row.total_minutes % 60
                    const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))
                    const avgPerDay = (row.total_minutes / days / 60).toFixed(1)
                    return (
                      <tr key={row.user_id} className="border-b border-gray-800/50">
                        <td className="py-2 text-white">{nameMap[row.user_id] ?? 'Unknown'}</td>
                        <td className="py-2 text-right text-gray-300 font-mono">{h}h {m}m</td>
                        <td className="py-2 text-right text-gray-500 font-mono">{avgPerDay}h</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t border-gray-700">
                    <td className="py-2 text-gray-400 font-medium">Total</td>
                    <td className="py-2 text-right text-white font-mono font-medium">
                      {Math.floor(summary.reduce((s, r) => s + r.total_minutes, 0) / 60)}h{' '}
                      {summary.reduce((s, r) => s + r.total_minutes, 0) % 60}m
                    </td>
                    <td className="py-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
