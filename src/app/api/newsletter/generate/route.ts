import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { NextResponse } from 'next/server'
import { getUserOrg } from '@/lib/get-user-org'
import {
  loadNewsletterTemplate,
  injectSlots,
  expandBlock,
  applyUtm,
  qaGate,
  sanitizeModelHtml,
  type SlotValue,
} from '@/lib/newsletter'

export const dynamic = 'force-dynamic'

// System prompt — verbatim from docs/superpowers/specs/2026-07-15-newsletter-weekly-digest-design.md
// § "Feature 1 — Monthly Newsletter Builder — System prompt (keep every rule)". The model writes
// copy only; code writes all HTML. Never edit these rules without updating the spec first.
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

// The model's copy contract — plain-text slots as z.string(); the model returns ONLY copy,
// never markup. HTML-allowed slots (GLANCE_ITEMS, CLINIC_CONTENT, ANNOUNCEMENT_BLOCKS,
// AHEAD_ITEMS) may use inline-styled <br>/<h3>/<p> per the spec, still no <script>/<table>/etc.
const SlotSchema = z.object({
  PREHEADER: z.string().describe('40-100 chars, teases the hero offer. Plain text.'),
  HERO_HEADLINE: z.string().describe('Max 6 words, plain text'),
  HERO_VALUE_LINE: z.string().describe('1-2 sentences, plain text'),
  HERO_CTA: z.string().describe('Max 4 words, plain text, button label'),
  HERO_IMAGE_SUGGESTION: z
    .string()
    .describe('Short photo direction for the hero image, plain text, URL-encodable'),
  HERO_IMAGE_ALT: z.string().describe('Alt text for the hero image, plain text'),
  GLANCE_ITEMS: z
    .string()
    .describe(
      'HTML allowed: 3-5 lines separated by <br>, each "• item — date"; inline styles only'
    ),
  LEAGUE_INTRO: z.string().describe('One line, plain text intro to the league lineup section'),
  LEAGUE_REG_DATES: z
    .string()
    .describe('Plain text: member + daily player registration windows'),
  CLINIC_CONTENT: z
    .string()
    .describe(
      'HTML allowed: LTP sessions, Liveball times, clinic schedule + booking links; inline styles only'
    ),
  ANNOUNCEMENT_BLOCKS: z
    .string()
    .describe('HTML allowed: h3+p pairs per announcement; inline styles only'),
  COMMUNITY_IMAGE_SUGGESTION: z
    .string()
    .describe('Short photo direction for the community image, plain text, URL-encodable'),
  COMMUNITY_IMAGE_ALT: z.string().describe('Alt text for the community image, plain text'),
  SPOTLIGHT_NAME: z
    .string()
    .describe('The member spotlight name, plain text — echo the provided name exactly'),
  SPOTLIGHT_TEXT: z.string().describe('3-4 sentences, plain text'),
  STAFF_NAME: z
    .string()
    .describe('The staff shout-out name, plain text — echo the provided name exactly'),
  STAFF_TEXT: z.string().describe('2-3 sentences, plain text'),
  COACH_QUOTE: z
    .string()
    .describe("The coach's quote, plain text — echo the provided quote exactly"),
  COACH_NAME: z
    .string()
    .describe('The coach attribution name, plain text — echo the provided name exactly'),
  AHEAD_ITEMS: z.string().describe('HTML allowed: 2-4 next-month teasers with dates'),
  SIGNOFF_TEXT: z.string().describe('1-2 sentences, plain text'),
})

// Slots whose model copy is allowed to carry inline-styled HTML (injected raw).
const HTML_SLOT_KEYS = [
  'GLANCE_ITEMS',
  'CLINIC_CONTENT',
  'ANNOUNCEMENT_BLOCKS',
  'AHEAD_ITEMS',
] as const

// These two slots land inside a placehold.co `?text=` query string in the template — they must
// be URL-encoded (not HTML-escaped) or a stray "&" in the model's copy would start a bogus query
// param once the browser decodes the HTML entity.
const URL_ENCODED_SLOT_KEYS = ['HERO_IMAGE_SUGGESTION', 'COMMUNITY_IMAGE_SUGGESTION'] as const

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

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
  memberRegOpen: z.string().default(''),
  dailyPlayerRegOpen: z.string().default(''),
  coachQuote: z.string().default(''),
  coachName: z.string().default(''),
  spotlightName: z.string().default(''),
  staffName: z.string().default(''),
})

type GenerateRequest = z.infer<typeof GenerateRequestSchema>

// Best-effort per-lambda-instance cooldown — this is a paid-API guard for a solo admin,
// not a security control. Set only once the request is accepted (auth + shape both pass),
// right before we spend money on the Anthropic call.
let lastCall = 0
const COOLDOWN_MS = 15_000

function buildFactsBlock(body: GenerateRequest): string {
  const leagueLines = body.leagues.length
    ? body.leagues.map((l) => `- ${l.name} — ${l.detail} (${l.url})`).join('\n')
    : '(none provided)'
  const eventLines = body.events.length
    ? body.events.map((e) => `- ${e.mon} ${e.day}: ${e.name} — ${e.detail} (${e.url})`).join('\n')
    : '(none provided)'

  return [
    `Month: ${body.month} ${body.year}`,
    `Hero topic: ${body.heroTopic}`,
    `Hero registration URL: ${body.heroUrl}`,
    `Leagues:\n${leagueLines}`,
    `Upcoming events:\n${eventLines}`,
    `Member registration opens: ${body.memberRegOpen || '(not provided)'}`,
    `Daily player registration opens: ${body.dailyPlayerRegOpen || '(not provided)'}`,
    `Coach quote: ${body.coachQuote || '(not provided)'}`,
    `Coach name: ${body.coachName || '(not provided)'}`,
    `Member spotlight name: ${body.spotlightName || '(not provided)'}`,
    `Staff shout-out name: ${body.staffName || '(not provided)'}`,
  ].join('\n\n')
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

  const monthIndex = MONTH_NAMES.indexOf(body.month.trim().toLowerCase())
  const userMessage = `${buildFactsBlock(body)}\n\n---\nAdmin's freeform notes for this month:\n${body.notes || '(no additional notes provided)'}`

  const client = new Anthropic()
  let parsed: z.infer<typeof SlotSchema>

  lastCall = Date.now()

  try {
    const response = await client.messages.parse({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
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

    parsed = response.parsed_output
  } catch (err: unknown) {
    console.error('Newsletter generate failed:', err)
    const msg = err instanceof Error ? err.message : 'Newsletter generation failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Assemble server-side. The model only ever produced copy above — code writes all HTML.
  let html = loadNewsletterTemplate()

  html = expandBlock(
    html,
    'LEAGUE_ROWS',
    body.leagues.map((l) => ({
      LEAGUE_NAME: l.name,
      LEAGUE_DETAIL: l.detail,
      LEAGUE_URL: l.url,
    }))
  )
  html = expandBlock(
    html,
    'EVENT_ROWS',
    body.events.map((e) => ({
      EVENT_DAY: e.day,
      EVENT_MON: e.mon,
      EVENT_NAME: e.name,
      EVENT_DETAIL: e.detail,
      EVENT_URL: e.url,
    }))
  )

  const slots: Record<string, SlotValue> = {
    MONTH: body.month.toUpperCase(),
    YEAR: String(body.year),
    HERO_URL: body.heroUrl,
  }

  for (const [key, value] of Object.entries(parsed)) {
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

  const campaign = `${body.year}-${String(monthIndex + 1).padStart(2, '0')}`
  html = applyUtm(html, campaign)

  const qa = qaGate(html)
  if (qa.errors.length > 0) {
    // Never ship partially-injected or QA-failing HTML — the Copy button never sees this.
    return NextResponse.json({ errors: qa.errors }, { status: 422 })
  }

  return NextResponse.json({ html, warnings: qa.warnings })
}
