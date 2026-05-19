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

/** Greedy magic-schedule algorithm. Reads submitted availability + capabilities
 *  + target hours; proposes draft shifts. See docs/CURRENT_STATE.md item #9.
 */
function generateMagicProposals(args: {
  anchor: Date
  mode: ViewMode
  profiles: Profile[]
  availabilityEntries: AvailabilityEntry[]
  timeOffMap: Record<string, Set<string>>
  shifts: ShiftWithProfile[]
}): MagicProposal[] {
  const { anchor, mode, profiles, availabilityEntries, timeOffMap, shifts } = args
  const range = visibleRange(anchor, mode)
  const startKey = fmtDateKey(range.start)
  const endKey = fmtDateKey(range.end)

  // Index existing shifts (drafts + published) by user|date so we don't
  // double-assign on a day a staffer already has something.
  const existingByUserDate: Record<string, true> = {}
  for (const s of shifts) {
    existingByUserDate[`${s.user_id}|${s.shift_date}`] = true
  }

  // Index submitted availability by user|date for quick lookup.
  const entryByUserDate: Record<string, AvailabilityEntry> = {}
  for (const e of availabilityEntries) {
    entryByUserDate[`${e.user_id}|${e.entry_date}`] = e
  }

  // Track running assigned-hours-this-range to respect target_weekly_hours
  // (the spec says: skip assigning if it would push them over their target).
  // Initialize from existing shifts.
  const assignedHoursByUser: Record<string, number> = {}
  for (const p of profiles) assignedHoursByUser[p.id] = 0
  for (const s of shifts) {
    if (s.shift_date < startKey || s.shift_date > endKey) continue
    const a = parseTimeMinutes(s.start_time)
    const b = parseTimeMinutes(s.end_time)
    if (a == null || b == null) continue
    assignedHoursByUser[s.user_id] = (assignedHoursByUser[s.user_id] ?? 0) + Math.max(0, b - a) / 60
  }

  const proposals: MagicProposal[] = []

  // Iterate days in the range
  const dayCount = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1
  for (let i = 0; i < dayCount; i++) {
    const day = addDays(range.start, i)
    const dayKey = fmtDateKey(day)

    // Sort profiles by "furthest below target" so we spread proposed shifts.
    const candidates = profiles
      .filter((p) => p.is_operational_staff)
      .filter((p) => !timeOffMap[p.id]?.has(dayKey))
      .filter((p) => !existingByUserDate[`${p.id}|${dayKey}`])
      .filter((p) => entryByUserDate[`${p.id}|${dayKey}`]?.is_available === true)
      .filter((p) => (p.target_weekly_hours ?? 1) > 0) // 0 means "don't auto-schedule"
      .sort((a, b) => {
        const aRem = (a.target_weekly_hours ?? 40) - (assignedHoursByUser[a.id] ?? 0)
        const bRem = (b.target_weekly_hours ?? 40) - (assignedHoursByUser[b.id] ?? 0)
        return bRem - aRem // furthest below target first
      })

    for (const p of candidates) {
      const entry = entryByUserDate[`${p.id}|${dayKey}`]
      const target = p.target_weekly_hours
      const assigned = assignedHoursByUser[p.id] ?? 0
      // Skip if adding even an hour would push them over target.
      if (target != null && assigned >= target) continue

      // Try to parse the staffer's stated hours into discrete blocks.
      const blocks = parseShiftBlocks(entry?.shifts ?? null)
      const role: ShiftRole =
        p.capabilities?.find((c) => c !== 'management') ??
        p.capabilities?.[0] ??
        'front-desk'

      if (blocks.length > 0) {
        for (const blk of blocks) {
          const hrs = (blk.end - blk.start) / 60
          if (target != null && assigned + hrs > target) continue
          proposals.push({
            user_id: p.id,
            shift_date: dayKey,
            start_time: minutesToTime(blk.start),
            end_time: minutesToTime(blk.end),
            role,
          })
          assignedHoursByUser[p.id] = assigned + hrs
        }
      } else {
        // Available with no specific hours: default to a 9 AM – 2 PM block (5 hours).
        const fallbackHrs = 5
        if (target != null && assigned + fallbackHrs > target) continue
        proposals.push({
          user_id: p.id,
          shift_date: dayKey,
          start_time: '09:00',
          end_time: '14:00',
          role,
        })
        assignedHoursByUser[p.id] = assigned + fallbackHrs
      }
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

  useEffect(() => {
    if (!buildMode) {
      if (shiftDetail?.published_at == null && shiftDetail != null) setShiftDetail(null)
      if (dayPopover) setDayPopover(null)
    }
  }, [buildMode]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!buildMode && s.published_at == null) continue
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
  }, [profiles, shifts, availabilityEntries, anchor, mode, buildMode])

  const draftCountInRange = useMemo(() => {
    const range = visibleRange(anchor, mode)
    const startKey = fmtDateKey(range.start)
    const endKey = fmtDateKey(range.end)
    return shifts.filter(
      (s) => s.published_at == null && s.shift_date >= startKey && s.shift_date <= endKey
    ).length
  }, [shifts, anchor, mode])

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
      const range = visibleRange(anchor, mode)
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
      availabilityEntries,
      timeOffMap,
      shifts,
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
    </div>
  )

  const handleShiftClick = (s: ShiftWithProfile) => {
    setShiftDetail(s)
  }

  const handleEmptyDayClick = (d: Date) => {
    if (!isAdmin || !buildMode) return
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
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleShiftClick(s)}
                      className={`w-full text-[10px] px-1 py-0.5 rounded truncate text-left flex items-center gap-1 hover:opacity-80 transition-opacity ${monthPillColors[s.role]} ${
                        isDraft ? 'border-2 border-dashed opacity-70' : 'border'
                      }`}
                      title={`${s.profile?.full_name ?? ''}\n${fmtTimeRange12h(s.start_time, s.end_time)}\n${SHIFT_ROLE_LABELS[s.role]}${isDraft ? ' (DRAFT)' : ''}${s.notes ? `\n${s.notes}` : ''}`}
                    >
                      <span className="font-medium truncate">{firstName}</span>
                      <span className="opacity-70 font-mono shrink-0">
                        {fmtTimeRange12hCompact(s.start_time, s.end_time)}
                      </span>
                      <span
                        className={`ml-auto text-[8px] uppercase tracking-wide px-1 rounded border ${getRoleBadgeColor(s.role)}`}
                      >
                        {isDraft ? 'DRAFT' : getRoleShortLabel(s.role)}
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
            isAdmin={isAdmin && buildMode}
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
              // Overscheduling: assigned > target (and target is set + > 0).
              // For 'month' mode the target is per-week so multiply by ~4.
              // For 'week'/'day' the target is per-week as-is.
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

      {dayPopover && isAdmin && (
        <DayAssignPopover
          date={dayPopover}
          orgId={orgId}
          profiles={profiles}
          entryMap={entryMap}
          timeOffMap={timeOffMap}
          existingShifts={shiftsByDate[fmtDateKey(dayPopover)] ?? []}
          allShifts={shifts}
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
  const [role, setRole] = useState<ShiftRole>(shift.role)
  const [startTime, setStartTime] = useState(shift.start_time)
  const [endTime, setEndTime] = useState(shift.end_time)
  const [notes, setNotes] = useState(shift.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [openingSwap, setOpeningSwap] = useState(false)

  const isPublished = shift.published_at != null
  const isMyShift = shift.user_id === currentUserId

  async function handleOpenForSwap(swapType: 'swap' | 'take') {
    const label = swapType === 'take' ? 'open for anyone to take' : 'open for swap'
    const reason = prompt(`Why are you opening this shift? (optional)`)
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
        toast('This shift already has an open swap request', 'error')
        return
      }

      const { error } = await supabase.from('shift_swaps').insert({
        org_id: orgId,
        shift_id: shift.id,
        original_user_id: shift.user_id,
        swap_type: swapType,
        status: 'open',
        reason: reason?.trim() || null,
      })
      if (error) throw error
      toast(`Shift ${label} — share the link from the Shift Swap tab`)
      onClose()
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open swap', 'error')
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

  async function handleSave() {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const fmtTime = (t: string) => (t.length === 5 ? t + ':00' : t)
      if (startTime && endTime && startTime >= endTime) {
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
              {isDraft && (
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

        {/* Swap actions — available to the shift owner (or admin) on published shifts */}
        {isPublished && (isMyShift || isAdmin) && (
          <div className="px-5 py-3 border-t border-gray-800">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Shift swap</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleOpenForSwap('take')}
                disabled={openingSwap}
                className="text-xs px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-500/30 transition-colors disabled:opacity-50"
              >
                {openingSwap ? 'Opening…' : 'Open for take'}
              </button>
              <button
                onClick={() => handleOpenForSwap('swap')}
                disabled={openingSwap}
                className="text-xs px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded border border-purple-500/30 transition-colors disabled:opacity-50"
              >
                {openingSwap ? 'Opening…' : 'Open for swap'}
              </button>
            </div>
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

  // Weekly hours load for the picked staffer — for the week containing this popover's date.
  // Used to surface "this week: assigned X.Y / target Z.Z" + over-target warning.
  const weekStart = useMemo(() => fmtDateKey(startOfWeek(date)), [date])
  const weekEnd = useMemo(() => fmtDateKey(addDays(startOfWeek(date), 6)), [date])

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
        // Manual admin assigns publish immediately. Magic-schedule paths go
        // through bulk INSERT with published_at=null instead.
        published_at: new Date().toISOString(),
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
