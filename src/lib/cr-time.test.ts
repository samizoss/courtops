import { describe, it, expect } from 'vitest'
import { crWallClockToInstant } from './cr-time'

/** Format an instant back into a zone's wall clock as `YYYY-MM-DDTHH:mm:ss`. */
function wallClockInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

describe('crWallClockToInstant', () => {
  it('converts a summer (CDT, UTC-5) wall clock to the real instant', () => {
    // Prod evidence: "LTP-Monday 6pm" arrives as "2026-07-20T18:00:00" → 23:00Z
    expect(crWallClockToInstant('2026-07-20T18:00:00', 'America/Chicago').toISOString())
      .toBe('2026-07-20T23:00:00.000Z')
  })

  it('converts a winter (CST, UTC-6) wall clock to the real instant', () => {
    expect(crWallClockToInstant('2026-01-15T18:00:00', 'America/Chicago').toISOString())
      .toBe('2026-01-16T00:00:00.000Z')
  })

  it('crosses UTC midnight correctly for late-evening summer times', () => {
    // 7:30 PM CDT = 00:30Z the NEXT UTC day — the date-flip case
    expect(crWallClockToInstant('2026-07-20T19:30:00', 'America/Chicago').toISOString())
      .toBe('2026-07-21T00:30:00.000Z')
  })

  it('maps the spring-forward skipped hour to the earliest candidate instant (documented rule)', () => {
    // 2026-03-08 02:30 does not exist in America/Chicago (02:00 CST → 03:00 CDT).
    // Rule: earliest candidate instant → interpreted with the post-transition
    // offset (UTC-5) → 07:30Z, which renders as 01:30 CST.
    expect(crWallClockToInstant('2026-03-08T02:30:00', 'America/Chicago').toISOString())
      .toBe('2026-03-08T07:30:00.000Z')
  })

  it('maps the fall-back ambiguous hour to the earlier valid instant (first occurrence, CDT)', () => {
    // 2026-11-01 01:30 occurs twice (CDT 06:30Z, then CST 07:30Z). Rule: earlier.
    expect(crWallClockToInstant('2026-11-01T01:30:00', 'America/Chicago').toISOString())
      .toBe('2026-11-01T06:30:00.000Z')
  })

  it('picks the earlier valid instant for ambiguous hours in positive-offset zones too', () => {
    // Europe/Berlin fall-back 2026-10-25: 02:30 occurs as CEST (00:30Z) then CET (01:30Z).
    expect(crWallClockToInstant('2026-10-25T02:30:00', 'Europe/Berlin').toISOString())
      .toBe('2026-10-25T00:30:00.000Z')
  })

  it('round-trips: the instant formatted back in the zone equals the input wall clock', () => {
    const samples = [
      '2026-07-20T18:00:00', // summer
      '2026-01-15T06:30:00', // winter morning
      '2026-12-31T23:45:00', // year boundary
      '2026-03-08T01:59:00', // minute before spring-forward
      '2026-03-08T03:00:00', // minute-zero after spring-forward
      '2026-11-01T00:59:00', // minute before fall-back window
      '2026-11-01T02:00:00', // first unambiguous minute after fall-back
    ]
    for (const s of samples) {
      const d = crWallClockToInstant(s, 'America/Chicago')
      expect(wallClockInZone(d, 'America/Chicago')).toBe(s)
    }
  })

  it('handles non-Chicago zones (America/New_York, EDT)', () => {
    expect(crWallClockToInstant('2026-07-20T18:00:00', 'America/New_York').toISOString())
      .toBe('2026-07-20T22:00:00.000Z')
  })

  it('handles zones without DST (Asia/Tokyo, UTC+9)', () => {
    expect(crWallClockToInstant('2026-07-20T18:00:00', 'Asia/Tokyo').toISOString())
      .toBe('2026-07-20T09:00:00.000Z')
  })

  it('parses fractional seconds (attendance-style strings) at second precision', () => {
    expect(crWallClockToInstant('2026-07-21T16:39:03.157', 'America/Chicago').toISOString())
      .toBe('2026-07-21T21:39:03.000Z')
  })

  it('trusts strings that carry an explicit offset or Z', () => {
    expect(crWallClockToInstant('2026-07-20T18:00:00Z', 'America/Chicago').toISOString())
      .toBe('2026-07-20T18:00:00.000Z')
    expect(crWallClockToInstant('2026-07-20T18:00:00-05:00', 'America/Chicago').toISOString())
      .toBe('2026-07-20T23:00:00.000Z')
  })

  it('treats a bare date as midnight wall clock in the zone', () => {
    expect(crWallClockToInstant('2026-07-20', 'America/Chicago').toISOString())
      .toBe('2026-07-20T05:00:00.000Z')
  })

  it('returns an invalid Date for garbage or empty input (caller skips via isNaN)', () => {
    for (const bad of ['', 'not-a-date', '2026-13-99T99:99:99', 'Monday 6pm']) {
      expect(Number.isNaN(crWallClockToInstant(bad, 'America/Chicago').getTime())).toBe(true)
    }
  })
})
