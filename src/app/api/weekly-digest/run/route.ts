import { NextResponse } from 'next/server'
import { getUserOrg } from '@/lib/get-user-org'
import { createServiceClient } from '@/lib/supabase/service'
import { CourtReserveAPI } from '@/lib/courtreserve'
import { getWeekWindow, normalizeEvents, formatDateRange } from '@/lib/weekly-digest'
import { sendWeeklyDigestFailedEmail, sendWeeklyDigestReadyEmail } from '@/lib/email'

/**
 * GET  = cron (Bearer CRON_SECRET), iterates every org with Court Reserve
 *        credentials configured. Each org's run is isolated: one org's
 *        failure never aborts the remaining orgs.
 * POST = manual (admin session), runs for the caller's own org only. Never
 *        sends the success "ready" email (the review is the admin's own
 *        click), but on failure still writes an error row and sends the
 *        alert email to org admins, same as cron.
 *
 * Both funnel through runDigestForOrg, which always uses the service-role
 * client: weekly_digest_runs (migration 023) ships with a SELECT-only RLS
 * policy by design ("writes go through server routes (service role / route
 * auth)") — no session, admin or otherwise, has INSERT rights on this table.
 * On any failure, runDigestForOrg guarantees (best-effort) both an error row
 * and an alert email — see the sendReadyEmail/sendFailureEmail split below.
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
  // Ready email ("your digest is available") is a cron-only nicety — a manual
  // "Generate now" click is the admin's own review, so no email for success.
  // The failure alert is unconditional per spec ("on any failure: insert
  // error row AND send alert email") — it fires for manual runs too, since a
  // manual run failing is just as important to surface. dryRun always skips
  // both categories of email.
  const sendReadyEmail = triggeredBy === 'cron' && !dryRun
  const sendFailureEmail = !dryRun

  // createServiceClient() itself can throw (e.g. missing env var). If that
  // happens we have no client to write an error row with, so there is
  // nothing to insert and no admin lookup to run — log loudly so the
  // failure is at least visible in Vercel logs, and let the caller (cron
  // loop / POST handler) turn this into a visible response.
  let supabase: ReturnType<typeof createServiceClient>
  try {
    supabase = createServiceClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(
      `Weekly digest: createServiceClient() failed for org ${orgId} — no error row or alert email could be produced:`,
      err
    )
    return { orgId, status: 'error', reason: `Service client unavailable: ${message}` }
  }

  const window = getWeekWindow(new Date())
  // Populated once the org/settings lookup succeeds; used by the catch
  // block below for the failure alert email's org name.
  let org: { name: string } | null | undefined

  try {
    const [{ data: settings }, { data: orgRow }] = await Promise.all([
      supabase.from('org_settings').select('cr_api_user, cr_api_pass').eq('org_id', orgId).single(),
      supabase.from('orgs').select('courtreserve_org_id, name').eq('id', orgId).single(),
    ])
    org = orgRow

    if (!settings?.cr_api_user || !settings?.cr_api_pass || !orgRow?.courtreserve_org_id) {
      return { orgId, status: 'skipped', reason: 'Court Reserve API credentials not configured' }
    }

    const cr = new CourtReserveAPI(settings.cr_api_user, settings.cr_api_pass, orgRow.courtreserve_org_id)
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

    if (sendReadyEmail) {
      await notifyOrgAdmins(supabase, orgId, (admin) =>
        sendWeeklyDigestReadyEmail({
          to: admin.email,
          staffName: admin.full_name,
          orgName: orgRow.name,
          dateRange: formatDateRange(window.start, window.end),
          link: REVIEW_LINK,
        })
      )
    }

    return { orgId, status: 'success' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    try {
      await supabase.from('weekly_digest_runs').insert({
        org_id: orgId,
        week_start: window.start,
        week_end: window.end,
        status: 'error',
        error: message,
        events: [],
        triggered_by: triggeredBy,
      })
    } catch (insertErr) {
      console.error(`Weekly digest: failed to write error row for org ${orgId}:`, insertErr)
    }

    if (sendFailureEmail) {
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

  // This lookup happens before any per-org try/catch, so a failure here
  // (including createServiceClient() throwing on a missing env var) can't
  // produce an error row or alert email for any org — there's no orgId yet
  // to write one against. Make sure it's at least loud in Vercel logs and
  // returns a descriptive 500 instead of a generic 500/crash.
  let orgIds: string[]
  try {
    const supabase = createServiceClient()
    const { data: settingsRows } = await supabase
      .from('org_settings')
      .select('org_id')
      .not('cr_api_user', 'is', null)
      .not('cr_api_pass', 'is', null)

    orgIds = [...new Set((settingsRows ?? []).map((r) => r.org_id as string))]
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Weekly digest cron: failed to load orgs to process — no runs were attempted:', err)
    return NextResponse.json(
      { error: `Weekly digest cron failed before processing any org: ${message}` },
      { status: 500 }
    )
  }

  // Each org is isolated: runDigestForOrg already catches its own errors
  // and returns an 'error' RunResult, but this try/catch is a second line
  // of defense so a truly unexpected throw (e.g. a bug in the isolation
  // logic itself) still logs-and-continues instead of aborting the whole
  // cron run and skipping every remaining org.
  const results: RunResult[] = []
  for (const orgId of orgIds) {
    try {
      results.push(await runDigestForOrg(orgId, 'cron', dryRun))
    } catch (err) {
      console.error(`Weekly digest cron: uncaught error running org ${orgId}, continuing to next org:`, err)
      results.push({ orgId, status: 'error', reason: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return NextResponse.json({ results })
}

/**
 * Manual entry point — "Generate now" on /weekly-digest. Never sends the
 * success "ready" email (the review is the admin's own click) but does
 * send the failure alert to org admins on error, same as cron.
 */
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
