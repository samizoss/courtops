'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Org } from '@/types/database'

const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
]

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

interface DayHours {
  open: string
  close: string
  closed: boolean
}

interface OrgSettingsRow {
  id: string
  org_id: string
  open_time: string | null
  close_time: string | null
  open_days: number[] | null
  staff_arrive_before_min: number | null
  staff_depart_after_min: number | null
  daily_hours: Record<string, { open: string; close: string }> | null
  [key: string]: unknown
}

function buildDailyHours(settings: OrgSettingsRow | null): Record<number, DayHours> {
  const defaults: Record<number, DayHours> = {}
  const openDays = settings?.open_days ?? [1, 2, 3, 4, 5, 6]
  const fallbackOpen = settings?.open_time?.slice(0, 5) || '08:00'
  const fallbackClose = settings?.close_time?.slice(0, 5) || '17:00'
  const daily = settings?.daily_hours ?? {}

  for (let d = 0; d < 7; d++) {
    const saved = daily[String(d)]
    if (saved) {
      defaults[d] = { open: saved.open, close: saved.close, closed: false }
    } else if (openDays.includes(d)) {
      defaults[d] = { open: fallbackOpen, close: fallbackClose, closed: false }
    } else {
      defaults[d] = { open: fallbackOpen, close: fallbackClose, closed: true }
    }
  }
  return defaults
}

export function GeneralSettings({ org, orgSettings }: { org: Org; orgSettings: OrgSettingsRow | null }) {
  const [name, setName] = useState(org.name)
  const [timezone, setTimezone] = useState(org.timezone || 'America/Chicago')
  const [logoUrl, setLogoUrl] = useState(org.logo_url || '')
  const [dailyHours, setDailyHours] = useState<Record<number, DayHours>>(() => buildDailyHours(orgSettings))
  const [arriveBefore, setArriveBefore] = useState(orgSettings?.staff_arrive_before_min ?? 0)
  const [departAfter, setDepartAfter] = useState(orgSettings?.staff_depart_after_min ?? 0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Track dirty state for unsaved changes warning
  const markDirty = useCallback(() => setDirty(true), [])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  function updateDay(day: number, field: keyof DayHours, value: string | boolean) {
    setDailyHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      // Save org basics
      const { error: orgErr } = await supabase
        .from('orgs')
        .update({ name, timezone, logo_url: logoUrl || null })
        .eq('id', org.id)

      if (orgErr) throw orgErr

      // Build daily_hours JSON and legacy fields
      const dailyJson: Record<string, { open: string; close: string }> = {}
      const openDays: number[] = []
      for (let d = 0; d < 7; d++) {
        if (!dailyHours[d].closed) {
          dailyJson[String(d)] = { open: dailyHours[d].open, close: dailyHours[d].close }
          openDays.push(d)
        }
      }
      // Use first open day for legacy single open/close (backwards compat)
      const firstOpen = openDays.length > 0 ? dailyHours[openDays[0]] : { open: '08:00', close: '17:00' }

      const hoursData = {
        daily_hours: dailyJson,
        open_time: firstOpen.open,
        close_time: firstOpen.close,
        open_days: openDays,
        staff_arrive_before_min: arriveBefore,
        staff_depart_after_min: departAfter,
      }

      if (orgSettings) {
        const { error } = await supabase
          .from('org_settings')
          .update(hoursData)
          .eq('id', orgSettings.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('org_settings')
          .insert({ org_id: org.id, ...hoursData })
        if (error) throw error
      }

      setDirty(false)
      setMessage({ type: 'success', text: 'Settings saved.' })
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
        <h2 className="text-2xl font-bold">General Settings</h2>
        <p className="text-gray-400 text-sm mt-1">Organization details and preferences</p>
      </div>

      <form onSubmit={handleSave} onChange={markDirty} className="max-w-lg space-y-5">
        {/* Org Basics */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
            Organization Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-300 mb-1">
            Slug
          </label>
          <input
            id="slug"
            type="text"
            value={org.slug}
            readOnly
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used for your subdomain: {org.slug}.courtops.app
          </p>
        </div>

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-300 mb-1">
            Timezone
          </label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            {US_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="logoUrl" className="block text-sm font-medium text-gray-300 mb-1">
            Logo URL
          </label>
          <input
            id="logoUrl"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        {/* Business Hours */}
        <div className="border-t border-gray-800 pt-5 mt-5">
          <h3 className="text-lg font-semibold mb-1">Business Hours</h3>
          <p className="text-gray-400 text-sm mb-4">Set hours for each day. Toggle off days the facility is closed.</p>

          <div className="space-y-2 mb-4">
            {DAYS.map((day) => {
              const dh = dailyHours[day.value]
              return (
                <div key={day.value} className={`flex items-center gap-3 p-3 rounded-lg ${dh.closed ? 'bg-gray-900/50 opacity-60' : 'bg-gray-900'}`}>
                  <button
                    type="button"
                    onClick={() => updateDay(day.value, 'closed', !dh.closed)}
                    className={`w-10 text-xs font-medium rounded py-1 transition-colors ${
                      dh.closed ? 'bg-gray-800 text-gray-500' : 'bg-orange-600 text-white'
                    }`}
                  >
                    {dh.closed ? 'Off' : 'On'}
                  </button>
                  <span className="w-10 text-sm font-medium text-gray-300">{day.label}</span>
                  {!dh.closed ? (
                    <>
                      <input
                        type="time"
                        value={dh.open}
                        onChange={(e) => updateDay(day.value, 'open', e.target.value)}
                        className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <span className="text-gray-600 text-sm">to</span>
                      <input
                        type="time"
                        value={dh.close}
                        onChange={(e) => updateDay(day.value, 'close', e.target.value)}
                        className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </>
                  ) : (
                    <span className="text-gray-600 text-sm">Closed</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Staff Buffer */}
        <div className="border-t border-gray-800 pt-5 mt-5">
          <h3 className="text-lg font-semibold mb-1">Staff Shift Buffer</h3>
          <p className="text-gray-400 text-sm mb-4">
            How early should staff arrive before open, and how late should they stay after close?
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Arrive before open (min)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                step={5}
                value={arriveBefore}
                onChange={(e) => setArriveBefore(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Stay after close (min)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                step={5}
                value={departAfter}
                onChange={(e) => setDepartAfter(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Staff shifts will span from {arriveBefore > 0 ? `${arriveBefore} min before open` : 'open'} to{' '}
            {departAfter > 0 ? `${departAfter} min after close` : 'close'}.
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
  )
}
