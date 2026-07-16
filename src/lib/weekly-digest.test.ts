import { describe, it, expect } from 'vitest'
import {
  getWeekWindow,
  normalizeEvents,
  formatTimeRange,
  formatDateRange,
  DAY_LABELS,
} from './weekly-digest'
import type { CREventRegistration } from '@/lib/courtreserve'

describe('getWeekWindow', () => {
  it('resolves the coming Monday-Sunday from a Friday (UTC instant)', () => {
    // 2026-07-17T14:00Z = Friday 9:00 AM CDT (America/Chicago)
    expect(getWeekWindow(new Date('2026-07-17T14:00:00.000Z'))).toEqual({
      start: '2026-07-20',
      end: '2026-07-26',
    })
  })

  it('starts the window today when today is Monday in Chicago', () => {
    // 2026-07-20T18:00Z = Monday 1:00 PM CDT
    expect(getWeekWindow(new Date('2026-07-20T18:00:00.000Z'))).toEqual({
      start: '2026-07-20',
      end: '2026-07-26',
    })
  })

  it('resolves from the Chicago date, not the UTC date, near midnight UTC', () => {
    // 2026-07-18T03:00Z is Saturday in UTC but still Friday 10:00 PM in Chicago
    expect(getWeekWindow(new Date('2026-07-18T03:00:00.000Z'))).toEqual({
      start: '2026-07-20',
      end: '2026-07-26',
    })
  })

  it('still yields a full Mon-Sun 7-day window spanning a DST transition', () => {
    // Fri 2026-10-30; DST (fall back) happens Sun 2026-11-01 in America/Chicago
    const window = getWeekWindow(new Date('2026-10-30T14:00:00.000Z'))
    expect(window).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    // sanity: exactly 7 calendar days apart
    const days = (Date.parse(window.end + 'T12:00:00Z') - Date.parse(window.start + 'T12:00:00Z')) / 86400000
    expect(days).toBe(6)
  })
})

describe('normalizeEvents', () => {
  const window = { start: '2026-07-20', end: '2026-07-26' }

  function row(overrides: Partial<CREventRegistration>): CREventRegistration {
    return {
      EventId: 1,
      EventName: 'Open Play',
      EventDateId: 100,
      StartTime: '2026-07-20T12:00:00.000Z', // Mon 7am Chicago
      EndTime: '2026-07-20T15:00:00.000Z', // Mon 10am Chicago
      CancelledOnUtc: null,
      ...overrides,
    }
  }

  it('de-dupes on EventDateId', () => {
    const rows = [row({}), row({})]
    expect(normalizeEvents(rows, window)).toHaveLength(1)
  })

  it('keeps a session that has one cancelled and one active registration row (session, not registration, is the unit)', () => {
    const rows = [
      row({ CancelledOnUtc: '2026-07-19T00:00:00.000Z' }),
      row({ CancelledOnUtc: null }),
    ]
    const result = normalizeEvents(rows, window)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Open Play')
  })

  it('falls back to day|start|name key when EventDateId is missing', () => {
    const rows = [
      row({ EventDateId: undefined as unknown as number }),
      row({ EventDateId: undefined as unknown as number }),
    ]
    expect(normalizeEvents(rows, window)).toHaveLength(1)
  })

  it('treats distinct EventDateIds as distinct sessions even with the same name/time', () => {
    const rows = [row({ EventDateId: 100 }), row({ EventDateId: 101 })]
    expect(normalizeEvents(rows, window)).toHaveLength(2)
  })

  it('drops rows outside the window (Chicago date)', () => {
    const rows = [
      row({}), // Mon, in window
      row({
        EventDateId: 200,
        StartTime: '2026-07-27T12:00:00.000Z', // following Monday, out of window
        EndTime: '2026-07-27T15:00:00.000Z',
      }),
    ]
    expect(normalizeEvents(rows, window)).toHaveLength(1)
  })

  it('assigns dayIndex 0=Mon..6=Sun and sorts by dayIndex then start time', () => {
    const rows = [
      row({
        EventDateId: 300,
        StartTime: '2026-07-26T18:00:00.000Z', // Sun 1pm Chicago
        EndTime: '2026-07-26T20:00:00.000Z',
        EventName: 'Sunday Session',
      }),
      row({
        EventDateId: 100,
        StartTime: '2026-07-20T12:00:00.000Z', // Mon 7am
        EndTime: '2026-07-20T15:00:00.000Z',
        EventName: 'Monday Early',
      }),
      row({
        EventDateId: 101,
        StartTime: '2026-07-20T16:00:00.000Z', // Mon 11am
        EndTime: '2026-07-20T18:00:00.000Z',
        EventName: 'Monday Late',
      }),
    ]
    const result = normalizeEvents(rows, window)
    expect(result.map((e) => e.name)).toEqual(['Monday Early', 'Monday Late', 'Sunday Session'])
    expect(result[0].dayIndex).toBe(0)
    expect(result[2].dayIndex).toBe(6)
  })

  it('keeps event names verbatim, never renaming', () => {
    const rows = [row({ EventName: 'HIP Class (3.5+)' })]
    expect(normalizeEvents(rows, window)[0].name).toBe('HIP Class (3.5+)')
  })

  it('skips rows with unparsable times or missing name', () => {
    const rows = [
      row({ StartTime: 'not-a-date' }),
      row({ EventName: '' as unknown as string, EventDateId: 999 }),
    ]
    expect(normalizeEvents(rows, window)).toHaveLength(0)
  })
})

describe('formatTimeRange', () => {
  it('shows meridiem once when both sides match', () => {
    // 7:00 AM - 10:00 AM Chicago (CDT, summer)
    expect(formatTimeRange('2026-07-20T12:00:00.000Z', '2026-07-20T15:00:00.000Z')).toBe(
      '7:00 - 10:00 AM'
    )
  })

  it('shows meridiem on both sides when they differ', () => {
    // 11:00 AM - 1:00 PM Chicago
    expect(formatTimeRange('2026-07-20T16:00:00.000Z', '2026-07-20T18:00:00.000Z')).toBe(
      '11:00 AM - 1:00 PM'
    )
  })
})

describe('formatDateRange', () => {
  it('formats as M/D – M/D with an en dash', () => {
    expect(formatDateRange('2026-07-20', '2026-07-26')).toBe('7/20 – 7/26')
  })
})

describe('DAY_LABELS', () => {
  it('has 7 lowercase day labels, Monday first', () => {
    expect(DAY_LABELS).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ])
  })
})
