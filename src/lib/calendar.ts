// Pure date helpers for the availability + schedule calendar views.
// Configurable week start (0=Sun, 1=Mon, etc.), local time (no UTC drift).

const _DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const _DAY_LABELS_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

export const DAY_LABELS_SHORT = _DAY_LABELS_SHORT
export const DAY_LABELS_FULL = _DAY_LABELS_FULL

export function rotatedDayLabels(weekStart: number): string[] {
  return [..._DAY_LABELS_SHORT.slice(weekStart), ..._DAY_LABELS_SHORT.slice(0, weekStart)]
}

export type ViewMode = 'day' | 'week' | 'month'

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  const out = startOfDay(d)
  out.setDate(out.getDate() + n)
  return out
}

/** First day of the week containing d, using weekStart (0=Sun, 1=Mon, ...). */
export function startOfWeek(d: Date, weekStart = 0): Date {
  const out = startOfDay(d)
  const diff = (out.getDay() - weekStart + 7) % 7
  out.setDate(out.getDate() - diff)
  return out
}

/** First day of the calendar month view (week row containing the 1st). */
export function startOfMonthView(d: Date, weekStart = 0): Date {
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1)
  return startOfWeek(firstOfMonth, weekStart)
}

/** Number of weeks (4-6) needed to cover the calendar month containing d. */
export function weeksInMonthView(d: Date, weekStart = 0): number {
  const start = startOfMonthView(d, weekStart)
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const days = Math.ceil((lastOfMonth.getTime() - start.getTime()) / 86400000) + 1
  return Math.ceil(days / 7)
}

/** 'YYYY-MM-DD' in local time. */
export function fmtDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtDateRangeLabel(start: Date, end: Date): string {
  return `${fmtShortDate(start)} – ${fmtShortDate(end)}`
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function visibleRange(anchor: Date, mode: ViewMode, weekStart = 0): { start: Date; end: Date } {
  if (mode === 'day') {
    const s = startOfDay(anchor)
    return { start: s, end: s }
  }
  if (mode === 'week') {
    const s = startOfWeek(anchor, weekStart)
    return { start: s, end: addDays(s, 6) }
  }
  const s = startOfMonthView(anchor, weekStart)
  const weeks = weeksInMonthView(anchor, weekStart)
  return { start: s, end: addDays(s, weeks * 7 - 1) }
}

export function stepAnchor(anchor: Date, mode: ViewMode, n: number): Date {
  if (mode === 'day') return addDays(anchor, n)
  if (mode === 'week') return addDays(anchor, n * 7)
  return new Date(anchor.getFullYear(), anchor.getMonth() + n, 1)
}
