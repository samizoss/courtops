export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { IntegrationSettings } from './integration-settings'

export default async function IntegrationsSettingsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role === 'staff') {
    redirect('/')
  }

  const [{ data: orgSettings }, { data: org }, { data: upcomingSessions }, { count: eventCount }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('*')
      .eq('org_id', userOrg.orgId)
      .single(),
    supabase
      .from('orgs')
      .select('courtreserve_org_id, timezone')
      .eq('id', userOrg.orgId)
      .single(),
    supabase
      .from('cr_event_sessions')
      .select('id, start_time, end_time, registration_count, event:cr_events!cr_event_sessions_cr_event_id_fkey(name, cr_category_name)')
      .eq('org_id', userOrg.orgId)
      .gte('start_time', new Date().toISOString())
      .order('start_time')
      .limit(12),
    supabase
      .from('cr_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', userOrg.orgId),
  ])

  return (
    <div className="space-y-8">
      <IntegrationSettings
        orgSettings={orgSettings}
        courtreserveOrgId={org?.courtreserve_org_id ?? ''}
        orgId={userOrg.orgId}
      />

      {/* Synced CR events preview — populated by the same Sync Now button above.
          Read-only; the campaign UI (content v2 Phase 3+) will consume these. */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Synced Court Reserve Events {eventCount != null && <span className="text-gray-600 normal-case">— {eventCount} event series</span>}
        </h3>
        {(upcomingSessions ?? []).length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-sm text-gray-400">
              No synced event sessions yet. Run <span className="text-gray-300">Sync Now</span> above — CourtOps
              mirrors your Court Reserve events (31 days back and forward) so they can anchor content campaigns.
            </p>
            <p className="text-[11px] text-gray-600 mt-2">
              Note: Court Reserve only exposes events that have at least one registration.
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/40 border-b border-gray-800">
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2.5 font-medium">Upcoming session</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Starts</th>
                  <th className="px-4 py-2.5 font-medium text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {(upcomingSessions ?? []).map((s) => {
                  const ev = s.event as unknown as { name: string; cr_category_name: string | null } | null
                  return (
                    <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-white font-medium">{ev?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400">{ev?.cr_category_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-300">
                        {/* Server renders in UTC on Vercel — format in the club's timezone
                            (orgs.timezone; org_settings never had a timezone column). */}
                        {new Date(s.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: org?.timezone || 'America/Chicago' })}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-300 font-mono">{s.registration_count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-600 px-4 py-2.5 border-t border-gray-800">
              Read-only mirror, refreshed on each sync. Events with zero registrations are invisible to the
              Court Reserve API until their first signup. These sessions will anchor content campaigns.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
