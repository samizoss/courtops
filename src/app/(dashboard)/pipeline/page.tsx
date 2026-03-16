export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { PipelineBoard } from './pipeline-board'

export default async function PipelinePage() {
  const supabase = await createClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('*, assigned_profile:profiles!leads_assigned_to_fkey(full_name)')
    .order('updated_at', { ascending: false })

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Lead Pipeline</h2>
          <p className="text-gray-400 text-sm mt-1">{leads?.length ?? 0} leads total</p>
        </div>
        <AddLeadButton />
      </div>

      <PipelineBoard leads={leads ?? []} />
    </div>
  )
}

function AddLeadButton() {
  return (
    <a
      href="/pipeline/new"
      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
    >
      + Add Lead
    </a>
  )
}
