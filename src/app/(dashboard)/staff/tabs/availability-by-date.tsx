'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import { CalendarMonthGrid } from '@/components/calendar-month-grid'
import { ViewMode, fmtDateKey, fmtShortDate, startOfDay, visibleRange } from '@/lib/calendar'
import { TimeBlockPicker, START_HOUR, SLOT_MINUTES, TOTAL_SLOTS } from '@/components/time-block-picker'
import type {
  Profile,
  AvailabilityEntry,
  AvailabilityWindow,
  AvailabilitySubmission,
  AvailabilityWindowAssignee,
} from '@/types/database'
import type { OrgHours } from '../staff-module'
import { AvailabilityWindowsStrip } from './availability-windows-strip'

const SHIFTS_MAX_LEN = 200

function closedSlotsForDay(date: Date, orgHours?: OrgHours): Set<number> | undefined {
  if (!orgHours) return undefined
  const dow = date.getDay()
  const daily = orgHours.daily_hours
  const dayEntry = daily?.[String(dow)]
  const openMin = parseHHMM(dayEntry?.open ?? orgHours.open_time)
  const closeMin = parseHHMM(dayEntry?.close ?? orgHours.close_time)
  if (openMin == null || closeMin == null) return undefined
  const closed = new Set<number>()
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slotMin = START_HOUR * 60 + i * SLOT_MINUTES
    if (slotMin < openMin || slotMin >= closeMin) closed.add(i)
  }
  return closed.size > 0 ? closed : undefined
}

function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * Light validation: can we reasonably parse this free-text shifts entry?
 * Returns null if valid, or an error string if not. Only validates non-empty
 * strings on cells where is_available=true (if they typed hours, those hours
 * should be parseable as time ranges).
 */
function validateShiftsText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (/^n\/?a$/i.test(trimmed) || /^off$/i.test(trimmed) || /^none$/i.test(trimmed)) {
    return `"${trimmed}" — if you're unavailable, use the ✗ button instead`
  }
  const tokens = trimmed.split(',')
  let parsedAny = false
  for (const tok of tokens) {
    const t = tok.trim()
    if (!t) continue
    const halves = t.split(/[-–]/).map((s) => s.trim())
    if (halves.length === 2 && halves[0] && halves[1]) {
      const a = parseLooseTime(halves[0])
      const b = parseLooseTime(halves[1])
      if (a != null && b != null) {
        if (a >= b) return `"${t}" — start time must be before end time`
        parsedAny = true; continue
      }
    }
    if (/^\d{1,2}(:\d{2})?\s*(am?|pm?)?$/i.test(t)) { parsedAny = true; continue }
    return `Can't understand "${t}" — try a format like "7 - 230" or "9a - 5p"`
  }
  if (!parsedAny && tokens.length > 0) {
    return `Can't understand "${trimmed}" — try a format like "7 - 230" or "9a - 5p"`
  }
  return null
}

function parseLooseTime(raw: string): number | null {
  const lower = raw.toLowerCase().trim()
  if (!lower) return null
  if (/^(open|close|all|any)$/i.test(lower)) return null
  const digits = lower.replace(/[^\d]/g, '')
  if (!digits) return null
  let h = 0
  let m = 0
  if (digits.length <= 2) h = parseInt(digits, 10)
  else if (digits.length === 3) {
    h = parseInt(digits.slice(0, 1), 10)
    m = parseInt(digits.slice(1), 10)
  } else {
    h = parseInt(digits.slice(0, 2), 10)
    m = parseInt(digits.slice(2, 4), 10)
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  if (lower.includes('p') && h < 12) h += 12
  if (lower.includes('a') && h === 12) h = 0
  if (!lower.includes('a') && !lower.includes('p') && h >= 1 && h <= 6) h += 12
  return h * 60 + m
}

interface Props {
  initialEntries: AvailabilityEntry[]
  windows: AvailabilityWindow[]
  submissions: AvailabilitySubmission[]
  assignees: AvailabilityWindowAssignee[]
  /** Full active+visible profile list — used by the assignee picker (can include non-schedulable). */
  profiles: Profile[]
  /** Operational subset (is_operational_staff=true OR self) — fallback for admin's calendar view when no windows are visible. */
  operationalProfiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
  weekStartDay?: number
  orgHours?: OrgHours
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
  assignees,
  profiles,
  operationalProfiles,
  currentUser,
  isAdmin,
  weekStartDay = 0,
  orgHours,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [mode, setMode] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [submissions, setSubmissions] = useState<AvailabilitySubmission[]>(initialSubmissions)
  const [submittingWindowId, setSubmittingWindowId] = useState<string | null>(null)

  const [selectedDay, setSelectedDay] = useState<{ date: Date; userId: string } | null>(null)

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

  const cellsRef = useRef(cells)
  cellsRef.current = cells

  // Admin calendar rows: union of assignees across ALL windows in scope.
  // If no windows have any assignees yet, fall back to operationalProfiles
  // so the calendar isn't empty before any windows are configured.
  // Staff users still see only their own row.
  const visibleProfiles = useMemo(() => {
    if (!isAdmin) return profiles.filter((p) => p.id === currentUser.userId)

    const assigneeIds = new Set(assignees.map((a) => a.user_id))
    const filteredFromAssignees = profiles.filter((p) => assigneeIds.has(p.id))
    const baseList =
      filteredFromAssignees.length > 0 ? filteredFromAssignees : operationalProfiles

    const me = baseList.find((p) => p.id === currentUser.userId)
    const others = baseList
      .filter((p) => p.id !== currentUser.userId)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    return me ? [me, ...others] : others
  }, [assignees, profiles, operationalProfiles, currentUser.userId, isAdmin])

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
      const { start, end } = visibleRange(anchor, mode, weekStartDay)
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
    const snap = cellsRef.current[k]
    if (!snap || !snap.dirty) return
    setCells((prev) => ({ ...prev, [k]: { ...prev[k], saving: true } }))

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const trimmed = snap.shifts.trim().slice(0, SHIFTS_MAX_LEN)

      // Empty + neither toggle = delete row.
      if (!trimmed && !snap.is_available && !snap.is_unavailable) {
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
              shifts: snap.is_unavailable ? null : trimmed || null,
              is_available: snap.is_available,
              is_unavailable: snap.is_unavailable,
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
    const win = windows.find((w) => w.id === windowId)
    if (!win) return

    // Validate: scan cells inside this window for the current user.
    // Flag any "available" cells with unparseable shifts text.
    const issues: string[] = []
    const d = new Date(win.start_date + 'T12:00:00')
    const endDate = new Date(win.end_date + 'T12:00:00')
    while (d <= endDate) {
      const cell = getCell(currentUser.userId, d)
      if (cell.is_available && cell.shifts.trim()) {
        const err = validateShiftsText(cell.shifts)
        if (err) {
          const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          issues.push(`${dateLabel}: ${err}`)
        }
      }
      d.setDate(d.getDate() + 1)
    }
    if (issues.length > 0) {
      const msg = issues.length === 1
        ? `Fix before submitting:\n${issues[0]}`
        : `Fix ${issues.length} entries before submitting:\n${issues.join('\n')}`
      toast(msg, 'error')
      return
    }

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
        assignees={assignees}
        profiles={profiles}
        operationalProfiles={operationalProfiles}
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
        weekStartDay={weekStartDay}
        anchor={anchor}
        mode={mode}
        onAnchorChange={setAnchor}
        onModeChange={setMode}
        renderCell={({ date }) => {
          const win = windowForDate(date, windows)
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
              onOpenTimePicker={(userId) => setSelectedDay({ date, userId })}
            />
          )
        }}
      />

      {selectedDay && (
        <DayAvailabilityModal
          date={selectedDay.date}
          profileName={
            visibleProfiles.find((p) => p.id === selectedDay.userId)?.full_name ?? ''
          }
          cell={getCell(selectedDay.userId, selectedDay.date)}
          editable={(() => {
            const win = windowForDate(selectedDay.date, windows)
            if (isAdmin) return true
            if (!win || win.status !== 'open') return false
            return !submissionFor(win.id, selectedDay.userId)
          })()}
          onUpdate={(patch) => updateCell(selectedDay.userId, selectedDay.date, patch)}
          onSave={() => saveCell(selectedDay.userId, selectedDay.date)}
          onClose={() => setSelectedDay(null)}
          closedSlots={closedSlotsForDay(selectedDay.date, orgHours)}
        />
      )}
    </div>
  )
}

function DayAvailabilityModal({
  date,
  profileName,
  cell,
  editable,
  onUpdate,
  onSave,
  onClose,
  closedSlots,
}: {
  date: Date
  profileName: string
  cell: CellState
  editable: boolean
  onUpdate: (patch: Partial<CellState>) => void
  onSave: () => void
  onClose: () => void
  closedSlots?: Set<number>
}) {
  const dayLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  function handleTimeBlockChange(text: string) {
    onUpdate({ shifts: text, is_available: true, is_unavailable: false })
    setTimeout(onSave, 0)
  }

  function handleSaveAndClose() {
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h3 className="text-sm font-semibold text-white">{dayLabel}</h3>
            <p className="text-xs text-gray-400">{profileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!editable) return
                onUpdate({ is_available: true, is_unavailable: false })
                setTimeout(onSave, 0)
              }}
              disabled={!editable}
              className={`flex-1 py-2 rounded text-xs font-medium border transition-colors ${
                cell.is_available && !cell.is_unavailable
                  ? 'bg-green-500/25 text-green-300 border-green-500/40'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-green-500/10 hover:text-green-300'
              } disabled:opacity-50`}
            >
              ✓ Available
            </button>
            <button
              type="button"
              onClick={() => {
                if (!editable) return
                onUpdate({ is_unavailable: true, is_available: false, shifts: '' })
                setTimeout(onSave, 0)
              }}
              disabled={!editable}
              className={`flex-1 py-2 rounded text-xs font-medium border transition-colors ${
                cell.is_unavailable
                  ? 'bg-red-500/25 text-red-300 border-red-500/40'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-red-500/10 hover:text-red-300'
              } disabled:opacity-50`}
            >
              ✗ Unavailable
            </button>
          </div>

          {!cell.is_unavailable && editable && (
            <>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">
                  Tap or drag to select your available hours
                </label>
                <TimeBlockPicker
                  value={cell.shifts}
                  onChange={handleTimeBlockChange}
                  closedSlots={closedSlots}
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">
                  Or type manually
                </label>
                <input
                  type="text"
                  value={cell.shifts}
                  onChange={(e) => onUpdate({ shifts: e.target.value })}
                  onBlur={onSave}
                  placeholder="e.g. 7a - 2:30p, 5p - 8p"
                  maxLength={SHIFTS_MAX_LEN}
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </>
          )}

          {!cell.is_unavailable && !editable && cell.shifts && (
            <div className="text-xs text-gray-300 font-mono bg-gray-800 rounded p-2">
              {cell.shifts}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-800">
          <button
            type="button"
            onClick={handleSaveAndClose}
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
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
  onOpenTimePicker: (userId: string) => void
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
  onOpenTimePicker,
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
            onOpenTimePicker={rowEditable ? () => onOpenTimePicker(p.id) : undefined}
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
  onOpenTimePicker,
}: {
  label: string
  cell: CellState
  editable: boolean
  compact: boolean
  onChange: (patch: Partial<CellState>) => void
  onCommit: () => void
  onOpenTimePicker?: () => void
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
      {!cell.is_unavailable && (
        onOpenTimePicker ? (
          <button
            type="button"
            onClick={onOpenTimePicker}
            className="w-full text-left px-1.5 py-1 bg-gray-800 border border-dashed border-gray-700 rounded text-[10px] font-mono text-gray-400 hover:text-orange-300 hover:border-orange-500/40 transition-colors truncate"
          >
            {cell.shifts.trim() || (compact ? 'Set hours' : 'Tap to set available hours')}
          </button>
        ) : (
          <input
            type="text"
            value={cell.shifts}
            onChange={(e) => onChange({ shifts: e.target.value })}
            onBlur={onCommit}
            placeholder={compact ? 'or hrs' : 'or specify hours, e.g. 7 - 230'}
            maxLength={SHIFTS_MAX_LEN}
            className="w-full px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] font-mono text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        )
      )}
    </div>
  )
}
