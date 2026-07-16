import { NextResponse } from 'next/server'
import { getUserOrg } from '@/lib/get-user-org'
import { createServiceClient } from '@/lib/supabase/service'
import { CourtReserveAPI } from '@/lib/courtreserve'
import { getWeekWindow, normalizeEvents, formatDateRange } from '@/lib/weekly-digest'
import { sendWeeklyDigestFailedEmail, sendWeeklyDigestReadyEmail } from '@/lib/email'

/**
 * GET  = cron (Bearer CRON_SECRET), iterates every org with Court Reserve
 *        credentials configured.
 * POST = manual (admin session), runs for the caller's own org only and
 *        never sends email (the review is the admin's own click).
 *
 * Both funnel through runDigestForOrg, which always uses the service-role
 * client: weekly_digest_runs (migration 023) ships with a SELECT-only RLS
 * policy by design ("writes go through server routes (service role / route
 * auth)") — no session, admin or otherwise, has INSERT rights on this table.
 */

const REVIEW_LINK = 'https://courtops.app/weekly-digest'

interface RunResult {
  orgId: string
  status: 'success' | 'error' | 'skipped'
  reason?: string
}

async function notifyOrgAdmins(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  send: (admin: { email: string; full_name: string }) => Promise<unknown>
) {
  const { data: admins } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin'])

  for (const admin of admins ?? []) {
    try {
      await send(admin as { email: string; full_name: string })
    } catch (err) {
      console.error(`Weekly digest email failed for ${admin.email}:`, err)
    }
  }
}

async function runDigestForOrg(orgId: string, triggeredBy: 'manual' | 'cron', dryRun: boolean): Promise<RunResult> {
  const supabase = createServiceClient()
  const sendEmail = triggeredBy === 'cron' && !dryRun

  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase.from('org_settings').select('cr_api_user, cr_api_pass').eq('org_id', orgId).single(),
    supabase.from('orgs').select('courtreserve_org_id, name').eq('id', orgId).single(),
  ])

  if (!settings?.cr_api_user || !settings?.cr_api_pass || !org?.courtreserve_org_id) {
    return { orgId, status: 'skipped', reason: 'Court Reserve API credentials not configured' }
  }

  const window = getWeekWindow(new Date())

  try {
    const cr = new CourtReserveAPI(settings.cr_api_user, settings.cr_api_pass, org.courtreserve_org_id)
    const rows = await cr.getEventRegistrations(window.start, window.end)
    const events = normalizeEvents(rows, window)

    await supabase.from('weekly_digest_runs').insert({
      org_id: orgId,
      week_start: window.start,
      week_end: window.end,
      status: 'success',
      events,
      triggered_by: triggeredBy,
    })

    if (sendEmail) {
      await notifyOrgAdmins(supabase, orgId, (admin) =>
        sendWeeklyDigestReadyEmail({
          to: admin.email,
          staffName: admin.full_name,
          orgName: org.name,
          dateRange: formatDateRange(window.start, window.end),
          link: REVIEW_LINK,
        })
      )
    }

    return { orgId, status: 'success' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    await supabase.from('weekly_digest_runs').insert({
      org_id: orgId,
      week_start: window.start,
      week_end: window.end,
      status: 'error',
      error: message,
      events: [],
      triggered_by: triggeredBy,
    })

    if (sendEmail) {
      await notifyOrgAdmins(supabase, orgId, (admin) =>
        sendWeeklyDigestFailedEmail({
          to: admin.email,
          staffName: admin.full_name,
          orgName: org?.name ?? 'your club',
          error: message,
          link: REVIEW_LINK,
        })
      )
    }

    return { orgId, status: 'error', reason: message }
  }
}

/** Cron entry point — Friday 14:00 UTC via vercel.json. */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'

  const supabase = createServiceClient()
  const { data: settingsRows } = await supabase
    .from('org_settings')
    .select('org_id')
    .not('cr_api_user', 'is', null)
    .not('cr_api_pass', 'is', null)

  const orgIds = [...new Set((settingsRows ?? []).map((r) => r.org_id as string))]

  const results: RunResult[] = []
  for (const orgId of orgIds) {
    results.push(await runDigestForOrg(orgId, 'cron', dryRun))
  }

  return NextResponse.json({ results })
}

/** Manual entry point — "Generate now" on /weekly-digest. Never emails. */
export async function POST(request: Request) {
  const org = await getUserOrg()
  if (!org) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(org.role)) {
    return NextResponse.json({ error: 'Only admins can trigger the weekly digest' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'

  const result = await runDigestForOrg(org.orgId, 'manual', dryRun)

  if (result.status === 'skipped') {
    return NextResponse.json({ error: result.reason }, { status: 400 })
  }
  if (result.status === 'error') {
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
