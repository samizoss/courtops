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

export interface DigestEvent { dayIndex: number; startTime: string; endTime: string; startIso: string; name: string }

function chicagoIsoDate(d: Date): string {
  const { y, m, d: day } = chicagoYmdWeekday(d)
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function normalizeEvents(rows: CREventRegistration[], window: { start: string; end: string }): DigestEvent[] {
  const seen = new Map<string, DigestEvent>()
  for (const r of rows) {
    const start = new Date(r.StartTime); const end = new Date(r.EndTime)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || !r.EventName) continue
    const dateIso = chicagoIsoDate(start)
    if (dateIso < window.start || dateIso > window.end) continue
    const key = r.EventDateId ? `id:${r.EventDateId}` : `${dateIso}|${r.StartTime}|${r.EventName}`
    if (seen.has(key)) continue
    const dayIndex = Math.round((Date.parse(dateIso + 'T12:00:00Z') - Date.parse(window.start + 'T12:00:00Z')) / 86400000)
    seen.set(key, {
      dayIndex,
      startIso: start.toISOString(),
      startTime: r.StartTime,
      endTime: r.EndTime,
      name: r.EventName, // verbatim from CR — never rename
    })
  }
  return [...seen.values()].sort((a, b) => a.dayIndex - b.dayIndex || a.startIso.localeCompare(b.startIso))
}

function fmtTime(d: Date, withMeridiem: boolean): string {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
  return withMeridiem ? s : s.replace(/\s?(AM|PM)$/i, '')
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const s = new Date(startIso); const e = new Date(endIso)
  const mer = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: true }).format(d).slice(-2)
  const same = mer(s) === mer(e)
  return `${fmtTime(s, !same)} - ${fmtTime(e, true)}`
}

export function formatDateRange(startDate: string, endDate: string): string {
  const md = (iso: string) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}` }
  return `${md(startDate)} – ${md(endDate)}`
}

export const DAY_LABELS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

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
