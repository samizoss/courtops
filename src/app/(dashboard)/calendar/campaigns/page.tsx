export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { CampaignsList, type CampaignRow } from './campaigns-list'

export default async function CampaignsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  // Content module is staff-accessible; viewers get a read-only list.
  const canEdit = userOrg.role !== 'viewer'

  const [{ data: campaigns }, { data: milestoneRows }, { data: linkRows }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*')
      .eq('org_id', userOrg.orgId)
      .order('start_date', { ascending: false }),
    supabase
      .from('campaign_milestones')
      .select('campaign_id')
      .eq('org_id', userOrg.orgId),
    supabase
      .from('campaign_linked_events')
      .select('campaign_id')
      .eq('org_id', userOrg.orgId),
  ])

  const milestoneCounts: Record<string, number> = {}
  for (const row of (milestoneRows ?? []) as { campaign_id: string }[]) {
    milestoneCounts[row.campaign_id] = (milestoneCounts[row.campaign_id] ?? 0) + 1
  }
  const linkedEventCounts: Record<string, number> = {}
  for (const row of (linkRows ?? []) as { campaign_id: string }[]) {
    linkedEventCounts[row.campaign_id] = (linkedEventCounts[row.campaign_id] ?? 0) + 1
  }

  // Order: planning + active first, then complete, then archived; start_date desc within.
  const statusRank: Record<string, number> = { planning: 0, active: 1, complete: 2, archived: 3 }
  const sorted = ([...(campaigns ?? [])] as CampaignRow[]).sort(
    (a, b) =>
      (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
      b.start_date.localeCompare(a.start_date)
  )

  return (
    <CampaignsList
      campaigns={sorted}
      milestoneCounts={milestoneCounts}
      linkedEventCounts={linkedEventCounts}
      canEdit={canEdit}
    />
  )
}
