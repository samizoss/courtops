'use client'

import { useEffect, useMemo, useState } from 'react'
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
  addDays,
  fmtDateKey,
  fmtDateRangeLabel,
  fmtShortDate,
  startOfDay,
  startOfWeek,
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
  type AvailabilitySubmission,
  type AvailabilityWindow,
  type TimeOffRequest,
} from '@/types/database'
import type { OrgHours, SchedulingSettings } from '../staff-module'

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
  availabilitySubmissions?: AvailabilitySubmission[]
  availabilityWindows?: AvailabilityWindow[]
  timeOffRequests: TimeOffWithProfile[]
  orgHours?: OrgHours
  schedulingSettings?: SchedulingSettings
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  weekStartDay?: number
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
 *  Gracefully handles "NA", "N/A", blank tokens, and unparseable free-text
 *  by skipping them instead of producing bogus totals.
 */
function approximateHours(shifts: string | null): number {
  if (!shifts) return 0
  const cleaned = shifts.trim()
  if (!cleaned) return 0
  if (/^n\/?a$/i.test(cleaned) || /^off$/i.test(cleaned) || /^none$/i.test(cleaned)) return 0
  let total = 0
  for (const tok of cleaned.split(',')) {
    const trimmed = tok.trim()
    if (!trimmed) continue
    const halves = trimmed.split(/[-–]/).map((s) => s.trim())
    if (halves.length !== 2) continue
    if (!halves[0] || !halves[1]) continue
    const a = parseLooseHHMM(halves[0])
    const b = parseLooseHHMM(halves[1])
    if (a == null || b == null) continue
    let dur = b - a
    if (dur < 0) dur += 24 * 60
    if (dur > 16 * 60) continue
    total += dur
  }
  return total / 60
}

/** Parse free-text shifts into discrete (start_min, end_min) blocks. Used by
 *  the magic-schedule algorithm to propose specific shifts from each
 *  staffer's submitted availability. Returns [] if nothing parseable.
 */
function parseShiftBlocks(shifts: string | null): { start: number; end: number }[] {
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

/** Format minutes-since-midnight as HH:MM (00:00 - 23:59) for DB inserts. */
function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface MagicProposal {
  user_id: string
  shift_date: string
  start_time: string
  end_time: string
  role: ShiftRole
}

/** Coverage-first magic-schedule algorithm. Builds a 30-min slot grid per day,
 *  finds gaps below min_coverage_count, fills greedily (longest gap first,
 *  candidate furthest below target first), then balance-fills for staff still
 *  below target.
 */
function generateMagicProposals(args: {
  anchor: Date
  mode: ViewMode
  profiles: Profile[]
  availabilityEntries: AvailabilityEntry[]
  timeOffMap: Record<string, Set<string>>
  shifts: ShiftWithProfile[]
  weekStartDay?: number
  orgHours?: OrgHours
  minShiftHours?: number
  minCoverageCount?: number
  defaultTargetHours?: number
}): MagicProposal[] {
  const {
    anchor, mode, profiles, availabilityEntries, timeOffMap, shifts,
    weekStartDay = 0, orgHours,
    minShiftHours = 3, minCoverageCount = 1, defaultTargetHours = 20,
  } = args
  const range = visibleRange(anchor, mode, weekStartDay)
  const startKey = fmtDateKey(range.start)
  const endKey = fmtDateKey(range.end)
  const SLOT = 30
  const dayCount = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1
  const rangeWeeks = Math.max(1, dayCount / 7)

  function bizHours(day: Date): { openMin: number; closeMin: number } | null {
    const dow = day.getDay()
    if (orgHours?.open_days?.length && !orgHours.open_days.includes(dow)) return null
    const de = orgHours?.daily_hours?.[String(dow)]
    const oStr = de?.open ?? orgHours?.open_time
    const cStr = de?.close ?? orgHours?.close_time
    const o = oStr ? parseTimeMinutes(oStr) : null
    const c = cStr ? parseTimeMinutes(cStr) : null
    if (o != null && c != null && c > o) return { openMin: o, closeMin: c }
    return { openMin: 420, closeMin: 1260 }
  }

  const entryByUserDate: Record<string, AvailabilityEntry> = {}
  for (const e of availabilityEntries) entryByUserDate[`${e.user_id}|${e.entry_date}`] = e

  const assignedHours: Record<string, number> = {}
  for (const p of profiles) assignedHours[p.id] = 0
  for (const s of shifts) {
    if (s.shift_date < startKey || s.shift_date > endKey) continue
    const a = parseTimeMinutes(s.start_time)
    const b = parseTimeMinutes(s.end_time)
    if (a == null || b == null) continue
    assignedHours[s.user_id] = (assignedHours[s.user_id] ?? 0) + Math.max(0, b - a) / 60
  }

  const proposals: MagicProposal[] = []
  const proposed: Record<string, { start: number; end: number }[]> = {}

  function userShifts(uid: string, dk: string): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = []
    for (const s of shifts) {
      if (s.shift_date !== dk || s.user_id !== uid) continue
      const a = parseTimeMinutes(s.start_time)
      const b = parseTimeMinutes(s.end_time)
      if (a != null && b != null) out.push({ start: a, end: b })
    }
    return [...out, ...(proposed[`${uid}|${dk}`] ?? [])]
  }

  function getAvail(uid: string, dk: string, biz: { openMin: number; closeMin: number }): { start: number; end: number }[] {
    const entry = entryByUserDate[`${uid}|${dk}`]
    if (!entry?.is_available) return []
    const blocks = parseShiftBlocks(entry.shifts ?? null)
    return blocks.length > 0 ? blocks : [{ start: biz.openMin, end: biz.closeMin }]
  }

  function pickRole(p: Profile): ShiftRole {
    return p.capabilities?.find((c) => c !== 'management') ?? p.capabilities?.[0] ?? 'front-desk'
  }

  function addProposal(uid: string, dk: string, start: number, end: number, role: ShiftRole) {
    proposals.push({ user_id: uid, shift_date: dk, start_time: minutesToTime(start), end_time: minutesToTime(end), role })
    const k = `${uid}|${dk}`
    if (!proposed[k]) proposed[k] = []
    proposed[k].push({ start, end })
    assignedHours[uid] = (assignedHours[uid] ?? 0) + (end - start) / 60
  }

  for (let i = 0; i < dayCount; i++) {
    const day = addDays(range.start, i)
    const dayKey = fmtDateKey(day)
    const biz = bizHours(day)
    if (!biz) continue

    const nSlots = Math.floor((biz.closeMin - biz.openMin) / SLOT)
    if (nSlots <= 0) continue

    const coverage = new Array(nSlots).fill(0)
    for (const s of shifts) {
      if (s.shift_date !== dayKey) continue
      const a = parseTimeMinutes(s.start_time)
      const b = parseTimeMinutes(s.end_time)
      if (a == null || b == null) continue
      for (let sl = 0; sl < nSlots; sl++) {
        const ss = biz.openMin + sl * SLOT
        if (a < ss + SLOT && b > ss) coverage[sl]++
      }
    }

    type Gap = { s: number; e: number }
    const gaps: Gap[] = []
    let gs: number | null = null
    for (let sl = 0; sl <= nSlots; sl++) {
      const isGap = sl < nSlots && coverage[sl] < minCoverageCount
      if (isGap && gs === null) gs = sl
      if (!isGap && gs !== null) { gaps.push({ s: gs, e: sl }); gs = null }
    }
    gaps.sort((a, b) => (b.e - b.s) - (a.e - a.s))

    const eligible = profiles
      .filter((p) => p.is_operational_staff)
      .filter((p) => !timeOffMap[p.id]?.has(dayKey))
      .filter((p) => entryByUserDate[`${p.id}|${dayKey}`]?.is_available === true)

    for (const gap of gaps) {
      const gapStart = biz.openMin + gap.s * SLOT
      const gapEnd = biz.openMin + gap.e * SLOT

      const sorted = eligible
        .filter((p) => !userShifts(p.id, dayKey).some((s) => s.start < gapEnd && s.end > gapStart))
        .sort((a, b) => {
          const aR = (a.target_weekly_hours ?? defaultTargetHours) * rangeWeeks - (assignedHours[a.id] ?? 0)
          const bR = (b.target_weekly_hours ?? defaultTargetHours) * rangeWeeks - (assignedHours[b.id] ?? 0)
          return bR - aR
        })

      for (const cand of sorted) {
        let needed = false
        for (let sl = gap.s; sl < gap.e; sl++) {
          if (coverage[sl] < minCoverageCount) { needed = true; break }
        }
        if (!needed) break

        const blocks = getAvail(cand.id, dayKey, biz)
        let best: { start: number; end: number } | null = null
        for (const blk of blocks) {
          let ss = Math.max(blk.start, gapStart)
          let se = Math.min(blk.end, gapEnd)
          if (ss >= se) continue
          const minMin = minShiftHours * 60
          if (se - ss < minMin) {
            const before = Math.min(ss - blk.start, Math.ceil((minMin - (se - ss)) / 2))
            ss -= before
            const after = Math.min(blk.end - se, minMin - (se - ss))
            se += after
            if (se - ss < minMin) ss -= Math.min(ss - blk.start, minMin - (se - ss))
          }
          if (!best || (se - ss) > (best.end - best.start)) best = { start: ss, end: se }
        }
        if (!best) continue
        if (userShifts(cand.id, dayKey).some((s) => best!.start < s.end && best!.end > s.start)) continue

        const target = (cand.target_weekly_hours ?? defaultTargetHours) * rangeWeeks
        if ((assignedHours[cand.id] ?? 0) >= target) {
          if (sorted.some((o) => o.id !== cand.id && (assignedHours[o.id] ?? 0) < (o.target_weekly_hours ?? defaultTargetHours) * rangeWeeks)) continue
        }

        addProposal(cand.id, dayKey, best.start, best.end, pickRole(cand))
        for (let sl = 0; sl < nSlots; sl++) {
          const ss = biz.openMin + sl * SLOT
          if (best.start < ss + SLOT && best.end > ss) coverage[sl]++
        }
      }
    }

    const balanceCands = [...eligible]
      .filter((p) => !userShifts(p.id, dayKey).length)
      .sort((a, b) => {
        const aR = (a.target_weekly_hours ?? defaultTargetHours) * rangeWeeks - (assignedHours[a.id] ?? 0)
        const bR = (b.target_weekly_hours ?? defaultTargetHours) * rangeWeeks - (assignedHours[b.id] ?? 0)
        return bR - aR
      })

    for (const cand of balanceCands) {
      const target = (cand.target_weekly_hours ?? defaultTargetHours) * rangeWeeks
      if ((assignedHours[cand.id] ?? 0) >= target) continue

      const blocks = getAvail(cand.id, dayKey, biz)
      let bestBlk: { start: number; end: number } | null = null
      for (const blk of blocks) {
        if ((blk.end - blk.start) < minShiftHours * 60) continue
        if (!bestBlk || (blk.end - blk.start) > (bestBlk.end - bestBlk.start)) bestBlk = blk
      }
      if (!bestBlk) continue

      const remaining = target - (assignedHours[cand.id] ?? 0)
      let se = bestBlk.end
      if ((se - bestBlk.start) / 60 > remaining) {
        se = bestBlk.start + remaining * 60
        se = Math.floor(se / SLOT) * SLOT
      }
      if ((se - bestBlk.start) / 60 < minShiftHours) continue

      addProposal(cand.id, dayKey, bestBlk.start, se, pickRole(cand))
    }
  }

  return proposals
}

function parseLooseHHMM(raw: string): number | null {
  const lower = raw.toLowerCase().trim()
  if (!lower) return null
  if (/^(open|close|na|n\/a|off|none|tbd|x)$/i.test(lower)) return null
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
  if (lower.includes('p') && h < 12) h += 12
  if (lower.includes('a') && h === 12) h = 0
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
  availabilitySubmissions,
  availabilityWindows,
  timeOffRequests,
  orgHours,
  schedulingSettings,
  currentUser,
  weekStartDay = 0,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [mode, setMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [filter, setFilter] = useState<FilterMode>(isAdmin ? 'all' : 'mine')

  // Build mode: admin-only toggle that separates "viewing the published
  // schedule" from "building/editing draft shifts". Magic schedule, Publish,
  // + Assign, and draft visibility all live behind this toggle.
  const [buildMode, setBuildMode] = useState(false)

  // Role + draft visibility toggles — only meaningful in build mode.
  const [hiddenRoles, setHiddenRoles] = useState<Set<ShiftRole>>(new Set())
  const [showDrafts, setShowDrafts] = useState(true)

  function toggleRole(r: ShiftRole) {
    setHiddenRoles((prev) => {
      const next = new Set(prev)
      if (next.has(r)) next.delete(r)
      else next.add(r)
      return next
    })
  }

  // Two distinct popovers:
  //  - dayPopover: the Assign-modal for a date (admin only). Set when admin
  //    clicks an empty area or "+ Assign".
  //  - shiftDetail: the detail/edit popover for a specific existing shift.
  //    Set when ANY user clicks a shift block/pill.
  const [dayPopover, setDayPopover] = useState<Date | null>(null)
  const [shiftDetail, setShiftDetail] = useState<ShiftWithProfile | null>(null)
  const [dragPreFill, setDragPreFill] = useState<{ startTime: string; endTime: string } | null>(null)

  useEffect(() => {
    if (!buildMode) {
      if (shiftDetail?.published_at == null && shiftDetail != null) setShiftDetail(null)
      if (dayPopover) setDayPopover(null)
    }
  }, [buildMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const { startHour, endHour } = useMemo(() => getTimelineRange(orgHours), [orgHours])

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of profiles) map[p.id] = p.full_name?.split(' ')[0] ?? '?'
    return map
  }, [profiles])

  const submittedUserIds = useMemo(() => {
    if (!availabilitySubmissions?.length) return new Set<string>()
    return new Set(availabilitySubmissions.map((s) => s.user_id))
  }, [availabilitySubmissions])

  const submittedAvailabilityEntries = useMemo(
    () => availabilityEntries.filter((e) => submittedUserIds.has(e.user_id)),
    [availabilityEntries, submittedUserIds],
  )

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
    for (const e of submittedAvailabilityEntries) map[`${e.user_id}|${e.entry_date}`] = e
    return map
  }, [submittedAvailabilityEntries])

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

  // Apply ALL view filters: My/Total + role visibility + draft visibility.
  // Outside build mode, drafts are always hidden regardless of showDrafts state.
  function applyViewFilters(input: ShiftWithProfile[]): ShiftWithProfile[] {
    let out = input
    if (filter === 'mine') out = out.filter((s) => s.user_id === currentUser.userId)
    if (buildMode && hiddenRoles.size > 0) out = out.filter((s) => !hiddenRoles.has(s.role))
    if (!buildMode || !showDrafts) out = out.filter((s) => s.published_at != null)
    return out
  }

  const filteredShifts = useMemo<ShiftWithProfile[]>(
    () => applyViewFilters(shifts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shifts, filter, hiddenRoles, showDrafts, buildMode, currentUser.userId]
  )

  const visibleShiftsForDate = (date: Date): ShiftWithProfile[] =>
    applyViewFilters(shiftsByDate[fmtDateKey(date)] ?? [])

  const weekRangeStart = useMemo(() => visibleRange(anchor, 'week', weekStartDay).start, [anchor, weekStartDay])

  const hoursSummary = useMemo(() => {
    const range = visibleRange(anchor, mode === 'day' ? 'week' : mode, weekStartDay)
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
      if (!buildMode && s.published_at == null) continue
      const a = parseTimeMinutes(s.start_time)
      const b = parseTimeMinutes(s.end_time)
      if (a == null || b == null) continue
      const dur = (b - a) / 60
      if (rows[s.user_id]) rows[s.user_id].assignedHours += Math.max(0, dur)
    }
    for (const e of submittedAvailabilityEntries) {
      if (e.entry_date < startKey || e.entry_date > endKey) continue
      if (!e.is_available) continue
      const hrs = approximateHours(e.shifts)
      const fallback = hrs > 0 ? hrs : 8
      if (rows[e.user_id]) rows[e.user_id].availableHours += fallback
    }
    return Object.values(rows)
      .filter((r) => r.assignedHours > 0 || r.availableHours > 0)
      .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name))
  }, [profiles, shifts, submittedAvailabilityEntries, anchor, mode, buildMode])

  const draftCountInRange = useMemo(() => {
    const range = visibleRange(anchor, mode, weekStartDay)
    const startKey = fmtDateKey(range.start)
    const endKey = fmtDateKey(range.end)
    return shifts.filter(
      (s) => s.published_at == null && s.shift_date >= startKey && s.shift_date <= endKey
    ).length
  }, [shifts, anchor, mode, weekStartDay])

  const magicDraftCountInRange = useMemo(() => {
    const range = visibleRange(anchor, mode, weekStartDay)
    const sk = fmtDateKey(range.start)
    const ek = fmtDateKey(range.end)
    return shifts.filter(
      (s) => s.published_at == null && s.notes === 'Magic-scheduled draft' && s.shift_date >= sk && s.shift_date <= ek
    ).length
  }, [shifts, anchor, mode, weekStartDay])

  const windowsInRange = useMemo(() => {
    if (!availabilityWindows?.length) return []
    const range = visibleRange(anchor, mode, weekStartDay)
    const sk = fmtDateKey(range.start)
    const ek = fmtDateKey(range.end)
    return availabilityWindows.filter((w) => w.start_date <= ek && w.end_date >= sk)
  }, [availabilityWindows, anchor, mode, weekStartDay])

  const [releaseWindow, setReleaseWindow] = useState<AvailabilityWindow | null>(null)

  const [magicRunning, setMagicRunning] = useState(false)
  const [publishing, setPublishing] = useState(false)

  async function handlePublishDrafts() {
    if (publishing) return
    if (draftCountInRange === 0) {
      toast('No drafts to publish in this view', 'error')
      return
    }
    if (!confirm(`Publish ${draftCountInRange} draft shift${draftCountInRange === 1 ? '' : 's'} in this ${mode}? Staff will see them immediately.`)) return

    setPublishing(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const range = visibleRange(anchor, mode, weekStartDay)
      const startKey = fmtDateKey(range.start)
      const endKey = fmtDateKey(range.end)
      const { error } = await supabase
        .from('shifts')
        .update({ published_at: new Date().toISOString() })
        .is('published_at', null)
        .gte('shift_date', startKey)
        .lte('shift_date', endKey)
        .eq('org_id', orgId)
      if (error) throw error
      toast(`Published ${draftCountInRange} shift${draftCountInRange === 1 ? '' : 's'}`)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to publish', 'error')
      console.error(err)
    } finally {
      setPublishing(false)
    }
  }

  async function handleMagicSchedule() {
    if (magicRunning) return
    if (mode === 'day') {
      toast('Switch to week or month to use magic schedule', 'error')
      return
    }
    const proposals = generateMagicProposals({
      anchor,
      mode,
      profiles,
      availabilityEntries: submittedAvailabilityEntries,
      timeOffMap,
      shifts,
      weekStartDay,
      orgHours,
      minShiftHours: schedulingSettings?.min_shift_hours,
      minCoverageCount: schedulingSettings?.min_coverage_count,
      defaultTargetHours: schedulingSettings?.default_target_hours,
    })
    if (proposals.length === 0) {
      toast('No magic proposals — no submitted availability in this range', 'error')
      return
    }
    if (!confirm(
      `Propose ${proposals.length} draft shift${proposals.length === 1 ? '' : 's'} based on submitted availability + capabilities + target hours? Drafts only — toggle 'Drafts' off in the view to compare against the published schedule, then publish individually or bulk when ready.`
    )) return

    setMagicRunning(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const rows = proposals.map((p) => ({
        org_id: orgId,
        user_id: p.user_id,
        shift_date: p.shift_date,
        start_time: p.start_time,
        end_time: p.end_time,
        role: p.role,
        notes: 'Magic-scheduled draft',
        published_at: null,
      }))
      const { error } = await supabase.from('shifts').insert(rows)
      if (error) throw error
      toast(`Proposed ${proposals.length} draft${proposals.length === 1 ? '' : 's'} — toggle 'Drafts' to compare`)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Magic schedule failed', 'error')
      console.error(err)
    } finally {
      setMagicRunning(false)
    }
  }

  async function handleClearMagicDrafts() {
    if (magicDraftCountInRange === 0) return
    if (!confirm(`Remove ${magicDraftCountInRange} magic-scheduled draft${magicDraftCountInRange === 1 ? '' : 's'} in this ${mode}?`)) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const r = visibleRange(anchor, mode, weekStartDay)
      const { error } = await supabase
        .from('shifts')
        .delete()
        .is('published_at', null)
        .eq('notes', 'Magic-scheduled draft')
        .gte('shift_date', fmtDateKey(r.start))
        .lte('shift_date', fmtDateKey(r.end))
        .eq('org_id', orgId)
      if (error) throw error
      toast(`Cleared ${magicDraftCountInRange} magic draft${magicDraftCountInRange === 1 ? '' : 's'}`)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
      console.error(err)
    }
  }

  async function handleClearAllDrafts() {
    if (draftCountInRange === 0) return
    if (!confirm(`Remove ALL ${draftCountInRange} draft${draftCountInRange === 1 ? '' : 's'} in this ${mode}? This includes magic and manually-created drafts.`)) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const r = visibleRange(anchor, mode, weekStartDay)
      const { error } = await supabase
        .from('shifts')
        .delete()
        .is('published_at', null)
        .gte('shift_date', fmtDateKey(r.start))
        .lte('shift_date', fmtDateKey(r.end))
        .eq('org_id', orgId)
      if (error) throw error
      toast(`Cleared ${draftCountInRange} draft${draftCountInRange === 1 ? '' : 's'}`)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
      console.error(err)
    }
  }

  function handleExportPDF() {
    const range = visibleRange(anchor, mode, weekStartDay)
    const startKey = fmtDateKey(range.start)
    const endKey = fmtDateKey(range.end)
    const exportShifts = filteredShifts
      .filter((s) => s.shift_date >= startKey && s.shift_date <= endKey)
      .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time))

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const title = filter === 'mine' ? `My Schedule` : `Staff Schedule`
    const rangeLabel = mode === 'month'
      ? new Date(range.start.getTime() + 15 * 86400000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${range.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${range.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    if (mode === 'month') {
      const weeks: string[][] = []
      const firstDay = new Date(range.start)
      const lastDay = new Date(range.end)
      let cursor = new Date(firstDay)
      let currentWeek: string[] = []
      const startDow = cursor.getDay()
      for (let i = 0; i < ((weekStartDay - startDow + 7) % 7); i++) currentWeek.push('<td class="empty"></td>')
      while (cursor <= lastDay) {
        const dk = fmtDateKey(cursor)
        const dayShifts = exportShifts.filter((s) => s.shift_date === dk)
        const dow = cursor.getDay()
        const isToday = dk === fmtDateKey(new Date())
        let cell = `<td class="${isToday ? 'today' : ''}"><div class="day-num">${monthNames[cursor.getMonth()]} ${cursor.getDate()}</div>`
        for (const s of dayShifts) {
          const name = s.profile?.full_name?.split(' ')[0] ?? '?'
          cell += `<div class="shift">${name} <span class="time">${fmtTimeRange12hCompact(s.start_time, s.end_time)}</span> <span class="role">${SHIFT_ROLE_LABELS[s.role]}</span></div>`
        }
        cell += '</td>'
        currentWeek.push(cell)
        if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
        cursor = addDays(cursor, 1)
      }
      while (currentWeek.length > 0 && currentWeek.length < 7) currentWeek.push('<td class="empty"></td>')
      if (currentWeek.length === 7) weeks.push(currentWeek)

      const headerRow = Array.from({ length: 7 }, (_, i) => `<th>${dayNamesShort[(weekStartDay + i) % 7]}</th>`).join('')
      const bodyRows = weeks.map((w) => `<tr>${w.join('')}</tr>`).join('')

      const html = `<!DOCTYPE html><html><head><title>${title} — ${rangeLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; padding: 20px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #f3f4f6; font-size: 11px; padding: 6px 4px; border: 1px solid #d1d5db; text-align: center; }
  td { border: 1px solid #d1d5db; padding: 4px; vertical-align: top; font-size: 10px; min-height: 60px; }
  td.empty { background: #f9fafb; }
  td.today { background: #fffbeb; }
  .day-num { font-weight: 600; font-size: 11px; margin-bottom: 3px; color: #374151; }
  .shift { padding: 1px 0; line-height: 1.4; }
  .time { color: #6b7280; }
  .role { color: #9ca3af; font-size: 9px; }
  @media print { body { padding: 10px; } @page { margin: 0.5in; size: landscape; } }
</style></head><body>
<h1>${title}</h1><div class="subtitle">${rangeLabel} · ${exportShifts.length} shift${exportShifts.length === 1 ? '' : 's'}</div>
<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
</body></html>`

      const w = window.open('', '_blank')
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print() }
      return
    }

    // Week / day view: table with date rows
    const rows = exportShifts.map((s) => {
      const d = new Date(s.shift_date + 'T12:00:00')
      return `<tr>
        <td class="day-col">${dayNames[d.getDay()]}<br><span class="date">${monthNames[d.getMonth()]} ${d.getDate()}</span></td>
        <td>${s.profile?.full_name ?? '?'}</td>
        <td class="time-col">${fmtTimeRange12h(s.start_time, s.end_time)}</td>
        <td>${SHIFT_ROLE_LABELS[s.role]}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><title>${title} — ${rangeLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; padding: 20px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; font-size: 11px; padding: 8px 10px; border: 1px solid #d1d5db; text-align: left; }
  td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 12px; }
  .day-col { font-weight: 600; white-space: nowrap; }
  .date { font-weight: 400; color: #6b7280; font-size: 11px; }
  .time-col { white-space: nowrap; color: #374151; }
  @media print { body { padding: 10px; } @page { margin: 0.5in; } }
</style></head><body>
<h1>${title}</h1><div class="subtitle">${rangeLabel} · ${exportShifts.length} shift${exportShifts.length === 1 ? '' : 's'}</div>
<table><thead><tr><th>Day</th><th>Staff</th><th>Time</th><th>Role</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print() }
  }

  const toolbarRight = (
    <div className="flex items-center gap-1 ml-2 flex-wrap">
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
      <button
        onClick={handleExportPDF}
        className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-colors"
        title={`Export ${filter === 'mine' ? 'my' : 'full'} schedule as PDF (${mode} view)`}
      >
        Export
      </button>
      {isAdmin && (
        <button
          onClick={() => setBuildMode((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
            buildMode
              ? 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700'
          }`}
          title={buildMode ? 'Exit build mode — view published schedule only' : 'Enter build mode — create drafts, run magic schedule, then publish'}
        >
          {buildMode ? '✏ Building' : '✏ Build'}
        </button>
      )}
      {isAdmin && buildMode && mode !== 'day' && (
        <button
          onClick={handleMagicSchedule}
          disabled={magicRunning}
          className="text-xs px-3 py-1.5 rounded bg-purple-600/30 hover:bg-purple-600/50 disabled:opacity-50 text-purple-200 border border-purple-500/40 transition-colors"
          title="Propose magic-scheduled shifts as drafts — review before publishing"
        >
          {magicRunning ? 'Running…' : '✨ Magic schedule'}
        </button>
      )}
      {isAdmin && buildMode && magicDraftCountInRange > 0 && (
        <button
          onClick={handleClearMagicDrafts}
          className="text-xs px-3 py-1.5 rounded bg-red-600/15 hover:bg-red-600/25 text-red-300 border border-red-500/30 transition-colors"
          title={`Remove ${magicDraftCountInRange} magic-scheduled drafts`}
        >
          Clear {magicDraftCountInRange} magic
        </button>
      )}
      {isAdmin && buildMode && draftCountInRange > magicDraftCountInRange && (
        <button
          onClick={handleClearAllDrafts}
          className="text-xs px-3 py-1.5 rounded bg-red-600/15 hover:bg-red-600/25 text-red-300 border border-red-500/30 transition-colors"
          title={`Remove all ${draftCountInRange} drafts in this ${mode}`}
        >
          Clear all {draftCountInRange}
        </button>
      )}
      {isAdmin && buildMode && draftCountInRange > 0 && (
        <button
          onClick={handlePublishDrafts}
          disabled={publishing}
          className="text-xs px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white transition-colors"
          title={`Publish ${draftCountInRange} drafts in this ${mode}`}
        >
          {publishing ? 'Publishing…' : `Publish ${draftCountInRange} draft${draftCountInRange === 1 ? '' : 's'}`}
        </button>
      )}
      {isAdmin && buildMode && windowsInRange.map((w) => {
        const wDrafts = shifts.filter(
          (s) => s.published_at == null && s.shift_date >= w.start_date && s.shift_date <= w.end_date
        ).length
        if (wDrafts === 0) return null
        return (
          <button
            key={w.id}
            onClick={() => setReleaseWindow(w)}
            className="text-xs px-3 py-1.5 rounded bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/30 transition-colors"
            title={`Review & release schedule for ${w.label}`}
          >
            Release {w.label}
          </button>
        )
      })}
    </div>
  )

  const handleShiftClick = (s: ShiftWithProfile) => {
    setShiftDetail(s)
  }

  const handleEmptyDayClick = (d: Date) => {
    if (!isAdmin || !buildMode) return
    setDragPreFill(null)
    setDayPopover(d)
  }

  const handleDragSelect = (d: Date, startTime: string, endTime: string) => {
    if (!isAdmin || !buildMode) return
    setDragPreFill({ startTime, endTime })
    setDayPopover(d)
  }

  async function handlePublishOne(id: string) {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('shifts')
        .update({ published_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      toast('Shift published')
      setShiftDetail(null)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    }
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

  // Aggregate counts by role for the visibility chips, after My/Total + draft
  // filter — but BEFORE role hide so the chip count reflects what would show
  // if the chip were on. Helps Geneva find "0 front-desk" days at a glance.
  const roleCounts = useMemo<Record<ShiftRole, number>>(() => {
    const out: Record<ShiftRole, number> = {
      'front-desk': 0, coaching: 0, instructor: 0, 'league-leader': 0, management: 0, other: 0,
    }
    for (const s of shifts) {
      if (filter === 'mine' && s.user_id !== currentUser.userId) continue
      if (!showDrafts && s.published_at == null) continue
      out[s.role] = (out[s.role] ?? 0) + 1
    }
    return out
  }, [shifts, filter, showDrafts, currentUser.userId])

  const draftCountVisible = useMemo(
    () => shifts.filter((s) => s.published_at == null && (filter === 'all' || s.user_id === currentUser.userId)).length,
    [shifts, filter, currentUser.userId]
  )

  return (
    <div className="space-y-4">
      {/* Visibility chip row — admin coverage tool in build mode only. */}
      {isAdmin && buildMode && (
        <div className="flex flex-wrap items-center gap-2 bg-gray-900/40 border border-gray-800 rounded-lg px-3 py-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Show</span>
          {ALL_SHIFT_ROLES.map((r) => {
            const hidden = hiddenRoles.has(r)
            const count = roleCounts[r] ?? 0
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1 ${
                  hidden
                    ? 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700'
                    : `border-${'orange'}-500/40 ${getRoleBadgeColor(r)}`
                }`}
                title={hidden ? `Show ${SHIFT_ROLE_LABELS[r]}` : `Hide ${SHIFT_ROLE_LABELS[r]}`}
              >
                <span>{hidden ? '○' : '●'}</span>
                <span>{SHIFT_ROLE_LABELS[r]}</span>
                <span className="opacity-70">({count})</span>
              </button>
            )
          })}
          <span className="border-l border-gray-700 h-5 mx-1" aria-hidden />
          <button
            type="button"
            onClick={() => setShowDrafts((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1 ${
              showDrafts
                ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40'
                : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700'
            }`}
            title={showDrafts ? 'Hide draft shifts (compare to published only)' : 'Show draft shifts alongside published'}
          >
            <span>{showDrafts ? '●' : '○'}</span>
            <span>Drafts ({draftCountVisible})</span>
          </button>
          {(hiddenRoles.size > 0 || !showDrafts) && (
            <button
              type="button"
              onClick={() => {
                setHiddenRoles(new Set())
                setShowDrafts(true)
              }}
              className="text-[10px] text-gray-400 hover:text-orange-400 underline ml-auto"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {mode === 'month' ? (
        <CalendarMonthGrid
          weekStartDay={weekStartDay}
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
                  const isDraft = s.published_at == null
                  const isMagicDraft = isDraft && s.notes === 'Magic-scheduled draft'
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleShiftClick(s)}
                      className={`w-full text-[10px] px-1 py-0.5 rounded truncate text-left flex items-center gap-1 hover:opacity-80 transition-opacity ${
                        isMagicDraft
                          ? 'bg-purple-500/15 text-purple-300 border-purple-500/40 border-2 border-dashed opacity-70'
                          : `${monthPillColors[s.role]} ${isDraft ? 'border-2 border-dashed opacity-70' : 'border'}`
                      }`}
                      title={`${s.profile?.full_name ?? ''}\n${fmtTimeRange12h(s.start_time, s.end_time)}\n${SHIFT_ROLE_LABELS[s.role]}${isMagicDraft ? ' (MAGIC)' : isDraft ? ' (DRAFT)' : ''}${s.notes ? `\n${s.notes}` : ''}`}
                    >
                      <span className="font-medium truncate">{firstName}</span>
                      <span className="opacity-70 font-mono shrink-0">
                        {fmtTimeRange12hCompact(s.start_time, s.end_time)}
                      </span>
                      <span
                        className={`ml-auto text-[8px] uppercase tracking-wide px-1 rounded border ${
                          isMagicDraft ? 'bg-purple-500/20 text-purple-200 border-purple-500/40' : getRoleBadgeColor(s.role)
                        }`}
                      >
                        {isMagicDraft ? 'MAGIC' : isDraft ? 'DRAFT' : getRoleShortLabel(s.role)}
                      </span>
                    </button>
                  )
                })}
                {isAdmin && buildMode && (
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
        // Day or Week view: hand-built toolbar + time grid.
        // In build mode, hours summary appears as a sidebar; otherwise below.
        <div className="space-y-3">
          <ScheduleToolbar
            anchor={anchor}
            mode={mode}
            onAnchorChange={setAnchor}
            onModeChange={setMode}
            toolbarRight={toolbarRight}
            weekStartDay={weekStartDay}
          />
          <div className={isAdmin && buildMode ? 'grid grid-cols-1 xl:grid-cols-[1fr_220px] gap-4' : ''}>
            <ScheduleTimeGrid
              mode={mode}
              anchor={anchor}
              rangeStart={weekRangeStart}
              shifts={filteredShifts}
              startHour={startHour}
              endHour={endHour}
              onShiftClick={handleShiftClick}
              onEmptyClick={handleEmptyDayClick}
              onDragSelect={handleDragSelect}
              availabilityEntries={isAdmin && buildMode ? submittedAvailabilityEntries : undefined}
              profileMap={isAdmin && buildMode ? profileMap : undefined}
              orgHours={orgHours}
              isAdmin={isAdmin && buildMode}
            />
            {isAdmin && buildMode && (
              <HoursSidebar hoursSummary={hoursSummary} mode={mode} />
            )}
          </div>
          {isAdmin && buildMode && (
            <div className="flex items-center gap-2 text-[10px] text-gray-500 flex-wrap">
              <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'rgba(34,197,94,0.15)' }} />
              Available
              <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'rgba(34,197,94,0.25)' }} />
              More available
              <span className="text-gray-600 mx-1">·</span>
              <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'rgba(15,23,42,0.35)', border: '1px solid rgba(100,116,139,0.2)' }} />
              Closed
              <span className="text-gray-600 mx-1">·</span>
              Hover green areas to see who&apos;s available. Drag to assign.
            </div>
          )}
        </div>
      )}

      {!(isAdmin && buildMode && mode !== 'month') && (
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
              const targetForRange = target == null
                ? null
                : mode === 'month'
                  ? target * 4
                  : target
              const overBy = targetForRange != null && targetForRange > 0
                ? r.assignedHours - targetForRange
                : null
              const isOver = overBy != null && overBy > 0
              return (
                <div
                  key={r.profile.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg text-sm"
                >
                  <span className="text-gray-300 truncate">{r.profile.full_name}</span>
                  <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                    <span
                      className={isOver ? 'text-red-400 font-semibold' : 'text-white font-semibold'}
                      title={isOver ? `Over target by ${overBy!.toFixed(1)}h` : undefined}
                    >
                      {isOver && '⚠ '}
                      {r.assignedHours.toFixed(1)}h
                    </span>
                    {' / '}
                    <span title="Estimated from availability submissions (free-text — approximate)">
                      ~{r.availableHours.toFixed(0)}h avail
                    </span>
                    {target != null && target > 0 && (
                      <span className={`ml-2 ${isOver ? 'text-red-300' : 'text-orange-300'}`} title="Target weekly hours">
                        target {target}h{mode === 'month' ? '/wk' : ''}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}

      {dayPopover && isAdmin && (
        <DayAssignPopover
          date={dayPopover}
          orgId={orgId}
          profiles={profiles}
          entryMap={entryMap}
          timeOffMap={timeOffMap}
          existingShifts={shiftsByDate[fmtDateKey(dayPopover)] ?? []}
          allShifts={shifts}
          onClose={() => { setDayPopover(null); setDragPreFill(null) }}
          onAssigned={() => {
            setDayPopover(null)
            setDragPreFill(null)
            router.refresh()
          }}
          onDeleteShift={handleDeleteShift}
          weekStartDay={weekStartDay}
          initialStartTime={dragPreFill?.startTime}
          initialEndTime={dragPreFill?.endTime}
        />
      )}

      {shiftDetail && (
        <ShiftDetailPopover
          shift={shiftDetail}
          isAdmin={isAdmin}
          orgId={orgId}
          currentUserId={currentUser.userId}
          onClose={() => setShiftDetail(null)}
          onDelete={handleDeleteShift}
          onPublish={handlePublishOne}
          onRoleChanged={() => {
            setShiftDetail(null)
            router.refresh()
          }}
        />
      )}

      {releaseWindow && (
        <ReleaseScheduleModal
          window={releaseWindow}
          shifts={shifts}
          profiles={profiles}
          orgId={orgId}
          orgHours={orgHours}
          schedulingSettings={schedulingSettings}
          onClose={() => setReleaseWindow(null)}
          onReleased={() => {
            setReleaseWindow(null)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}

function HoursSidebar({ hoursSummary, mode }: { hoursSummary: { profile: Profile; assignedHours: number; availableHours: number }[]; mode: ViewMode }) {
  const totalScheduled = hoursSummary.reduce((sum, r) => sum + r.assignedHours, 0)
  const totalAvailable = hoursSummary.reduce((sum, r) => sum + r.availableHours, 0)
  const maxHours = Math.max(...hoursSummary.map((r) => r.assignedHours), 1)

  return (
    <div className="sticky top-5">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Hours this {mode === 'day' ? 'week' : mode}
        </h4>
        {hoursSummary.length === 0 ? (
          <p className="text-[10px] text-gray-600">No shifts yet.</p>
        ) : (
          <>
            <div className="space-y-2">
              {hoursSummary.map((r) => {
                const target = r.profile.target_weekly_hours
                const targetForRange = target == null ? null : mode === 'month' ? target * 4 : target
                const isOver = targetForRange != null && targetForRange > 0 && r.assignedHours > targetForRange
                const barWidth = Math.min(100, (r.assignedHours / maxHours) * 100)
                return (
                  <div key={r.profile.id} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-300 w-16 truncate shrink-0">
                      {r.profile.full_name.split(' ')[0]}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOver ? 'bg-red-400' : barWidth > 60 ? 'bg-yellow-400' : 'bg-green-400'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-semibold min-w-[32px] text-right ${
                      isOver ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {r.assignedHours.toFixed(0)}h
                    </span>
                  </div>
                )
              })}
            </div>

            <hr className="border-gray-800 my-3" />

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Total scheduled</span>
                <span className="text-gray-300 font-semibold">{totalScheduled.toFixed(0)}h</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Avg hrs/person</span>
                <span className="text-gray-300 font-semibold">
                  {hoursSummary.length > 0 ? (totalScheduled / hoursSummary.length).toFixed(1) : 0}h
                </span>
              </div>
            </div>

            <hr className="border-gray-800 my-3" />

            <div className="text-[10px] text-gray-500 mb-2">Scheduled vs Available</div>
            <div className="space-y-1">
              {hoursSummary.map((r) => (
                <div key={r.profile.id} className="flex justify-between text-[10px]">
                  <span className="text-gray-400">{r.profile.full_name.split(' ')[0]}</span>
                  <span className="text-gray-500 font-mono">
                    {r.assignedHours.toFixed(0)} / ~{r.availableHours.toFixed(0)}h
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface ScheduleToolbarProps {
  anchor: Date
  mode: ViewMode
  onAnchorChange: (next: Date) => void
  onModeChange: (next: ViewMode) => void
  toolbarRight: React.ReactNode
  weekStartDay?: number
}

function ScheduleToolbar({
  anchor,
  mode,
  onAnchorChange,
  onModeChange,
  toolbarRight,
  weekStartDay = 0,
}: ScheduleToolbarProps) {
  const range = useMemo(() => visibleRange(anchor, mode, weekStartDay), [anchor, mode, weekStartDay])
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
  orgId: string
  currentUserId: string
  onClose: () => void
  onDelete: (id: string) => void
  onPublish: (id: string) => void
  onRoleChanged: () => void
}

/** Click-to-detail popover for a single shift. Admin can change role/time/notes, publish (if draft), or remove. */
function ShiftDetailPopover({ shift, isAdmin, orgId, currentUserId, onClose, onDelete, onPublish, onRoleChanged }: ShiftDetailPopoverProps) {
  const { toast } = useToast()
  const date = new Date(shift.shift_date + 'T12:00:00')
  const isDraft = shift.published_at == null
  const isMagicDraft = isDraft && shift.notes === 'Magic-scheduled draft'
  const [role, setRole] = useState<ShiftRole>(shift.role)
  const [startTime, setStartTime] = useState(shift.start_time)
  const [endTime, setEndTime] = useState(shift.end_time)
  const [notes, setNotes] = useState(shift.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [openingSwap, setOpeningSwap] = useState(false)

  const isPublished = shift.published_at != null
  const isMyShift = shift.user_id === currentUserId

  async function handlePostShift() {
    const reason = prompt(`Why are you posting this shift? (optional)`)
    if (reason === null) return
    setOpeningSwap(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data: existing } = await supabase
        .from('shift_swaps')
        .select('id')
        .eq('shift_id', shift.id)
        .in('status', ['open', 'claimed'])
        .limit(1)
      if (existing && existing.length > 0) {
        toast('This shift is already posted', 'error')
        return
      }

      const { error } = await supabase.from('shift_swaps').insert({
        org_id: orgId,
        shift_id: shift.id,
        original_user_id: shift.user_id,
        swap_type: 'take',
        status: 'open',
        reason: reason?.trim() || null,
      })
      if (error) throw error
      toast('Shift posted — share the link from the Shift Swap tab')
      onClose()
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to post shift', 'error')
      console.error(err)
    } finally {
      setOpeningSwap(false)
    }
  }

  const isDirty =
    role !== shift.role ||
    startTime !== shift.start_time ||
    endTime !== shift.end_time ||
    notes !== (shift.notes ?? '')

  async function handleAcceptMagic() {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('shifts')
        .update({ notes: null })
        .eq('id', shift.id)
      if (error) throw error
      toast('Draft accepted — still unpublished')
      onRoleChanged()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  async function handleSave() {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      if (!startTime || !endTime) {
        toast('Start and end times are required', 'error')
        setSaving(false)
        return
      }
      const fmtTime = (t: string) => (t.length === 5 ? t + ':00' : t)
      if (startTime >= endTime) {
        toast('Start time must be before end time', 'error')
        setSaving(false)
        return
      }
      const { error } = await supabase
        .from('shifts')
        .update({
          role,
          start_time: fmtTime(startTime),
          end_time: fmtTime(endTime),
          notes: notes.trim() || null,
        })
        .eq('id', shift.id)
      if (error) throw error
      toast('Shift updated')
      onRoleChanged()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update shift', 'error')
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
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              {shift.profile?.full_name ?? 'Shift'}
              {isMagicDraft && (
                <span className="text-[10px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Magic
                </span>
              )}
              {isDraft && !isMagicDraft && (
                <span className="text-[10px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                  Draft
                </span>
              )}
            </h3>
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
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <span className="text-gray-500">–</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            ) : (
              <span className="text-white font-mono">
                {fmtTimeRange12h(shift.start_time, shift.end_time)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs uppercase tracking-wide w-16 shrink-0">
              Role
            </span>
            {isAdmin ? (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ShiftRole)}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {ALL_SHIFT_ROLES.map((r) => (
                  <option key={r} value={r}>{SHIFT_ROLE_LABELS[r]}</option>
                ))}
              </select>
            ) : (
              <span
                className={`text-xs px-2 py-0.5 rounded border ${getRoleBadgeColor(shift.role)}`}
              >
                {SHIFT_ROLE_LABELS[shift.role]}
              </span>
            )}
          </div>
          <div className="flex items-start gap-2">
            <span className="text-gray-500 text-xs uppercase tracking-wide w-16 shrink-0 pt-1">
              Notes
            </span>
            {isAdmin ? (
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            ) : (
              shift.notes && <span className="text-gray-200">{shift.notes}</span>
            )}
          </div>
        </div>

        {/* Post shift — available to the shift owner (or admin) on published shifts */}
        {isPublished && (isMyShift || isAdmin) && (
          <div className="px-5 py-3 border-t border-gray-800">
            <button
              onClick={handlePostShift}
              disabled={openingSwap}
              className="text-xs px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-500/30 transition-colors disabled:opacity-50"
            >
              {openingSwap ? 'Posting…' : 'Post shift for coverage'}
            </button>
          </div>
        )}

        {isAdmin && (
          <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-2 flex-wrap">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
            >
              Close
            </button>
            {isDirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
            {isMagicDraft && (
              <button
                onClick={handleAcceptMagic}
                className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
              >
                Accept
              </button>
            )}
            {isDraft && (
              <button
                onClick={() => onPublish(shift.id)}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
              >
                Publish
              </button>
            )}
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

interface ReleaseScheduleModalProps {
  window: AvailabilityWindow
  shifts: ShiftWithProfile[]
  profiles: Profile[]
  orgId: string
  orgHours?: OrgHours
  schedulingSettings?: SchedulingSettings
  onClose: () => void
  onReleased: () => void
}

function ReleaseScheduleModal({ window: win, shifts, profiles, orgId, orgHours, schedulingSettings, onClose, onReleased }: ReleaseScheduleModalProps) {
  const { toast } = useToast()
  const [releasing, setReleasing] = useState(false)

  const drafts = shifts.filter(
    (s) => s.published_at == null && s.shift_date >= win.start_date && s.shift_date <= win.end_date
  )
  const published = shifts.filter(
    (s) => s.published_at != null && s.shift_date >= win.start_date && s.shift_date <= win.end_date
  )
  const allInRange = [...drafts, ...published]

  const daySummary = useMemo(() => {
    const days: { date: string; staffCount: number; names: string[]; hours: number }[] = []
    const d = new Date(win.start_date + 'T12:00:00')
    const end = new Date(win.end_date + 'T12:00:00')
    while (d <= end) {
      const dk = fmtDateKey(d)
      const dayShifts = allInRange.filter((s) => s.shift_date === dk)
      const uniqueStaff = new Set(dayShifts.map((s) => s.user_id))
      const names = dayShifts
        .map((s) => s.profile?.full_name?.split(' ')[0] ?? '?')
        .filter((n, i, a) => a.indexOf(n) === i)
      let hrs = 0
      for (const s of dayShifts) {
        const a = parseTimeMinutes(s.start_time)
        const b = parseTimeMinutes(s.end_time)
        if (a != null && b != null) hrs += Math.max(0, b - a) / 60
      }
      days.push({ date: dk, staffCount: uniqueStaff.size, names, hours: hrs })
      d.setDate(d.getDate() + 1)
    }
    return days
  }, [allInRange, win])

  const staffHours = useMemo(() => {
    const map: Record<string, { name: string; hours: number; shiftCount: number }> = {}
    for (const s of allInRange) {
      if (!map[s.user_id]) map[s.user_id] = { name: s.profile?.full_name ?? '?', hours: 0, shiftCount: 0 }
      const a = parseTimeMinutes(s.start_time)
      const b = parseTimeMinutes(s.end_time)
      if (a != null && b != null) map[s.user_id].hours += Math.max(0, b - a) / 60
      map[s.user_id].shiftCount++
    }
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }, [allInRange])

  const minCoverage = schedulingSettings?.min_coverage_count ?? 1
  const gapDays = daySummary.filter((d) => d.staffCount < minCoverage && d.staffCount === 0)

  async function handleRelease() {
    if (drafts.length === 0) {
      toast('No drafts to release in this window', 'error')
      return
    }
    setReleasing(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('shifts')
        .update({ published_at: new Date().toISOString() })
        .is('published_at', null)
        .gte('shift_date', win.start_date)
        .lte('shift_date', win.end_date)
        .eq('org_id', orgId)
      if (error) throw error
      toast(`Released schedule for ${win.label} — ${drafts.length} shift${drafts.length === 1 ? '' : 's'} published`)
      onReleased()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to release', 'error')
      console.error(err)
    } finally {
      setReleasing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Release schedule</h3>
          <p className="text-xs text-gray-500">{win.label} · {win.start_date} to {win.end_date}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-2xl font-bold text-white">{drafts.length}</div>
              <div className="text-[10px] text-gray-500 uppercase">Drafts to publish</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-2xl font-bold text-white">{published.length}</div>
              <div className="text-[10px] text-gray-500 uppercase">Already published</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className={`text-2xl font-bold ${gapDays.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {gapDays.length > 0 ? gapDays.length : '✓'}
              </div>
              <div className="text-[10px] text-gray-500 uppercase">{gapDays.length > 0 ? 'Uncovered days' : 'Full coverage'}</div>
            </div>
          </div>

          {gapDays.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-red-300">
                {gapDays.length} day{gapDays.length === 1 ? '' : 's'} with no staff scheduled:{' '}
                {gapDays.map((d) => {
                  const dt = new Date(d.date + 'T12:00:00')
                  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                }).join(', ')}
              </p>
            </div>
          )}

          {staffHours.length > 0 && (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Staff hours</h4>
              <div className="space-y-1">
                {staffHours.map((s) => (
                  <div key={s.name} className="flex justify-between text-xs">
                    <span className="text-gray-300">{s.name}</span>
                    <span className="text-gray-500 font-mono">{s.hours.toFixed(1)}h · {s.shiftCount} shift{s.shiftCount === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {daySummary.length > 0 && (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Daily coverage</h4>
              <div className="grid grid-cols-7 gap-1">
                {daySummary.map((d) => {
                  const dt = new Date(d.date + 'T12:00:00')
                  const dow = dt.toLocaleDateString('en-US', { weekday: 'narrow' })
                  const day = dt.getDate()
                  return (
                    <div
                      key={d.date}
                      className={`text-center rounded p-1 ${
                        d.staffCount === 0 ? 'bg-red-500/15 border border-red-500/30' : 'bg-gray-800/50'
                      }`}
                      title={d.names.join(', ') || 'No staff'}
                    >
                      <div className="text-[9px] text-gray-500">{dow}</div>
                      <div className="text-[11px] text-gray-300 font-medium">{day}</div>
                      <div className={`text-[10px] font-mono ${d.staffCount === 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {d.staffCount}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleRelease}
            disabled={releasing || drafts.length === 0}
            className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded transition-colors font-medium"
          >
            {releasing ? 'Releasing…' : `Release ${drafts.length} shift${drafts.length === 1 ? '' : 's'}`}
          </button>
        </div>
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
  allShifts: ShiftWithProfile[]
  onClose: () => void
  onAssigned: () => void
  onDeleteShift: (id: string) => void
  weekStartDay?: number
  initialStartTime?: string
  initialEndTime?: string
}

function DayAssignPopover({
  date,
  orgId,
  profiles,
  entryMap,
  timeOffMap,
  existingShifts,
  allShifts,
  onClose,
  onAssigned,
  onDeleteShift,
  weekStartDay = 0,
  initialStartTime,
  initialEndTime,
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
    start_time: initialStartTime ?? '08:00',
    end_time: initialEndTime ?? '14:00',
    role: 'front-desk',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    const wantStart = initialStartTime ? parseTimeMinutes(initialStartTime) : null
    const wantEnd = initialEndTime ? parseTimeMinutes(initialEndTime) : null

    return profiles
      .map((p) => {
        const e = entryMap[`${p.id}|${dateKey}`]
        const offToday = timeOffMap[p.id]?.has(dateKey)
        let status: 'available' | 'partial' | 'no-submission' | 'time-off' = 'no-submission'
        let detail: string | null = null
        if (offToday) {
          status = 'time-off'
          detail = 'Time off'
        } else if (e?.is_available) {
          if (wantStart != null && wantEnd != null && e.shifts) {
            const blocks = parseShiftBlocks(e.shifts)
            if (blocks.length > 0) {
              let covered = 0
              for (const blk of blocks) {
                const ov = Math.max(0, Math.min(blk.end, wantEnd) - Math.max(blk.start, wantStart))
                covered += ov
              }
              const needed = wantEnd - wantStart
              if (covered >= needed) {
                status = 'available'
                detail = 'Available full block'
              } else if (covered > 0) {
                status = 'partial'
                detail = `Partial — ${e.shifts}`
              } else {
                status = 'no-submission'
                detail = `Available other times — ${e.shifts}`
              }
            } else {
              status = 'available'
              detail = 'Available all day'
            }
          } else {
            status = 'available'
            detail = e?.shifts || null
          }
        }
        return { profile: p, status, shifts: e?.shifts ?? null, detail }
      })
      .sort((a, b) => {
        const order = { available: 0, partial: 1, 'no-submission': 2, 'time-off': 3 } as const
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
        return a.profile.full_name.localeCompare(b.profile.full_name)
      })
  }, [profiles, entryMap, timeOffMap, dateKey, initialStartTime, initialEndTime])

  // Weekly hours load for the picked staffer — for the week containing this popover's date.
  // Used to surface "this week: assigned X.Y / target Z.Z" + over-target warning.
  const weekStart = useMemo(() => fmtDateKey(startOfWeek(date, weekStartDay)), [date, weekStartDay])
  const weekEnd = useMemo(() => fmtDateKey(addDays(startOfWeek(date, weekStartDay), 6)), [date, weekStartDay])

  const pickedHours = useMemo(() => {
    if (!form.user_id) return null
    const profile = profiles.find((p) => p.id === form.user_id)
    if (!profile) return null
    let weeklyAssigned = 0
    for (const s of allShifts) {
      if (s.user_id !== form.user_id) continue
      if (s.shift_date < weekStart || s.shift_date > weekEnd) continue
      const a = parseTimeMinutes(s.start_time)
      const b = parseTimeMinutes(s.end_time)
      if (a == null || b == null) continue
      weeklyAssigned += Math.max(0, b - a) / 60
    }
    const a = parseTimeMinutes(form.start_time)
    const b = parseTimeMinutes(form.end_time)
    const proposedHours = a != null && b != null ? Math.max(0, b - a) / 60 : 0
    return {
      profile,
      weeklyAssigned,
      proposedHours,
      target: profile.target_weekly_hours,
    }
  }, [form.user_id, form.start_time, form.end_time, allShifts, profiles, weekStart, weekEnd])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.user_id) {
      toast('Pick a staff member first', 'error')
      return
    }
    if (form.start_time >= form.end_time) {
      toast('Start time must be before end time', 'error')
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
        published_at: null,
      })
      if (error) throw error
      toast('Draft shift created')
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
                        : r.status === 'partial'
                        ? 'bg-yellow-400'
                        : r.status === 'time-off'
                        ? 'bg-red-400'
                        : 'bg-gray-500'
                    }`}
                  />
                  <span className="text-white truncate">{r.profile.full_name}</span>
                  <span className={`text-[10px] ml-auto truncate ${
                    r.status === 'available' ? 'text-green-400' :
                    r.status === 'partial' ? 'text-yellow-400' :
                    'text-gray-500'
                  }`}>
                    {r.detail ?? r.shifts ?? (r.status === 'no-submission' ? 'No submission' : '')}
                  </span>
                </button>
              )
            })}
            {rows.length === 0 && <p className="text-xs text-gray-600 italic">No staff to show.</p>}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1" />
            Available
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 ml-3 mr-1" />
            Partial
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-500 ml-3 mr-1" />
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
          {pickedHours && pickedHours.target != null && pickedHours.target > 0 && (() => {
            const totalAfter = pickedHours.weeklyAssigned + pickedHours.proposedHours
            const isOver = totalAfter > pickedHours.target
            const overBy = totalAfter - pickedHours.target
            return (
              <div
                className={`text-[11px] px-3 py-2 rounded border ${
                  isOver
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-gray-800/40 border-gray-700 text-gray-400'
                }`}
              >
                {isOver && <span className="font-bold mr-1">⚠</span>}
                This week:{' '}
                <span className="font-mono">
                  {pickedHours.weeklyAssigned.toFixed(1)}h
                </span>
                {' + '}
                <span className="font-mono">{pickedHours.proposedHours.toFixed(1)}h</span> proposed{' '}
                <span className="opacity-75">/ target {pickedHours.target}h</span>
                {isOver && <span className="ml-1">(over by {overBy.toFixed(1)}h)</span>}
              </div>
            )
          })()}
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
