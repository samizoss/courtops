export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { NewLeadForm } from './new-lead-form'

export default async function NewLeadPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  // Fetch active pipelines and their stages
  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('*')
    .eq('org_id', userOrg.orgId)
    .eq('is_active', true)
    .order('sort_order')

  const pipelineIds = (pipelines ?? []).map((p) => p.id)
  const { data: stages } = pipelineIds.length > 0
    ? await supabase
        .from('pipeline_stages')
        .select('*')
        .in('pipeline_id', pipelineIds)
        .order('sort_order')
    : { data: [] }

  // Fetch staff for assignment
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', userOrg.orgId)
    .eq('is_active', true)

  return (
    <NewLeadForm
      orgId={userOrg.orgId}
      pipelines={pipelines ?? []}
      stages={stages ?? []}
      staff={staff ?? []}
    />
  )
}
