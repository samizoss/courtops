'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import type { Profile } from '@/types/database'

interface Props {
  activeClocks: any[]
  recentClocks: any[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  profiles: Profile[]
  isAdmin: boolean
}

function formatDuration(minutes: number | null) {
  if (!minutes) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function elapsed(clockInIso: string): string {
  const min = Math.floor((Date.now() - new Date(clockInIso).getTime()) / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function ClockTab({ activeClocks, recentClocks, currentUser, profiles, isAdmin }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')

  const myClock = activeClocks.find(c => c.user_id === currentUser.userId)
  const isClockedIn = !!myClock

  async function handleClockAction() {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      if (isClockedIn) {
        const { error } = await supabase.from('time_clock').update({
          clock_out: new Date().toISOString(),
          notes: notes || null,
        }).eq('id', myClock.id)
        if (error) throw error
        toast('Clocked out')
      } else {
        const { error } = await supabase.from('time_clock').insert({
          org_id: currentUser.orgId,
          user_id: currentUser.userId,
          clock_in: new Date().toISOString(),
          notes: notes || null,
        })
        if (error) throw error
        toast('Clocked in')
      }

      setNotes('')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save clock entry', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* My clock action */}
      <div className={`bg-gray-900 rounded-xl p-6 border-l-4 ${isClockedIn ? 'border-green-500' : 'border-gray-700'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-lg font-semibold">{currentUser.fullName}</p>
            <p className="text-sm text-gray-400">
              {isClockedIn
                ? `Clocked in since ${formatTime(myClock.clock_in)} (${elapsed(myClock.clock_in)})`
                : 'Not clocked in'
              }
            </p>
          </div>
          <div className={`w-3 h-3 rounded-full ${isClockedIn ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
        </div>

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isClockedIn ? 'Clock out notes (optional)...' : 'Clock in notes (optional)...'}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={handleClockAction}
            disabled={loading}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
              isClockedIn
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
            } disabled:opacity-50`}
          >
            {loading ? 'Saving...' : isClockedIn ? 'Clock Out' : 'Clock In'}
          </button>
        </div>
      </div>

      {/* Who's clocked in now */}
      {activeClocks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Currently On Shift</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeClocks.map((clock) => (
              <div key={clock.id} className="bg-gray-900 rounded-lg p-3 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">{clock.profile?.full_name}</p>
                  <p className="text-xs text-gray-500">Since {formatTime(clock.clock_in)} ({elapsed(clock.clock_in)})</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hours Summary (admin only) */}
      {isAdmin && <HoursSummary orgId={currentUser.orgId} profiles={profiles} />}

      {/* Recent clock history */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Recent Clock History</h3>
        {recentClocks.length === 0 ? (
          <p className="text-gray-500 text-sm">No clock entries yet.</p>
        ) : (
          <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800/50">
            {recentClocks.map((clock) => (
              <div key={clock.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{clock.profile?.full_name}</p>
                  <p className="text-xs text-gray-500">{formatDate(clock.clock_in)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm text-gray-300">
                    {formatTime(clock.clock_in)} {clock.clock_out ? `— ${formatTime(clock.clock_out)}` : '— active'}
                  </p>
                  <p className="text-xs text-gray-500">{formatDuration(clock.total_minutes)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function HoursSummary({ orgId, profiles }: { orgId: string; profiles: Profile[] }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{ user_id: string; total_minutes: number }[] | null>(null)

  // Default to current pay period (last 14 days)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(Date.now() - 13 * 86400000)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

  async function loadSummary() {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('time_clock')
        .select('user_id, clock_in, clock_out, total_minutes')
        .eq('org_id', orgId)
        .gte('clock_in', `${startDate}T00:00:00`)
        .lte('clock_in', `${endDate}T23:59:59`)
        .not('clock_out', 'is', null)

      if (error) throw error

      // Aggregate by user
      const byUser: Record<string, number> = {}
      for (const row of data ?? []) {
        const mins = row.total_minutes ?? Math.floor((new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 60000)
        byUser[row.user_id] = (byUser[row.user_id] || 0) + mins
      }

      const result = Object.entries(byUser)
        .map(([user_id, total_minutes]) => ({ user_id, total_minutes }))
        .sort((a, b) => b.total_minutes - a.total_minutes)

      setSummary(result)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load hours', 'error')
    } finally {
      setLoading(false)
    }
  }

  const nameMap: Record<string, string> = {}
  profiles.forEach(p => { nameMap[p.id] = p.full_name })

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Hours Summary</h3>
      <div className="bg-gray-900 rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={loadSummary}
            disabled={loading}
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Load Hours'}
          </button>
        </div>

        {summary !== null && (
          summary.length === 0 ? (
            <p className="text-gray-500 text-sm">No clock entries for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 text-xs font-medium text-gray-500">Staff Member</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">Total Hours</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500">Avg/Day</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => {
                    const h = Math.floor(row.total_minutes / 60)
                    const m = row.total_minutes % 60
                    const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))
                    const avgPerDay = (row.total_minutes / days / 60).toFixed(1)
                    return (
                      <tr key={row.user_id} className="border-b border-gray-800/50">
                        <td className="py-2 text-white">{nameMap[row.user_id] ?? 'Unknown'}</td>
                        <td className="py-2 text-right text-gray-300 font-mono">{h}h {m}m</td>
                        <td className="py-2 text-right text-gray-500 font-mono">{avgPerDay}h</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t border-gray-700">
                    <td className="py-2 text-gray-400 font-medium">Total</td>
                    <td className="py-2 text-right text-white font-mono font-medium">
                      {Math.floor(summary.reduce((s, r) => s + r.total_minutes, 0) / 60)}h{' '}
                      {summary.reduce((s, r) => s + r.total_minutes, 0) % 60}m
                    </td>
                    <td className="py-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
