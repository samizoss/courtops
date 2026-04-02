'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Shift } from '@/types/database'

interface ChecklistItem {
  id: string
  template_id: string
  org_id: string
  label: string
  sort_order: number
  created_at: string
}

interface ChecklistTemplate {
  id: string
  org_id: string
  name: string
  shift: Shift
  sort_order: number
  is_active: boolean
  created_at: string
  checklist_items: ChecklistItem[]
}

interface Props {
  templates: ChecklistTemplate[]
  orgId: string
}

const shiftColors: Record<string, string> = {
  opening: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  midday: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  closing: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  custom: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
}

const shiftOptions: Shift[] = ['opening', 'midday', 'closing', 'custom']

export function ChecklistAdmin({ templates, orgId }: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // New template form
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newShift, setNewShift] = useState<Shift>('opening')

  // New item form
  const [showNewItem, setShowNewItem] = useState(false)
  const [newItemLabel, setNewItemLabel] = useState('')

  // Inline edit for item labels
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null

  async function getSupabase() {
    const { createClient } = await import('@/lib/supabase/client')
    return createClient()
  }

  // ── Template CRUD ──

  async function createTemplate() {
    if (!newName.trim()) return
    setLoading(true)
    const supabase = await getSupabase()
    const maxSort = templates.reduce((max, t) => Math.max(max, t.sort_order), 0)
    await supabase.from('checklist_templates').insert({
      org_id: orgId,
      name: newName.trim(),
      shift: newShift,
      sort_order: maxSort + 1,
      is_active: true,
    })
    setNewName('')
    setNewShift('opening')
    setShowNewForm(false)
    setLoading(false)
    router.refresh()
  }

  async function toggleActive(template: ChecklistTemplate) {
    setLoading(true)
    const supabase = await getSupabase()
    await supabase
      .from('checklist_templates')
      .update({ is_active: !template.is_active })
      .eq('id', template.id)
    setLoading(false)
    router.refresh()
  }

  async function deleteTemplate(template: ChecklistTemplate) {
    if (!confirm(`Delete "${template.name}" and all its items? This cannot be undone.`)) return
    setLoading(true)
    const supabase = await getSupabase()
    // Delete items first, then template
    await supabase.from('checklist_items').delete().eq('template_id', template.id)
    await supabase.from('checklist_templates').delete().eq('id', template.id)
    if (selectedId === template.id) setSelectedId(null)
    setLoading(false)
    router.refresh()
  }

  // ── Item CRUD ──

  async function addItem() {
    if (!newItemLabel.trim() || !selectedTemplate) return
    setLoading(true)
    const supabase = await getSupabase()
    const maxSort = selectedTemplate.checklist_items.reduce((max, i) => Math.max(max, i.sort_order), 0)
    await supabase.from('checklist_items').insert({
      template_id: selectedTemplate.id,
      org_id: orgId,
      label: newItemLabel.trim(),
      sort_order: maxSort + 1,
    })
    setNewItemLabel('')
    setShowNewItem(false)
    setLoading(false)
    router.refresh()
  }

  async function updateItemLabel(item: ChecklistItem) {
    if (!editingLabel.trim() || editingLabel.trim() === item.label) {
      setEditingItemId(null)
      return
    }
    setLoading(true)
    const supabase = await getSupabase()
    await supabase
      .from('checklist_items')
      .update({ label: editingLabel.trim() })
      .eq('id', item.id)
    setEditingItemId(null)
    setLoading(false)
    router.refresh()
  }

  async function deleteItem(item: ChecklistItem) {
    if (!confirm(`Delete "${item.label}"?`)) return
    setLoading(true)
    const supabase = await getSupabase()
    await supabase.from('checklist_items').delete().eq('id', item.id)
    setLoading(false)
    router.refresh()
  }

  async function moveItem(item: ChecklistItem, direction: 'up' | 'down') {
    if (!selectedTemplate) return
    const items = [...selectedTemplate.checklist_items]
    const idx = items.findIndex((i) => i.id === item.id)
    if (direction === 'up' && idx <= 0) return
    if (direction === 'down' && idx >= items.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    // Swap sort_order values
    const tempSort = items[idx].sort_order
    items[idx].sort_order = items[swapIdx].sort_order
    items[swapIdx].sort_order = tempSort

    setLoading(true)
    const supabase = await getSupabase()
    await Promise.all([
      supabase.from('checklist_items').update({ sort_order: items[idx].sort_order }).eq('id', items[idx].id),
      supabase.from('checklist_items').update({ sort_order: items[swapIdx].sort_order }).eq('id', items[swapIdx].id),
    ])
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Template List ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Templates</h3>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showNewForm ? 'Cancel' : 'New Template'}
          </button>
        </div>

        {showNewForm && (
          <div className="bg-gray-900 rounded-xl p-4 mb-4 space-y-3">
            <input
              type="text"
              placeholder="Template name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createTemplate()}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-600"
              autoFocus
            />
            <select
              value={newShift}
              onChange={(e) => setNewShift(e.target.value as Shift)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-600"
            >
              {shiftOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={createTemplate}
              disabled={loading || !newName.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Create
            </button>
          </div>
        )}

        <div className="space-y-2">
          {templates.length === 0 && !showNewForm && (
            <div className="bg-gray-900 rounded-xl p-8 text-center">
              <p className="text-gray-400">No templates yet.</p>
            </div>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              className={`bg-gray-900 rounded-xl p-4 cursor-pointer transition-colors border-2 ${
                selectedId === t.id ? 'border-orange-600' : 'border-transparent hover:border-gray-700'
              }`}
              onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-200 truncate">{t.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${shiftColors[t.shift]}`}>
                    {t.shift}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${
                    t.is_active
                      ? 'bg-green-500/10 text-green-400 border-green-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}>
                    {t.is_active ? 'active' : 'inactive'}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {t.checklist_items.length} item{t.checklist_items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleActive(t)}
                    disabled={loading}
                    className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
                    title={t.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {t.is_active ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => deleteTemplate(t)}
                    disabled={loading}
                    className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete template"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Item Editor ── */}
      <div>
        {selectedTemplate ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Items &mdash; {selectedTemplate.name}
              </h3>
              <button
                onClick={() => setShowNewItem(!showNewItem)}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {showNewItem ? 'Cancel' : 'Add Item'}
              </button>
            </div>

            <div className="space-y-2">
              {selectedTemplate.checklist_items.length === 0 && !showNewItem && (
                <div className="bg-gray-900 rounded-xl p-8 text-center">
                  <p className="text-gray-400">No items yet. Add one to get started.</p>
                </div>
              )}
              {selectedTemplate.checklist_items.map((item, idx) => (
                <div key={item.id} className="bg-gray-900 rounded-xl p-3 flex items-center gap-2">
                  {/* Reorder arrows */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveItem(item, 'up')}
                      disabled={loading || idx === 0}
                      className="p-0.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-200 disabled:opacity-30 transition-colors"
                      title="Move up"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveItem(item, 'down')}
                      disabled={loading || idx === selectedTemplate.checklist_items.length - 1}
                      className="p-0.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-200 disabled:opacity-30 transition-colors"
                      title="Move down"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Label (editable on click) */}
                  <div className="flex-1 min-w-0">
                    {editingItemId === item.id ? (
                      <input
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateItemLabel(item)
                          if (e.key === 'Escape') setEditingItemId(null)
                        }}
                        onBlur={() => updateItemLabel(item)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-600"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingItemId(item.id)
                          setEditingLabel(item.label)
                        }}
                        className="text-sm text-gray-200 hover:text-white text-left truncate w-full"
                        title="Click to edit"
                      >
                        {item.label}
                      </button>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => deleteItem(item)}
                    disabled={loading}
                    className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
                    title="Delete item"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Add item form */}
              {showNewItem && (
                <div className="bg-gray-900 rounded-xl p-3 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Item label"
                    value={newItemLabel}
                    onChange={(e) => setNewItemLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addItem()
                      if (e.key === 'Escape') { setShowNewItem(false); setNewItemLabel('') }
                    }}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-600"
                    autoFocus
                  />
                  <button
                    onClick={addItem}
                    disabled={loading || !newItemLabel.trim()}
                    className="px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-gray-900 rounded-xl p-8 text-center mt-10 lg:mt-0">
            <p className="text-gray-400">Select a template to edit its items.</p>
          </div>
        )}
      </div>
    </div>
  )
}
