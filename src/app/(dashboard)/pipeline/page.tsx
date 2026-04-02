export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { PipelineBoard } from './pipeline-board'
import Link from 'next/link'

export default async function PipelinePage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  // Fetch pipelines for this org
  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('*')
    .eq('org_id', userOrg.orgId)
    .eq('is_active', true)
    .order('sort_order')

  // Fetch all stages for those pipelines
  const pipelineIds = (pipelines ?? []).map((p) => p.id)
  const { data: stages } = pipelineIds.length > 0
    ? await supabase
        .from('pipeline_stages')
        .select('*')
        .in('pipeline_id', pipelineIds)
        .order('sort_order')
    : { data: [] }

  // Fetch leads with assigned profile join
  const { data: leads } = await supabase
    .from('leads')
    .select('*, assigned_profile:profiles!leads_assigned_to_fkey(full_name)')
    .eq('org_id', userOrg.orgId)
    .order('updated_at', { ascending: false })

  // Separate leads with pipeline vs legacy (no pipeline_id)
  const allLeads = leads ?? []
  const pipelineLeads = allLeads.filter((l) => l.pipeline_id)
  const unassignedLeads = allLeads.filter((l) => !l.pipeline_id)

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Lead Pipeline</h2>
          <p className="text-gray-400 text-sm mt-1">
            {allLeads.length} leads total
            {unassignedLeads.length > 0 && (
              <span className="text-yellow-500 ml-2">
                ({unassignedLeads.length} unassigned)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/pipeline/overdue"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Overdue
          </Link>
          <Link
            href="/pipeline/new"
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Lead
          </Link>
        </div>
      </div>

      <PipelineBoard
        pipelines={pipelines ?? []}
        stages={stages ?? []}
        leads={pipelineLeads}
        unassignedLeads={unassignedLeads}
      />
    </div>
  )
}
