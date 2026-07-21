import { describe, it, expect } from 'vitest'
import type { CREventRegistration } from './courtreserve'
import {
  monthWindow,
  buildCrEventUrl,
  groupCrEvents,
  isLeagueEvent,
  defaultIncluded,
  toEventRow,
  toLeagueRow,
  RECURRING_SESSION_THRESHOLD,
  type PrefillEvent,
} from './newsletter-prefill'

const WINDOW = { start: '2026-08-01', end: '2026-08-31' }
const CR_ORG_ID = '13403'

/** Registration-report row factory (shape verified against The Jar prod data). */
function row(overrides: Partial<CREventRegistration> = {}): CREventRegistration {
  return {
    EventId: 100,
    EventName: 'Glow in the Dark Pickleball',
    EventCategoryName: 'Social Events',
    EventDateId: 9001,
    StartTime: '2026-08-14T18:00:00',
    EndTime: '2026-08-14T19:30:00',
    ...overrides,
  }
}

function group(rows: CREventRegistration[]): PrefillEvent[] {
  return groupCrEvents(rows, { crOrgId: CR_ORG_ID, window: WINDOW })
}

describe('monthWindow', () => {
  it('returns first and last day of a 31-day month', () => {
    expect(monthWindow('2026-08')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('handles 30-day months and February', () => {
    expect(monthWindow('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(monthWindow('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('handles leap-year February', () => {
    expect(monthWindow('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('rejects malformed or out-of-range input', () => {
    expect(monthWindow('')).toBeNull()
    expect(monthWindow('2026-8')).toBeNull()
    expect(monthWindow('2026-13')).toBeNull()
    expect(monthWindow('2026-00')).toBeNull()
    expect(monthWindow('August 2026')).toBeNull()
    expect(monthWindow('2026-08-01')).toBeNull()
  })
})

describe('buildCrEventUrl', () => {
  it('builds the public Court Reserve event details URL', () => {
    expect(buildCrEventUrl('13403', 55123)).toBe(
      'https://app.courtreserve.com/Online/Events/Details/13403/55123'
    )
  })

  it('URL-encodes the org id defensively', () => {
    expect(buildCrEventUrl('134 03', 1)).toBe(
      'https://app.courtreserve.com/Online/Events/Details/134%2003/1'
    )
  })
})

describe('groupCrEvents', () => {
  it('groups registration rows by EventId into one event with distinct-session count', () => {
    // 3 registration rows across 2 sessions of the same event
    const events = group([
      row({ EventDateId: 9001 }),
      row({ EventDateId: 9001 }),
      row({ EventDateId: 9002, StartTime: '2026-08-21T18:00:00', EndTime: '2026-08-21T19:30:00' }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].eventId).toBe(100)
    expect(events[0].sessionCount).toBe(2)
  })

  it('keeps the event name verbatim and carries the category name', () => {
    const [e] = group([row({ EventName: '  LTP-Monday <6pm> ', EventCategoryName: 'Clinics' })])
    expect(e.name).toBe('  LTP-Monday <6pm> ') // verbatim — no trimming, no renaming
    expect(e.categoryName).toBe('Clinics')
  })

  it('derives first-session date chip from the earliest session, wall-clock', () => {
    const [e] = group([
      row({ EventDateId: 9002, StartTime: '2026-08-21T18:00:00', EndTime: '2026-08-21T19:30:00' }),
      row({ EventDateId: 9001, StartTime: '2026-08-14T18:00:00', EndTime: '2026-08-14T19:30:00' }),
    ])
    expect(e.firstSession).toEqual({ dateIso: '2026-08-14', day: '14', mon: 'AUG' })
  })

  it('formats timeSummary from the first session with wall-clock digits (never Date conversion)', () => {
    // 18:00 naive must render 6:00 PM regardless of server timezone
    const [e] = group([row()])
    expect(e.timeSummary).toBe('6:00 - 7:30 PM')
  })

  it('collapses meridiem only when both sides match, like the weekly digest', () => {
    const [e] = group([row({ StartTime: '2026-08-14T11:00:00', EndTime: '2026-08-14T13:00:00' })])
    expect(e.timeSummary).toBe('11:00 AM - 1:00 PM')
  })

  it('builds the https event details URL from crOrgId + eventId', () => {
    const [e] = group([row({ EventId: 55123 })])
    expect(e.url).toBe('https://app.courtreserve.com/Online/Events/Details/13403/55123')
  })

  it('flags recurring at >= 3 distinct sessions', () => {
    const twoSessions = group([
      row({ EventDateId: 1, StartTime: '2026-08-07T18:00:00' }),
      row({ EventDateId: 2, StartTime: '2026-08-14T18:00:00' }),
    ])
    expect(twoSessions[0].isRecurring).toBe(false)

    const threeSessions = group([
      row({ EventDateId: 1, StartTime: '2026-08-07T18:00:00' }),
      row({ EventDateId: 2, StartTime: '2026-08-14T18:00:00' }),
      row({ EventDateId: 3, StartTime: '2026-08-21T18:00:00' }),
    ])
    expect(threeSessions[0].isRecurring).toBe(true)
    expect(RECURRING_SESSION_THRESHOLD).toBe(3)
  })

  it('sorts one-offs by date first, then recurring by name', () => {
    const events = group([
      // Recurring "Zeta League" (3 sessions)
      row({ EventId: 3, EventName: 'Zeta Weekly', EventDateId: 31, StartTime: '2026-08-03T18:00:00' }),
      row({ EventId: 3, EventName: 'Zeta Weekly', EventDateId: 32, StartTime: '2026-08-10T18:00:00' }),
      row({ EventId: 3, EventName: 'Zeta Weekly', EventDateId: 33, StartTime: '2026-08-17T18:00:00' }),
      // Recurring "Alpha Weekly" (3 sessions)
      row({ EventId: 4, EventName: 'Alpha Weekly', EventDateId: 41, StartTime: '2026-08-04T18:00:00' }),
      row({ EventId: 4, EventName: 'Alpha Weekly', EventDateId: 42, StartTime: '2026-08-11T18:00:00' }),
      row({ EventId: 4, EventName: 'Alpha Weekly', EventDateId: 43, StartTime: '2026-08-18T18:00:00' }),
      // One-off late in the month
      row({ EventId: 2, EventName: 'Late One-off', EventDateId: 21, StartTime: '2026-08-29T09:00:00' }),
      // One-off early in the month
      row({ EventId: 1, EventName: 'Early One-off', EventDateId: 11, StartTime: '2026-08-02T09:00:00' }),
    ])
    expect(events.map((e) => e.name)).toEqual([
      'Early One-off',
      'Late One-off',
      'Alpha Weekly',
      'Zeta Weekly',
    ])
  })

  it('skips rows with missing EventId, missing name, or unparsable times', () => {
    const events = group([
      row({ EventId: undefined as unknown as number }),
      row({ EventId: 7, EventName: '' }),
      row({ EventId: 8, StartTime: 'not-a-date' }),
      row({ EventId: 9, EventName: 'Good Event' }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].eventId).toBe(9)
  })

  it('ignores sessions outside the window but keeps the event if any session is inside', () => {
    const events = group([
      row({ EventDateId: 1, StartTime: '2026-07-31T18:00:00', EndTime: '2026-07-31T19:30:00' }),
      row({ EventDateId: 2, StartTime: '2026-08-07T18:00:00', EndTime: '2026-08-07T19:30:00' }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].sessionCount).toBe(1)
    expect(events[0].firstSession.dateIso).toBe('2026-08-07')
  })

  it('falls back to date+start+name session identity when EventDateId is missing', () => {
    const events = group([
      row({ EventDateId: undefined as unknown as number, StartTime: '2026-08-07T18:00:00' }),
      row({ EventDateId: undefined as unknown as number, StartTime: '2026-08-07T18:00:00' }),
      row({ EventDateId: undefined as unknown as number, StartTime: '2026-08-14T18:00:00' }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].sessionCount).toBe(2)
  })
})

describe('isLeagueEvent', () => {
  const base = group([row()])[0]

  it('matches when categoryName contains "league", case-insensitive', () => {
    expect(isLeagueEvent({ ...base, categoryName: 'Leagues' })).toBe(true)
    expect(isLeagueEvent({ ...base, categoryName: 'FALL LEAGUE PLAY' })).toBe(true)
    expect(isLeagueEvent({ ...base, categoryName: 'league' })).toBe(true)
  })

  it('does not match other categories or missing category', () => {
    expect(isLeagueEvent({ ...base, categoryName: 'Social Events' })).toBe(false)
    expect(isLeagueEvent({ ...base, categoryName: null })).toBe(false)
  })
})

describe('defaultIncluded', () => {
  const base = group([row()])[0]

  it('includes one-offs and excludes recurring by default', () => {
    expect(defaultIncluded({ ...base, isRecurring: false })).toBe(true)
    expect(defaultIncluded({ ...base, isRecurring: true })).toBe(false)
  })
})

describe('toEventRow', () => {
  const base = group([row({ EventId: 55123 })])[0]

  it('maps a one-off to a builder event row with verbatim name and prefilled detail/url', () => {
    expect(toEventRow(base)).toEqual({
      day: '14',
      mon: 'AUG',
      name: 'Glow in the Dark Pickleball',
      detail: '6:00 - 7:30 PM',
      url: 'https://app.courtreserve.com/Online/Events/Details/13403/55123',
    })
  })

  it('appends "runs weekly" to the detail for recurring events', () => {
    expect(toEventRow({ ...base, isRecurring: true }).detail).toBe('6:00 - 7:30 PM — runs weekly')
  })
})

describe('toLeagueRow', () => {
  const base = group([row({ EventId: 77, EventName: 'Ladder Play', EventCategoryName: 'Leagues' })])[0]

  it('maps to a builder league row with timeSummary + category detail', () => {
    expect(toLeagueRow(base)).toEqual({
      name: 'Ladder Play',
      detail: '6:00 - 7:30 PM — Leagues',
      url: 'https://app.courtreserve.com/Online/Events/Details/13403/77',
    })
  })

  it('omits the category suffix when categoryName is missing', () => {
    expect(toLeagueRow({ ...base, categoryName: null }).detail).toBe('6:00 - 7:30 PM')
  })
})
