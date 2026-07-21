import { describe, it, expect } from 'vitest'
import { toISODate, fmt } from './courtreserve'

// CR sends naive org-local wall-clock strings (verified against The Jar's prod
// data 2026-07-21: attendance DateTime "2026-07-21T16:39:03.157" with
// DateTimeDisplay "7/21/2026 4:39 PM" and TimeZone "America/Chicago").
// Day-granularity fields must keep the WALL-CLOCK date — never round-trip
// through Date, which re-interprets the string in the server timezone and can
// flip late-evening times across midnight on non-UTC servers.

describe('toISODate', () => {
  it('keeps the wall-clock date for naive CR strings', () => {
    expect(toISODate('2026-07-21T16:39:03.157')).toBe('2026-07-21')
    expect(toISODate('2026-01-15T18:00:00')).toBe('2026-01-15')
  })

  it('does not flip late-evening wall-clock times to the next date (any server tz)', () => {
    // 7:39 PM Chicago = next-day 00:39Z; the date must stay 07-21.
    expect(toISODate('2026-07-21T19:39:00')).toBe('2026-07-21')
    expect(toISODate('2026-07-21T23:59:59.999')).toBe('2026-07-21')
  })

  it('handles bare dates', () => {
    expect(toISODate('2026-07-21')).toBe('2026-07-21')
  })

  it('returns null for missing or garbage input', () => {
    expect(toISODate(null)).toBeNull()
    expect(toISODate(undefined)).toBeNull()
    expect(toISODate('')).toBeNull()
    expect(toISODate('not-a-date')).toBeNull()
    expect(toISODate('2026-13-40T00:00:00')).toBeNull()
  })
})

describe('fmt', () => {
  it('returns the calendar date of the local Date components, independent of server tz', () => {
    // Sync builds windows with new Date(year, month, 1) — local components.
    expect(fmt(new Date(2026, 6, 1))).toBe('2026-07-01')
    expect(fmt(new Date(2026, 11, 31))).toBe('2026-12-31')
    expect(fmt(new Date(2026, 0, 1))).toBe('2026-01-01')
  })
})
