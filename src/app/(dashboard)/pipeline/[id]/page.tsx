export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { LeadDetail } from './lead-detail'
import { notFound } from 'next/navigation'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  // Fetch activities for this lead
  const { data: activities } = await supabase
    .from('activities')
    .select('*, performer:profiles!activities_performed_by_fkey(full_name)')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  // Fetch pipeline stages if lead has a pipeline
  let stages: { id: string; pipeline_id: string; org_id: string; name: string; slug: string; sort_order: number; cadence_days: number | null; is_terminal: boolean; color: string | null; created_at: string }[] = []
  let pipeline: { id: string; name: string } | null = null
  if (lead.pipeline_id) {
    const { data: pipelineData } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('id', lead.pipeline_id)
      .single()
    pipeline = pipelineData ?? null

    const { data: stageData } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('pipeline_id', lead.pipeline_id)
      .order('sort_order', { ascending: true })
    stages = stageData ?? []
  }

  // Fetch staff list for assignment
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', userOrg.orgId)
    .eq('is_active', true)

  // Fetch related SOPs for this pipeline
  let sops: { id: string; title: string; category: string }[] = []
  if (lead.pipeline_id) {
    const { data: sopData } = await supabase
      .from('sops')
      .select('id, title, category')
      .eq('pipeline_id', lead.pipeline_id)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
    sops = sopData ?? []
  }

  return (
    <LeadDetail
      lead={lead}
      activities={activities ?? []}
      stages={stages}
      pipeline={pipeline}
      staff={staff ?? []}
      sops={sops}
      currentUserId={userOrg.userId}
    />
  )
}
