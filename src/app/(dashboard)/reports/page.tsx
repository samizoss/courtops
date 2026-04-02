export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'

export default async function ReportsPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  // Pipeline conversion data
  const [
    { data: pipelines },
    { data: allLeads },
    { data: activitiesThisMonth },
  ] = await Promise.all([
    supabase.from('pipelines').select('id, name, slug, icon').eq('is_active', true).order('sort_order'),
    supabase.from('leads').select('id, pipeline_type, status, source, converted, created_at'),
    supabase
      .from('activities')
      .select('id, activity_type, lead_id, created_at')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ])

  const leads = allLeads ?? []
  const activities = activitiesThisMonth ?? []

  // Calculate per-pipeline stats
  const pipelineStats = (pipelines ?? []).map((p) => {
    const pLeads = leads.filter((l) => l.pipeline_type === p.slug)
    const converted = pLeads.filter((l) => l.converted)
    const lost = pLeads.filter((l) => l.status === 'lost')
    const active = pLeads.filter((l) => !['converted', 'lost', 'archived'].includes(l.status))

    return {
      ...p,
      total: pLeads.length,
      converted: converted.length,
      lost: lost.length,
      active: active.length,
      conversionRate: pLeads.length > 0 ? Math.round((converted.length / pLeads.length) * 100) : 0,
    }
  })

  // Source breakdown
  const sourceMap = new Map<string, { total: number; converted: number }>()
  for (const lead of leads) {
    const src = lead.source || 'unknown'
    const existing = sourceMap.get(src) || { total: 0, converted: 0 }
    existing.total++
    if (lead.converted) existing.converted++
    sourceMap.set(src, existing)
  }
  const sourceStats = Array.from(sourceMap.entries())
    .map(([source, stats]) => ({
      source: source.replace(/-/g, ' '),
      ...stats,
      rate: stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // This month activity stats
  const activityCount = activities.length
  const uniqueLeadsTouched = new Set(activities.map((a) => a.lead_id)).size

  // Leads created this month
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const leadsThisMonth = leads.filter((l) => l.created_at >= monthStart).length
  const convertedThisMonth = leads.filter((l) => l.converted && l.created_at >= monthStart).length

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Reports</h2>
        <p className="text-gray-400 text-sm mt-1">Pipeline performance and conversion metrics</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl p-5 border-l-4 border-blue-500">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Leads This Month</p>
          <p className="text-3xl font-bold mt-2">{leadsThisMonth}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border-l-4 border-green-500">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Converted This Month</p>
          <p className="text-3xl font-bold mt-2">{convertedThisMonth}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border-l-4 border-orange-500">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Activities This Month</p>
          <p className="text-3xl font-bold mt-2">{activityCount}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border-l-4 border-purple-500">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Leads Touched</p>
          <p className="text-3xl font-bold mt-2">{uniqueLeadsTouched}</p>
        </div>
      </div>

      {/* Pipeline Conversion Rates */}
      <div className="bg-gray-900 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
          Pipeline Conversion Rates
        </h3>
        {pipelineStats.length === 0 ? (
          <p className="text-gray-500 text-sm">No pipelines configured</p>
        ) : (
          <div className="space-y-4">
            {pipelineStats.map((p) => (
              <div key={p.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span>{p.icon}</span>
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <span className="text-xs text-gray-500">{p.total} leads</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-green-400">{p.converted} converted</span>
                    <span className="text-gray-500">{p.active} active</span>
                    <span className="text-gray-600">{p.lost} lost</span>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden flex">
                  {p.total > 0 && (
                    <>
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${(p.converted / p.total) * 100}%` }}
                      />
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${(p.active / p.total) * 100}%` }}
                      />
                      <div
                        className="h-full bg-gray-600"
                        style={{ width: `${(p.lost / p.total) * 100}%` }}
                      />
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {p.conversionRate}% conversion rate
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Source Effectiveness */}
      <div className="bg-gray-900 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
          Lead Source Effectiveness
        </h3>
        {sourceStats.length === 0 ? (
          <p className="text-gray-500 text-sm">No lead data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="pb-3 font-medium">Source</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                  <th className="pb-3 font-medium text-right">Converted</th>
                  <th className="pb-3 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {sourceStats.map((s) => (
                  <tr key={s.source}>
                    <td className="py-2.5 text-white capitalize">{s.source}</td>
                    <td className="py-2.5 text-gray-400 text-right">{s.total}</td>
                    <td className="py-2.5 text-green-400 text-right">{s.converted}</td>
                    <td className="py-2.5 text-right">
                      <span className={`${s.rate > 20 ? 'text-green-400' : s.rate > 10 ? 'text-yellow-400' : 'text-gray-500'}`}>
                        {s.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
