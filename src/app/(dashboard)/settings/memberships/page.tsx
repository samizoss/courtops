export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'

interface MembershipTypeRow {
  id: string
  org_id: string
  cr_id: number
  name: string
  is_active: boolean
  monthly_price: number | null
  annual_price: number | null
  last_synced_at: string
}

function formatCurrency(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

export default async function MembershipsSettingsPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role === 'staff') {
    redirect('/')
  }

  const [{ data: types }, { data: orgSettings }] = await Promise.all([
    supabase
      .from('cr_membership_types')
      .select('*')
      .eq('org_id', userOrg.orgId)
      .order('is_active', { ascending: false })
      .order('monthly_price', { ascending: false })
      .order('name'),
    supabase
      .from('org_settings')
      .select('cr_last_synced_at, cr_sync_enabled')
      .eq('org_id', userOrg.orgId)
      .single(),
  ])

  const rows = (types ?? []) as MembershipTypeRow[]
  const lastSynced = orgSettings?.cr_last_synced_at ?? null
  const syncEnabled = orgSettings?.cr_sync_enabled ?? false

  return (
    <div>
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-400 hover:text-white transition-colors">
          &larr; Back to Settings
        </Link>
      </div>

      <div className="mb-8 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Memberships</h2>
          <p className="text-gray-400 text-sm mt-1">
            Read-only view of your Court Reserve membership tiers. Edit in Court Reserve directly;
            CourtOps refreshes this list each sync.
          </p>
        </div>
        <Link
          href="/settings/integrations"
          className="text-xs text-orange-400 hover:text-orange-300 underline"
        >
          Manage Court Reserve sync →
        </Link>
      </div>

      {!syncEnabled && rows.length === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 text-sm text-yellow-300">
          <p className="font-medium">Court Reserve sync isn&apos;t set up yet.</p>
          <p className="text-yellow-300/80 text-xs mt-1">
            Go to <Link href="/settings/integrations" className="underline hover:text-white">Settings → Integrations</Link> to
            enter your Court Reserve API credentials. The first sync will populate this page.
          </p>
        </div>
      )}

      {lastSynced && (
        <p className="text-xs text-gray-500 mb-4">
          Last synced: {new Date(lastSynced).toLocaleString()}
        </p>
      )}

      {rows.length === 0 && syncEnabled ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">
            No membership types found yet. Trigger a sync from{' '}
            <Link href="/settings/integrations" className="text-orange-400 underline hover:text-orange-300">
              Settings → Integrations
            </Link>
            .
          </p>
        </div>
      ) : rows.length > 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/40 border-b border-gray-800">
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Monthly</th>
                <th className="px-4 py-2.5 font-medium text-right">Annual</th>
                <th className="px-4 py-2.5 font-medium text-right">CR ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {rows.map((m) => (
                <tr
                  key={m.id}
                  className={`hover:bg-gray-800/30 transition-colors ${
                    !m.is_active ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-2.5 text-white font-medium">{m.name}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        m.is_active
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-300 font-mono">
                    {formatCurrency(m.monthly_price)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-300 font-mono">
                    {formatCurrency(m.annual_price)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs">
                    {m.cr_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-[10px] text-gray-600 mt-6 italic">
        Other Court Reserve org-level info (location, hours, courts, programs) may be auto-populated
        into Settings in a future iteration. For now, only membership types are surfaced here.
      </p>
    </div>
  )
}
