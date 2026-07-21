import { describe, it, expect } from 'vitest'
import { GenerateRequestSchema } from './route'

/** Minimal valid request body — override per test. */
function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    month: 'August',
    year: 2026,
    notes: '',
    heroTopic: 'Fall leagues',
    heroUrl: 'https://app.courtreserve.com/Online/Events?id=1',
    leagues: [],
    events: [],
    ...overrides,
  }
}

describe('GenerateRequestSchema — toggle-aware row validation', () => {
  it('drops an invalid league row when LEAGUES is OFF (200-path validation passes)', () => {
    const body = baseBody({
      sections: { LEAGUES: false, EVENTS: true, CLINICS: true, ANNOUNCEMENTS: true, COMMUNITY_IMAGE: true, SPOTLIGHT: true, STAFF: true, COACH_QUOTE: true, AHEAD: true },
      leagues: [{ name: 'Ladder Play', detail: 'Mondays', url: 'not-a-url' }],
    })
    const result = GenerateRequestSchema.safeParse(body)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.leagues).toEqual([])
  })

  it('drops an invalid event row when EVENTS is OFF (200-path validation passes)', () => {
    const body = baseBody({
      sections: { LEAGUES: true, EVENTS: false, CLINICS: true, ANNOUNCEMENTS: true, COMMUNITY_IMAGE: true, SPOTLIGHT: true, STAFF: true, COACH_QUOTE: true, AHEAD: true },
      events: [{ day: '14', mon: 'AUG', name: 'Glow Night', detail: 'Blacklights', url: 'ftp://not-https' }],
    })
    const result = GenerateRequestSchema.safeParse(body)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.events).toEqual([])
  })

  it('still 400s an invalid league row when LEAGUES is ON', () => {
    const body = baseBody({
      sections: { LEAGUES: true, EVENTS: true, CLINICS: true, ANNOUNCEMENTS: true, COMMUNITY_IMAGE: true, SPOTLIGHT: true, STAFF: true, COACH_QUOTE: true, AHEAD: true },
      leagues: [{ name: 'Ladder Play', detail: 'Mondays', url: 'not-a-url' }],
    })
    const result = GenerateRequestSchema.safeParse(body)
    expect(result.success).toBe(false)
  })

  it('still 400s an invalid event row when EVENTS is ON', () => {
    const body = baseBody({
      sections: { LEAGUES: true, EVENTS: true, CLINICS: true, ANNOUNCEMENTS: true, COMMUNITY_IMAGE: true, SPOTLIGHT: true, STAFF: true, COACH_QUOTE: true, AHEAD: true },
      events: [{ day: '14', mon: 'AUG', name: 'Glow Night', detail: 'Blacklights', url: 'ftp://not-https' }],
    })
    const result = GenerateRequestSchema.safeParse(body)
    expect(result.success).toBe(false)
  })

  it('omitted sections default to all-on (pre-v1.2 clients) and still validate rows', () => {
    const body = baseBody({
      leagues: [{ name: 'Ladder Play', detail: 'Mondays', url: 'not-a-url' }],
    })
    delete (body as Record<string, unknown>).sections
    const result = GenerateRequestSchema.safeParse(body)
    expect(result.success).toBe(false)
  })

  it('a partial sections object still 400s (unchanged pre-existing semantics)', () => {
    const body = baseBody({ sections: { LEAGUES: true } })
    const result = GenerateRequestSchema.safeParse(body)
    expect(result.success).toBe(false)
  })

  it('valid rows pass through unchanged when their section is ON', () => {
    const body = baseBody({
      sections: { LEAGUES: true, EVENTS: true, CLINICS: true, ANNOUNCEMENTS: true, COMMUNITY_IMAGE: true, SPOTLIGHT: true, STAFF: true, COACH_QUOTE: true, AHEAD: true },
      leagues: [{ name: 'Ladder Play', detail: 'Mondays', url: 'https://app.courtreserve.com/Online/Leagues?id=2' }],
    })
    const result = GenerateRequestSchema.safeParse(body)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.leagues).toHaveLength(1)
  })
})
