'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ContentPlatform, ContentType, ContentStatus } from '@/types/database'

interface ContentEntry {
  id: string
  title: string
  description: string | null
  platform: ContentPlatform
  content_type: ContentType
  scheduled_date: string
  scheduled_time: string | null
  status: ContentStatus
  assigned_to: string | null
  notes: string | null
  assigned_profile: { full_name: string } | null
}

interface StaffMember {
  id: string
  full_name: string
}

const platformOptions: { value: ContentPlatform; label: string; color: string }[] = [
  { value: 'instagram', label: 'Instagram', color: 'bg-pink-500/10 text-pink-400' },
  { value: 'facebook', label: 'Facebook', color: 'bg-blue-500/10 text-blue-400' },
  { value: 'tiktok', label: 'TikTok', color: 'bg-purple-500/10 text-purple-400' },
  { value: 'email', label: 'Email', color: 'bg-green-500/10 text-green-400' },
  { value: 'other', label: 'Other', color: 'bg-gray-500/10 text-gray-400' },
]

const typeOptions: { value: ContentType; label: string }[] = [
  { value: 'post', label: 'Post' },
  { value: 'story', label: 'Story' },
  { value: 'reel', label: 'Reel' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
]

const statusOptions: { value: ContentStatus; label: string; color: string }[] = [
  { value: 'planned', label: 'Planned', color: 'bg-gray-700' },
  { value: 'draft', label: 'Draft', color: 'bg-yellow-600' },
  { value: 'ready', label: 'Ready', color: 'bg-blue-600' },
  { value: 'posted', label: 'Posted', color: 'bg-green-600' },
  { value: 'skipped', label: 'Skipped', color: 'bg-gray-600' },
]

export function ContentCalendarView({
  initialContent,
  orgId,
  staff,
}: {
  initialContent: ContentEntry[]
  orgId: string
  staff: StaffMember[]
}) {
  const [content, setContent] = useState(initialContent)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // viewMonth is 'YYYY-MM'. Parse via local components — new Date('YYYY-MM-01')
  // is UTC midnight, i.e. the previous local day in US timezones, which made
  // the month header wrong and the forward button a no-op.
  const [viewYear, viewMonthNum] = viewMonth.split('-').map(Number)
  const monthStart = new Date(viewYear, viewMonthNum - 1, 1)
  const monthName = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Group content by date
  const byDate = content.reduce<Record<string, ContentEntry[]>>((acc, item) => {
    if (!acc[item.scheduled_date]) acc[item.scheduled_date] = []
    acc[item.scheduled_date].push(item)
    return acc
  }, {})

  // Generate days of the month
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const firstDayOfWeek = monthStart.getDay()
  const days: (number | null)[] = Array(firstDayOfWeek).fill(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonthNum - 1 + delta, 1)
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const prevMonth = () => shiftMonth(-1)
  const nextMonth = () => shiftMonth(1)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Read the form BEFORE any await — e.currentTarget is null once the
    // handler yields, which made this throw mid-save and left the button
    // spinning forever with nothing persisted.
    const form = new FormData(e.currentTarget)
    setLoading(true)
    setError('')

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error: err } = await supabase
        .from('content_calendar')
        .insert({
          org_id: orgId,
          title: form.get('title') as string,
          description: (form.get('description') as string) || null,
          platform: form.get('platform') as ContentPlatform,
          content_type: form.get('content_type') as ContentType,
          scheduled_date: form.get('scheduled_date') as string,
          scheduled_time: (form.get('scheduled_time') as string) || null,
          status: 'planned',
          assigned_to: (form.get('assigned_to') as string) || null,
          notes: (form.get('notes') as string) || null,
        })
        .select('*, assigned_profile:profiles!content_calendar_assigned_to_fkey(full_name)')
        .single()

      if (err) {
        setError(err.message)
      } else if (data) {
        setContent((prev) => [...prev, data].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)))
        setShowForm(false)
      }
    } catch (err) {
      console.error('Content save failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(id: string, newStatus: ContentStatus) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    await supabase.from('content_calendar').update({ status: newStatus }).eq('id', id)
    setContent((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)))
  }

  async function handleDelete(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    await supabase.from('content_calendar').delete().eq('id', id)
    setContent((prev) => prev.filter((c) => c.id !== id))
    setEditingId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Content Calendar</h2>
          <p className="text-gray-400 text-sm mt-1">Plan and track content across platforms</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/calendar/campaigns"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Campaigns
          </Link>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New Content
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {showForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-semibold text-white mb-4">Schedule Content</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
                <input name="title" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Post title..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Platform</label>
                  <select name="platform" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                    {platformOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
                  <select name="content_type" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                    {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Date *</label>
                <input name="scheduled_date" type="date" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Time</label>
                <input name="scheduled_time" type="time" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Assign to</label>
                <select name="assigned_to" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
              <textarea name="description" rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Content details, copy, hashtags..." />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {loading ? 'Saving...' : 'Schedule'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-gray-400 hover:text-white px-3 py-1 rounded hover:bg-gray-800">←</button>
        <h3 className="text-lg font-semibold">{monthName}</h3>
        <button onClick={nextMonth} className="text-gray-400 hover:text-white px-3 py-1 rounded hover:bg-gray-800">→</button>
      </div>

      {/* Calendar grid */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-800">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-gray-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-800/50 bg-gray-900/50" />
            const dateStr = `${viewMonth}-${String(day).padStart(2, '0')}`
            const dayContent = byDate[dateStr] || []
            const isToday = dateStr === new Date().toISOString().split('T')[0]

            return (
              <div key={day} className={`min-h-[80px] border-b border-r border-gray-800/50 p-1 ${isToday ? 'bg-orange-500/5' : ''}`}>
                <div className={`text-xs mb-1 ${isToday ? 'text-orange-400 font-bold' : 'text-gray-500'}`}>{day}</div>
                {dayContent.map((item) => {
                  const plat = platformOptions.find((p) => p.value === item.platform)
                  return (
                    <button
                      key={item.id}
                      onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                      className={`w-full text-left text-[10px] px-1 py-0.5 rounded mb-0.5 truncate ${plat?.color || 'bg-gray-700 text-gray-300'}`}
                    >
                      {item.title}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel for selected item */}
      {editingId && (() => {
        const item = content.find((c) => c.id === editingId)
        if (!item) return null
        const plat = platformOptions.find((p) => p.value === item.platform)
        return (
          <div className="mt-4 bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">{item.title}</h3>
              <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-white text-sm">✕</button>
            </div>
            <div className="flex gap-2 mb-3 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded ${plat?.color}`}>{plat?.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300">{item.content_type}</span>
              <span className="text-[10px] text-gray-500">
                {new Date(item.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {item.scheduled_time ? ` at ${item.scheduled_time}` : ''}
              </span>
              {item.assigned_profile && <span className="text-[10px] text-gray-500">{item.assigned_profile.full_name}</span>}
            </div>
            {item.description && <p className="text-sm text-gray-400 mb-3">{item.description}</p>}
            <div className="flex gap-2 flex-wrap">
              {statusOptions.map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleStatusChange(item.id, s.value)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                    item.status === s.value
                      ? `${s.color} text-white`
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <button
                onClick={() => handleDelete(item.id)}
                className="text-xs px-2.5 py-1 rounded-lg text-red-400 hover:bg-red-500/10 ml-auto"
              >
                Delete
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
