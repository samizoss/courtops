import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { NextResponse } from 'next/server'
import { getUserOrg } from '@/lib/get-user-org'
import {
  SECTION_KEYS,
  SECTION_LABELS,
  ALL_SECTIONS_ON,
  MONTH_NAMES,
  buildSlotSchema,
  assembleNewsletter,
  type SectionToggles,
} from '@/lib/newsletter-sections'

export const dynamic = 'force-dynamic'

// System prompt — rules verbatim from docs/superpowers/specs/2026-07-15-newsletter-weekly-digest-design.md
// § "Feature 1 — Monthly Newsletter Builder — System prompt (keep every rule)". The model writes
// copy only; code writes all HTML. Never edit these rules without updating the spec first.
// v1.2 appends ONE dynamic line below (the list of sections toggled OFF this month) so the
// model doesn't reference them in hero/glance/ahead copy — the rules themselves are unchanged.
const SYSTEM_PROMPT = `You write email copy for The Jar Pickleball Club's monthly newsletter.
Voice: authentic, slightly corny, not over-polished. Direct. Short
sentences. No fluff. Welcoming to all skill levels. Hook → Value → CTA
on the hero. Emoji: sparingly, only 🥒 🏓 👟 🏆 🥇 📍 ❄️ 🔥.
Seasonal angle: winter = warmth/escape from SD cold; summer = no wind,
no humidity.

Club programs (use these terms exactly, never invent new ones):
Open Play, LTP (Learn To Play), Liveball, Ladder Play, Play Pass,
Save My Play, PB Vision, Ball Machine, Court Reserve, Passport Program.

HARD RULES:
- Use ONLY the dates, times, prices, names, and URLs provided in the
  input. If a required fact is missing, put the literal string
  "MISSING:" plus a description in that slot — never guess.
- HERO_HEADLINE: max 6 words. All slot copy is plain text (no HTML)
  except slots marked html:true in the schema.`

function buildSystemPrompt(sections: SectionToggles): string {
  const offLabels = SECTION_KEYS.filter((k) => !sections[k]).map((k) => SECTION_LABELS[k])
  if (offLabels.length === 0) return SYSTEM_PROMPT
  return `${SYSTEM_PROMPT}\n- These sections are OFF this month and will not appear in the email — never reference them anywhere in your copy: ${offLabels.join(', ')}.`
}

// Bad URLs must fail fast at request validation (400) rather than surviving the paid Anthropic
// call only to be caught by qaGate afterward (422). qaGate's own https-only rule stays as the
// last line of defense against anything that slips past this.
const HttpsUrlSchema = z
  .string()
  .url({ message: 'must be a valid URL' })
  .refine((v) => /^https:\/\//i.test(v), { message: 'must be an https:// URL' })

const LeagueSchema = z.object({
  name: z.string(),
  detail: z.string(),
  url: HttpsUrlSchema,
})

const EventSchema = z.object({
  day: z.string(),
  mon: z.string(),
  name: z.string(),
  detail: z.string(),
  url: HttpsUrlSchema,
})

const SectionsSchema = z
  .object(
    Object.fromEntries(SECTION_KEYS.map((k) => [k, z.boolean()])) as Record<
      (typeof SECTION_KEYS)[number],
      z.ZodBoolean
    >
  )
  // Older clients (or curl) that omit sections get the pre-v1.2 behavior: everything on.
  .default(ALL_SECTIONS_ON)

const GenerateRequestSchema = z.object({
  month: z
    .string()
    .refine((v) => MONTH_NAMES.includes(v.trim().toLowerCase()), {
      message: 'month must be a full month name (e.g. "August")',
    }),
  year: z.number().int(),
  notes: z.string(),
  heroTopic: z.string().min(1, 'Hero topic is required'),
  heroUrl: HttpsUrlSchema,
  leagues: z.array(LeagueSchema).default([]),
  events: z.array(EventSchema).default([]),
  /** Optional one-liner injected VERBATIM into the league section; empty removes the line. */
  leagueRegInfo: z.string().default(''),
  coachQuote: z.string().default(''),
  coachName: z.string().default(''),
  spotlightName: z.string().default(''),
  staffName: z.string().default(''),
  sections: SectionsSchema,
})

type GenerateRequest = z.infer<typeof GenerateRequestSchema>

// Best-effort per-lambda-instance cooldown — this is a paid-API guard for a solo admin,
// not a security control. Set only once the request is accepted (auth + shape both pass),
// right before we spend money on the Anthropic call.
let lastCall = 0
const COOLDOWN_MS = 15_000

// Facts for OFF sections are omitted entirely — the model isn't asked for that copy
// (its slots aren't in the dynamic schema) so feeding it those facts only invites
// stray references. Member/daily reg windows are gone for good (v1.2): the optional
// league reg line is injected verbatim by code and never shown to the model.
function buildFactsBlock(body: GenerateRequest): string {
  const s = body.sections
  const lines: string[] = [
    `Month: ${body.month} ${body.year}`,
    `Hero topic: ${body.heroTopic}`,
    `Hero registration URL: ${body.heroUrl}`,
  ]

  if (s.LEAGUES) {
    const leagueLines = body.leagues.length
      ? body.leagues.map((l) => `- ${l.name} — ${l.detail} (${l.url})`).join('\n')
      : '(none provided)'
    lines.push(`Leagues:\n${leagueLines}`)
  }
  if (s.EVENTS) {
    const eventLines = body.events.length
      ? body.events.map((e) => `- ${e.mon} ${e.day}: ${e.name} — ${e.detail} (${e.url})`).join('\n')
      : '(none provided)'
    lines.push(`Upcoming events:\n${eventLines}`)
  }
  if (s.COACH_QUOTE) {
    lines.push(`Coach quote: ${body.coachQuote || '(not provided)'}`)
    lines.push(`Coach name: ${body.coachName || '(not provided)'}`)
  }
  if (s.SPOTLIGHT) lines.push(`Member spotlight name: ${body.spotlightName || '(not provided)'}`)
  if (s.STAFF) lines.push(`Staff shout-out name: ${body.staffName || '(not provided)'}`)

  return lines.join('\n\n')
}

export async function POST(request: Request) {
  const userOrg = await getUserOrg()
  if (!userOrg || !['owner', 'admin'].includes(userOrg.role)) {
    return NextResponse.json(
      { error: 'Only admins can generate the newsletter' },
      { status: 403 }
    )
  }

  if (Date.now() - lastCall < COOLDOWN_MS) {
    return NextResponse.json(
      { error: 'Please wait a few seconds before generating again' },
      { status: 429 }
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Newsletter generation not configured (missing ANTHROPIC_API_KEY)' },
      { status: 500 }
    )
  }

  let body: GenerateRequest
  try {
    const json = await request.json()
    body = GenerateRequestSchema.parse(json)
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const userMessage = `${buildFactsBlock(body)}\n\n---\nAdmin's freeform notes for this month:\n${body.notes || '(no additional notes provided)'}`

  // Dynamic contract: only the slots belonging to ON sections (hero/glance/sign-off always).
  const SlotSchema = buildSlotSchema(body.sections)

  const client = new Anthropic()
  let parsed: Record<string, string>

  lastCall = Date.now()

  try {
    const response = await client.messages.parse({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: buildSystemPrompt(body.sections),
      messages: [{ role: 'user', content: userMessage }],
      output_config: {
        format: zodOutputFormat(SlotSchema),
      },
    })

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: 'AI returned invalid output — try again' },
        { status: 502 }
      )
    }

    parsed = response.parsed_output as Record<string, string>
  } catch (err: unknown) {
    console.error('Newsletter generate failed:', err)
    const msg = err instanceof Error ? err.message : 'Newsletter generation failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Assemble server-side (excise OFF sections → expand blocks → inject slots → UTM → QA gate).
  // The model only ever produced copy above — code writes all HTML.
  const { html, qa } = assembleNewsletter(
    {
      month: body.month,
      year: body.year,
      heroUrl: body.heroUrl,
      leagues: body.leagues,
      events: body.events,
      leagueRegInfo: body.leagueRegInfo,
      sections: body.sections,
    },
    parsed
  )

  if (qa.errors.length > 0) {
    // Never ship partially-injected or QA-failing HTML — the Copy button never sees this.
    return NextResponse.json({ errors: qa.errors }, { status: 422 })
  }

  return NextResponse.json({ html, warnings: qa.warnings })
}
