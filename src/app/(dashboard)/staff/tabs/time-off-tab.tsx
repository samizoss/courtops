'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'

const statusBadge: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  approved: 'bg-green-500/10 text-green-400',
  denied: 'bg-red-500/10 text-red-400',
}

interface Props {
  requests: any[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
  availability: any[]
}

export function TimeOffTab({ requests, currentUser, isAdmin, availability }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' })

  // Build a set of dates that already have approved time off, per user
  function getConflicts(requestId: string, startDate: string, endDate: string): { overlapping: string[]; totalAvailable: number } {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const overlapping: string[] = []

    // Find other approved or pending requests that overlap this date range
    for (const other of requests) {
      if (other.id === requestId) continue
      if (other.status === 'denied') continue
      const oStart = new Date(other.start_date)
      const oEnd = new Date(other.end_date)
      if (oStart <= end && oEnd >= start) {
        overlapping.push(other.profile?.full_name ?? 'Unknown')
      }
    }

    // Count how many staff have availability set for the date range
    const availableUsers = new Set(availability.filter((a: any) => a.is_available).map((a: any) => a.user_id))
    return { overlapping, totalAvailable: availableUsers.size }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { error } = await supabase.from('time_off_requests').insert({
        org_id: currentUser.orgId,
        user_id: currentUser.userId,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || null,
      })

      if (error) throw error
      toast('Time off request submitted')
      setShowNew(false)
      setForm({ start_date: '', end_date: '', reason: '' })
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to submit request', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleReview(id: string, status: 'approved' | 'denied') {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { error } = await supabase.from('time_off_requests').update({
        status,
        reviewed_by: currentUser.userId,
        reviewed_at: new Date().toISOString(),
      }).eq('id', id)

      if (error) throw error
      toast(status === 'approved' ? 'Request approved' : 'Request denied')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update request', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showNew ? 'Cancel' : '+ Request Time Off'}
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Request Time Off</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Start Date *</label>
              <input type="date" required value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">End Date *</label>
              <input type="date" required min={form.start_date || undefined} value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Reason</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Vacation, appointment, etc." />
            </div>
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      )}

      {requests.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400">No time off requests.</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800/50">
          {requests.map((req) => {
            const conflicts = isAdmin && req.status === 'pending'
              ? getConflicts(req.id, req.start_date, req.end_date)
              : null

            return (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{req.profile?.full_name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge[req.status]}`}>{req.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(req.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {req.start_date !== req.end_date && ` — ${new Date(req.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </p>
                    {req.reason && <p className="text-xs text-gray-400 mt-1">{req.reason}</p>}
                    {req.reviewer && <p className="text-[10px] text-gray-600 mt-1">Reviewed by {req.reviewer.full_name}</p>}

                    {/* Conflict warning for admins */}
                    {conflicts && conflicts.overlapping.length > 0 && (
                      <div className="mt-2 px-2 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/20">
                        <p className="text-xs text-yellow-400">
                          {conflicts.overlapping.length === 1
                            ? `${conflicts.overlapping[0]} also has time off during this period`
                            : `${conflicts.overlapping.length} others also off: ${conflicts.overlapping.join(', ')}`
                          }
                        </p>
                        {conflicts.overlapping.length >= conflicts.totalAvailable - 1 && (
                          <p className="text-xs text-red-400 mt-0.5 font-medium">
                            Approving this may leave you short-staffed
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {isAdmin && req.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => handleReview(req.id, 'approved')} className="px-3 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs rounded-lg transition-colors">Approve</button>
                      <button onClick={() => handleReview(req.id, 'denied')} className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded-lg transition-colors">Deny</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
