'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import { CalendarMonthGrid } from '@/components/calendar-month-grid'
import {
  ScheduleTimeGrid,
  type ShiftWithProfile,
  getRoleBadgeColor,
  getRoleShortLabel,
} from '@/components/schedule-time-grid'
import {
  ViewMode,
  fmtDateKey,
  fmtDateRangeLabel,
  fmtShortDate,
  startOfDay,
  stepAnchor,
  visibleRange,
} from '@/lib/calendar'
import { fmtTime12h, fmtTimeRange12h, fmtTimeRange12hCompact } from '@/lib/format'
import {
  ALL_SHIFT_ROLES,
  SHIFT_ROLE_LABELS,
  type Profile,
  type ShiftRole,
  type AvailabilityEntry,
  type TimeOffRequest,
} from '@/types/database'
import type { OrgHours } from '../staff-module'

// Compact pill colors for the month-view cells. Distinct from the timeline
// block colors so month cells don't visually shout — month is the
// at-a-glance view, week/day are the detail views.
const monthPillColors: Record<ShiftRole, string> = {
  'front-desk': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  coaching: 'bg-green-500/15 text-green-300 border-green-500/30',
  instructor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'league-leader': 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  management: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  other: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
}

interface TimeOffWithProfile extends TimeOffRequest {
  profile?: { full_name: string }
}

interface Props {
  shifts: ShiftWithProfile[]
  profiles: Profile[]
  isAdmin: boolean
  orgId: string
  availabilityEntries: AvailabilityEntry[]
  timeOffRequests: TimeOffWithProfile[]
  orgHours?: OrgHours
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
}

type FilterMode = 'mine' | 'all'

function parseTimeMinutes(t: string): number | null {
  const [h, m] = t.split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/** Best-effort parse of free-text shifts ("7 - 230", "open - 9, 5 - close").
 *  Returns total estimated hours. Used for the hours-summary "available"
 *  number — a rough sanity check, not a precise count.
 */
function approximateHours(shifts: string | null): number {
  if (!shifts) return 0
  let total = 0
  for (const tok of shifts.split(',')) {
    const halves = tok.split(/[-–]/).map((s) => s.trim())
    if (halves.length !== 2) continue
    const a = parseLooseHHMM(halves[0])
    const b = parseLooseHHMM(halves[1])
    if (a == null || b == null) continue
    let dur = b - a
    if (dur < 0) dur += 24 * 60
    total += dur
  }
  return total / 60
}

function parseLooseHHMM(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '')
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
  const lower = raw.toLowerCase()
  if (!lower.includes('a') && !lower.includes('p') && h >= 1 && h <= 6) h += 12
  return h * 60 + m
}

/**
 * Resolve the (open, close) hour pair to use for the timeline axis. Pull
 * from org_settings.daily_hours / open_time / close_time when present, fall
 * back to 5 AM – 11 PM (Sami's default — covers The Jar's typical 7 AM open
 * to 10 PM close with buffer for the staff-arrive-before / depart-after
 * settings).
 */
function getTimelineRange(orgHours?: OrgHours): { startHour: number; endHour: number } {
  const fallback = { startHour: 5, endHour: 23 }
  if (!orgHours) return fallback

  const collectHours: number[] = []
  if (orgHours.daily_hours) {
    for (const v of Object.values(orgHours.daily_hours)) {
      const o = parseTimeMinutes(v.open)
      const c = parseTimeMinutes(v.close)
      if (o != null) collectHours.push(o / 60)
      if (c != null) collectHours.push(c / 60)
    }
  }
  if (orgHours.open_time) {
    const o = parseTimeMinutes(orgHours.open_time)
    if (o != null) collectHours.push(o / 60)
  }
  if (orgHours.close_time) {
    const c = parseTimeMinutes(orgHours.close_time)
    if (c != null) collectHours.push(c / 60)
  }
  if (collectHours.length === 0) return fallback

  const minH = Math.min(...collectHours)
  const maxH = Math.max(...collectHours)
  // Pad ±1 hour for staff-arrive-before / depart-after, then clamp to a
  // full-hour grid.
  const startHour = Math.max(0, Math.floor(minH - 1))
  const endHour = Math.min(24, Math.ceil(maxH + 1))
  // If the window is too tight (single point or otherwise unreliable),
  // fall back to the default 18-hour day.
  if (endHour - startHour < 6) return fallback
  return { startHour, endHour }
}

export function ScheduleTab({
  shifts,
  profiles,
  isAdmin,
  orgId,
  availabilityEntries,
  timeOffRequests,
  orgHours,
  currentUser,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [mode, setMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [filter, setFilter] = useState<FilterMode>(isAdmin ? 'all' : 'mine')

  // Two distinct popovers:
  //  - dayPopover: the Assign-modal for a date (admin only). Set when admin
  //    clicks an empty area or "+ Assign".
  //  - shiftDetail: the detail/edit popover for a specific existing shift.
  //    Set when ANY user clicks a shift block/pill.
  const [dayPopover, setDayPopover] = useState<Date | null>(null)
  const [shiftDetail, setShiftDetail] = useState<ShiftWithProfile | null>(null)

  const { startHour, endHour } = useMemo(() => getTimelineRange(orgHours), [orgHours])

  const timeOffMap = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const r of timeOffRequests) {
      if (r.status !== 'approved') continue
      if (!map[r.user_id]) map[r.user_id] = new Set()
      const start = new Date(r.start_date + 'T12:00:00')
      const end = new Date(r.end_date + 'T12:00:00')
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        map[r.user_id].add(fmtDateKey(d))
      }
    }
    return map
  }, [timeOffRequests])

  const entryMap = useMemo(() => {
    const map: Record<string, AvailabilityEntry> = {}
    for (const e of availabilityEntries) map[`${e.user_id}|${e.entry_date}`] = e
    return map
  }, [availabilityEntries])

  const shiftsByDate = useMemo(() => {
    const map: Record<string, ShiftWithProfile[]> = {}
    for (const s of shifts) {
      if (!map[s.shift_date]) map[s.shift_date] = []
      map[s.shift_date].push(s)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return map
  }, [shifts])

  const filteredShifts = useMemo<ShiftWithProfile[]>(() => {
    if (filter === 'mine') return shifts.filter((s) => s.user_id === currentUser.userId)
    return shifts
  }, [shifts, filter, currentUser.userId])

  const visibleShiftsForDate = (date: Date): ShiftWithProfile[] => {
    const all = shiftsByDate[fmtDateKey(date)] ?? []
    if (filter === 'mine') return all.filter((s) => s.user_id === currentUser.userId)
    return all
  }

  const weekRangeStart = useMemo(() => visibleRange(anchor, 'week').start, [anchor])

  const hoursSummary = useMemo(() => {
    const range = visibleRange(anchor, mode === 'day' ? 'week' : mode)
    const startKey = fmtDateKey(range.start)
    const endKey = fmtDateKey(range.end)

    type Row = {
      profile: Profile
      assignedHours: number
      availableHours: number
    }
    const rows: Record<string, Row> = {}
    for (const p of profiles) {
      rows[p.id] = { profile: p, assignedHours: 0, availableHours: 0 }
    }
    for (const s of shifts) {
      if (s.shift_date < startKey || s.shift_date > endKey) continue
      const a = parseTimeMinutes(s.start_time)
      const b = parseTimeMinutes(s.end_time)
      if (a == null || b == null) continue
      const dur = (b - a) / 60
      if (rows[s.user_id]) rows[s.user_id].assignedHours += Math.max(0, dur)
    }
    for (const e of availabilityEntries) {
      if (e.entry_date < startKey || e.entry_date > endKey) continue
      if (!e.is_available) continue
      const hrs = approximateHours(e.shifts)
      const fallback = hrs > 0 ? hrs : 8
      if (rows[e.user_id]) rows[e.user_id].availableHours += fallback
    }
    return Object.values(rows)
      .filter((r) => r.assignedHours > 0 || r.availableHours > 0)
      .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name))
  }, [profiles, shifts, availabilityEntries, anchor, mode])

  const toolbarRight = (
    <div className="flex items-center gap-1 ml-2">
      {(['mine', 'all'] as FilterMode[]).map((f) => (
        <button
          key={f}
          onClick={() => setFilter(f)}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${
            filter === f
              ? 'bg-gray-700 text-white'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
          }`}
        >
          {f === 'mine' ? 'My schedule' : 'Total schedule'}
        </button>
      ))}
    </div>
  )

  const handleShiftClick = (s: ShiftWithProfile) => {
    setShiftDetail(s)
  }

  const handleEmptyDayClick = (d: Date) => {
    if (!isAdmin) return
    setDayPopover(d)
  }

  const handleDeleteShift = async (id: string) => {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('shifts').delete().eq('id', id)
      if (error) throw error
      toast('Shift removed')
      setShiftDetail(null)
      setDayPopover(null)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  return (
    <div className="space-y-4">
      {mode === 'month' ? (
        <CalendarMonthGrid
          anchor={anchor}
          mode="month"
          onAnchorChange={setAnchor}
          onModeChange={setMode}
          toolbarRight={toolbarRight}
          renderCell={({ date }) => {
            const dayShifts = visibleShiftsForDate(date)
            return (
              <div className="space-y-0.5">
                {dayShifts.length === 0 && (
                  <div className="text-[9px] text-gray-700">—</div>
                )}
                {dayShifts.map((s) => {
                  const firstName = s.profile?.full_name?.split(' ')[0] ?? '?'
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleShiftClick(s)}
                      className={`w-full text-[10px] px-1 py-0.5 rounded border truncate text-left flex items-center gap-1 hover:opacity-80 transition-opacity ${monthPillColors[s.role]}`}
                      title={`${s.profile?.full_name ?? ''}\n${fmtTimeRange12h(s.start_time, s.end_time)}\n${SHIFT_ROLE_LABELS[s.role]}${s.notes ? `\n${s.notes}` : ''}`}
                    >
                      <span className="font-medium truncate">{firstName}</span>
                      <span className="opacity-70 font-mono shrink-0">
                        {fmtTime12h(s.start_time).replace(' AM', 'a').replace(' PM', 'p')}
                      </span>
                      <span
                        className={`ml-auto text-[8px] uppercase tracking-wide px-1 rounded border ${getRoleBadgeColor(s.role)}`}
                      >
                        {getRoleShortLabel(s.role)}
                      </span>
                    </button>
                  )
                })}
                {isAdmin && (
                  <button
                    onClick={() => setDayPopover(date)}
                    className="text-[10px] w-full text-left text-gray-500 hover:text-orange-400 transition-colors mt-0.5"
                  >
                    + Assign
                  </button>
                )}
              </div>
            )
          }}
        />
      ) : (
        // Day or Week view: hand-built toolbar (CalendarMonthGrid couples
        // toolbar+body, but we want the toolbar with our own time-grid body).
        <div className="space-y-3">
          <ScheduleToolbar
            anchor={anchor}
            mode={mode}
            onAnchorChange={setAnchor}
            onModeChange={setMode}
            toolbarRight={toolbarRight}
          />
          <ScheduleTimeGrid
            mode={mode}
            anchor={anchor}
            rangeStart={weekRangeStart}
            shifts={filteredShifts}
            startHour={startHour}
            endHour={endHour}
            onShiftClick={handleShiftClick}
            onEmptyClick={handleEmptyDayClick}
            isAdmin={isAdmin}
          />
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Hours summary ({mode === 'day' ? 'this week' : `this ${mode}`})
        </h3>
        {hoursSummary.length === 0 ? (
          <p className="text-xs text-gray-600">
            No shifts or availability submitted in this range.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {hoursSummary.map((r) => {
              const target = r.profile.target_weekly_hours
              return (
                <div
                  key={r.profile.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg text-sm"
                >
                  <span className="text-gray-300 truncate">{r.profile.full_name}</span>
                  <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                    <span className="text-white font-semibold">{r.assignedHours.toFixed(1)}h</span>
                    {' / '}
                    <span title="Estimated from availability submissions (free-text — approximate)">
                      ~{r.availableHours.toFixed(0)}h avail
                    </span>
                    {target != null && (
                      <span className="ml-2 text-orange-300" title="Target weekly hours">
                        target {target}h
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {dayPopover && isAdmin && (
        <DayAssignPopover
          date={dayPopover}
          orgId={orgId}
          profiles={profiles}
          entryMap={entryMap}
          timeOffMap={timeOffMap}
          existingShifts={shiftsByDate[fmtDateKey(dayPopover)] ?? []}
          onClose={() => setDayPopover(null)}
          onAssigned={() => {
            setDayPopover(null)
            router.refresh()
          }}
          onDeleteShift={handleDeleteShift}
        />
      )}

      {shiftDetail && (
        <ShiftDetailPopover
          shift={shiftDetail}
          isAdmin={isAdmin}
          onClose={() => setShiftDetail(null)}
          onDelete={handleDeleteShift}
        />
      )}
    </div>
  )
}

interface ScheduleToolbarProps {
  anchor: Date
  mode: ViewMode
  onAnchorChange: (next: Date) => void
  onModeChange: (next: ViewMode) => void
  toolbarRight: React.ReactNode
}

/**
 * Stand-in toolbar for day/week views. Mirrors the layout of
 * CalendarMonthGrid's toolbar so the UI is consistent across all three
 * view modes — back/Today/forward + visible-range label + day/week/month
 * mode switch + filter buttons (slot via toolbarRight).
 */
function ScheduleToolbar({
  anchor,
  mode,
  onAnchorChange,
  onModeChange,
  toolbarRight,
}: ScheduleToolbarProps) {
  const range = useMemo(() => visibleRange(anchor, mode), [anchor, mode])
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onAnchorChange(stepAnchor(anchor, mode, -1))}
        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        title={`Previous ${mode}`}
        aria-label={`Previous ${mode}`}
      >
        ←
      </button>
      <button
        onClick={() => onAnchorChange(new Date())}
        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
      >
        Today
      </button>
      <button
        onClick={() => onAnchorChange(stepAnchor(anchor, mode, 1))}
        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        title={`Next ${mode}`}
        aria-label={`Next ${mode}`}
      >
        →
      </button>

      <div className="text-sm text-gray-200 ml-2 font-medium">
        {mode === 'week' ? fmtDateRangeLabel(range.start, range.end) : fmtShortDate(anchor)}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {(['day', 'week', 'month'] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`text-xs px-3 py-1.5 rounded transition-colors capitalize ${
              mode === m
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
          >
            {m}
          </button>
        ))}
        {toolbarRight}
      </div>
    </div>
  )
}

interface ShiftDetailPopoverProps {
  shift: ShiftWithProfile
  isAdmin: boolean
  onClose: () => void
  onDelete: (id: string) => void
}

/** Click-to-detail popover for a single shift. Admin can delete; staff sees details. */
function ShiftDetailPopover({ shift, isAdmin, onClose, onDelete }: ShiftDetailPopoverProps) {
  const date = new Date(shift.shift_date + 'T12:00:00')
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{shift.profile?.full_name ?? 'Shift'}</h3>
            <p className="text-xs text-gray-500">
              {date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs uppercase tracking-wide w-16 shrink-0">
              Time
            </span>
            <span className="text-white font-mono">
              {fmtTimeRange12h(shift.start_time, shift.end_time)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs uppercase tracking-wide w-16 shrink-0">
              Role
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded border ${getRoleBadgeColor(shift.role)}`}
            >
              {SHIFT_ROLE_LABELS[shift.role]}
            </span>
          </div>
          {shift.notes && (
            <div className="flex items-start gap-2">
              <span className="text-gray-500 text-xs uppercase tracking-wide w-16 shrink-0 pt-0.5">
                Notes
              </span>
              <span className="text-gray-200">{shift.notes}</span>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
            >
              Close
            </button>
            <button
              onClick={() => onDelete(shift.id)}
              className="px-3 py-1.5 text-sm bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded border border-red-500/30 transition-colors"
            >
              Remove shift
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface DayAssignPopoverProps {
  date: Date
  orgId: string
  profiles: Profile[]
  entryMap: Record<string, AvailabilityEntry>
  timeOffMap: Record<string, Set<string>>
  existingShifts: ShiftWithProfile[]
  onClose: () => void
  onAssigned: () => void
  onDeleteShift: (id: string) => void
}

function DayAssignPopover({
  date,
  orgId,
  profiles,
  entryMap,
  timeOffMap,
  existingShifts,
  onClose,
  onAssigned,
  onDeleteShift,
}: DayAssignPopoverProps) {
  const { toast } = useToast()
  const dateKey = fmtDateKey(date)
  const [form, setForm] = useState<{
    user_id: string
    start_time: string
    end_time: string
    role: ShiftRole
    notes: string
  }>({
    user_id: '',
    start_time: '08:00',
    end_time: '14:00',
    role: 'front-desk',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    return profiles
      .map((p) => {
        const e = entryMap[`${p.id}|${dateKey}`]
        const offToday = timeOffMap[p.id]?.has(dateKey)
        let status: 'available' | 'no-submission' | 'time-off' = 'no-submission'
        if (offToday) status = 'time-off'
        else if (e?.is_available) status = 'available'
        return { profile: p, status, shifts: e?.shifts ?? null }
      })
      .sort((a, b) => {
        const order = { available: 0, 'no-submission': 1, 'time-off': 2 } as const
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
        return a.profile.full_name.localeCompare(b.profile.full_name)
      })
  }, [profiles, entryMap, timeOffMap, dateKey])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.user_id) {
      toast('Pick a staff member first', 'error')
      return
    }
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('shifts').insert({
        org_id: orgId,
        user_id: form.user_id,
        shift_date: dateKey,
        start_time: form.start_time,
        end_time: form.end_time,
        role: form.role,
        notes: form.notes || null,
      })
      if (error) throw error
      toast('Shift assigned')
      onAssigned()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to assign', 'error')
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
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{fmtShortDate(date)}</h3>
            <p className="text-xs text-gray-500">
              {date.toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">
            ×
          </button>
        </div>

        {existingShifts.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-800">
            <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Already assigned</h4>
            <div className="space-y-1">
              {existingShifts.map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <span className="text-white">{s.profile?.full_name}</span>
                  <span className="text-gray-500 font-mono text-xs">
                    {fmtTimeRange12hCompact(s.start_time, s.end_time)}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${getRoleBadgeColor(s.role)}`}
                  >
                    {SHIFT_ROLE_LABELS[s.role]}
                  </span>
                  <button
                    onClick={() => onDeleteShift(s.id)}
                    className="ml-auto text-gray-500 hover:text-red-400 text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-b border-gray-800">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            Who&apos;s available
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {rows.map((r) => {
              const disabled = r.status === 'time-off'
              return (
                <button
                  key={r.profile.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, user_id: r.profile.id }))}
                  className={`text-left px-3 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                    form.user_id === r.profile.id
                      ? 'bg-orange-600/30 ring-1 ring-orange-500'
                      : 'bg-gray-800 hover:bg-gray-700'
                  } ${disabled ? 'opacity-60' : ''}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      r.status === 'available'
                        ? 'bg-green-400'
                        : r.status === 'time-off'
                        ? 'bg-red-400'
                        : 'bg-yellow-400'
                    }`}
                  />
                  <span className="text-white truncate">{r.profile.full_name}</span>
                  {r.shifts && (
                    <span className="text-[10px] text-gray-500 font-mono ml-auto truncate">
                      {r.shifts}
                    </span>
                  )}
                </button>
              )
            })}
            {rows.length === 0 && <p className="text-xs text-gray-600 italic">No staff to show.</p>}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1" />
            Available
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 ml-3 mr-1" />
            No submission
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 ml-3 mr-1" />
            Time off
          </p>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                Start{' '}
                <span className="text-gray-600 normal-case">
                  ({fmtTime12h(form.start_time)})
                </span>
              </label>
              <input
                type="time"
                required
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                End{' '}
                <span className="text-gray-600 normal-case">
                  ({fmtTime12h(form.end_time)})
                </span>
              </label>
              <input
                type="time"
                required
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                Role
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as ShiftRole }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {ALL_SHIFT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {SHIFT_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="optional"
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || !form.user_id}
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Assigning...' : form.user_id ? 'Assign shift' : 'Pick a staff member above'}
          </button>
        </form>
      </div>
    </div>
  )
}
