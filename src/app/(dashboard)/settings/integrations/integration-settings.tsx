'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { OrgSettings } from '@/types/database'

interface Props {
  orgSettings: OrgSettings | null
  courtreserveOrgId: string
  orgId: string
}

export function IntegrationSettings({ orgSettings, courtreserveOrgId, orgId }: Props) {
  const [apiUser, setApiUser] = useState(orgSettings?.cr_api_user ?? '')
  const [apiPass, setApiPass] = useState(orgSettings?.cr_api_pass ?? '')
  const [crOrgId, setCrOrgId] = useState(courtreserveOrgId)
  const [syncEnabled, setSyncEnabled] = useState(orgSettings?.cr_sync_enabled ?? false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [sheetsSyncing, setSheetsSyncing] = useState(false)
  const [sheetsMessage, setSheetsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const lastSynced = orgSettings?.cr_last_synced_at
    ? new Date(orgSettings.cr_last_synced_at).toLocaleString()
    : 'Never'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      // Update org_settings
      if (orgSettings) {
        const { error } = await supabase
          .from('org_settings')
          .update({
            cr_api_user: apiUser || null,
            cr_api_pass: apiPass || null,
            cr_sync_enabled: syncEnabled,
          })
          .eq('id', orgSettings.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('org_settings')
          .insert({
            org_id: orgId,
            cr_api_user: apiUser || null,
            cr_api_pass: apiPass || null,
            cr_sync_enabled: syncEnabled,
          })

        if (error) throw error
      }

      // Update courtreserve_org_id on orgs table
      const { error: orgError } = await supabase
        .from('orgs')
        .update({ courtreserve_org_id: crOrgId || null })
        .eq('id', orgId)

      if (orgError) throw orgError

      setMessage({ type: 'success', text: 'Integration settings saved.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings.'
      setMessage({ type: 'error', text: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-400 hover:text-white transition-colors">
          &larr; Back to Settings
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">Integrations</h2>
        <p className="text-gray-400 text-sm mt-1">Connect external services</p>
      </div>

      {/* Court Reserve */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-lg">
        <h3 className="text-lg font-semibold mb-1">Court Reserve</h3>
        <p className="text-gray-400 text-sm mb-5">Sync members and booking data from Court Reserve.</p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="apiUser" className="block text-sm font-medium text-gray-300 mb-1">
              API Username
            </label>
            <input
              id="apiUser"
              type="text"
              value={apiUser}
              onChange={(e) => setApiUser(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="your-api-username"
            />
          </div>

          <div>
            <label htmlFor="apiPass" className="block text-sm font-medium text-gray-300 mb-1">
              API Password
            </label>
            <input
              id="apiPass"
              type="password"
              value={apiPass}
              onChange={(e) => setApiPass(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="crOrgId" className="block text-sm font-medium text-gray-300 mb-1">
              Court Reserve Org ID
            </label>
            <input
              id="crOrgId"
              type="text"
              value={crOrgId}
              onChange={(e) => setCrOrgId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="e.g. 13403"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSyncEnabled(!syncEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                syncEnabled ? 'bg-orange-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  syncEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-300">Enable sync</span>
          </div>

          <div className="text-sm text-gray-500">
            Last synced: {lastSynced}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true)
                setMessage(null)
                try {
                  const res = await fetch('/api/sync/courtreserve', { method: 'POST' })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error || 'Sync failed')
                  setMessage({ type: 'success', text: `Sync complete! ${data.members_synced} members synced, ${data.upgrade_candidates} upgrade candidates found.` })
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Sync failed'
                  setMessage({ type: 'error', text: msg })
                } finally {
                  setSyncing(false)
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <p className="text-xs text-gray-500">
              Pulls members, attendance, and transactions from Court Reserve
            </p>
          </div>

          {message && (
            <p className={message.type === 'success' ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
      {/* Google Sheets Lead Sync */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-lg mt-6">
        <h3 className="text-lg font-semibold mb-1">Google Sheets — Lead Sync</h3>
        <p className="text-gray-400 text-sm mb-5">
          Import leads from the marketing team&apos;s Google Sheet into your pipelines (LTP, Membership, Events).
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={sheetsSyncing}
            onClick={async () => {
              setSheetsSyncing(true)
              setSheetsMessage(null)
              try {
                const res = await fetch('/api/sync/sheets', { method: 'POST' })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || 'Sync failed')
                const detail = (data.sheets as { sheet: string; created: number; skipped: number }[])
                  .map((s: { sheet: string; created: number; skipped: number }) => `${s.sheet}: ${s.created} new`)
                  .join(', ')
                setSheetsMessage({
                  type: 'success',
                  text: `Imported ${data.total_created} leads (${data.total_skipped} skipped). ${detail}`,
                })
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Sync failed'
                setSheetsMessage({ type: 'error', text: msg })
              } finally {
                setSheetsSyncing(false)
              }
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {sheetsSyncing ? 'Importing...' : 'Import Leads'}
          </button>
          <p className="text-xs text-gray-500">
            Pulls from all campaign tabs, deduplicates by email/phone
          </p>
        </div>

        {sheetsMessage && (
          <p className={`mt-3 ${sheetsMessage.type === 'success' ? 'text-green-400' : 'text-red-400'} text-sm`}>
            {sheetsMessage.text}
          </p>
        )}
      </div>
    </div>
  )
}
