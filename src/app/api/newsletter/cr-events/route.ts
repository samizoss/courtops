import { NextResponse } from 'next/server'
import { getUserOrg } from '@/lib/get-user-org'
import { createClient } from '@/lib/supabase/server'
import { CourtReserveAPI } from '@/lib/courtreserve'
import { groupCrEvents, monthWindow } from '@/lib/newsletter-prefill'

export const dynamic = 'force-dynamic'

/**
 * GET /api/newsletter/cr-events?month=YYYY-MM
 *
 * Live Court Reserve pull for the newsletter builder's "Load from Court
 * Reserve" panel: distinct events (grouped from registration rows) for the
 * requested calendar month, with session counts, first-session date chip,
 * wall-clock time summary, and public event-details URL.
 *
 * Auth: any org member — this is read-only prefill data for a builder page
 * that staff can already view. Generating the newsletter itself stays
 * owner/admin-only (POST /api/newsletter/generate). CR credentials are read
 * server-side via the session client (org_settings RLS grants org members
 * SELECT) and never leave the server.
 *
 * A calendar month is ≤31 days, so one getEventRegistrations call fits CR's
 * window limit; 429s are retried inside the CR client. Responses are
 * no-store — the whole point is a fresh look at the live CR calendar.
 */
export async function GET(request: Request) {
  const userOrg = await getUserOrg()
  if (!userOrg) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const window = monthWindow(searchParams.get('month') ?? '')
  if (!window) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  const supabase = await createClient()
  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase.from('org_settings').select('cr_api_user, cr_api_pass').eq('org_id', userOrg.orgId).single(),
    supabase.from('orgs').select('courtreserve_org_id').eq('id', userOrg.orgId).single(),
  ])

  if (!settings?.cr_api_user || !settings?.cr_api_pass || !org?.courtreserve_org_id) {
    return NextResponse.json(
      { error: 'Court Reserve API credentials not configured. Go to Settings > Integrations.' },
      { status: 400 }
    )
  }

  try {
    const cr = new CourtReserveAPI(settings.cr_api_user, settings.cr_api_pass, org.courtreserve_org_id)
    const rows = await cr.getEventRegistrations(window.start, window.end)
    const events = groupCrEvents(rows, { crOrgId: org.courtreserve_org_id, window })
    return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('Newsletter CR events fetch failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Court Reserve fetch failed' },
      { status: 502 }
    )
  }
}
