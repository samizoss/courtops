'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  DAY_LABELS_SHORT,
  DAY_LABELS_FULL,
  addDays,
  fmtDateKey,
  isSameDay,
  startOfDay,
} from '@/lib/calendar'
import { fmtTimeRange12hCompact } from '@/lib/format'
import type { ShiftRole, ScheduleShift, AvailabilityEntry } from '@/types/database'

export interface ShiftWithProfile extends ScheduleShift {
  profile?: { full_name: string }
}

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

function parseLooseHHMM(raw: string): number | null {
  const lower = raw.toLowerCase().trim()
  if (!lower) return null
  if (/^(open|close|na|n\/a|off|none|tbd|x)$/i.test(lower)) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  let h = 0, m = 0
  if (digits.length <= 2) h = parseInt(digits, 10)
  else if (digits.length === 3) { h = parseInt(digits.slice(0, 1), 10); m = parseInt(digits.slice(1), 10) }
  else { h = parseInt(digits.slice(0, 2), 10); m = parseInt(digits.slice(2, 4), 10) }
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  if (lower.includes('p') && h < 12) h += 12
  if (lower.includes('a') && h === 12) h = 0
  if (!lower.includes('a') && !lower.includes('p') && h >= 1 && h <= 6) h += 12
  return h * 60 + m
}

function parseAvailBlocks(shifts: string | null): { start: number; end: number }[] {
  if (!shifts) return []
  const out: { start: number; end: number }[] = []
  for (const tok of shifts.split(',')) {
    const halves = tok.split(/[-–]/).map((s) => s.trim())
    if (halves.length !== 2) continue
    const a = parseLooseHHMM(halves[0])
    const b = parseLooseHHMM(halves[1])
    if (a == null || b == null || b <= a) continue
    out.push({ start: a, end: b })
  }
  return out
}

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function minutesTo12h(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'p' : 'a'
  const hh = h % 12 || 12
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, '0')}${ampm}`
}

interface ProfileMap {
  [userId: string]: string // userId → first name
}

interface ClosedHoursRange {
  openMin: number
  closeMin: number
}

interface Props {
  mode: 'day' | 'week'
  anchor: Date
  rangeStart: Date
  shifts: ShiftWithProfile[]
  startHour?: number
  endHour?: number
  onShiftClick?: (shift: ShiftWithProfile) => void
  onEmptyClick?: (date: Date) => void
  onDragSelect?: (date: Date, startTime: string, endTime: string) => void
  availabilityEntries?: AvailabilityEntry[]
  profileMap?: ProfileMap
  orgHours?: { open_time: string | null; close_time: string | null; daily_hours: Record<string, { open: string; close: string }> | null }
  isAdmin: boolean
}

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

function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function getClosedRange(
  date: Date,
  orgHours?: Props['orgHours'],
): ClosedHoursRange | null {
  if (!orgHours) return null
  const dow = date.getDay()
  const daily = orgHours.daily_hours
  const dayEntry = daily?.[String(dow)]
  const openMin = parseHHMM(dayEntry?.open ?? orgHours.open_time)
  const closeMin = parseHHMM(dayEntry?.close ?? orgHours.close_time)
  if (openMin == null || closeMin == null) return null
  return { openMin, closeMin }
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
  onDragSelect,
  availabilityEntries,
  profileMap,
  orgHours,
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

  const entriesByDate = useMemo(() => {
    if (!availabilityEntries) return {}
    const map: Record<string, AvailabilityEntry[]> = {}
    for (const e of availabilityEntries) {
      if (!map[e.entry_date]) map[e.entry_date] = []
      map[e.entry_date].push(e)
    }
    return map
  }, [availabilityEntries])

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
              gridHeight={gridHeight}
              isToday={isToday_}
              isAdmin={isAdmin}
              onShiftClick={onShiftClick}
              onEmptyClick={onEmptyClick}
              onDragSelect={onDragSelect}
              dayEntries={entriesByDate[key]}
              profileMap={profileMap}
              closedRange={getClosedRange(d, orgHours)}
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
  gridHeight: number
  isToday: boolean
  isAdmin: boolean
  onShiftClick?: (shift: ShiftWithProfile) => void
  onEmptyClick?: (date: Date) => void
  onDragSelect?: (date: Date, startTime: string, endTime: string) => void
  dayEntries?: AvailabilityEntry[]
  profileMap?: ProfileMap
  closedRange?: ClosedHoursRange | null
}

function DayColumn({
  date,
  positioned,
  hourTicks,
  startHour,
  totalHours,
  gridHeight,
  isToday,
  isAdmin,
  onShiftClick,
  onEmptyClick,
  onDragSelect,
  dayEntries,
  profileMap,
  closedRange,
}: DayColumnProps) {
  const colRef = useRef<HTMLDivElement>(null)
  const justDraggedRef = useRef(false)
  const dragRef = useRef<{ startSlot: number; currentSlot: number } | null>(null)
  const [drag, setDrag] = useState<{ startSlot: number; currentSlot: number } | null>(null)

  const totalSlots = totalHours * 2
  const slotHeight = gridHeight / totalSlots
  const startHourMin = startHour * 60

  const slotNames = useMemo(() => {
    const names: string[][] = Array.from({ length: totalSlots }, () => [])
    if (!dayEntries?.length || !profileMap) return names
    for (const entry of dayEntries) {
      if (!entry.is_available) continue
      const name = profileMap[entry.user_id] ?? '?'
      const blocks = parseAvailBlocks(entry.shifts)
      if (blocks.length === 0) {
        for (let i = 0; i < totalSlots; i++) names[i].push(name)
      } else {
        for (const blk of blocks) {
          const s = Math.max(0, Math.floor((blk.start - startHourMin) / 30))
          const e = Math.min(totalSlots, Math.ceil((blk.end - startHourMin) / 30))
          for (let i = s; i < e; i++) names[i].push(name)
        }
      }
    }
    return names
  }, [dayEntries, totalSlots, startHourMin, profileMap])

  const slotDensity = useMemo(() => slotNames.map((n) => n.length), [slotNames])

  const densityStrips = useMemo(() => {
    const strips: { start: number; end: number; count: number; names: string[] }[] = []
    let rStart = 0
    let rCount = slotDensity[0]
    for (let i = 1; i <= totalSlots; i++) {
      const c = i < totalSlots ? slotDensity[i] : -1
      if (c !== rCount) {
        if (rCount > 0) {
          const allNames = new Set<string>()
          for (let j = rStart; j < i; j++) for (const n of slotNames[j]) allNames.add(n)
          strips.push({ start: rStart, end: i, count: rCount, names: [...allNames].sort() })
        }
        rStart = i
        rCount = c
      }
    }
    return strips
  }, [slotDensity, slotNames, totalSlots])

  const closedOverlays = useMemo(() => {
    if (!closedRange) return []
    const overlays: { top: string; height: string }[] = []
    const startMin = startHour * 60
    const endMin = (startHour + totalHours) * 60
    if (closedRange.openMin > startMin) {
      const top = 0
      const bottom = ((closedRange.openMin - startMin) / (endMin - startMin)) * 100
      overlays.push({ top: `${top}%`, height: `${bottom}%` })
    }
    if (closedRange.closeMin < endMin) {
      const top = ((closedRange.closeMin - startMin) / (endMin - startMin)) * 100
      overlays.push({ top: `${top}%`, height: `${100 - top}%` })
    }
    return overlays
  }, [closedRange, startHour, totalHours])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isAdmin || !onDragSelect || !colRef.current) return
    if ((e.target as HTMLElement).closest('button')) return
    const rect = colRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const slot = Math.max(0, Math.min(totalSlots - 1, Math.floor(y / slotHeight)))
    const state = { startSlot: slot, currentSlot: slot }
    dragRef.current = state
    setDrag(state)
    colRef.current.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [isAdmin, onDragSelect, totalSlots, slotHeight])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !colRef.current) return
    const rect = colRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const slot = Math.max(0, Math.min(totalSlots - 1, Math.floor(y / slotHeight)))
    if (slot !== dragRef.current.currentSlot) {
      const state = { ...dragRef.current, currentSlot: slot }
      dragRef.current = state
      setDrag(state)
    }
  }, [totalSlots, slotHeight])

  const handlePointerUp = useCallback(() => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    setDrag(null)

    const minSlot = Math.min(d.startSlot, d.currentSlot)
    const maxSlot = Math.max(d.startSlot, d.currentSlot)
    if (maxSlot >= minSlot) {
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 100)
      const startMin = startHourMin + minSlot * 30
      const endMin = startHourMin + (maxSlot + 1) * 30
      onDragSelect?.(date, minutesToHHMM(startMin), minutesToHHMM(endMin))
    }
  }, [startHourMin, date, onDragSelect])

  const handleEmptyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAdmin || !onEmptyClick) return
    if (justDraggedRef.current) return
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.empty) return
    onEmptyClick(date)
  }

  const dragMinSlot = drag ? Math.min(drag.startSlot, drag.currentSlot) : 0
  const dragMaxSlot = drag ? Math.max(drag.startSlot, drag.currentSlot) : 0

  return (
    <div
      ref={colRef}
      className={`relative border-l border-gray-800 touch-none ${
        isToday ? 'bg-orange-500/[0.04]' : ''
      } ${isAdmin ? 'cursor-crosshair' : ''}`}
      onClick={handleEmptyClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      data-empty="true"
    >
      {/* Closed-hours overlay */}
      {closedOverlays.map((o, idx) => (
        <div
          key={`closed-${idx}`}
          className="absolute left-0 right-0 pointer-events-none z-[1]"
          style={{
            top: o.top,
            height: o.height,
            background: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(100,116,139,0.08) 4px, rgba(100,116,139,0.08) 5px)',
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
          }}
          data-empty="true"
        />
      ))}

      {/* Availability density background + inline name labels */}
      {densityStrips.map((s, idx) => {
        const top = (s.start / totalSlots) * 100
        const height = ((s.end - s.start) / totalSlots) * 100
        const opacity = Math.min(0.06 + s.count * 0.04, 0.25)
        const slotSpan = s.end - s.start
        const showNames = slotSpan >= 2
        return (
          <div
            key={idx}
            className="absolute left-0 right-0 overflow-hidden"
            style={{ top: `${top}%`, height: `${height}%`, background: `rgba(34, 197, 94, ${opacity})` }}
            data-empty="true"
          >
            {showNames && (
              <div className="px-1 py-[1px] pointer-events-none" data-empty="true">
                <div className="text-[9px] leading-tight text-emerald-300/70 truncate" data-empty="true">
                  {s.names.join(', ')}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Hour tick lines */}
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

      {/* Half-hour tick lines (lighter) */}
      {hourTicks.map((h, i) => {
        if (i === hourTicks.length - 1) return null
        const top = ((h + 0.5 - startHour) / totalHours) * 100
        return (
          <div
            key={`half-${h}`}
            className="absolute left-0 right-0 border-t border-gray-800/25 pointer-events-none"
            style={{ top: `${top}%` }}
            data-empty="true"
          />
        )
      })}

      {/* Shift blocks */}
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
            className={`absolute rounded text-left px-1.5 py-1 overflow-hidden transition-colors z-[2] ${roleBlockColors[p.role]} ${
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

      {/* Drag overlay */}
      {drag && (
        <div
          className="absolute left-[2px] right-[2px] z-[5] rounded pointer-events-none"
          style={{
            top: `${(dragMinSlot / totalSlots) * 100}%`,
            height: `${((dragMaxSlot - dragMinSlot + 1) / totalSlots) * 100}%`,
            background: 'rgba(234, 88, 12, 0.2)',
            border: '2px dashed rgba(234, 88, 12, 0.6)',
          }}
        >
          <div className="text-[10px] font-semibold text-orange-400 px-1.5 py-0.5">
            {minutesTo12h(startHourMin + dragMinSlot * 30)} – {minutesTo12h(startHourMin + (dragMaxSlot + 1) * 30)}
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {isAdmin && positioned.length === 0 && !drag && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          data-empty="true"
        >
          <span className="text-[10px] text-gray-600">
            Drag to assign
          </span>
        </div>
      )}
    </div>
  )
}
