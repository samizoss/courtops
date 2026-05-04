'use client'

// Restaurant-style schedule timeline. Used by the Schedule tab for both Day
// (single column) and Week (7 columns Sun–Sat) views. Each shift renders as a
// positioned block whose top = start time and height = duration. Overlapping
// shifts in the same day-column are split into side-by-side lanes so the user
// can see both — Geneva specifically asked for this on 2026-04-28 ("Geneva
// 9–2:30 + Cody 1–5 should look like two shifts, not one merged block").

import { useMemo } from 'react'
import {
  DAY_LABELS_SHORT,
  DAY_LABELS_FULL,
  addDays,
  fmtDateKey,
  isSameDay,
  startOfDay,
} from '@/lib/calendar'
import { fmtTimeRange12hCompact } from '@/lib/format'
import type { ShiftRole, ScheduleShift } from '@/types/database'

export interface ShiftWithProfile extends ScheduleShift {
  profile?: { full_name: string }
}

// Solid + saturated role colors for the timeline blocks. Bordered + tinted
// background so blocks read clearly against the dark grid even when small.
const roleBlockColors: Record<ShiftRole, string> = {
  'front-desk': 'bg-blue-600/40 border-blue-400/60 text-blue-50 hover:bg-blue-600/55',
  coaching: 'bg-green-600/40 border-green-400/60 text-green-50 hover:bg-green-600/55',
  instructor: 'bg-purple-600/40 border-purple-400/60 text-purple-50 hover:bg-purple-600/55',
  'league-leader': 'bg-pink-600/40 border-pink-400/60 text-pink-50 hover:bg-pink-600/55',
  management: 'bg-orange-600/40 border-orange-400/60 text-orange-50 hover:bg-orange-600/55',
  other: 'bg-gray-600/50 border-gray-400/60 text-gray-50 hover:bg-gray-600/65',
}

const roleBadgeColors: Record<ShiftRole, string> = {
  'front-desk': 'bg-blue-500/20 text-blue-200 border-blue-500/40',
  coaching: 'bg-green-500/20 text-green-200 border-green-500/40',
  instructor: 'bg-purple-500/20 text-purple-200 border-purple-500/40',
  'league-leader': 'bg-pink-500/20 text-pink-200 border-pink-500/40',
  management: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  other: 'bg-gray-500/20 text-gray-200 border-gray-500/40',
}

/** Short role labels for tight pill rendering. */
const ROLE_SHORT: Record<ShiftRole, string> = {
  'front-desk': 'FD',
  coaching: 'Coach',
  instructor: 'Inst',
  'league-leader': 'Lead',
  management: 'Mgmt',
  other: 'Other',
}

export function getRoleBadgeColor(role: ShiftRole): string {
  return roleBadgeColors[role]
}

export function getRoleShortLabel(role: ShiftRole): string {
  return ROLE_SHORT[role]
}

interface Props {
  /** 'day' renders a single day-column; 'week' renders Sun–Sat. */
  mode: 'day' | 'week'
  /** Anchor date — for 'day' it's the displayed day; for 'week' the week containing this date. */
  anchor: Date
  /** Sun anchor of the visible range (passed in so caller can keep it consistent with toolbar). */
  rangeStart: Date
  /** All shifts that may fall in the visible range. The grid filters by date itself. */
  shifts: ShiftWithProfile[]
  /** Hour to start the time axis at (24h). Default 5. */
  startHour?: number
  /** Hour to end the time axis at (24h, exclusive). Default 23. */
  endHour?: number
  /** Click handler on an existing shift block. */
  onShiftClick?: (shift: ShiftWithProfile) => void
  /** Click handler on empty area — passes the date that was clicked. */
  onEmptyClick?: (date: Date) => void
  /** Whether admin affordances (empty-cell click, "+ Assign" hint) should show. */
  isAdmin: boolean
}

/** Convert a "HH:MM" or "HH:MM:SS" to fractional hours, or null. */
function timeToHours(t: string): number | null {
  const [h, m] = t.split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h + m / 60
}

interface PositionedShift extends ShiftWithProfile {
  top: number
  height: number
  lane: number
  lanes: number
}

/**
 * Greedy left-pack lane assignment. Shifts sorted by start time get the
 * lowest free lane that doesn't overlap any active shift in that lane. Two
 * shifts overlap iff their [start, end) intervals intersect. The result is
 * guaranteed to give every shift a lane and the per-shift `lanes` count
 * reflects the day-wide max simultaneous overlap, so non-overlapping shifts
 * get full width while a 3-way overlap shrinks to 1/3 width for those three
 * shifts.
 */
function assignLanes(dayShifts: ShiftWithProfile[]): PositionedShift[] {
  if (dayShifts.length === 0) return []

  type WithHours = ShiftWithProfile & { _start: number; _end: number }
  const withHours: WithHours[] = dayShifts
    .map((s) => {
      const start = timeToHours(s.start_time)
      const end = timeToHours(s.end_time)
      if (start == null || end == null || end <= start) return null
      return { ...s, _start: start, _end: end }
    })
    .filter((x): x is WithHours => x !== null)
    .sort((a, b) => a._start - b._start || a._end - b._end)

  const laneEndTimes: number[] = []
  const laneAssignments: number[] = []
  for (const s of withHours) {
    let assigned = -1
    for (let i = 0; i < laneEndTimes.length; i++) {
      if (laneEndTimes[i] <= s._start) {
        assigned = i
        laneEndTimes[i] = s._end
        break
      }
    }
    if (assigned === -1) {
      assigned = laneEndTimes.length
      laneEndTimes.push(s._end)
    }
    laneAssignments.push(assigned)
  }
  const totalLanes = Math.max(1, laneEndTimes.length)
  return withHours.map((s, i) => ({
    ...s,
    top: 0,
    height: 0,
    lane: laneAssignments[i],
    lanes: totalLanes,
  }))
}

export function ScheduleTimeGrid({
  mode,
  anchor,
  rangeStart,
  shifts,
  startHour = 5,
  endHour = 23,
  onShiftClick,
  onEmptyClick,
  isAdmin,
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), [])

  const totalHours = endHour - startHour
  const hourTicks = useMemo(() => {
    const arr: number[] = []
    for (let h = startHour; h <= endHour; h++) arr.push(h)
    return arr
  }, [startHour, endHour])

  const days = useMemo<Date[]>(() => {
    if (mode === 'day') return [startOfDay(anchor)]
    const out: Date[] = []
    for (let i = 0; i < 7; i++) out.push(addDays(rangeStart, i))
    return out
  }, [mode, anchor, rangeStart])

  const positionedByDay = useMemo<Record<string, PositionedShift[]>>(() => {
    const byDay: Record<string, ShiftWithProfile[]> = {}
    for (const s of shifts) {
      if (!byDay[s.shift_date]) byDay[s.shift_date] = []
      byDay[s.shift_date].push(s)
    }
    const result: Record<string, PositionedShift[]> = {}
    for (const day of days) {
      const key = fmtDateKey(day)
      const dayShifts = byDay[key] ?? []
      const positioned = assignLanes(dayShifts)
      result[key] = positioned.map((p) => {
        const start = timeToHours(p.start_time) ?? startHour
        const end = timeToHours(p.end_time) ?? start + 1
        const clampedStart = Math.max(start, startHour)
        const clampedEnd = Math.min(end, endHour)
        const top = ((clampedStart - startHour) / totalHours) * 100
        const height = Math.max(2.5, ((clampedEnd - clampedStart) / totalHours) * 100)
        return { ...p, top, height }
      })
    }
    return result
  }, [shifts, days, startHour, endHour, totalHours])

  // ~36px per hour fits 18 hours in ~650px — week view stays roughly one screen.
  const pxPerHour = 36
  const gridHeight = pxPerHour * totalHours

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div
        className="grid border-b border-gray-800 bg-gray-800/40"
        style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
      >
        <div />
        {days.map((d) => {
          const isToday_ = isSameDay(d, today)
          return (
            <div
              key={fmtDateKey(d)}
              className={`px-2 py-2 text-center border-l border-gray-800 ${
                isToday_ ? 'bg-orange-500/10' : ''
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                {mode === 'day' ? DAY_LABELS_FULL[d.getDay()] : DAY_LABELS_SHORT[d.getDay()]}
              </div>
              <div
                className={`text-sm font-semibold ${
                  isToday_ ? 'text-orange-400' : 'text-gray-200'
                }`}
              >
                {d.getDate()}
              </div>
              {isToday_ && (
                <div className="text-[9px] uppercase tracking-wide text-orange-400">Today</div>
              )}
            </div>
          )
        })}
      </div>

      <div
        className="grid relative"
        style={{
          gridTemplateColumns: `64px repeat(${days.length}, 1fr)`,
          height: gridHeight,
        }}
      >
        <div className="relative border-r border-gray-800">
          {hourTicks.map((h, i) => {
            if (i === hourTicks.length - 1) return null
            const top = ((h - startHour) / totalHours) * 100
            const ampm = h >= 12 ? 'PM' : 'AM'
            const hh = h % 12 || 12
            return (
              <div
                key={h}
                className="absolute right-1 text-[10px] text-gray-500 font-mono -translate-y-1/2"
                style={{ top: `${top}%` }}
              >
                {hh} {ampm}
              </div>
            )
          })}
        </div>

        {days.map((d) => {
          const key = fmtDateKey(d)
          const positioned = positionedByDay[key] ?? []
          const isToday_ = isSameDay(d, today)

          return (
            <DayColumn
              key={key}
              date={d}
              positioned={positioned}
              hourTicks={hourTicks}
              startHour={startHour}
              totalHours={totalHours}
              isToday={isToday_}
              isAdmin={isAdmin}
              onShiftClick={onShiftClick}
              onEmptyClick={onEmptyClick}
            />
          )
        })}
      </div>
    </div>
  )
}

interface DayColumnProps {
  date: Date
  positioned: PositionedShift[]
  hourTicks: number[]
  startHour: number
  totalHours: number
  isToday: boolean
  isAdmin: boolean
  onShiftClick?: (shift: ShiftWithProfile) => void
  onEmptyClick?: (date: Date) => void
}

function DayColumn({
  date,
  positioned,
  hourTicks,
  startHour,
  totalHours,
  isToday,
  isAdmin,
  onShiftClick,
  onEmptyClick,
}: DayColumnProps) {
  const handleEmptyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAdmin || !onEmptyClick) return
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.empty) return
    onEmptyClick(date)
  }

  return (
    <div
      className={`relative border-l border-gray-800 ${
        isToday ? 'bg-orange-500/[0.04]' : ''
      } ${isAdmin ? 'cursor-pointer hover:bg-gray-800/30' : ''}`}
      onClick={handleEmptyClick}
      data-empty="true"
    >
      {hourTicks.map((h, i) => {
        if (i === 0) return null
        const top = ((h - startHour) / totalHours) * 100
        return (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-gray-800/60 pointer-events-none"
            style={{ top: `${top}%` }}
            data-empty="true"
          />
        )
      })}

      {positioned.map((p) => {
        const widthPct = 100 / p.lanes
        const leftPct = p.lane * widthPct
        const firstName = p.profile?.full_name?.split(' ')[0] ?? '?'
        const timeRange = fmtTimeRange12hCompact(p.start_time, p.end_time)
        const showRole = p.lanes <= 2
        const isDraft = p.published_at == null
        return (
          <button
            key={p.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onShiftClick?.(p)
            }}
            className={`absolute rounded text-left px-1.5 py-1 overflow-hidden transition-colors ${roleBlockColors[p.role]} ${
              isDraft ? 'border-2 border-dashed opacity-60' : 'border'
            }`}
            style={{
              top: `${p.top}%`,
              height: `${p.height}%`,
              left: `calc(${leftPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
            }}
            title={`${p.profile?.full_name ?? ''}\n${timeRange}\n${p.role}${isDraft ? ' (DRAFT)' : ''}${p.notes ? `\n${p.notes}` : ''}`}
          >
            <div className="flex items-baseline gap-1 leading-tight">
              <span className="text-[11px] font-semibold truncate">{firstName}</span>
              {isDraft && (
                <span className="text-[8px] uppercase tracking-wide font-bold opacity-90 shrink-0">
                  draft
                </span>
              )}
              {showRole && !isDraft && (
                <span className="text-[9px] uppercase tracking-wide opacity-75 shrink-0">
                  {ROLE_SHORT[p.role]}
                </span>
              )}
            </div>
            <div className="text-[10px] opacity-80 leading-tight truncate font-mono">
              {timeRange}
            </div>
          </button>
        )
      })}

      {isAdmin && positioned.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          data-empty="true"
        >
          <span className="text-[10px] text-gray-600 hover:text-orange-400 transition-colors">
            + Assign
          </span>
        </div>
      )}
    </div>
  )
}
