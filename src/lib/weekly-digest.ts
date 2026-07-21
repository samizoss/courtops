import fs from 'node:fs'
import path from 'node:path'
import type { CREventRegistration } from '@/lib/courtreserve'
import { JAR_BRAND } from '@/lib/jar-brand'
import { escapeHtml, injectSlots, expandBlock } from '@/lib/template-engine'

const TZ = JAR_BRAND.club.timezone // America/Chicago

function chicagoYmdWeekday(d: Date): { y: number; m: number; d: number; weekday: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(d).map((p) => [p.type, p.value])
  )
  return { y: +parts.year, m: +parts.month, d: +parts.day, weekday: parts.weekday }
}

/** Coming Monday→Sunday in Chicago. If today is Monday (Chicago), the week starts today. */
export function getWeekWindow(now: Date): { start: string; end: string } {
  const { y, m, d, weekday } = chicagoYmdWeekday(now)
  const dow: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  const daysToMonday = (8 - dow[weekday]) % 7
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  // UTC noon avoids DST-transition date shifts when adding days
  return {
    start: iso(Date.UTC(y, m - 1, d + daysToMonday, 12)),
    end: iso(Date.UTC(y, m - 1, d + daysToMonday + 6, 12)),
  }
}

export interface DigestEvent {
  dayIndex: number
  startTime: string
  endTime: string
  /**
   * Sort key only. Since the 2026-07-21 wall-clock fix this is
   * "YYYY-MM-DDTHH:MM" (naive, no zone); rows stored before the fix hold a
   * server-TZ-dependent UTC instant instead. Nothing in the display path
   * reads it — rendering always goes through startTime/endTime raw strings.
   */
  startIso: string
  name: string
  /** Court Reserve EventId for deep-linking. Missing on runs stored before 2026-07-21 — render unlinked. */
  eventId?: number | null
}

/**
 * Court Reserve `StartTime`/`EndTime` are *naive Chicago wall-clock* strings —
 * "2026-07-27T18:00:00", no zone suffix (verified against prod
 * weekly_digest_runs.events, 2026-07-21). They must NEVER go through
 * `new Date(raw)`: JS parses zone-less date-times in the server's local
 * timezone, so on Vercel (UTC) every time shifted 5-6h when re-formatted in
 * America/Chicago ("LTP-Monday 6pm" rendered as 1:00 PM). This parser reads
 * the digits straight off the string — no Date, no timezone math anywhere in
 * the display path.
 */
interface WallClock { y: number; mo: number; d: number; h: number; min: number }

function parseWallClock(raw: string): WallClock | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(raw)
  if (!m) return null
  const wc = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], min: +m[5] }
  if (wc.mo < 1 || wc.mo > 12 || wc.d < 1 || wc.d > 31 || wc.h > 23 || wc.min > 59) return null
  return wc
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function normalizeEvents(rows: CREventRegistration[], window: { start: string; end: string }): DigestEvent[] {
  const seen = new Map<string, DigestEvent>()
  for (const r of rows) {
    const start = parseWallClock(r.StartTime); const end = parseWallClock(r.EndTime)
    if (!start || !end || !r.EventName) continue
    // Date and dayIndex come from the string's own date part — never from a
    // timezone-converted Date (see parseWallClock).
    const dateIso = `${start.y}-${pad2(start.mo)}-${pad2(start.d)}`
    if (dateIso < window.start || dateIso > window.end) continue
    const key = r.EventDateId ? `id:${r.EventDateId}` : `${dateIso}|${r.StartTime}|${r.EventName}`
    if (seen.has(key)) continue
    // Pure calendrical day arithmetic — UTC noon anchors are fine here
    // because both sides are date-only strings, not instants.
    const dayIndex = Math.round((Date.parse(dateIso + 'T12:00:00Z') - Date.parse(window.start + 'T12:00:00Z')) / 86400000)
    seen.set(key, {
      dayIndex,
      startIso: `${dateIso}T${pad2(start.h)}:${pad2(start.min)}`, // wall-clock sort key
      startTime: r.StartTime,
      endTime: r.EndTime,
      name: r.EventName, // verbatim from CR — never rename
      eventId: typeof r.EventId === 'number' ? r.EventId : null,
    })
  }
  return [...seen.values()].sort((a, b) => a.dayIndex - b.dayIndex || a.startIso.localeCompare(b.startIso))
}

function fmtWallTime(wc: WallClock, withMeridiem: boolean): string {
  const h12 = wc.h % 12 === 0 ? 12 : wc.h % 12
  const base = `${h12}:${pad2(wc.min)}`
  return withMeridiem ? `${base} ${wc.h < 12 ? 'AM' : 'PM'}` : base
}

/**
 * Formats two raw CR wall-clock strings as e.g. "7:00 - 10:00 AM" (meridiem
 * collapsed when both sides match). Backward compatible with runs stored
 * before the wall-clock fix: those rows hold the same raw naive strings.
 * Unparsable input renders as '' rather than "Invalid Date".
 */
export function formatTimeRange(startRaw: string, endRaw: string): string {
  const s = parseWallClock(startRaw); const e = parseWallClock(endRaw)
  if (!s || !e) return ''
  const same = (s.h < 12) === (e.h < 12)
  return `${fmtWallTime(s, !same)} - ${fmtWallTime(e, true)}`
}

export function formatDateRange(startDate: string, endDate: string): string {
  const md = (iso: string) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}` }
  return `${md(startDate)} – ${md(endDate)}`
}

export const DAY_LABELS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export interface DigestImageTier {
  eventFontSize: number
  lineHeight: number
  eventGap: number
  rowPaddingY: number
}

/**
 * Font/spacing tier for the weekly-digest PNG (`image/route.tsx`), a fixed
 * 1080x1350 canvas rendered via next/og (satori — no scrolling, no
 * overflow: anything past 1350px tall gets silently cropped). Design rule
 * is "never truncate," so instead of a single font step-down keyed off one
 * day's count, this picks from 3 tiers keyed off total weekly pressure
 * (every day contributes to the same fixed-height column, so a broadly
 * busy week is exactly as dangerous as one very busy day).
 *
 * Height budget math (see image/route.tsx for the literal JSX these
 * numbers describe):
 *   header (title x2 @ 72px/1.1 + paddingTop 64 + date pill)  ≈ 305px
 *   + rows container marginTop                                =  48px
 *   + footer (logo 80 + paddingTop 16 + paddingBottom 40)     = 136px
 *   -----------------------------------------------------------------
 *   fixed total                                                489px
 *   budget remaining for the 7 day rows: 1350 - 489            ≈ 861px
 *
 * Each row's height = (border 2px + rowPaddingY*2) + max(dayLabelHeight
 * ~36px, eventsHeight), where eventsHeight(n) = n*(eventFontSize*lineHeight)
 * + (n-1)*eventGap for that day's n events.
 *
 * Worst realistic case per spec: 7 days x 8 events/day (56 total). Tier 3's
 * numbers are sized for exactly that:
 *   eventsHeight(8) = 8*(12*1.05) + 7*1 = 8*12.6 + 7 ≈ 107.8px
 *   row total       = (2 + 4*2) + 107.8 = 10 + 107.8 ≈ 117.8px
 *   7 rows          ≈ 824.6px  <  861px budget (≈36px to spare)
 * so the worst realistic week still fits within the fixed 1350px canvas.
 */
export function getDigestImageTier(countsByDay: number[]): DigestImageTier {
  const totalEvents = countsByDay.reduce((sum, n) => sum + n, 0)
  const maxPerDay = Math.max(0, ...countsByDay)

  if (maxPerDay <= 4 && totalEvents <= 20) {
    return { eventFontSize: 24, lineHeight: 1.2, eventGap: 4, rowPaddingY: 14 }
  }
  if (maxPerDay <= 6 && totalEvents <= 35) {
    return { eventFontSize: 19, lineHeight: 1.15, eventGap: 3, rowPaddingY: 10 }
  }
  return { eventFontSize: 12, lineHeight: 1.05, eventGap: 1, rowPaddingY: 4 }
}

export function renderDigestEmail(events: DigestEvent[], window: { start: string; end: string }): string {
  const template = fs.readFileSync(path.join(process.cwd(), 'templates', 'weekly-digest.html'), 'utf8')
  const byDay = DAY_LABELS.map((_, i) => events.filter((e) => e.dayIndex === i))
  const maxPerDay = Math.max(0, ...byDay.map((d) => d.length))
  const fontSize = maxPerDay > 5 ? 13 : 15 // >5 events: shrink one step, never truncate
  const rows = DAY_LABELS.map((label, i) => ({
    DAY_LABEL: label,
    ROW_FONT_SIZE: String(fontSize),
    DAY_EVENTS: {
      value: byDay[i]
        .map((e) => `${escapeHtml(formatTimeRange(e.startTime, e.endTime))} | <strong>${escapeHtml(e.name)}</strong>`)
        .join('<br>'),
      html: true as const,
    },
  }))
  let html = expandBlock(template, 'DAY_ROWS', rows)
  html = injectSlots(html, { DATE_RANGE: formatDateRange(window.start, window.end) })
  return html
}
