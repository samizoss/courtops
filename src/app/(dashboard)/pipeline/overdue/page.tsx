export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import Link from 'next/link'

export default async function OverduePage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // Fetch all leads where next_action_date < today
  const { data: leads } = await supabase
    .from('leads')
    .select('*, assigned_profile:profiles!leads_assigned_to_fkey(full_name)')
    .eq('org_id', userOrg.orgId)
    .lt('next_action_date', today)
    .order('next_action_date', { ascending: true })

  // Fetch pipelines and stages for context
  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('*')
    .eq('org_id', userOrg.orgId)

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('org_id', userOrg.orgId)

  const pipelineMap = (pipelines ?? []).reduce<Record<string, { name: string; slug: string }>>((acc, p) => {
    acc[p.id] = { name: p.name, slug: p.slug }
    return acc
  }, {})

  const stageMap = (stages ?? []).reduce<Record<string, { name: string; is_terminal: boolean }>>((acc, s) => {
    acc[s.id] = { name: s.name, is_terminal: s.is_terminal }
    return acc
  }, {})

  // Filter out leads in terminal stages
  const overdueLeads = (leads ?? []).filter((lead) => {
    if (lead.current_stage_id && stageMap[lead.current_stage_id]?.is_terminal) return false
    if (['converted', 'lost', 'archived'].includes(lead.status)) return false
    return true
  })

  // Group by pipeline_type (or 'Legacy' for unassigned)
  const grouped: Record<string, typeof overdueLeads> = {}
  overdueLeads.forEach((lead) => {
    const key = lead.pipeline_id
      ? pipelineMap[lead.pipeline_id]?.name ?? 'Unknown Pipeline'
      : 'Legacy (No Pipeline)'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(lead)
  })

  const now = new Date()

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/pipeline" className="text-gray-400 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Overdue Leads</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {overdueLeads.length} lead{overdueLeads.length !== 1 ? 's' : ''} past their next action date
          </p>
        </div>
      </div>

      {overdueLeads.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No overdue leads. You are all caught up.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([groupName, groupLeads]) => (
            <div key={groupName}>
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                {groupName}
                <span className="text-xs bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded-full">
                  {groupLeads.length}
                </span>
              </h3>

              <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-xs text-gray-500 font-medium px-4 py-2">Lead</th>
                      <th className="text-left text-xs text-gray-500 font-medium px-4 py-2">Stage</th>
                      <th className="text-left text-xs text-gray-500 font-medium px-4 py-2">Days Overdue</th>
                      <th className="text-left text-xs text-gray-500 font-medium px-4 py-2">Assigned To</th>
                      <th className="text-left text-xs text-gray-500 font-medium px-4 py-2">Next Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupLeads.map((lead) => {
                      const nextDate = new Date(lead.next_action_date!)
                      const daysOverdue = Math.floor(
                        (now.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24)
                      )
                      const stageName = lead.current_stage_id
                        ? stageMap[lead.current_stage_id]?.name ?? lead.status
                        : lead.status
                      const assignedName =
                        (lead as { assigned_profile?: { full_name: string } | null }).assigned_profile
                          ?.full_name ?? 'Unassigned'

                      return (
                        <tr key={lead.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/pipeline/${lead.id}`}
                              className="text-white hover:text-orange-400 font-medium transition-colors"
                            >
                              {lead.name}
                            </Link>
                            {lead.email && (
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">{lead.email}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{stageName}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`text-xs font-medium ${
                                daysOverdue >= 7
                                  ? 'text-red-400'
                                  : daysOverdue >= 3
                                    ? 'text-orange-400'
                                    : 'text-yellow-400'
                              }`}
                            >
                              {daysOverdue}d overdue
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{assignedName}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">
                            {nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
