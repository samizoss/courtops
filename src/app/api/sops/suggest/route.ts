import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SuggestionSchema = z.object({
  category: z.enum([
    'operations',
    'front-desk',
    'sales',
    'content',
    'emergency',
    'equipment',
    'general',
  ]).describe('The single best category for this SOP'),
  tags: z
    .array(z.string())
    .min(1)
    .max(6)
    .describe(
      'Lowercase, hyphenated, single-word-ish tags (e.g. "courtreserve", "payments", "opening"). 3-5 is ideal.'
    ),
})

/**
 * POST /api/sops/suggest
 * Body: { title: string, content?: string }
 * Returns: { category, tags }
 *
 * Uses Claude Haiku 4.5 with structured outputs to suggest a category
 * and tags based on the SOP's title and content. Cost per call is
 * ~$0.0001 — safe to run on blur.
 */
export async function POST(request: Request) {
  // Auth gate: must be a signed-in admin/owner of an org
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only admins can use AI suggestions' }, { status: 403 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI suggestions not configured (missing ANTHROPIC_API_KEY)' },
      { status: 500 }
    )
  }

  const body = await request.json()
  const title = (body.title || '').toString().trim()
  const content = (body.content || '').toString().trim()

  if (!title && !content) {
    return NextResponse.json(
      { error: 'Provide a title or content to analyze' },
      { status: 400 }
    )
  }

  // Strip any iframe HTML from content — those contain no useful text for classification
  // (they're walkthrough videos / embedded docs where the title carries the semantics).
  const cleanedContent = content
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '[EMBED]')
    .slice(0, 4000) // cap input to keep latency + cost low

  const client = new Anthropic()

  try {
    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system:
        'You are a content tagger for a pickleball club operations platform called CourtOps. ' +
        'Given an SOP (Standard Operating Procedure) title and content, suggest the single best category and 3-5 short lowercase tags. ' +
        'Category enum meanings:\n' +
        '- operations: general business/ops processes (opening, closing, accounting)\n' +
        '- front-desk: staff-facing workflows at the counter (check-ins, payments, court reservations, POS)\n' +
        '- sales: lead follow-up, conversions, tours, upgrades\n' +
        '- content: social media, marketing content, events promotion\n' +
        '- emergency: injuries, evacuations, incidents\n' +
        '- equipment: gear, courts, facility maintenance\n' +
        '- general: anything that clearly does not fit above\n\n' +
        'Tag guidance: use specific domain nouns when possible (e.g. "courtreserve", "pos", "membership", "ltp", "savemyplay"). ' +
        'Avoid generic tags like "sop", "procedure", "staff". Single words or short hyphenated phrases only.',
      messages: [
        {
          role: 'user',
          content: `Title: ${title || '(none)'}\n\nContent:\n${cleanedContent || '(none)'}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(SuggestionSchema),
      },
    })

    if (!response.parsed_output) {
      return NextResponse.json(
        { error: 'AI returned invalid output — try again' },
        { status: 502 }
      )
    }

    return NextResponse.json(response.parsed_output)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AI suggestion failed'
    console.error('SOP suggest failed:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
