'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import { CalendarMonthGrid } from '@/components/calendar-month-grid'
import { ViewMode, fmtDateKey, fmtShortDate, startOfDay, visibleRange } from '@/lib/calendar'
import type {
  Profile,
  AvailabilityEntry,
  AvailabilityWindow,
  AvailabilitySubmission,
} from '@/types/database'
import { AvailabilityWindowsStrip } from './availability-windows-strip'

const SHIFTS_MAX_LEN = 200

interface Props {
  initialEntries: AvailabilityEntry[]
  windows: AvailabilityWindow[]
  submissions: AvailabilitySubmission[]
  profiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
}

interface CellState {
  shifts: string
  is_available: boolean
  is_unavailable: boolean
  saving: boolean
  dirty: boolean
}

const emptyCell = (): CellState => ({
  shifts: '',
  is_available: false,
  is_unavailable: false,
  saving: false,
  dirty: false,
})

const cellKey = (userId: string, dateKey: string) => `${userId}|${dateKey}`

function windowForDate(date: Date, windows: AvailabilityWindow[]): AvailabilityWindow | null {
  const k = fmtDateKey(date)
  for (const w of windows) {
    if (k >= w.start_date && k <= w.end_date) return w
  }
  return null
}

export function AvailabilityByDateTab({
  initialEntries,
  windows,
  submissions: initialSubmissions,
  profiles,
  currentUser,
  isAdmin,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [mode, setMode] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [submissions, setSubmissions] = useState<AvailabilitySubmission[]>(initialSubmissions)
  const [submittingWindowId, setSubmittingWindowId] = useState<string | null>(null)

  const [cells, setCells] = useState<Record<string, CellState>>(() => {
    const map: Record<string, CellState> = {}
    for (const e of initialEntries) {
      map[cellKey(e.user_id, e.entry_date)] = {
        shifts: e.shifts ?? '',
        is_available: e.is_available,
        is_unavailable: e.is_unavailable ?? false,
        saving: false,
        dirty: false,
      }
    }
    return map
  })

  const visibleProfiles = useMemo(() => {
    if (!isAdmin) return profiles.filter((p) => p.id === currentUser.userId)
    const me = profiles.find((p) => p.id === currentUser.userId)
    const others = profiles
      .filter((p) => p.id !== currentUser.userId)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    return me ? [me, ...others] : others
  }, [profiles, currentUser.userId, isAdmin])

  const openWindows = useMemo(() => windows.filter((w) => w.status === 'open'), [windows])

  // Submission lookup helpers — keyed (windowId|userId).
  const submissionFor = (windowId: string, userId: string): AvailabilitySubmission | undefined =>
    submissions.find((s) => s.window_id === windowId && s.user_id === userId)

  const hasSubmittedAnyOpenWindow = useMemo(
    () => openWindows.some((w) => submissionFor(w.id, currentUser.userId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openWindows, submissions, currentUser.userId]
  )

  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true)
      return
    }
    let cancelled = false
    ;(async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { start, end } = visibleRange(anchor, mode)
      const startKey = fmtDateKey(start)
      const endKey = fmtDateKey(end)
      const { data } = await supabase
        .from('availability_entries')
        .select('*')
        .eq('org_id', currentUser.orgId)
        .gte('entry_date', startKey)
        .lte('entry_date', endKey)
      if (cancelled || !data) return

      setCells((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          const [, dateKey] = k.split('|')
          if (dateKey >= startKey && dateKey <= endKey && !next[k].dirty) delete next[k]
        }
        for (const e of data as AvailabilityEntry[]) {
          const k = cellKey(e.user_id, e.entry_date)
          if (next[k]?.dirty) continue
          next[k] = {
            shifts: e.shifts ?? '',
            is_available: e.is_available,
            is_unavailable: e.is_unavailable ?? false,
            saving: false,
            dirty: false,
          }
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [anchor, mode, currentUser.orgId, hasMounted])

  function getCell(userId: string, date: Date): CellState {
    return cells[cellKey(userId, fmtDateKey(date))] ?? emptyCell()
  }

  function updateCell(userId: string, date: Date, patch: Partial<CellState>) {
    const k = cellKey(userId, fmtDateKey(date))
    setCells((prev) => ({
      ...prev,
      [k]: { ...(prev[k] ?? emptyCell()), ...patch, dirty: true },
    }))
  }

  async function saveCell(userId: string, date: Date) {
    const k = cellKey(userId, fmtDateKey(date))
    const cell = cells[k]
    if (!cell || !cell.dirty) return

    setCells((prev) => ({ ...prev, [k]: { ...prev[k], saving: true } }))
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const trimmed = cell.shifts.trim().slice(0, SHIFTS_MAX_LEN)

      // Empty + neither toggle = delete row.
      if (!trimmed && !cell.is_available && !cell.is_unavailable) {
        await supabase
          .from('availability_entries')
          .delete()
          .eq('org_id', currentUser.orgId)
          .eq('user_id', userId)
          .eq('entry_date', fmtDateKey(date))
      } else {
        const { error } = await supabase
          .from('availability_entries')
          .upsert(
            {
              org_id: currentUser.orgId,
              user_id: userId,
              entry_date: fmtDateKey(date),
              // Unavailable wipes any typed shifts so the row can't lie.
              shifts: cell.is_unavailable ? null : trimmed || null,
              is_available: cell.is_available,
              is_unavailable: cell.is_unavailable,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,user_id,entry_date' }
          )
        if (error) throw error
      }
      setCells((prev) => ({ ...prev, [k]: { ...prev[k], saving: false, dirty: false } }))
    } catch (err) {
      setCells((prev) => ({ ...prev, [k]: { ...prev[k], saving: false } }))
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
      console.error('Save availability cell failed:', err)
    }
  }

  async function submitWindow(windowId: string) {
    setSubmittingWindowId(windowId)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data, error } = await supabase
        .from('availability_submissions')
        .insert({
          org_id: currentUser.orgId,
          window_id: windowId,
          user_id: currentUser.userId,
          submitted_at: new Date().toISOString(),
        })
        .select('*')
        .single()
      if (error) throw error
      setSubmissions((prev) => [...prev, data as AvailabilitySubmission])
      toast('Availability submitted')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to submit', 'error')
      console.error('Submit availability failed:', err)
    } finally {
      setSubmittingWindowId(null)
    }
  }

  async function reopenSubmission(windowId: string) {
    const win = windows.find((w) => w.id === windowId)
    if (!win) return
    if (win.status !== 'open') {
      toast(
        'Submissions are locked. Use shift swap from the Schedule tab to change a covered shift.',
        'error'
      )
      return
    }
    setSubmittingWindowId(windowId)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('availability_submissions')
        .delete()
        .eq('window_id', windowId)
        .eq('user_id', currentUser.userId)
      if (error) throw error
      setSubmissions((prev) =>
        prev.filter((s) => !(s.window_id === windowId && s.user_id === currentUser.userId))
      )
      toast('Submission reopened — make your edits and submit again')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reopen submission', 'error')
      console.error('Reopen submission failed:', err)
    } finally {
      setSubmittingWindowId(null)
    }
  }

  return (
    <div className="space-y-3">
      <AvailabilityWindowsStrip
        windows={windows}
        submissions={submissions}
        operationalCount={profiles.length}
        isAdmin={isAdmin}
        orgId={currentUser.orgId}
        userId={currentUser.userId}
      />

      {/* Submit / Edit strip — staff only, only when there's at least one open window. */}
      {!isAdmin && openWindows.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center bg-gray-900 border border-gray-800 rounded-lg p-3">
          <span className="text-xs text-gray-500 uppercase tracking-wide">My submission</span>
          {openWindows.map((w) => {
            const sub = submissionFor(w.id, currentUser.userId)
            const submitted = !!sub
            const submitting = submittingWindowId === w.id
            return (
              <div key={w.id} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-300 font-medium">{w.label}</span>
                {submitted ? (
                  <>
                    <span
                      className="text-[10px] text-green-400"
                      title={`Submitted ${new Date(sub!.submitted_at).toLocaleString()}`}
                    >
                      ✓ Submitted
                    </span>
                    <button
                      type="button"
                      onClick={() => reopenSubmission(w.id)}
                      disabled={submitting}
                      className="text-[11px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded transition-colors disabled:opacity-50"
                    >
                      {submitting ? '...' : 'Edit submission'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => submitWindow(w.id)}
                    disabled={submitting}
                    className="text-[11px] px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : `Submit availability for ${w.label}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit-locked notice for staff who tries to interact with a locked window. */}
      {!isAdmin && hasSubmittedAnyOpenWindow && (
        <p className="text-[11px] text-gray-500 italic">
          Cells inside windows you have submitted for are read-only. Click <em>Edit submission</em>{' '}
          above to reopen.
        </p>
      )}

      {!isAdmin && (
        <p className="text-xs text-gray-500">
          Use the <span className="text-green-400 font-medium">Available</span> /{' '}
          <span className="text-red-400 font-medium">Unavailable</span> toggles per cell. When
          available, optionally type your hours, e.g.{' '}
          <span className="text-gray-300 font-mono">7 - 230</span>. Saves automatically. Cells
          outside an open window are read-only.
        </p>
      )}

      <CalendarMonthGrid
        anchor={anchor}
        mode={mode}
        onAnchorChange={setAnchor}
        onModeChange={setMode}
        renderCell={({ date }) => {
          const win = windowForDate(date, windows)
          // Window must be open AND (admin OR not yet submitted for this window).
          const editable =
            isAdmin || (win?.status === 'open' && !submissionFor(win.id, currentUser.userId))
          return (
            <DayCell
              date={date}
              window={win}
              profiles={visibleProfiles}
              currentUserId={currentUser.userId}
              isAdmin={isAdmin}
              editable={editable}
              submissionFor={submissionFor}
              getCell={getCell}
              updateCell={updateCell}
              saveCell={saveCell}
              compact={mode === 'month'}
            />
          )
        }}
      />
    </div>
  )
}

interface DayCellProps {
  date: Date
  window: AvailabilityWindow | null
  profiles: Profile[]
  currentUserId: string
  isAdmin: boolean
  editable: boolean
  submissionFor: (windowId: string, userId: string) => AvailabilitySubmission | undefined
  getCell: (userId: string, date: Date) => CellState
  updateCell: (userId: string, date: Date, patch: Partial<CellState>) => void
  saveCell: (userId: string, date: Date) => void
  compact: boolean
}

function DayCell({
  date,
  window: win,
  profiles,
  currentUserId,
  isAdmin,
  editable,
  submissionFor,
  getCell,
  updateCell,
  saveCell,
  compact,
}: DayCellProps) {
  return (
    <div className="space-y-1">
      {win?.status === 'locked' && (
        <div className="text-[9px] uppercase tracking-wide text-gray-500">Locked</div>
      )}
      {win?.due_date && win.status === 'open' && (
        <div className="text-[9px] text-amber-400/80" title="Submission deadline">
          Due {fmtShortDate(new Date(win.due_date + 'T12:00:00'))}
        </div>
      )}
      {!win && !isAdmin && (
        <div className="text-[10px] text-gray-600 italic">No window</div>
      )}
      {profiles.map((p) => {
        const cell = getCell(p.id, date)
        const isMe = p.id === currentUserId
        // Per-row editability: in addition to cell-level editability, a staffer
        // who has submitted to the window owning this date is locked out of
        // their own row (admins can still edit anyone). Admin always editable
        // when window is open or no window.
        const submittedByThisUser = win ? !!submissionFor(win.id, p.id) : false
        const rowEditable =
          editable && (isAdmin || (isMe && !submittedByThisUser))
        return (
          <PersonRow
            key={p.id}
            label={isMe ? `${p.full_name.split(' ')[0]} (you)` : p.full_name.split(' ')[0]}
            cell={cell}
            editable={rowEditable}
            compact={compact}
            onChange={(patch) => updateCell(p.id, date, patch)}
            onCommit={() => saveCell(p.id, date)}
          />
        )
      })}
    </div>
  )
}

function PersonRow({
  label,
  cell,
  editable,
  compact,
  onChange,
  onCommit,
}: {
  label: string
  cell: CellState
  editable: boolean
  compact: boolean
  onChange: (patch: Partial<CellState>) => void
  onCommit: () => void
}) {
  if (!editable) {
    if (cell.is_unavailable) {
      return (
        <div className="text-[10px] flex items-center gap-1">
          <span className="text-red-400">✗</span>
          <span className="text-gray-500 truncate">{label}</span>
        </div>
      )
    }
    if (cell.is_available && cell.shifts.trim()) {
      return (
        <div className="text-[10px] flex items-center gap-1">
          <span className="text-green-400">✓</span>
          <span className="text-gray-500 truncate">{label}:</span>
          <span className="text-gray-300 font-mono truncate">{cell.shifts}</span>
        </div>
      )
    }
    if (cell.is_available) {
      return (
        <div className="text-[10px] flex items-center gap-1">
          <span className="text-green-400">✓</span>
          <span className="text-gray-500 truncate">{label}</span>
        </div>
      )
    }
    return <div className="text-[10px] text-gray-700 truncate">— {label}</div>
  }

  // Toggling Available clears Unavailable and vice-versa (mutual exclusion).
  function setAvailable(next: boolean) {
    onChange({
      is_available: next,
      is_unavailable: next ? false : cell.is_unavailable,
    })
    setTimeout(onCommit, 0)
  }
  function setUnavailable(next: boolean) {
    onChange({
      is_unavailable: next,
      is_available: next ? false : cell.is_available,
      shifts: next ? '' : cell.shifts,
    })
    setTimeout(onCommit, 0)
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setAvailable(!cell.is_available)}
          className={`px-1 py-0.5 rounded text-[9px] font-bold border transition-colors ${
            cell.is_available
              ? 'bg-green-500/25 text-green-300 border-green-500/40'
              : 'bg-gray-800 text-gray-500 border-gray-700 hover:bg-green-500/10 hover:text-green-400'
          }`}
          title="Available all day"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => setUnavailable(!cell.is_unavailable)}
          className={`px-1 py-0.5 rounded text-[9px] font-bold border transition-colors ${
            cell.is_unavailable
              ? 'bg-red-500/25 text-red-300 border-red-500/40'
              : 'bg-gray-800 text-gray-500 border-gray-700 hover:bg-red-500/10 hover:text-red-400'
          }`}
          title="Unavailable all day"
        >
          ✗
        </button>
        <span
          className={`text-[10px] truncate flex-1 ${
            cell.is_unavailable
              ? 'text-red-400'
              : cell.is_available
              ? 'text-green-400'
              : 'text-gray-500'
          }`}
        >
          {label}
        </span>
        {cell.saving && <span className="text-[9px] text-gray-600 italic">saving</span>}
      </div>
      {/* Hours input shown only when not "Unavailable" — both opt-in and unset
          allow specifying constrained hours. */}
      {!cell.is_unavailable && (
        <input
          type="text"
          value={cell.shifts}
          onChange={(e) => onChange({ shifts: e.target.value })}
          onBlur={onCommit}
          placeholder={compact ? 'or hrs' : 'or specify hours, e.g. 7 - 230'}
          maxLength={SHIFTS_MAX_LEN}
          className="w-full px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] font-mono text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      )}
    </div>
  )
}
