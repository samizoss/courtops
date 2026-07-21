/**
 * Newsletter pre-fill from Court Reserve — pure logic.
 *
 * Turns raw CR event-registration rows (the only event surface CR exposes)
 * into distinct, checklist-ready EVENTS for the newsletter builder: one entry
 * per EventId with a distinct-session count, a first-session date chip, a
 * wall-clock time summary, and the public event-details URL.
 *
 * Kept free of node/server imports on purpose: the newsletter builder (a
 * client component) imports the row mappers below, so everything here must be
 * client-bundle-safe. Wall-clock parsing/formatting is shared with the weekly
 * digest via src/lib/cr-time.ts — CR datetime strings are naive org-local
 * wall clock and must NEVER go through `new Date(raw)` (see cr-time.ts).
 */

import type { CREventRegistration } from '@/lib/courtreserve'
import { parseWallClock, formatTimeRange, pad2 } from '@/lib/cr-time'

/** Distinct sessions at or above this count ⇒ treated as a recurring series. */
export const RECURRING_SESSION_THRESHOLD = 3

const MON_ABBREV = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export interface PrefillEvent {
  eventId: number
  /** Verbatim from Court Reserve — never trimmed or renamed. */
  name: string
  categoryName: string | null
  /** Distinct sessions (EventDateIds) inside the requested window. */
  sessionCount: number
  firstSession: { dateIso: string; day: string; mon: string }
  /** Wall-clock time range of the first session, e.g. "6:00 - 7:30 PM". */
  timeSummary: string
  url: string
  isRecurring: boolean
}

/**
 * `YYYY-MM` → first/last calendar day of that month (both inclusive,
 * `YYYY-MM-DD`). A calendar month is ≤31 days, so the window always fits
 * CR's 31-day report limit in a single call. Returns null on bad input.
 */
export function monthWindow(ym: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return null
  const year = +m[1]
  const month = +m[2]
  if (month < 1 || month > 12) return null
  // Day 0 of the next month = last day of this month (pure calendar math, UTC-anchored).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${pad2(lastDay)}` }
}

/** Public Court Reserve event-details page (same URL shape the weekly digest links). */
export function buildCrEventUrl(crOrgId: string, eventId: number): string {
  return `https://app.courtreserve.com/Online/Events/Details/${encodeURIComponent(crOrgId)}/${encodeURIComponent(String(eventId))}`
}

interface EventAccumulator {
  eventId: number
  name: string
  categoryName: string | null
  /** Distinct session keys (EventDateId, or date|start|name fallback). */
  sessionKeys: Set<string>
  /** Earliest session so far, by wall-clock sort key. */
  first: { sortKey: string; dateIso: string; startTime: string; endTime: string }
}

/**
 * Group registration rows into distinct events. Multiple registration rows
 * for the same session collapse via EventDateId; sessions outside the window
 * are ignored (defensive — the API is queried with the same window).
 *
 * Sort order: one-offs (below the recurring threshold) by first-session date,
 * then recurring series by name.
 */
export function groupCrEvents(
  rows: CREventRegistration[],
  opts: { crOrgId: string; window: { start: string; end: string } }
): PrefillEvent[] {
  const byEvent = new Map<number, EventAccumulator>()

  for (const r of rows) {
    if (typeof r.EventId !== 'number' || !r.EventName) continue
    const start = parseWallClock(r.StartTime)
    const end = parseWallClock(r.EndTime)
    if (!start || !end) continue
    // Date comes from the string's own date part — never from a
    // timezone-converted Date (see parseWallClock in cr-time.ts).
    const dateIso = `${start.y}-${pad2(start.mo)}-${pad2(start.d)}`
    if (dateIso < opts.window.start || dateIso > opts.window.end) continue

    const sessionKey = r.EventDateId ? `id:${r.EventDateId}` : `${dateIso}|${r.StartTime}|${r.EventName}`
    const sortKey = `${dateIso}T${pad2(start.h)}:${pad2(start.min)}`

    let acc = byEvent.get(r.EventId)
    if (!acc) {
      acc = {
        eventId: r.EventId,
        name: r.EventName, // verbatim from CR — never rename
        categoryName: r.EventCategoryName ?? null,
        sessionKeys: new Set(),
        first: { sortKey, dateIso, startTime: r.StartTime, endTime: r.EndTime },
      }
      byEvent.set(r.EventId, acc)
    }
    acc.sessionKeys.add(sessionKey)
    if (sortKey < acc.first.sortKey) {
      acc.first = { sortKey, dateIso, startTime: r.StartTime, endTime: r.EndTime }
    }
  }

  const events: PrefillEvent[] = [...byEvent.values()].map((acc) => {
    const [, mo, d] = acc.first.dateIso.split('-')
    return {
      eventId: acc.eventId,
      name: acc.name,
      categoryName: acc.categoryName,
      sessionCount: acc.sessionKeys.size,
      firstSession: { dateIso: acc.first.dateIso, day: String(+d), mon: MON_ABBREV[+mo - 1] },
      timeSummary: formatTimeRange(acc.first.startTime, acc.first.endTime),
      url: buildCrEventUrl(opts.crOrgId, acc.eventId),
      isRecurring: acc.sessionKeys.size >= RECURRING_SESSION_THRESHOLD,
    }
  })

  return events.sort((a, b) => {
    if (a.isRecurring !== b.isRecurring) return a.isRecurring ? 1 : -1
    if (!a.isRecurring) {
      return (
        a.firstSession.dateIso.localeCompare(b.firstSession.dateIso) || a.name.localeCompare(b.name)
      )
    }
    return a.name.localeCompare(b.name)
  })
}

/** League Lineup candidates: category name suggests a league. */
export function isLeagueEvent(e: PrefillEvent): boolean {
  return (e.categoryName ?? '').toLowerCase().includes('league')
}

/** Checklist defaults: one-offs INCLUDED, recurring series EXCLUDED. */
export function defaultIncluded(e: PrefillEvent): boolean {
  return !e.isRecurring
}

/** Maps an included event to the builder's repeatable Event row fields. */
export function toEventRow(e: PrefillEvent): { day: string; mon: string; name: string; detail: string; url: string } {
  return {
    day: e.firstSession.day,
    mon: e.firstSession.mon,
    name: e.name,
    detail: e.isRecurring ? `${e.timeSummary} — runs weekly` : e.timeSummary,
    url: e.url,
  }
}

/** Maps an included league-category event to the builder's League row fields. */
export function toLeagueRow(e: PrefillEvent): { name: string; detail: string; url: string } {
  return {
    name: e.name,
    detail: e.categoryName ? `${e.timeSummary} — ${e.categoryName}` : e.timeSummary,
    url: e.url,
  }
}
