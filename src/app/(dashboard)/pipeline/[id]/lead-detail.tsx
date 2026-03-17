'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Lead, LeadStatus, LeadSource } from '@/types/database'

const statuses: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
  { value: 'follow-up', label: 'Follow-up', color: 'bg-orange-500' },
  { value: 'trial-booked', label: 'Trial Booked', color: 'bg-purple-500' },
  { value: 'converted', label: 'Converted', color: 'bg-green-500' },
  { value: 'nurturing', label: 'Nurturing', color: 'bg-teal-500' },
  { value: 'lost', label: 'Lost', color: 'bg-gray-500' },
  { value: 'archived', label: 'Archived', color: 'bg-gray-700' },
]

const sources: { value: LeadSource; label: string }[] = [
  { value: 'syndicate-ltp', label: 'Syndicate - LTP' },
  { value: 'syndicate-general', label: 'Syndicate - General' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

interface Props {
  lead: Lead
  staff: { id: string; full_name: string }[]
  currentUserId: string
}

export function LeadDetail({ lead, staff, currentUserId }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    name: lead.name,
    email: lead.email || '',
    phone: lead.phone || '',
    status: lead.status,
    source: lead.source,
    assigned_to: lead.assigned_to || '',
    next_action_date: lead.next_action_date || '',
    last_contact_date: lead.last_contact_date || '',
    touch_count: lead.touch_count,
    membership_type: lead.membership_type || '',
    notes: lead.notes || '',
    converted: lead.converted,
  })

  function set(field: string, value: string | number | boolean) {
    setForm(f => ({ ...f, [field]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const updates: Record<string, unknown> = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      status: form.status,
      source: form.source,
      assigned_to: form.assigned_to || null,
      next_action_date: form.next_action_date || null,
      last_contact_date: form.last_contact_date || null,
      touch_count: form.touch_count,
      membership_type: form.membership_type || null,
      notes: form.notes || null,
      converted: form.converted,
      updated_at: new Date().toISOString(),
    }

    if (form.status === 'converted' && !lead.converted) {
      updates.converted = true
      updates.conversion_date = new Date().toISOString().split('T')[0]
    }

    await supabase.from('leads').update(updates).eq('id', lead.id)
    setSaving(false)
    setSaved(true)
    router.refresh()
  }

  async function logTouch() {
    const newCount = form.touch_count + 1
    const today = new Date().toISOString().split('T')[0]
    set('touch_count', newCount)
    set('last_contact_date', today)

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('leads').update({
      touch_count: newCount,
      last_contact_date: today,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)
    setSaved(true)
    router.refresh()
  }

  const inputClass = 'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'
  const labelClass = 'block text-xs font-medium text-gray-400 mb-1'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/pipeline')} className="text-gray-400 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold flex-1">{form.name}</h2>
        <button
          onClick={logTouch}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Log Touch ({form.touch_count})
        </button>
      </div>

      {/* Status bar */}
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {statuses.map((s) => (
          <button
            key={s.value}
            onClick={() => set('status', s.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              form.status === s.value
                ? `${s.color} text-white`
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {/* Contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Name</label>
            <input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Source</label>
            <select className={inputClass} value={form.source} onChange={e => set('source', e.target.value)}>
              {sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input type="tel" className={inputClass} value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>

        {/* Pipeline info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Assigned To</label>
            <select className={inputClass} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Next Action Date</label>
            <input type="date" className={inputClass} value={form.next_action_date} onChange={e => set('next_action_date', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Last Contact</label>
            <input type="date" className={inputClass} value={form.last_contact_date} onChange={e => set('last_contact_date', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Membership Type</label>
            <input className={inputClass} value={form.membership_type} onChange={e => set('membership_type', e.target.value)} placeholder="e.g. Daily, Star, Patriot" />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className={labelClass}>Touch Count</label>
              <input type="number" className={inputClass} value={form.touch_count} onChange={e => set('touch_count', parseInt(e.target.value) || 0)} />
            </div>
            <label className="flex items-center gap-2 pb-2 cursor-pointer">
              <input type="checkbox" checked={form.converted} onChange={e => set('converted', e.target.checked)} className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-orange-500 focus:ring-orange-500" />
              <span className="text-sm text-gray-300">Converted</span>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            className={inputClass}
            rows={4}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Follow-up notes, context, what was discussed..."
          />
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved</span>}
          <span className="text-gray-600 text-xs ml-auto">
            Created {new Date(lead.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  )
}
