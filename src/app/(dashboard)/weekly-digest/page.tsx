export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { renderDigestEmail, formatDateRange } from '@/lib/weekly-digest'
import { WeeklyDigestClient } from './weekly-digest-client'
import type { WeeklyDigestRun } from '@/types/database'

export default async function WeeklyDigestPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null
  // Staff get view-only access (2026-07-21): previews, Copy HTML, Download
  // PNG. Generating stays owner/admin-only — the client hides the button and
  // POST /api/weekly-digest/run enforces it server-side. Possible future
  // refinement: a per-staff "content" capability (profiles.capabilities[])
  // instead of all-staff, per Sami's "I don't mind all staff" direction.
  if (!['owner', 'admin', 'staff'].includes(userOrg.role)) {
    redirect('/')
  }
  const isAdmin = ['owner', 'admin'].includes(userOrg.role)

  const supabase = await createClient()
  // crOrgId is org-level config re-read at render time (NOT stored per-run):
  // event links in the email need orgs.courtreserve_org_id, and reading it
  // here means runs stored before the link feature get working links too.
  const [{ data: runs }, { data: orgRow }] = await Promise.all([
    supabase
      .from('weekly_digest_runs')
      .select('*')
      .eq('org_id', userOrg.orgId)
      .order('generated_at', { ascending: false })
      .limit(10),
    supabase.from('orgs').select('courtreserve_org_id').eq('id', userOrg.orgId).single(),
  ])

  const allRuns = (runs ?? []) as WeeklyDigestRun[]
  const latestRun = allRuns[0] ?? null
  const latestSuccess = allRuns.find((r) => r.status === 'success') ?? null

  // The page always prefers to preview the most recent *successful* run's
  // artifacts — if the latest run failed, the error banner shows that
  // failure while the panels below still show the last good digest.
  const previewRun = latestRun?.status === 'success' ? latestRun : latestSuccess

  const emailHtml = previewRun
    ? renderDigestEmail(
        previewRun.events,
        { start: previewRun.week_start, end: previewRun.week_end },
        { crOrgId: orgRow?.courtreserve_org_id ?? null }
      )
    : null

  const previewDateRange = previewRun ? formatDateRange(previewRun.week_start, previewRun.week_end) : null

  return (
    <WeeklyDigestClient
      latestRun={latestRun}
      previewRun={previewRun}
      previewDateRange={previewDateRange}
      emailHtml={emailHtml}
      isAdmin={isAdmin}
    />
  )
}
