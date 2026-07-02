'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/toast'
import {
  CHANNEL_CATALOG,
  FORMAT_DEFINITIONS,
  formatLabel,
  allowedFormats,
  type ChannelType,
  type ContentFormat,
} from '@/lib/content-channels'

export interface ContentChannelRow {
  id: string
  org_id: string
  channel_type: string
  name: string
  url: string | null
  enabled_formats: string[]
  is_active: boolean
  display_order: number
  created_at: string
}

interface Draft {
  name: string
  url: string
  enabled_formats: string[]
}

interface Props {
  channels: ContentChannelRow[]
  orgId: string
  canEdit: boolean
}

const CATALOG_TYPES = Object.keys(CHANNEL_CATALOG) as ChannelType[]

function draftFromRow(row: ContentChannelRow): Draft {
  return {
    name: row.name,
    url: row.url ?? '',
    enabled_formats: [...row.enabled_formats],
  }
}

function sameFormats(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((f) => setB.has(f))
}

export function ChannelsSettings({ channels, orgId, canEdit }: Props) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ContentChannelRow[]>(channels)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(channels.map((c) => [c.id, draftFromRow(c)]))
  )
  const [savingId, setSavingId] = useState<string | null>(null)
  const [insertingType, setInsertingType] = useState<ChannelType | null>(null)

  function isDirty(row: ContentChannelRow): boolean {
    const draft = drafts[row.id]
    if (!draft) return false
    return (
      draft.name !== row.name ||
      draft.url !== (row.url ?? '') ||
      !sameFormats(draft.enabled_formats, row.enabled_formats)
    )
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function toggleFormat(id: string, format: ContentFormat) {
    setDrafts((prev) => {
      const draft = prev[id]
      const has = draft.enabled_formats.includes(format)
      return {
        ...prev,
        [id]: {
          ...draft,
          enabled_formats: has
            ? draft.enabled_formats.filter((f) => f !== format)
            : [...draft.enabled_formats, format],
        },
      }
    })
  }

  async function handleInsert(type: ChannelType) {
    setInsertingType(type)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const nextOrder =
        rows.length > 0 ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0

      const { data, error } = await supabase
        .from('content_channels')
        .insert({
          org_id: orgId,
          channel_type: type,
          name: CHANNEL_CATALOG[type].label,
          url: null,
          enabled_formats: allowedFormats(type),
          is_active: true,
          display_order: nextOrder,
        })
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Insert returned no rows (blocked by RLS?)')
      }

      window.location.reload()
    } catch (err) {
      console.error('Failed to enable channel:', err)
      toast('Failed to enable channel. Please try again.', 'error')
      setInsertingType(null)
    }
  }

  async function handleSave(row: ContentChannelRow) {
    const draft = drafts[row.id]
    if (!draft) return
    if (!draft.name.trim()) {
      toast('Channel name is required.', 'error')
      return
    }

    setSavingId(row.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const updates = {
        name: draft.name.trim(),
        url: draft.url.trim() || null,
        enabled_formats: draft.enabled_formats,
      }

      const { data, error } = await supabase
        .from('content_channels')
        .update(updates)
        .eq('id', row.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update returned no rows (blocked by RLS?)')
      }

      const updated = data[0] as ContentChannelRow
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      setDrafts((prev) => ({ ...prev, [row.id]: draftFromRow(updated) }))
      toast('Channel saved.')
    } catch (err) {
      console.error('Failed to save channel:', err)
      toast('Failed to save channel. Please try again.', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function handleSetActive(row: ContentChannelRow, isActive: boolean) {
    setSavingId(row.id)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('content_channels')
        .update({ is_active: isActive })
        .eq('id', row.id)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Update returned no rows (blocked by RLS?)')
      }

      const updated = data[0] as ContentChannelRow
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      toast(isActive ? 'Channel re-enabled.' : 'Channel disabled.')
    } catch (err) {
      console.error('Failed to update channel status:', err)
      toast('Failed to update channel status. Please try again.', 'error')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/settings/content"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          &larr; Back to Content Settings
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">Channels</h2>
        <p className="text-gray-400 text-sm mt-1">
          All channels start off. Enable the ones your club actually uses, then pick which
          formats each channel supports — the content calendar only offers what you enable here.
        </p>
      </div>

      <div className="space-y-6">
        {CATALOG_TYPES.map((type) => {
          const catalog = CHANNEL_CATALOG[type]
          const instances = rows
            .filter((r) => r.channel_type === type)
            .sort(
              (a, b) =>
                a.display_order - b.display_order ||
                a.created_at.localeCompare(b.created_at)
            )
          const formats = allowedFormats(type)

          return (
            <div
              key={type}
              className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold">{catalog.label}</h3>
                  {catalog.supports_multi_instance && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Supports multiple instances
                    </p>
                  )}
                </div>
                {canEdit && instances.length === 0 && (
                  <button
                    onClick={() => handleInsert(type)}
                    disabled={insertingType === type}
                    className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {insertingType === type ? 'Enabling...' : 'Enable'}
                  </button>
                )}
                {canEdit && instances.length > 0 && catalog.supports_multi_instance && (
                  <button
                    onClick={() => handleInsert(type)}
                    disabled={insertingType === type}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 text-gray-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    {insertingType === type ? 'Adding...' : '+ Add another'}
                  </button>
                )}
              </div>

              {instances.length === 0 ? (
                <div className="px-5 py-4">
                  <p className="text-sm text-gray-500">Not enabled for this club.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800/50">
                  {instances.map((inst) => {
                    const draft = drafts[inst.id] ?? draftFromRow(inst)
                    const dirty = isDirty(inst)
                    const busy = savingId === inst.id
                    // Lock inputs while this instance saves so in-flight edits
                    // aren't reverted when the response overwrites the draft.
                    const editable = canEdit && inst.is_active && !busy

                    return (
                      <div
                        key={inst.id}
                        className={`px-5 py-4 ${!inst.is_active ? 'opacity-50' : ''}`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Name</label>
                              <input
                                type="text"
                                value={draft.name}
                                onChange={(e) => updateDraft(inst.id, { name: e.target.value })}
                                disabled={!editable}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-60"
                              />
                            </div>
                            {catalog.has_url && (
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">URL</label>
                                <input
                                  type="url"
                                  value={draft.url}
                                  onChange={(e) => updateDraft(inst.id, { url: e.target.value })}
                                  disabled={!editable}
                                  placeholder="https://..."
                                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-60"
                                />
                              </div>
                            )}
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-gray-400 mb-1.5">Formats</label>
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {formats.map((f) => (
                                  <label
                                    key={f}
                                    title={FORMAT_DEFINITIONS[f]}
                                    className={`flex items-center gap-1.5 text-xs ${
                                      editable
                                        ? 'text-gray-300 cursor-pointer'
                                        : 'text-gray-500'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={draft.enabled_formats.includes(f)}
                                      onChange={() => toggleFormat(inst.id, f)}
                                      disabled={!editable}
                                      className="accent-orange-600"
                                    />
                                    {formatLabel(f)}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          {canEdit && (
                            <div className="flex items-center gap-2 lg:pt-5 shrink-0">
                              {inst.is_active ? (
                                <>
                                  <button
                                    onClick={() => handleSave(inst)}
                                    disabled={!dirty || busy}
                                    className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
                                  >
                                    {busy ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    onClick={() => handleSetActive(inst, false)}
                                    disabled={busy}
                                    className="px-3 py-1.5 bg-gray-800 hover:bg-red-600/20 border border-gray-700 hover:border-red-600/40 disabled:opacity-50 text-gray-400 hover:text-red-400 text-xs font-medium rounded-lg transition-colors"
                                  >
                                    Disable
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleSetActive(inst, true)}
                                  disabled={busy}
                                  className="px-3 py-1.5 bg-gray-800 hover:bg-green-600/20 border border-gray-700 hover:border-green-600/40 disabled:opacity-50 text-gray-300 hover:text-green-400 text-xs font-medium rounded-lg transition-colors"
                                >
                                  {busy ? 'Working...' : 'Re-enable'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {!inst.is_active && (
                          <p className="text-[11px] text-gray-600 mt-2">
                            Disabled — this channel is hidden from planning until re-enabled.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
