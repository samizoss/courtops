export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import {
  CampaignDetail,
  type MilestoneRow,
  type LinkedEvent,
  type SessionRow,
  type CrEventOption,
} from './campaign-detail'
import type { CampaignRow } from '../campaigns-list'

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const canEdit = userOrg.role !== 'viewer'

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('org_id', userOrg.orgId)
    .single()

  if (!campaign) notFound()

  const [{ data: milestones }, { data: linkRows }, { data: allEvents }] = await Promise.all([
    supabase
      .from('campaign_milestones')
      .select('*')
      .eq('campaign_id', id)
      .order('date')
      .order('display_order'),
    supabase
      .from('campaign_linked_events')
      .select('cr_event_id, event:cr_events(id, name, cr_category_name)')
      .eq('campaign_id', id),
    supabase
      .from('cr_events')
      .select('id, name, cr_category_name')
      .eq('org_id', userOrg.orgId)
      .order('name'),
  ])

  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('timezone')
    .eq('org_id', userOrg.orgId)
    .single()

  const linkedEvents: LinkedEvent[] = ((linkRows ?? []) as unknown as {
    cr_event_id: string
    event: { id: string; name: string; cr_category_name: string | null } | null
  }[]).map((r) => ({
    cr_event_id: r.cr_event_id,
    name: r.event?.name ?? 'Unknown event',
    cr_category_name: r.event?.cr_category_name ?? null,
  }))

  let sessions: SessionRow[] = []
  const linkedIds = linkedEvents.map((e) => e.cr_event_id)
  if (linkedIds.length > 0) {
    const { data } = await supabase
      .from('cr_event_sessions')
      .select('id, cr_event_id, start_time, end_time, registration_count')
      .eq('org_id', userOrg.orgId)
      .in('cr_event_id', linkedIds)
      .order('start_time')
    sessions = (data ?? []) as SessionRow[]
  }

  return (
    <CampaignDetail
      campaign={campaign as CampaignRow}
      initialMilestones={(milestones ?? []) as MilestoneRow[]}
      initialLinkedEvents={linkedEvents}
      initialSessions={sessions}
      allEvents={(allEvents ?? []) as CrEventOption[]}
      orgId={userOrg.orgId}
      canEdit={canEdit}
      timezone={orgSettings?.timezone || 'America/Chicago'}
    />
  )
}
