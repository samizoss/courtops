'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function ClockTab({ activeClocks, recentClocks, currentUser, profiles, isAdmin }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')

  const myClock = activeClocks.find(c => c.user_id === currentUser.userId)
  const isClockedIn = !!myClock

  async function handleClockAction() {
    setLoading(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    if (isClockedIn) {
      await supabase.from('time_clock').update({
        clock_out: new Date().toISOString(),
        notes: notes || null,
      }).eq('id', myClock.id)
    } else {
      await supabase.from('time_clock').insert({
        org_id: currentUser.orgId,
        user_id: currentUser.userId,
        clock_in: new Date().toISOString(),
        notes: notes || null,
      })
    }

    setNotes('')
    setLoading(false)
    router.refresh()
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
                ? `Clocked in since ${formatTime(myClock.clock_in)}`
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
                  <p className="text-xs text-gray-500">Since {formatTime(clock.clock_in)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
