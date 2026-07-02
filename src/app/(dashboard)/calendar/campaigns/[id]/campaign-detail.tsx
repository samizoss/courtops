'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/toast'
import type { CampaignRow, CampaignStatus, CampaignGoal } from '../campaigns-list'

export interface MilestoneRow {
  id: string
  campaign_id: string
  org_id: string
  label: string
  date: string
  display_order: number
}

export interface LinkedEvent {
  cr_event_id: string
  name: string
  cr_category_name: string | null
}

export interface SessionRow {
  id: string
  cr_event_id: string
  start_time: string
  end_time: string
  registration_count: number
}

export interface CrEventOption {
  id: string
  name: string
  cr_category_name: string | null
}

const PALETTE = [
  '#f97316',
  '#2563eb',
  '#16a34a',
  '#9333ea',
  '#eab308',
  '#dc2626',
  '#0d9488',
  '#64748b',
]

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
]

const GOAL_OPTIONS: { value: CampaignGoal; label: string }[] = [
  { value: 'brand_awareness', label: 'Brand awareness' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'follower_growth', label: 'Follower growth' },
  { value: 'event_attendance', label: 'Event attendance' },
  { value: 'sales_growth', label: 'Sales growth' },
  { value: 'customer_loyalty', label: 'Customer loyalty' },
  { value: 'content_sharing', label: 'Content sharing' },
]

interface FieldsDraft {
  name: string
  description: string
  color: string
  status: CampaignStatus
  goal: string
  start_date: string
  end_date: string
  post_goal: string
}

function draftFromCampaign(c: CampaignRow): FieldsDraft {
  return {
    name: c.name,
    description: c.description ?? '',
    color: c.color,
    status: c.status,
    goal: c.goal ?? '',
    start_date: c.start_date,
    end_date: c.end_date ?? '',
    post_goal: c.post_goal != null ? String(c.post_goal) : '',
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const inputClass =
  'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-60'

interface Props {
  campaign: CampaignRow
  initialMilestones: MilestoneRow[]
  initialLinkedEvents: LinkedEvent[]
  initialSessions: SessionRow[]
  allEvents: CrEventOption[]
  orgId: string
  canEdit: boolean
  /** Club timezone — session times must render identically on the Vercel (UTC) server and the browser. */
  timezone: string
}

export function CampaignDetail({
  campaign: initialCampaign,
  initialMilestones,
  initialLinkedEvents,
  initialSessions,
  allEvents,
  orgId,
  canEdit,
  timezone,
}: Props) {
  const { toast } = useToast()

  // --- Fields panel state ---
  const [campaign, setCampaign] = useState<CampaignRow>(initialCampaign)
  const [draft, setDraft] = useState<FieldsDraft>(() => draftFromCampaign(initialCampaign))
  const [savingFields, setSavingFields] = useState(false)

  // --- Milestones state ---
  const [milestones, setMilestones] = useState<MilestoneRow[]>(initialMilestones)
  const [msBusyId, setMsBusyId] = useState<string | null>(null)
  const [msEditingId, setMsEditingId] = useState<string | null>(null)
  const [msEditLabel, setMsEditLabel] = useState('')
  const [msEditDate, setMsEditDate] = useState('')
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const [newMsLabel, setNewMsLabel] = useState('')
  const [newMsDate, setNewMsDate] = useState('')
  const [addingMs, setAddingMs] = useState(false)

  // --- Linked events + sessions state ---
  const [linkedEvents, setLinkedEvents] = useState<LinkedEvent[]>(initialLinkedEvents)
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null)

  const isArchived = campaign.status === 'archived'

  const fieldsDirty =
    draft.name !== campaign.name ||
    draft.description !== (campaign.description ?? '') ||
    draft.color !== campaign.color ||
    draft.status !== campaign.status ||
    draft.goal !== (campaign.goal ?? '') ||
    draft.start_date !== campaign.start_date ||
    draft.end_date !== (campaign.end_date ?? '') ||
    draft.post_goal !== (campaign.post_goal != null ? String(campaign.post_goal) : '')

  function updateDraft(patch: Partial<FieldsDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  // ------------------------------------------------------------------
  // Fields panel handlers
  // ------------------------------------------------------------------

  async function applyCampaignUpdate(patch: Record<string, unknown>, successMsg: string) {
    setSavingFields(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('campaigns')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', campaign.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update returned no rows (blocked by RLS?)')
      }

      const updated = data[0] as CampaignRow
      setCampaign(updated)
      setDraft(draftFromCampaign(updated))
      toast(successMsg)
    } catch (err) {
      console.error('Failed to update campaign:', err)
      toast('Failed to update campaign. Please try again.', 'error')
    } finally {
      setSavingFields(false)
    }
  }

  async function handleSaveFields() {
    if (!draft.name.trim()) {
      toast('Campaign name is required.', 'error')
      return
    }
    if (!draft.start_date) {
      toast('Start date is required.', 'error')
      return
    }
    if (draft.end_date && draft.end_date < draft.start_date) {
      toast('End date must be on or after the start date.', 'error')
      return
    }

    await applyCampaignUpdate(
      {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        color: draft.color,
        status: draft.status,
        goal: draft.goal || null,
        start_date: draft.start_date,
        end_date: draft.end_date || null,
        post_goal: draft.post_goal ? parseInt(draft.post_goal, 10) : null,
      },
      'Campaign saved.'
    )
  }

  async function handleArchive() {
    // applyCampaignUpdate resets the draft from the server row, so warn
    // before silently discarding unsaved field edits.
    const msg = fieldsDirty
      ? 'Archive this campaign? Your unsaved field edits will be discarded.'
      : 'Archive this campaign? It will move to the archived section of the campaign list.'
    if (!confirm(msg)) return
    await applyCampaignUpdate({ status: 'archived' }, 'Campaign archived.')
  }

  async function handleRestore() {
    if (fieldsDirty && !confirm('Restore this campaign? Your unsaved field edits will be discarded.')) return
    await applyCampaignUpdate({ status: 'planning' }, 'Campaign restored.')
  }

  // ------------------------------------------------------------------
  // Milestone handlers
  // ------------------------------------------------------------------

  const sortedMilestones = [...milestones].sort(
    (a, b) => a.date.localeCompare(b.date) || a.display_order - b.display_order
  )

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault()
    if (!newMsLabel.trim() || !newMsDate) {
      toast('Milestone label and date are required.', 'error')
      return
    }

    setAddingMs(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const nextOrder =
        milestones.length > 0 ? Math.max(...milestones.map((m) => m.display_order)) + 1 : 0

      const { data, error } = await supabase
        .from('campaign_milestones')
        .insert({
          campaign_id: campaign.id,
          org_id: orgId,
          label: newMsLabel.trim(),
          date: newMsDate,
          display_order: nextOrder,
        })
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Insert returned no rows (blocked by RLS?)')
      }

      setMilestones((prev) => [...prev, data[0] as MilestoneRow])
      setNewMsLabel('')
      setNewMsDate('')
      setShowAddMilestone(false)
      toast('Milestone added.')
    } catch (err) {
      console.error('Failed to add milestone:', err)
      toast('Failed to add milestone. Please try again.', 'error')
    } finally {
      setAddingMs(false)
    }
  }

  function startEditMilestone(m: MilestoneRow) {
    // One shared edit state — don't silently discard another row's
    // typed-but-unsaved changes when switching.
    if (msEditingId && msEditingId !== m.id) {
      const editing = milestones.find((row) => row.id === msEditingId)
      const hasChanges = editing && (msEditLabel !== editing.label || msEditDate !== editing.date)
      if (hasChanges && !confirm('Discard unsaved changes to the milestone you were editing?')) return
    }
    setMsEditingId(m.id)
    setMsEditLabel(m.label)
    setMsEditDate(m.date)
  }

  async function handleSaveMilestone(m: MilestoneRow) {
    if (!msEditLabel.trim() || !msEditDate) {
      toast('Milestone label and date are required.', 'error')
      return
    }

    setMsBusyId(m.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('campaign_milestones')
        .update({ label: msEditLabel.trim(), date: msEditDate })
        .eq('id', m.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update returned no rows (blocked by RLS?)')
      }

      const updated = data[0] as MilestoneRow
      setMilestones((prev) => prev.map((row) => (row.id === m.id ? updated : row)))
      setMsEditingId(null)
      toast('Milestone saved.')
    } catch (err) {
      console.error('Failed to save milestone:', err)
      toast('Failed to save milestone. Please try again.', 'error')
    } finally {
      setMsBusyId(null)
    }
  }

  async function handleDeleteMilestone(m: MilestoneRow) {
    if (!confirm(`Delete milestone "${m.label}"?`)) return

    setMsBusyId(m.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('campaign_milestones')
        .delete()
        .eq('id', m.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Delete returned no rows (blocked by RLS?)')
      }

      setMilestones((prev) => prev.filter((row) => row.id !== m.id))
      toast('Milestone deleted.')
    } catch (err) {
      console.error('Failed to delete milestone:', err)
      toast('Failed to delete milestone. Please try again.', 'error')
    } finally {
      setMsBusyId(null)
    }
  }

  // ------------------------------------------------------------------
  // Linked event handlers
  // ------------------------------------------------------------------

  const linkedIds = new Set(linkedEvents.map((e) => e.cr_event_id))
  const pickerResults = allEvents
    .filter((ev) => !linkedIds.has(ev.id))
    .filter((ev) => {
      const q = pickerQuery.trim().toLowerCase()
      if (!q) return true
      return (
        ev.name.toLowerCase().includes(q) ||
        (ev.cr_category_name ?? '').toLowerCase().includes(q)
      )
    })

  async function handleLinkEvent(ev: CrEventOption) {
    setLinkBusyId(ev.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('campaign_linked_events')
        .insert({ campaign_id: campaign.id, cr_event_id: ev.id, org_id: orgId })
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Insert returned no rows (blocked by RLS?)')
      }

      // The link is committed — reflect it immediately so a failure in the
      // follow-up sessions fetch can't leave the UI claiming it's unlinked
      // (re-clicking would then hit the unique-key violation).
      setLinkedEvents((prev) => [
        ...prev,
        { cr_event_id: ev.id, name: ev.name, cr_category_name: ev.cr_category_name },
      ])

      // Pull this event's sessions so the auto table stays in sync without a reload.
      const { data: newSessions, error: sessErr } = await supabase
        .from('cr_event_sessions')
        .select('id, cr_event_id, start_time, end_time, registration_count')
        .eq('org_id', orgId)
        .eq('cr_event_id', ev.id)
        .order('start_time')
      if (sessErr) {
        // Non-fatal: the link succeeded; only the sessions display is stale.
        console.error('Linked event but failed to fetch its sessions:', sessErr)
        toast(`Linked "${ev.name}" — refresh the page to see its sessions`, 'error')
        return
      }

      setSessions((prev) =>
        [...prev, ...((newSessions ?? []) as SessionRow[])].sort((a, b) =>
          a.start_time.localeCompare(b.start_time)
        )
      )
      toast(`Linked "${ev.name}".`)
    } catch (err) {
      console.error('Failed to link event:', err)
      toast('Failed to link event. Please try again.', 'error')
    } finally {
      setLinkBusyId(null)
    }
  }

  async function handleUnlinkEvent(ev: LinkedEvent) {
    if (!confirm(`Unlink "${ev.name}" from this campaign? Its sessions will no longer appear here.`)) return

    setLinkBusyId(ev.cr_event_id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('campaign_linked_events')
        .delete()
        .eq('campaign_id', campaign.id)
        .eq('cr_event_id', ev.cr_event_id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Delete returned no rows (blocked by RLS?)')
      }

      setLinkedEvents((prev) => prev.filter((e) => e.cr_event_id !== ev.cr_event_id))
      setSessions((prev) => prev.filter((s) => s.cr_event_id !== ev.cr_event_id))
      toast(`Unlinked "${ev.name}".`)
    } catch (err) {
      console.error('Failed to unlink event:', err)
      toast('Failed to unlink event. Please try again.', 'error')
    } finally {
      setLinkBusyId(null)
    }
  }

  // ------------------------------------------------------------------
  // Sessions (derived)
  // ------------------------------------------------------------------

  const eventNameById = new Map(linkedEvents.map((e) => [e.cr_event_id, e.name]))
  const nowIso = new Date().toISOString()
  const upcomingSessions = sessions.filter((s) => s.start_time >= nowIso)
  const pastSessions = sessions.filter((s) => s.start_time < nowIso).reverse() // most recent first

  function formatSessionStart(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      // Club timezone, not server/browser default — Vercel SSR runs in UTC.
      timeZone: timezone,
    })
  }

  function sessionRow(s: SessionRow, dimmed: boolean) {
    return (
      <tr key={s.id} className={dimmed ? 'opacity-50' : 'hover:bg-gray-800/30 transition-colors'}>
        <td className="px-4 py-2.5 text-white font-medium">
          {eventNameById.get(s.cr_event_id) ?? '—'}
        </td>
        {/* suppressHydrationWarning: SSR renders in the server timezone; the browser re-renders locally. */}
        <td className="px-4 py-2.5 text-gray-300" suppressHydrationWarning>
          {formatSessionStart(s.start_time)}
        </td>
        <td className="px-4 py-2.5 text-right text-gray-300 font-mono">{s.registration_count}</td>
      </tr>
    )
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/calendar/campaigns"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          &larr; Back to Campaigns
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span
          className="w-4 h-4 rounded-full border border-gray-700 shrink-0"
          style={{ backgroundColor: campaign.color }}
        />
        <h2 className="text-2xl font-bold">{campaign.name}</h2>
        {isArchived && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-500/10 text-gray-500">
            Archived
          </span>
        )}
      </div>

      {/* ---------------- Fields panel ---------------- */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Campaign Details</h3>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveFields}
                disabled={!fieldsDirty || savingFields}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {savingFields ? 'Saving...' : 'Save'}
              </button>
              {isArchived ? (
                <button
                  onClick={handleRestore}
                  disabled={savingFields}
                  className="px-3 py-2 bg-gray-800 hover:bg-green-600/20 border border-gray-700 hover:border-green-600/40 disabled:opacity-50 text-gray-300 hover:text-green-400 text-xs font-medium rounded-lg transition-colors"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={handleArchive}
                  disabled={savingFields}
                  className="px-3 py-2 bg-gray-800 hover:bg-red-600/20 border border-gray-700 hover:border-red-600/40 disabled:opacity-50 text-gray-400 hover:text-red-400 text-xs font-medium rounded-lg transition-colors"
                >
                  Archive
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                disabled={!canEdit || savingFields}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateDraft({ color: c })}
                    disabled={!canEdit || savingFields}
                    title={c}
                    className={`w-7 h-7 rounded-full border-2 transition-transform disabled:opacity-60 ${
                      draft.color === c
                        ? 'border-white scale-110'
                        : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => updateDraft({ color: e.target.value })}
                  disabled={!canEdit || savingFields}
                  title="Custom color"
                  className="h-8 w-9 p-1 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
              disabled={!canEdit || savingFields}
              rows={2}
              placeholder="Optional"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Status</label>
              <select
                value={draft.status}
                onChange={(e) => updateDraft({ status: e.target.value as CampaignStatus })}
                disabled={!canEdit || savingFields}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Goal</label>
              <select
                value={draft.goal}
                onChange={(e) => updateDraft({ goal: e.target.value })}
                disabled={!canEdit || savingFields}
                className={inputClass}
              >
                <option value="">None</option>
                {GOAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Start date *</label>
              <input
                type="date"
                value={draft.start_date}
                onChange={(e) => updateDraft({ start_date: e.target.value })}
                disabled={!canEdit || savingFields}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">End date</label>
              <input
                type="date"
                value={draft.end_date}
                onChange={(e) => updateDraft({ end_date: e.target.value })}
                min={draft.start_date || undefined}
                disabled={!canEdit || savingFields}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Post goal</label>
              <input
                type="number"
                min={0}
                value={draft.post_goal}
                onChange={(e) => updateDraft({ post_goal: e.target.value })}
                disabled={!canEdit || savingFields}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Milestones ---------------- */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Milestones</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Date anchors for this campaign — they render as labeled pills on the calendar.
            </p>
          </div>
          {canEdit && !showAddMilestone && (
            <button
              onClick={() => setShowAddMilestone(true)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              + Add milestone
            </button>
          )}
        </div>

        {showAddMilestone && (
          <form
            onSubmit={handleAddMilestone}
            className="px-5 py-4 border-b border-gray-800 bg-gray-800/20 flex flex-col sm:flex-row gap-3 sm:items-end"
          >
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Label *</label>
              <input
                type="text"
                value={newMsLabel}
                onChange={(e) => setNewMsLabel(e.target.value)}
                required
                placeholder="e.g. Registration opens"
                className={inputClass}
              />
            </div>
            <div className="shrink-0">
              <label className="block text-xs text-gray-400 mb-1">Date *</label>
              <input
                type="date"
                value={newMsDate}
                onChange={(e) => setNewMsDate(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={addingMs}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {addingMs ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddMilestone(false)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {sortedMilestones.length === 0 ? (
          <div className="px-5 py-4">
            <p className="text-sm text-gray-500">
              No milestones yet. Add anchors like &quot;Registration opens&quot; or &quot;Early
              bird ends&quot;.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {sortedMilestones.map((m) => {
              const busy = msBusyId === m.id
              const editing = msEditingId === m.id

              if (editing) {
                return (
                  <div
                    key={m.id}
                    className="px-5 py-3 flex flex-col sm:flex-row gap-3 sm:items-end"
                  >
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">Label *</label>
                      <input
                        type="text"
                        value={msEditLabel}
                        onChange={(e) => setMsEditLabel(e.target.value)}
                        disabled={busy}
                        className={inputClass}
                      />
                    </div>
                    <div className="shrink-0">
                      <label className="block text-xs text-gray-400 mb-1">Date *</label>
                      <input
                        type="date"
                        value={msEditDate}
                        onChange={(e) => setMsEditDate(e.target.value)}
                        disabled={busy}
                        className={inputClass}
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleSaveMilestone(m)}
                        disabled={busy}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        {busy ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setMsEditingId(null)}
                        disabled={busy}
                        className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Yellow flag dot — matches the yellow milestone pills on the calendar. */}
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />
                    <span className="text-sm text-white font-medium truncate">{m.label}</span>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(m.date)}</span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => startEditMilestone(m)}
                        disabled={busy}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 text-gray-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMilestone(m)}
                        disabled={busy}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-red-600/20 border border-gray-700 hover:border-red-600/40 disabled:opacity-50 text-gray-400 hover:text-red-400 text-xs font-medium rounded-lg transition-colors"
                      >
                        {busy ? 'Working...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------------- Linked CR events ---------------- */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Linked Court Reserve Events</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Sessions from linked events flow into this campaign automatically.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => {
                setPickerQuery('')
                setShowPicker(true)
              }}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              + Link CR event
            </button>
          )}
        </div>

        <div className="px-5 py-4">
          {linkedEvents.length === 0 ? (
            allEvents.length === 0 ? (
              <p className="text-sm text-gray-500">
                No synced Court Reserve events yet. Go to{' '}
                <Link
                  href="/settings/integrations"
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Settings &rarr; Integrations
                </Link>{' '}
                and run Sync Now to mirror your events.
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                No events linked yet. Link a Court Reserve event to pull its sessions into this
                campaign.
              </p>
            )
          ) : (
            <div className="flex flex-wrap gap-2">
              {linkedEvents.map((ev) => (
                <span
                  key={ev.cr_event_id}
                  className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 bg-gray-800 border border-gray-700 rounded-full text-sm"
                >
                  <span className="text-white font-medium">{ev.name}</span>
                  {ev.cr_category_name && (
                    <span className="text-xs text-gray-400">{ev.cr_category_name}</span>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleUnlinkEvent(ev)}
                      disabled={linkBusyId === ev.cr_event_id}
                      title="Unlink event"
                      className="w-5 h-5 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 hover:bg-red-600/20 disabled:opacity-50 transition-colors"
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Link event picker modal ---------------- */}
      {showPicker && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 pt-[10vh]"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Link a Court Reserve event</h3>
              <button
                onClick={() => setShowPicker(false)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
            <div className="p-4">
              {allEvents.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No synced Court Reserve events yet. Go to{' '}
                  <Link
                    href="/settings/integrations"
                    className="text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    Settings &rarr; Integrations
                  </Link>{' '}
                  and run Sync Now to mirror your events, then come back here.
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    autoFocus
                    placeholder="Search by event name or category..."
                    className={inputClass}
                  />
                  <div className="mt-3 max-h-72 overflow-y-auto divide-y divide-gray-800/50 border border-gray-800 rounded-lg">
                    {pickerResults.length === 0 ? (
                      <p className="text-sm text-gray-500 px-4 py-3">
                        {pickerQuery
                          ? 'No events match that search.'
                          : 'All synced events are already linked.'}
                      </p>
                    ) : (
                      pickerResults.map((ev) => (
                        <button
                          key={ev.id}
                          onClick={() => handleLinkEvent(ev)}
                          disabled={linkBusyId !== null}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-800/50 disabled:opacity-50 transition-colors"
                        >
                          <span className="text-sm text-white font-medium">
                            {linkBusyId === ev.id ? 'Linking...' : ev.name}
                          </span>
                          {ev.cr_category_name && (
                            <span className="text-xs text-gray-400 ml-2">
                              {ev.cr_category_name}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Sessions (auto) ---------------- */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Sessions</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Pulled from linked events — updates automatically from Court Reserve sync.
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="px-5 py-4">
            <p className="text-sm text-gray-500">
              {linkedEvents.length === 0
                ? 'Link a Court Reserve event above to see its sessions here.'
                : 'No synced sessions for the linked events yet. Sessions appear after the next Court Reserve sync (events need at least one registration to be visible).'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/40 border-b border-gray-800">
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 font-medium">Starts</th>
                  <th className="px-4 py-2.5 font-medium text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {upcomingSessions.length > 0 && (
                  <tr className="bg-gray-800/20">
                    <td
                      colSpan={3}
                      className="px-4 py-1.5 text-[10px] uppercase tracking-wide text-gray-500"
                    >
                      Upcoming
                    </td>
                  </tr>
                )}
                {upcomingSessions.map((s) => sessionRow(s, false))}
                {pastSessions.length > 0 && (
                  <tr className="bg-gray-800/20">
                    <td
                      colSpan={3}
                      className="px-4 py-1.5 text-[10px] uppercase tracking-wide text-gray-500"
                    >
                      Past
                    </td>
                  </tr>
                )}
                {pastSessions.map((s) => sessionRow(s, true))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
