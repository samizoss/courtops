/**
 * Newsletter v1.2 section-toggle constants — isomorphic (no node:fs), safe to
 * import from BOTH the client builder UI and the server assembly pipeline.
 * Each key maps to a `<!-- SECTION: NAME --> ... <!-- /SECTION: NAME -->`
 * region in templates/newsletter-skeleton.html. Core sections (masthead, hero,
 * At a Glance, sign-off, footer) have no markers and always render.
 */
export const SECTION_KEYS = [
  'LEAGUES',
  'EVENTS',
  'CLINICS',
  'ANNOUNCEMENTS',
  'COMMUNITY_IMAGE',
  'SPOTLIGHT',
  'STAFF',
  'COACH_QUOTE',
  'AHEAD',
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]
export type SectionToggles = Record<SectionKey, boolean>

export const ALL_SECTIONS_ON: SectionToggles = Object.fromEntries(
  SECTION_KEYS.map((k) => [k, true])
) as SectionToggles

/** The builder UI's starting state — approved defaults from Sami's 2026-07-21 feedback. */
export const DEFAULT_SECTIONS: SectionToggles = {
  LEAGUES: true,
  EVENTS: true,
  CLINICS: true,
  ANNOUNCEMENTS: true,
  AHEAD: true,
  COMMUNITY_IMAGE: false,
  SPOTLIGHT: false,
  STAFF: false,
  COACH_QUOTE: false,
}

/** Human-readable names — used in the UI and in the model's "sections OFF" prompt line. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  LEAGUES: 'League Lineup',
  EVENTS: 'Upcoming Events',
  CLINICS: 'Classes & Clinics',
  ANNOUNCEMENTS: 'Club Announcements',
  COMMUNITY_IMAGE: 'Community photo',
  SPOTLIGHT: 'Member Spotlight',
  STAFF: 'Staff Shout-Out',
  COACH_QUOTE: "Coach's Corner",
  AHEAD: 'Looking Ahead',
}
