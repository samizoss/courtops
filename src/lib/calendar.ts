// Pure date helpers for the availability + schedule calendar views.
// Sunday-first, local time (no UTC drift).

export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LABELS_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

export type ViewMode = 'day' | 'week' | 'month'

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  const out = startOfDay(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Sunday of the week containing d (local time). */
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d)
  out.setDate(out.getDate() - out.getDay())
  return out
}

/** Sunday of the week containing the 1st of d's month. */
export function startOfMonthView(d: Date): Date {
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1)
  return startOfWeek(firstOfMonth)
}

/** Number of weeks (4-6) needed to cover the calendar month containing d. */
export function weeksInMonthView(d: Date): number {
  const start = startOfMonthView(d)
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

export function visibleRange(anchor: Date, mode: ViewMode): { start: Date; end: Date } {
  if (mode === 'day') {
    const s = startOfDay(anchor)
    return { start: s, end: s }
  }
  if (mode === 'week') {
    const s = startOfWeek(anchor)
    return { start: s, end: addDays(s, 6) }
  }
  const s = startOfMonthView(anchor)
  const weeks = weeksInMonthView(anchor)
  return { start: s, end: addDays(s, weeks * 7 - 1) }
}

export function stepAnchor(anchor: Date, mode: ViewMode, n: number): Date {
  if (mode === 'day') return addDays(anchor, n)
  if (mode === 'week') return addDays(anchor, n * 7)
  return new Date(anchor.getFullYear(), anchor.getMonth() + n, 1)
}
