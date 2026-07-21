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
  if (!['owner', 'admin'].includes(userOrg.role)) {
    redirect('/')
  }

  const supabase = await createClient()
  const { data: runs } = await supabase
    .from('weekly_digest_runs')
    .select('*')
    .eq('org_id', userOrg.orgId)
    .order('generated_at', { ascending: false })
    .limit(10)

  const allRuns = (runs ?? []) as WeeklyDigestRun[]
  const latestRun = allRuns[0] ?? null
  const latestSuccess = allRuns.find((r) => r.status === 'success') ?? null

  // The page always prefers to preview the most recent *successful* run's
  // artifacts — if the latest run failed, the error banner shows that
  // failure while the panels below still show the last good digest.
  const previewRun = latestRun?.status === 'success' ? latestRun : latestSuccess

  const emailHtml = previewRun
    ? renderDigestEmail(previewRun.events, { start: previewRun.week_start, end: previewRun.week_end })
    : null

  const previewDateRange = previewRun ? formatDateRange(previewRun.week_start, previewRun.week_end) : null

  return (
    <WeeklyDigestClient
      latestRun={latestRun}
      previewRun={previewRun}
      previewDateRange={previewDateRange}
      emailHtml={emailHtml}
    />
  )
}
