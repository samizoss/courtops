import { describe, it, expect } from 'vitest'
import {
  getWeekWindow,
  normalizeEvents,
  formatTimeRange,
  formatDateRange,
  renderDigestEmail,
  getDigestImageTier,
  DAY_LABELS,
  type DigestEvent,
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

describe('renderDigestEmail', () => {
  const window = { start: '2026-07-20', end: '2026-07-26' }

  function ev(overrides: Partial<DigestEvent>): DigestEvent {
    return {
      dayIndex: 0,
      startTime: '2026-07-20T12:00:00.000Z',
      endTime: '2026-07-20T15:00:00.000Z',
      startIso: '2026-07-20T12:00:00.000Z',
      name: 'Open Play',
      ...overrides,
    }
  }

  it('always renders all 7 day rows, even with zero events', () => {
    const html = renderDigestEmail([], window)
    for (const label of DAY_LABELS) {
      expect(html).toContain(`>${label}<`)
    }
  })

  it('renders an empty right cell for a day with no events', () => {
    const events = [ev({ dayIndex: 0 })] // only Monday has an event
    const html = renderDigestEmail(events, window)
    // Sunday (dayIndex 6) row should have an empty <p> for DAY_EVENTS
    const sundayRowMatch = html.match(/>sunday<[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)
    expect(sundayRowMatch).not.toBeNull()
    expect(sundayRowMatch![1].trim()).toBe('')
  })

  it('shrinks font size to 13 when any day has more than 5 events', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev({ dayIndex: 2, name: `Event ${i}`, startTime: `2026-07-22T${12 + i}:00:00.000Z`, endTime: `2026-07-22T${13 + i}:00:00.000Z` })
    )
    const html = renderDigestEmail(events, window)
    expect(html).toContain('font-size:13px')
    expect(html).not.toContain('font-size:15px')
  })

  it('uses font size 15 when no day exceeds 5 events', () => {
    const events = [ev({ dayIndex: 0 }), ev({ dayIndex: 1 })]
    const html = renderDigestEmail(events, window)
    expect(html).toContain('font-size:15px')
  })

  it('never truncates events, even when a day has more than 5', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      ev({ dayIndex: 3, name: `Session ${i}`, startTime: `2026-07-23T${12 + i}:00:00.000Z`, endTime: `2026-07-23T${13 + i}:00:00.000Z` })
    )
    const html = renderDigestEmail(events, window)
    for (let i = 0; i < 8; i++) {
      expect(html).toContain(`Session ${i}`)
    }
  })

  it('contains the formatted date range', () => {
    const html = renderDigestEmail([], window)
    expect(html).toContain('7/20 – 7/26')
  })

  it('leaves no unfilled {{ }} tokens', () => {
    const html = renderDigestEmail([ev({})], window)
    expect(html).not.toContain('{{')
  })

  it('keeps event names verbatim and bold, time regular', () => {
    const html = renderDigestEmail([ev({ name: 'HIP Class (3.5+)' })], window)
    expect(html).toContain('<strong>HIP Class (3.5+)</strong>')
    expect(html).toContain('7:00 - 10:00 AM')
  })
})

describe('getDigestImageTier', () => {
  it('uses the largest (tier 1) font for a quiet week', () => {
    expect(getDigestImageTier([1, 2, 1, 0, 2, 1, 3]).eventFontSize).toBe(24)
  })

  it('steps down to tier 2 when total weekly pressure is high even though no single day is very busy', () => {
    // 3 events every day = 21 total, no day exceeds tier 1's max-per-day
    // threshold — this is the exact "broadly busy week" case that a
    // single-day-only heuristic would miss.
    const tier = getDigestImageTier([3, 3, 3, 3, 3, 3, 3])
    expect(tier.eventFontSize).toBe(19)
  })

  it('steps down when a single day spikes, even if the weekly total is otherwise low', () => {
    const tier = getDigestImageTier([0, 0, 0, 20, 0, 0, 0])
    expect(tier.eventFontSize).toBeLessThan(24)
  })

  it('drops to the smallest (tier 3) font for the worst realistic case: 7 days x 8 events', () => {
    const tier = getDigestImageTier([8, 8, 8, 8, 8, 8, 8])
    expect(tier.eventFontSize).toBe(12)
  })

  it('fits the worst realistic case within the 1350px canvas budget', () => {
    // Mirrors the height-budget comment on getDigestImageTier: fixed
    // chrome (header + rows-container margin + footer) is ~489px, leaving
    // ~861px for the 7 day rows.
    const FIXED_CHROME = 489
    const CANVAS_HEIGHT = 1350
    const BUDGET_FOR_ROWS = CANVAS_HEIGHT - FIXED_CHROME

    const tier = getDigestImageTier([8, 8, 8, 8, 8, 8, 8])
    const eventsHeight = 8 * (tier.eventFontSize * tier.lineHeight) + 7 * tier.eventGap
    const rowHeight = 2 /* border */ + tier.rowPaddingY * 2 + eventsHeight
    const totalRowsHeight = rowHeight * 7

    expect(totalRowsHeight).toBeLessThanOrEqual(BUDGET_FOR_ROWS)
  })

  it('stays at tier 1 defaults exactly at the tier 1/2 boundary (20 total, maxPerDay 4)', () => {
    const tier = getDigestImageTier([4, 4, 4, 4, 4, 0, 0]) // 20 total, max 4
    expect(tier.eventFontSize).toBe(24)
  })

  it('crosses into tier 2 just past the boundary (21 total)', () => {
    const tier = getDigestImageTier([4, 4, 4, 4, 4, 1, 0]) // 21 total, max 4
    expect(tier.eventFontSize).toBe(19)
  })

  it('handles an empty week without throwing', () => {
    expect(getDigestImageTier([0, 0, 0, 0, 0, 0, 0]).eventFontSize).toBe(24)
  })
})
