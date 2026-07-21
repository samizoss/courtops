import { z } from 'zod'
import {
  loadNewsletterTemplate,
  removeSections,
  injectSlots,
  expandBlock,
  applyUtm,
  qaGate,
  sanitizeModelHtml,
  type SlotValue,
  type QaResult,
} from '@/lib/newsletter'

// Section keys/labels live in newsletter-section-keys.ts (no node:fs) so the
// client builder UI can import them too; re-exported here for server callers.
import {
  SECTION_KEYS,
  type SectionKey,
  type SectionToggles,
} from '@/lib/newsletter-section-keys'

export {
  SECTION_KEYS,
  ALL_SECTIONS_ON,
  DEFAULT_SECTIONS,
  SECTION_LABELS,
  type SectionKey,
  type SectionToggles,
} from '@/lib/newsletter-section-keys'

// The model's copy contract, slot by slot. LEAGUE_REG_DATES is intentionally
// absent — since v1.2 it's an optional admin-entered line injected verbatim by
// code (see assembleNewsletter), never model-written.
const SLOT_DESCRIPTORS: Record<string, string> = {
  PREHEADER: '40-100 chars, teases the hero offer. Plain text.',
  HERO_HEADLINE: 'Max 6 words, plain text',
  HERO_VALUE_LINE: '1-2 sentences, plain text',
  HERO_CTA: 'Max 4 words, plain text, button label',
  HERO_IMAGE_SUGGESTION: 'Short photo direction for the hero image, plain text, URL-encodable',
  HERO_IMAGE_ALT: 'Alt text for the hero image, plain text',
  GLANCE_ITEMS: 'HTML allowed: 3-5 lines separated by <br>, each "• item — date"; inline styles only',
  LEAGUE_INTRO: 'One line, plain text intro to the league lineup section',
  CLINIC_CONTENT:
    'HTML allowed: LTP sessions, Liveball times, clinic schedule + booking links; inline styles only',
  ANNOUNCEMENT_BLOCKS: 'HTML allowed: h3+p pairs per announcement; inline styles only',
  COMMUNITY_IMAGE_SUGGESTION:
    'Short photo direction for the community image, plain text, URL-encodable',
  COMMUNITY_IMAGE_ALT: 'Alt text for the community image, plain text',
  SPOTLIGHT_NAME: 'The member spotlight name, plain text — echo the provided name exactly',
  SPOTLIGHT_TEXT: '3-4 sentences, plain text',
  STAFF_NAME: 'The staff shout-out name, plain text — echo the provided name exactly',
  STAFF_TEXT: '2-3 sentences, plain text',
  COACH_QUOTE: "The coach's quote, plain text — echo the provided quote exactly",
  COACH_NAME: 'The coach attribution name, plain text — echo the provided name exactly',
  AHEAD_ITEMS: 'HTML allowed: 2-4 next-month teasers with dates',
  SIGNOFF_TEXT: '1-2 sentences, plain text',
}

// Slots the model always writes — hero, glance, and sign-off render every month.
const ALWAYS_SLOT_KEYS = [
  'PREHEADER',
  'HERO_HEADLINE',
  'HERO_VALUE_LINE',
  'HERO_CTA',
  'HERO_IMAGE_SUGGESTION',
  'HERO_IMAGE_ALT',
  'GLANCE_ITEMS',
  'SIGNOFF_TEXT',
] as const

// Slots that only exist while their section is toggled ON. EVENTS has no model
// slots — event rows are code-expanded from admin-entered facts.
const SECTION_SLOT_KEYS: Record<SectionKey, readonly string[]> = {
  LEAGUES: ['LEAGUE_INTRO'],
  EVENTS: [],
  CLINICS: ['CLINIC_CONTENT'],
  ANNOUNCEMENTS: ['ANNOUNCEMENT_BLOCKS'],
  COMMUNITY_IMAGE: ['COMMUNITY_IMAGE_SUGGESTION', 'COMMUNITY_IMAGE_ALT'],
  SPOTLIGHT: ['SPOTLIGHT_NAME', 'SPOTLIGHT_TEXT'],
  STAFF: ['STAFF_NAME', 'STAFF_TEXT'],
  COACH_QUOTE: ['COACH_QUOTE', 'COACH_NAME'],
  AHEAD: ['AHEAD_ITEMS'],
}

// Slots whose model copy is allowed to carry inline-styled HTML (injected raw after defanging).
const HTML_SLOT_KEYS = ['GLANCE_ITEMS', 'CLINIC_CONTENT', 'ANNOUNCEMENT_BLOCKS', 'AHEAD_ITEMS'] as const

// These land inside a placehold.co `?text=` query string in the template — they must be
// URL-encoded (not HTML-escaped) or a stray "&" in the model's copy would start a bogus
// query param once the browser decodes the HTML entity.
const URL_ENCODED_SLOT_KEYS = ['HERO_IMAGE_SUGGESTION', 'COMMUNITY_IMAGE_SUGGESTION'] as const

/**
 * Build the model's zod slot schema DYNAMICALLY: always-on slots plus only the
 * slots belonging to sections toggled ON. The model is never even asked for an
 * OFF section's copy, so the QA gate can't see MISSING: facts for it.
 */
export function buildSlotSchema(sections: SectionToggles) {
  const keys: string[] = [...ALWAYS_SLOT_KEYS]
  for (const section of SECTION_KEYS) {
    if (sections[section]) keys.push(...SECTION_SLOT_KEYS[section])
  }
  return z.object(
    Object.fromEntries(keys.map((k) => [k, z.string().describe(SLOT_DESCRIPTORS[k])]))
  )
}

/**
 * Compute the template regions to excise for this run:
 * - every OFF section,
 * - LEAGUE_REG when leagues are on but the optional verbatim reg line is empty
 *   (an OFF LEAGUES already swallows the nested LEAGUE_REG region),
 * - COMMUNITY_CARDS (the wrapper row holding both cards) when BOTH spotlight
 *   and staff are off, so no empty card row ships.
 */
export function sectionsToRemove(sections: SectionToggles, leagueRegInfo: string): string[] {
  const off: string[] = SECTION_KEYS.filter((k) => !sections[k])
  if (sections.LEAGUES && !leagueRegInfo.trim()) off.push('LEAGUE_REG')
  if (!sections.SPOTLIGHT && !sections.STAFF) off.push('COMMUNITY_CARDS')
  return off
}

export interface AssembleNewsletterInput {
  /** Full month name, e.g. "August". Callers validate before this point. */
  month: string
  year: number
  heroUrl: string
  leagues: Array<{ name: string; detail: string; url: string }>
  events: Array<{ day: string; mon: string; name: string; detail: string; url: string }>
  /** Optional one-liner injected VERBATIM (escaped) into LEAGUE_REG_DATES; empty removes the line. */
  leagueRegInfo: string
  sections: SectionToggles
}

export const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/**
 * Server-side assembly: the model only ever produced copy — code writes all HTML.
 * Order matters: excise OFF sections FIRST, then expand blocks / inject slots for
 * what remains, then UTM + QA gate on the final (already-excised) HTML. The gate
 * therefore never demands facts for OFF sections.
 */
export function assembleNewsletter(
  input: AssembleNewsletterInput,
  modelSlots: Record<string, string>
): { html: string; qa: QaResult } {
  let html = loadNewsletterTemplate()

  html = removeSections(html, sectionsToRemove(input.sections, input.leagueRegInfo))

  // Expand repeatable blocks only for sections that survived the excision —
  // expandBlock throws on a missing block, so OFF sections must be skipped.
  if (input.sections.LEAGUES) {
    html = expandBlock(
      html,
      'LEAGUE_ROWS',
      input.leagues.map((l) => ({
        LEAGUE_NAME: l.name,
        LEAGUE_DETAIL: l.detail,
        LEAGUE_URL: l.url,
      }))
    )
  }
  if (input.sections.EVENTS) {
    html = expandBlock(
      html,
      'EVENT_ROWS',
      input.events.map((e) => ({
        EVENT_DAY: e.day,
        EVENT_MON: e.mon,
        EVENT_NAME: e.name,
        EVENT_DETAIL: e.detail,
        EVENT_URL: e.url,
      }))
    )
  }

  const slots: Record<string, SlotValue> = {
    MONTH: input.month.toUpperCase(),
    YEAR: String(input.year),
    HERO_URL: input.heroUrl,
  }

  // The optional league reg line is admin-entered and injected verbatim by code
  // (plain string → escaped by injectSlots). When empty, the LEAGUE_REG region
  // was already excised above and no token remains.
  if (input.sections.LEAGUES && input.leagueRegInfo.trim()) {
    slots.LEAGUE_REG_DATES = input.leagueRegInfo.trim()
  }

  for (const [key, value] of Object.entries(modelSlots)) {
    if ((URL_ENCODED_SLOT_KEYS as readonly string[]).includes(key)) {
      slots[key] = { value: encodeURIComponent(value), html: true }
    } else if ((HTML_SLOT_KEYS as readonly string[]).includes(key)) {
      // Model output injected raw — defang script/event-handler/javascript-uri vectors first.
      slots[key] = { value: sanitizeModelHtml(value), html: true }
    } else {
      slots[key] = value
    }
  }

  html = injectSlots(html, slots)

  const monthIndex = MONTH_NAMES.indexOf(input.month.trim().toLowerCase())
  const campaign = `${input.year}-${String(monthIndex + 1).padStart(2, '0')}`
  html = applyUtm(html, campaign)

  return { html, qa: qaGate(html) }
}
