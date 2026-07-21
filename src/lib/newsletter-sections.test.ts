import { describe, it, expect } from 'vitest'
import {
  SECTION_KEYS,
  ALL_SECTIONS_ON,
  buildSlotSchema,
  sectionsToRemove,
  assembleNewsletter,
  type SectionToggles,
} from './newsletter-sections'

function toggles(overrides: Partial<SectionToggles> = {}): SectionToggles {
  return { ...ALL_SECTIONS_ON, ...overrides }
}

/** The owner's default toggle state: community/spotlight/staff/coach start OFF. */
const DEFAULT_UI_TOGGLES = toggles({
  COMMUNITY_IMAGE: false,
  SPOTLIGHT: false,
  STAFF: false,
  COACH_QUOTE: false,
})

const FULL_SLOTS: Record<string, string> = {
  PREHEADER: 'August at The Jar — leagues, glow night, and more inside.',
  HERO_HEADLINE: 'Fall Leagues Are Here',
  HERO_VALUE_LINE: 'Grab your spot before courts fill up.',
  HERO_CTA: 'Register Now',
  HERO_IMAGE_SUGGESTION: 'league night action shot',
  HERO_IMAGE_ALT: 'Players at league night',
  GLANCE_ITEMS: '• Fall league reg opens 8/4<br>• Glow Night 8/14',
  LEAGUE_INTRO: 'Something for every level.',
  CLINIC_CONTENT: '<p>LTP Tuesdays 6pm.</p>',
  ANNOUNCEMENT_BLOCKS: '<h3>New paddles</h3><p>Pro shop restock.</p>',
  COMMUNITY_IMAGE_SUGGESTION: 'crowd high five',
  COMMUNITY_IMAGE_ALT: 'Members celebrating',
  SPOTLIGHT_NAME: 'Jane Doe',
  SPOTLIGHT_TEXT: 'Jane joined in June and never left.',
  STAFF_NAME: 'Sam Smith',
  STAFF_TEXT: 'Sam keeps the courts running.',
  COACH_QUOTE: 'Keep your paddle up.',
  COACH_NAME: 'Coach Lee',
  AHEAD_ITEMS: '• September ladder starts 9/1',
  SIGNOFF_TEXT: 'See you on the courts.',
}

/** Model-slot fixture limited to exactly what the dynamic schema would request. */
function slotsFor(sections: SectionToggles): Record<string, string> {
  const keys = Object.keys(buildSlotSchema(sections).shape)
  return Object.fromEntries(keys.map((k) => [k, FULL_SLOTS[k]]))
}

function baseInput(sections: SectionToggles, leagueRegInfo = '') {
  return {
    month: 'August',
    year: 2026,
    heroUrl: 'https://app.courtreserve.com/Online/Events?id=1',
    leagues: [
      { name: 'Ladder Play', detail: 'Mondays 6pm', url: 'https://app.courtreserve.com/Online/Leagues?id=2' },
    ],
    events: [
      { day: '14', mon: 'AUG', name: 'Glow Night', detail: 'Blacklights, 9pm', url: 'https://app.courtreserve.com/Online/Events?id=3' },
    ],
    leagueRegInfo,
    sections,
  }
}

describe('buildSlotSchema', () => {
  it('includes every slot (except LEAGUE_REG_DATES) when all sections are on', () => {
    const keys = Object.keys(buildSlotSchema(ALL_SECTIONS_ON).shape)
    for (const k of Object.keys(FULL_SLOTS)) expect(keys).toContain(k)
    expect(keys).not.toContain('LEAGUE_REG_DATES')
  })

  it('never includes LEAGUE_REG_DATES — the model no longer writes it', () => {
    expect(Object.keys(buildSlotSchema(ALL_SECTIONS_ON).shape)).not.toContain('LEAGUE_REG_DATES')
    expect(Object.keys(buildSlotSchema(DEFAULT_UI_TOGGLES).shape)).not.toContain('LEAGUE_REG_DATES')
  })

  it('drops the slots of OFF sections', () => {
    const keys = Object.keys(buildSlotSchema(DEFAULT_UI_TOGGLES).shape)
    for (const gone of [
      'COMMUNITY_IMAGE_SUGGESTION', 'COMMUNITY_IMAGE_ALT',
      'SPOTLIGHT_NAME', 'SPOTLIGHT_TEXT',
      'STAFF_NAME', 'STAFF_TEXT',
      'COACH_QUOTE', 'COACH_NAME',
    ]) {
      expect(keys).not.toContain(gone)
    }
  })

  it('always keeps the core slots (hero, glance, sign-off) even with everything toggleable off', () => {
    const allOff = Object.fromEntries(SECTION_KEYS.map((k) => [k, false])) as SectionToggles
    const keys = Object.keys(buildSlotSchema(allOff).shape)
    for (const core of [
      'PREHEADER', 'HERO_HEADLINE', 'HERO_VALUE_LINE', 'HERO_CTA',
      'HERO_IMAGE_SUGGESTION', 'HERO_IMAGE_ALT', 'GLANCE_ITEMS', 'SIGNOFF_TEXT',
    ]) {
      expect(keys).toContain(core)
    }
    expect(keys).not.toContain('LEAGUE_INTRO')
    expect(keys).not.toContain('CLINIC_CONTENT')
    expect(keys).not.toContain('ANNOUNCEMENT_BLOCKS')
    expect(keys).not.toContain('AHEAD_ITEMS')
  })
})

describe('sectionsToRemove', () => {
  it('lists every OFF section', () => {
    const off = sectionsToRemove(DEFAULT_UI_TOGGLES, 'reg info')
    expect(off).toContain('COMMUNITY_IMAGE')
    expect(off).toContain('SPOTLIGHT')
    expect(off).toContain('STAFF')
    expect(off).toContain('COACH_QUOTE')
    expect(off).not.toContain('LEAGUES')
    expect(off).not.toContain('EVENTS')
  })

  it('adds LEAGUE_REG when leagues are on but the optional reg line is empty', () => {
    expect(sectionsToRemove(ALL_SECTIONS_ON, '')).toContain('LEAGUE_REG')
    expect(sectionsToRemove(ALL_SECTIONS_ON, '   ')).toContain('LEAGUE_REG')
    expect(sectionsToRemove(ALL_SECTIONS_ON, 'Members 8/4 @ noon')).not.toContain('LEAGUE_REG')
  })

  it('adds COMMUNITY_CARDS only when BOTH spotlight and staff are off', () => {
    expect(sectionsToRemove(toggles({ SPOTLIGHT: false, STAFF: false }), 'x')).toContain('COMMUNITY_CARDS')
    expect(sectionsToRemove(toggles({ SPOTLIGHT: false }), 'x')).not.toContain('COMMUNITY_CARDS')
    expect(sectionsToRemove(toggles({ STAFF: false }), 'x')).not.toContain('COMMUNITY_CARDS')
    expect(sectionsToRemove(ALL_SECTIONS_ON, 'x')).not.toContain('COMMUNITY_CARDS')
  })
})

describe('assembleNewsletter', () => {
  it('passes the QA gate cleanly with spotlight/staff/coach/community off and no names provided', () => {
    const sections = DEFAULT_UI_TOGGLES
    const { html, qa } = assembleNewsletter(baseInput(sections, 'Members register 8/4 @ noon.'), slotsFor(sections))
    expect(qa.errors).toHaveLength(0)
    expect(html).not.toContain('Member Spotlight')
    expect(html).not.toContain('Staff Shout-Out')
    expect(html).not.toContain("Coach's Corner")
    expect(html).toContain('Fall Leagues Are Here')
    expect(html).toContain('Glow Night')
  })

  it('does not throw when leagues are off and league rows were provided anyway (expansion skipped)', () => {
    const sections = toggles({ LEAGUES: false })
    const { html, qa } = assembleNewsletter(baseInput(sections), slotsFor(sections))
    expect(qa.errors).toHaveLength(0)
    expect(html).not.toContain('League Lineup')
    expect(html).not.toContain('Ladder Play')
  })

  it('does not throw when events are off (event expansion skipped)', () => {
    const sections = toggles({ EVENTS: false })
    const { html, qa } = assembleNewsletter(baseInput(sections, 'Reg opens 8/4.'), slotsFor(sections))
    expect(qa.errors).toHaveLength(0)
    expect(html).not.toContain('Upcoming Events')
    // The event row itself must be gone (the glance copy may still tease the event).
    expect(html).not.toContain('Blacklights, 9pm')
    expect(html).not.toContain('Online/Events?id=3')
  })

  it('injects the optional league reg line VERBATIM (escaped), never model-written', () => {
    const sections = ALL_SECTIONS_ON
    const reg = 'Members register 8/4 @ noon & daily players 8/6.'
    const { html, qa } = assembleNewsletter(baseInput(sections, reg), slotsFor(sections))
    expect(qa.errors).toHaveLength(0)
    expect(html).toContain('Members register 8/4 @ noon &amp; daily players 8/6.')
  })

  it('removes the league reg line entirely when the field is empty', () => {
    const sections = ALL_SECTIONS_ON
    const { html, qa } = assembleNewsletter(baseInput(sections, ''), slotsFor(sections))
    expect(qa.errors).toHaveLength(0)
    expect(html).not.toContain('{{LEAGUE_REG_DATES}}')
    expect(html).toContain('League Lineup')
  })

  it('renders one spotlight card alone when staff is off (and vice versa)', () => {
    const spotOnly = toggles({ STAFF: false })
    const a = assembleNewsletter(baseInput(spotOnly, 'x'), slotsFor(spotOnly))
    expect(a.qa.errors).toHaveLength(0)
    expect(a.html).toContain('Member Spotlight')
    expect(a.html).not.toContain('Staff Shout-Out')

    const staffOnly = toggles({ SPOTLIGHT: false })
    const b = assembleNewsletter(baseInput(staffOnly, 'x'), slotsFor(staffOnly))
    expect(b.qa.errors).toHaveLength(0)
    expect(b.html).not.toContain('Member Spotlight')
    expect(b.html).toContain('Staff Shout-Out')
  })

  it('applies UTM tags with the YYYY-MM campaign and leaves no markers or tokens behind', () => {
    const sections = DEFAULT_UI_TOGGLES
    const { html, qa } = assembleNewsletter(baseInput(sections, 'Reg opens 8/4.'), slotsFor(sections))
    expect(qa.errors).toHaveLength(0)
    expect(html).toContain('utm_campaign=2026-08')
    expect(html).not.toContain('SECTION:')
    expect(html).not.toContain('{{')
  })

  it('still assembles a valid core-only newsletter with every toggleable section off', () => {
    const allOff = Object.fromEntries(SECTION_KEYS.map((k) => [k, false])) as SectionToggles
    const { html, qa } = assembleNewsletter(baseInput(allOff), slotsFor(allOff))
    expect(qa.errors).toHaveLength(0)
    expect(html).toContain('Fall Leagues Are Here')
    expect(html).toContain('This Month at a Glance')
    expect(html).toContain('See you on the courts.')
    expect(html).toContain('Where Fun Meets Fierce Competition')
  })
})
