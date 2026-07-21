import fs from 'node:fs'
import path from 'node:path'
import type { CREventRegistration } from '@/lib/courtreserve'
import { parseWallClock, formatTimeRange, pad2 } from '@/lib/cr-time'
import { JAR_BRAND } from '@/lib/jar-brand'
import { escapeHtml, injectSlots, expandBlock } from '@/lib/template-engine'

// Re-exported for existing consumers (image route, tests). The wall-clock
// display helpers moved to cr-time.ts (2026-07-21) so client-safe modules
// (newsletter-prefill.ts) can share them — this file imports node:fs and
// must stay server-only.
export { formatTimeRange }

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

// CR StartTime/EndTime are naive org-local wall-clock strings and must never
// go through `new Date(raw)` in the display path — see parseWallClock in
// src/lib/cr-time.ts (moved there 2026-07-21 for sharing; full rationale in
// its doc comment).

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

/**
 * Renders the digest email HTML from the frozen template.
 *
 * `opts.crOrgId` is the club's Court Reserve org id (orgs.courtreserve_org_id).
 * It is deliberately NOT stored per-run: it's org-level config, so callers
 * (the /weekly-digest page) re-read it at render time — which also gives old
 * stored runs working links for free. When it's absent, or an event predates
 * the eventId field (pre-2026-07-21 runs), the name renders as plain bold
 * text — exactly what email clients that strip styles fall back to as well.
 */
export function renderDigestEmail(
  events: DigestEvent[],
  window: { start: string; end: string },
  opts: { crOrgId?: string | null } = {}
): string {
  const template = fs.readFileSync(path.join(process.cwd(), 'templates', 'weekly-digest.html'), 'utf8')
  const byDay = DAY_LABELS.map((_, i) => events.filter((e) => e.dayIndex === i))
  const maxPerDay = Math.max(0, ...byDay.map((d) => d.length))
  const fontSize = maxPerDay > 5 ? 13 : 15 // >5 events: shrink one step, never truncate

  const eventName = (e: DigestEvent): string => {
    const bold = `<strong>${escapeHtml(e.name)}</strong>`
    if (e.eventId == null || !opts.crOrgId) return bold
    // Verified working URL shape (Court Reserve public event details page).
    const href = `https://app.courtreserve.com/Online/Events/Details/${encodeURIComponent(opts.crOrgId)}/${encodeURIComponent(String(e.eventId))}`
    // White + underline + bold stays readable on the blue background
    // (white-on-#004a8d ≈ 8.9:1 — see templates/weekly-digest.html) and
    // degrades to plain bold text when a client strips styles.
    return `<a href="${escapeHtml(href)}" style="color:#ffffff;text-decoration:underline;font-weight:700;">${bold}</a>`
  }

  const rows = DAY_LABELS.map((label, i) => ({
    DAY_LABEL: label,
    ROW_FONT_SIZE: String(fontSize),
    DAY_EVENTS: {
      value: byDay[i]
        .map((e) => `${escapeHtml(formatTimeRange(e.startTime, e.endTime))} | ${eventName(e)}`)
        .join('<br>'),
      html: true as const,
    },
  }))
  let html = expandBlock(template, 'DAY_ROWS', rows)
  html = injectSlots(html, {
    DATE_RANGE: formatDateRange(window.start, window.end),
    MAPS_URL: `https://maps.google.com/?q=${encodeURIComponent(JAR_BRAND.club.address)}`,
    SITE_URL: JAR_BRAND.club.site,
    INSTAGRAM_URL: JAR_BRAND.club.socials.instagram,
    FACEBOOK_URL: JAR_BRAND.club.socials.facebook,
  })
  return html
}
