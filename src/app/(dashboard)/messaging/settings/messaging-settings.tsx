'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Config {
  id: string
  org_id: string
  twilio_phone: string | null
  monthly_cap_cents: number
  warn_threshold_pct: number
  current_spend_cents: number
  spend_month: string | null
  paused: boolean
  alert_phone: string | null
}

export function MessagingSettings({
  config,
  orgId,
}: {
  config: Config | null
  orgId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    monthly_cap: config ? (config.monthly_cap_cents / 100).toString() : '20',
    warn_threshold: config?.warn_threshold_pct?.toString() || '75',
    paused: config?.paused || false,
    alert_phone: config?.alert_phone || '',
  })

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setLoading(true)

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const data = {
      org_id: orgId,
      monthly_cap_cents: Math.round(parseFloat(form.monthly_cap) * 100),
      warn_threshold_pct: parseInt(form.warn_threshold),
      paused: form.paused,
      alert_phone: form.alert_phone || null,
      updated_at: new Date().toISOString(),
    }

    if (config) {
      await supabase.from('org_messaging_config').update(data).eq('id', config.id)
    } else {
      await supabase.from('org_messaging_config').insert(data)
    }

    setLoading(false)
    setSaved(true)
    router.refresh()
  }

  const spendPct = config
    ? Math.round((config.current_spend_cents / (parseFloat(form.monthly_cap) * 100 || 1)) * 100)
    : 0

  const inputClass = 'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'

  return (
    <div className="max-w-xl">
      <a href="/messaging" className="text-sm text-gray-400 hover:text-white mb-4 inline-block">
        ← Back to Messages
      </a>

      <h2 className="text-2xl font-bold mb-6">Messaging Settings</h2>

      {/* Current spend meter */}
      {config && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">Current Month Usage</h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold">
              ${(config.current_spend_cents / 100).toFixed(2)}
            </span>
            <span className="text-sm text-gray-400">
              of ${(parseFloat(form.monthly_cap)).toFixed(2)} cap
            </span>
          </div>
          <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                spendPct >= 100 ? 'bg-red-500' : spendPct >= 75 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(spendPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {config.spend_month || 'N/A'} · Resets on the 1st
          </p>
        </div>
      )}

      {/* Twilio phone (read-only) */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Twilio Number</h3>
        <p className="text-sm text-gray-300 font-mono">
          {config?.twilio_phone || 'Not provisioned'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Contact Sami to provision a phone number for your org.
        </p>
      </div>

      {/* Settings form */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">Budget & Alerts</h3>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Monthly Cap ($)</label>
          <input
            type="number"
            step="1"
            min="5"
            className={inputClass}
            value={form.monthly_cap}
            onChange={(e) => set('monthly_cap', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Warning Threshold ({form.warn_threshold}%)
          </label>
          <input
            type="range"
            min="50"
            max="95"
            step="5"
            className="w-full"
            value={form.warn_threshold}
            onChange={(e) => set('warn_threshold', e.target.value)}
          />
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>50%</span>
            <span>95%</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Alert Phone Number</label>
          <input
            type="tel"
            className={inputClass}
            value={form.alert_phone}
            onChange={(e) => set('alert_phone', e.target.value)}
            placeholder="+16055550000"
          />
          <p className="text-[10px] text-gray-600 mt-1">Receives budget alert SMS</p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.paused}
            onChange={(e) => set('paused', e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
          />
          <div>
            <span className="text-sm text-gray-300">Pause messaging</span>
            <p className="text-[10px] text-gray-600">Blocks all outbound SMS and widget submissions</p>
          </div>
        </label>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved</span>}
        </div>
      </div>
    </div>
  )
}
