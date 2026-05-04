// Display formatters. Centralized so AM/PM, currency, etc. are consistent
// across the app. Geneva flagged on 2026-04-28 that military times in shift
// pills (e.g. "14:30") were hard to scan — switched to "2:30 PM".

/**
 * Convert a "HH:MM" or "HH:MM:SS" time string to "h:MM AM/PM".
 * Returns the input unchanged if it doesn't parse.
 */
export function fmtTime12h(t: string | null | undefined): string {
  if (!t) return ''
  const [hStr, mStr] = t.slice(0, 5).split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return t
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return m === 0 ? `${hh} ${ampm}` : `${hh}:${m.toString().padStart(2, '0')} ${ampm}`
}

/**
 * "8 AM – 2:30 PM". Strips redundant AM/PM when both halves share it
 * ("8 – 11 AM" instead of "8 AM – 11 AM"), to keep shift pills compact.
 */
export function fmtTimeRange12h(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return ''
  const s = fmtTime12h(start)
  const e = fmtTime12h(end)
  const sAmPm = s.endsWith('AM') ? 'AM' : s.endsWith('PM') ? 'PM' : ''
  const eAmPm = e.endsWith('AM') ? 'AM' : e.endsWith('PM') ? 'PM' : ''
  if (sAmPm && sAmPm === eAmPm) {
    return `${s.replace(/ (AM|PM)$/, '')} – ${e}`
  }
  return `${s} – ${e}`
}

/**
 * Compact form for tight spaces: "8a–2:30p"
 */
export function fmtTimeRange12hCompact(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return ''
  const s = fmtTime12h(start).replace(' AM', 'a').replace(' PM', 'p')
  const e = fmtTime12h(end).replace(' AM', 'a').replace(' PM', 'p')
  return `${s}–${e}`
}

/** Hours like "4h", "1h 30m", "30m". */
export function fmtDurationHM(totalMinutes: number): string {
  if (totalMinutes < 60) return `${Math.round(totalMinutes)}m`
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
