'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/toast'

const PALETTE = [
  '#f97316', // orange (default)
  '#2563eb',
  '#16a34a',
  '#9333ea',
  '#eab308',
  '#dc2626',
  '#0d9488',
  '#64748b',
]

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
]

const GOAL_OPTIONS = [
  { value: 'brand_awareness', label: 'Brand awareness' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'follower_growth', label: 'Follower growth' },
  { value: 'event_attendance', label: 'Event attendance' },
  { value: 'sales_growth', label: 'Sales growth' },
  { value: 'customer_loyalty', label: 'Customer loyalty' },
  { value: 'content_sharing', label: 'Content sharing' },
]

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

interface Props {
  orgId: string
  userId: string
}

export function NewCampaignForm({ orgId, userId }: Props) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [status, setStatus] = useState('planning')
  const [goal, setGoal] = useState('')
  const [startDate, setStartDate] = useState(todayLocal)
  const [endDate, setEndDate] = useState('')
  const [postGoal, setPostGoal] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast('Campaign name is required.', 'error')
      return
    }
    if (!startDate) {
      toast('Start date is required.', 'error')
      return
    }
    if (endDate && endDate < startDate) {
      toast('End date must be on or after the start date.', 'error')
      return
    }

    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          org_id: orgId,
          name: name.trim(),
          description: description.trim() || null,
          color,
          status,
          goal: goal || null,
          start_date: startDate,
          end_date: endDate || null,
          post_goal: postGoal ? parseInt(postGoal, 10) : null,
          created_by: userId,
        })
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Insert returned no rows (blocked by RLS?)')
      }

      window.location.href = '/calendar/campaigns/' + data[0].id
    } catch (err) {
      console.error('Failed to create campaign:', err)
      toast('Failed to create campaign. Please try again.', 'error')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href="/calendar/campaigns"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          &larr; Back to Campaigns
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">New Campaign</h2>
        <p className="text-gray-400 text-sm mt-1">
          A campaign groups milestones, linked Court Reserve events, and content into one plan.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4"
      >
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Summer Kids Camp Push"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional — what is this campaign trying to do?"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={c}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${
                  color === c
                    ? 'border-white scale-110'
                    : 'border-transparent hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Custom color"
              className="h-8 w-9 p-1 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="">None</option>
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Start date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || undefined}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Post goal</label>
            <input
              type="number"
              min={0}
              value={postGoal}
              onChange={(e) => setPostGoal(e.target.value)}
              placeholder="e.g. 12"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Creating...' : 'Create campaign'}
          </button>
          <Link
            href="/calendar/campaigns"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
