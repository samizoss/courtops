'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import type {
  Lead,
  LeadSource,
  Activity,
  ActivityType,
  ActivityDirection,
  ActivityOutcome,
  PipelineStage,
} from '@/types/database'

const sources: { value: LeadSource; label: string }[] = [
  { value: 'syndicate-ltp', label: 'Syndicate - LTP' },
  { value: 'syndicate-general', label: 'Syndicate - General' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

const activityTypes: { value: ActivityType; label: string; icon: string }[] = [
  { value: 'call', label: 'Call', icon: '\u{1F4DE}' },
  { value: 'text', label: 'Text', icon: '\u{1F4AC}' },
  { value: 'email', label: 'Email', icon: '\u{2709}\u{FE0F}' },
  { value: 'in_person', label: 'In-Person', icon: '\u{1F91D}' },
  { value: 'voicemail', label: 'Voicemail', icon: '\u{1F4E9}' },
  { value: 'note', label: 'Note', icon: '\u{1F4DD}' },
]

const activityOutcomes: { value: ActivityOutcome; label: string }[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'booked', label: 'Booked' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up', label: 'Follow Up' },
]

const defaultStageColors: string[] = [
  '#3b82f6', '#eab308', '#f97316', '#a855f7', '#22c55e', '#14b8a6', '#6b7280', '#374151',
]

interface Props {
  lead: Lead
  activities: (Activity & { performer?: { full_name: string } | null })[]
  stages: PipelineStage[]
  pipeline: { id: string; name: string } | null
  staff: { id: string; full_name: string }[]
  sops: { id: string; title: string; category: string }[]
  currentUserId: string
}

export function LeadDetail({ lead, activities: initialActivities, stages, pipeline, staff, sops, currentUserId }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'details' | 'activity'>('details')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activities, setActivities] = useState(initialActivities)
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [submittingActivity, setSubmittingActivity] = useState(false)

  const [form, setForm] = useState({
    name: lead.name,
    email: lead.email || '',
    phone: lead.phone || '',
    source: lead.source,
    assigned_to: lead.assigned_to || '',
    next_action_date: lead.next_action_date || '',
    last_contact_date: lead.last_contact_date || '',
    membership_type: lead.membership_type || '',
    notes: lead.notes || '',
    current_stage_id: lead.current_stage_id || '',
  })

  const [activityForm, setActivityForm] = useState({
    activity_type: 'call' as ActivityType,
    direction: 'outbound' as ActivityDirection,
    outcome: '' as ActivityOutcome | '',
    notes: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setSaved(false)
  }

  async function handleStageChange(stageId: string) {
    const oldStage = stages.find(s => s.id === form.current_stage_id)
    const newStage = stages.find(s => s.id === stageId)
    if (!newStage || stageId === form.current_stage_id) return

    setForm(f => ({ ...f, current_stage_id: stageId }))

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    // Update the lead's stage
    await supabase.from('leads').update({
      current_stage_id: stageId,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)

    // Log a status_change activity
    const { data: newActivity } = await supabase.from('activities').insert({
      org_id: lead.org_id,
      lead_id: lead.id,
      activity_type: 'status_change',
      direction: 'internal',
      performed_by: currentUserId,
      notes: `Stage changed from ${oldStage?.name ?? 'None'} to ${newStage.name}`,
      metadata: {
        from_stage_id: oldStage?.id ?? null,
        from_stage_name: oldStage?.name ?? null,
        to_stage_id: newStage.id,
        to_stage_name: newStage.name,
      },
    }).select('*, performer:profiles!activities_performed_by_fkey(full_name)').single()

    if (newActivity) {
      setActivities(prev => [newActivity, ...prev])
    }

    router.refresh()
  }

  async function handleSave() {
    setSaving(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    await supabase.from('leads').update({
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      source: form.source,
      assigned_to: form.assigned_to || null,
      next_action_date: form.next_action_date || null,
      last_contact_date: form.last_contact_date || null,
      membership_type: form.membership_type || null,
      notes: form.notes || null,
      current_stage_id: form.current_stage_id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)

    setSaving(false)
    setSaved(true)
    router.refresh()
  }

  async function handleLogActivity() {
    setSubmittingActivity(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const { data: newActivity } = await supabase.from('activities').insert({
      org_id: lead.org_id,
      lead_id: lead.id,
      activity_type: activityForm.activity_type,
      direction: activityForm.activity_type === 'note' ? 'internal' : activityForm.direction,
      outcome: activityForm.outcome || null,
      performed_by: currentUserId,
      notes: activityForm.notes || null,
    }).select('*, performer:profiles!activities_performed_by_fkey(full_name)').single()

    // Update last_contact_date and touch_count
    await supabase.from('leads').update({
      last_contact_date: new Date().toISOString().split('T')[0],
      touch_count: (lead.touch_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)

    if (newActivity) {
      setActivities(prev => [newActivity, ...prev])
    }

    setActivityForm({ activity_type: 'call', direction: 'outbound', outcome: '', notes: '' })
    setShowActivityForm(false)
    setSubmittingActivity(false)
    router.refresh()
  }

  const inputClass = 'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'
  const labelClass = 'block text-xs font-medium text-gray-400 mb-1'

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/pipeline" className="text-gray-400 hover:text-white text-sm font-medium">
          &larr; Pipeline
        </Link>
        <h2 className="text-2xl font-bold flex-1">{form.name}</h2>
      </div>

      {/* Stage selector */}
      {stages.length > 0 && (
        <div className="flex gap-1.5 mb-6 flex-wrap">
          {stages.map((stage, i) => {
            const color = stage.color || defaultStageColors[i % defaultStageColors.length]
            const isActive = form.current_stage_id === stage.id
            return (
              <button
                key={stage.id}
                onClick={() => handleStageChange(stage.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  isActive
                    ? 'text-white border-transparent'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border-gray-700'
                }`}
                style={isActive ? { backgroundColor: color } : undefined}
              >
                {stage.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        <button
          onClick={() => setTab('details')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'details'
              ? 'border-orange-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'activity'
              ? 'border-orange-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Activity ({activities.length})
        </button>
      </div>

      {/* Details Tab */}
      {tab === 'details' && (
        <div className="space-y-4">
          {/* Pipeline info */}
          {pipeline && (
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <span className="text-xs font-medium text-gray-400">Pipeline</span>
              <p className="text-white text-sm mt-0.5">{pipeline.name}</p>
            </div>
          )}

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

          {/* Assignment & dates */}
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

          <div>
            <label className={labelClass}>Membership Type</label>
            <input className={inputClass} value={form.membership_type} onChange={e => set('membership_type', e.target.value)} placeholder="e.g. Daily, Star, Patriot" />
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

          {/* Related SOPs */}
          {sops.length > 0 && (
            <div className="pt-6 border-t border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Related SOPs</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sops.map(sop => (
                  <Link
                    key={sop.id}
                    href={`/sops/${sop.id}`}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-600 transition-colors"
                  >
                    <p className="text-sm text-white font-medium">{sop.title}</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{sop.category}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <div>
          {/* Log Activity button / form */}
          {!showActivityForm ? (
            <button
              onClick={() => setShowActivityForm(true)}
              className="mb-6 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Log Activity
            </button>
          ) : (
            <div className="mb-6 bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Type</label>
                  <select
                    className={inputClass}
                    value={activityForm.activity_type}
                    onChange={e => setActivityForm(f => ({ ...f, activity_type: e.target.value as ActivityType }))}
                  >
                    {activityTypes.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {activityForm.activity_type !== 'note' && (
                  <div>
                    <label className={labelClass}>Direction</label>
                    <select
                      className={inputClass}
                      value={activityForm.direction}
                      onChange={e => setActivityForm(f => ({ ...f, direction: e.target.value as ActivityDirection }))}
                    >
                      <option value="outbound">Outbound</option>
                      <option value="inbound">Inbound</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelClass}>Outcome</label>
                  <select
                    className={inputClass}
                    value={activityForm.outcome}
                    onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value as ActivityOutcome | '' }))}
                  >
                    <option value="">-- Select --</option>
                    {activityOutcomes.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={activityForm.notes}
                  onChange={e => setActivityForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="What happened?"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleLogActivity}
                  disabled={submittingActivity}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {submittingActivity ? 'Saving...' : 'Submit'}
                </button>
                <button
                  onClick={() => setShowActivityForm(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Activity timeline */}
          {activities.length === 0 ? (
            <p className="text-gray-500 text-sm">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {activities.map(a => (
                <ActivityRow key={a.id} activity={a} stages={stages} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------- Activity row component ------- */

function getActivityIcon(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    call: '\u{1F4DE}',
    text: '\u{1F4AC}',
    email: '\u{2709}\u{FE0F}',
    in_person: '\u{1F91D}',
    voicemail: '\u{1F4E9}',
    note: '\u{1F4DD}',
    status_change: '\u{1F504}',
    system: '\u{2699}\u{FE0F}',
  }
  return map[type] || '\u{1F4CC}'
}

function getActivityLabel(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    call: 'Call',
    text: 'Text',
    email: 'Email',
    in_person: 'In-Person',
    voicemail: 'Voicemail',
    note: 'Note',
    status_change: 'Stage Change',
    system: 'System',
  }
  return map[type] || type
}

function directionBadge(dir: string | null) {
  if (!dir || dir === 'internal') return null
  const colors = dir === 'outbound'
    ? 'bg-blue-900/50 text-blue-300'
    : 'bg-green-900/50 text-green-300'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors}`}>
      {dir === 'outbound' ? 'Outbound' : 'Inbound'}
    </span>
  )
}

function outcomeBadge(outcome: string | null) {
  if (!outcome) return null
  const label = outcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-800 text-gray-300">
      {label}
    </span>
  )
}

function ActivityRow({ activity, stages }: {
  activity: Activity & { performer?: { full_name: string } | null }
  stages: PipelineStage[]
}) {
  const isSystem = activity.activity_type === 'system'
  const isStageChange = activity.activity_type === 'status_change'
  const time = new Date(activity.created_at)
  const timeStr = time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${
      isSystem
        ? 'bg-gray-900/50 border-gray-800/50'
        : 'bg-gray-900 border-gray-800'
    }`}>
      <div className="text-lg flex-shrink-0 mt-0.5">
        {getActivityIcon(activity.activity_type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white">
            {getActivityLabel(activity.activity_type)}
          </span>
          {directionBadge(activity.direction)}
          {outcomeBadge(activity.outcome)}
        </div>
        {activity.notes && (
          <p className="text-sm text-gray-300 mt-1">{activity.notes}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
          {activity.performer?.full_name && (
            <span>{activity.performer.full_name}</span>
          )}
          <span>{timeStr}</span>
        </div>
      </div>
    </div>
  )
}
