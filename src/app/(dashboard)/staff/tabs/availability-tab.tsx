'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import type { Profile, Availability } from '@/types/database'

const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  availability: Availability[]
  profiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
}

function formatShortTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const hh = h % 12 || 12
  return m === 0 ? `${hh}${ampm}` : `${hh}:${m.toString().padStart(2, '0')}${ampm}`
}

export function AvailabilityTab({ availability, profiles, currentUser }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Build my availability map (0-6)
  const myAvail = availability.filter(a => a.user_id === currentUser.userId)
  const [days, setDays] = useState(() => {
    const map: Record<number, { is_available: boolean; start_time: string; end_time: string }> = {}
    for (let i = 0; i < 7; i++) {
      const existing = myAvail.find(a => a.day_of_week === i)
      map[i] = {
        is_available: existing ? existing.is_available : true,
        start_time: existing?.start_time?.slice(0, 5) || '08:00',
        end_time: existing?.end_time?.slice(0, 5) || '17:00',
      }
    }
    return map
  })

  async function handleSave() {
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      for (let i = 0; i < 7; i++) {
        const d = days[i]
        const { error } = await supabase.from('availability').upsert({
          org_id: currentUser.orgId,
          user_id: currentUser.userId,
          day_of_week: i,
          is_available: d.is_available,
          start_time: d.is_available ? d.start_time : null,
          end_time: d.is_available ? d.end_time : null,
        }, { onConflict: 'user_id,day_of_week' })
        if (error) throw error
      }

      toast('Availability saved')
      setEditMode(false)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save availability', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Build team availability grid — track which users have set their availability
  const usersWithAvail = new Set(availability.map((a) => a.user_id))

  const staffAvail: Record<string, { name: string; hasSet: boolean; days: Record<number, { is_available: boolean; start_time: string | null; end_time: string | null; hasRecord: boolean }> }> = {}
  profiles.forEach(p => {
    staffAvail[p.id] = { name: p.full_name, hasSet: usersWithAvail.has(p.id), days: {} }
    for (let i = 0; i < 7; i++) staffAvail[p.id].days[i] = { is_available: true, start_time: null, end_time: null, hasRecord: false }
  })
  availability.forEach((a) => {
    if (staffAvail[a.user_id]) {
      staffAvail[a.user_id].days[a.day_of_week] = {
        is_available: a.is_available,
        start_time: a.start_time,
        end_time: a.end_time,
        hasRecord: true,
      }
    }
  })

  return (
    <div className="space-y-6">
      {/* My availability editor */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">My Availability</h3>
          {!editMode ? (
            <button onClick={() => setEditMode(true)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">Edit</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditMode(false)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <div key={d} className={`bg-gray-900 rounded-lg p-3 ${!days[d].is_available ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">{dayShort[d]}</span>
                {editMode ? (
                  <button
                    onClick={() => setDays(prev => ({ ...prev, [d]: { ...prev[d], is_available: !prev[d].is_available } }))}
                    className={`text-[10px] px-2 py-0.5 rounded ${days[d].is_available ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                  >
                    {days[d].is_available ? 'Available' : 'Off'}
                  </button>
                ) : (
                  <span className={`text-[10px] px-2 py-0.5 rounded ${days[d].is_available ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {days[d].is_available ? 'Available' : 'Off'}
                  </span>
                )}
              </div>
              {days[d].is_available && editMode && (
                <div className="flex gap-2">
                  <input type="time" value={days[d].start_time} onChange={e => setDays(prev => ({ ...prev, [d]: { ...prev[d], start_time: e.target.value } }))} className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500" />
                  <input type="time" value={days[d].end_time} onChange={e => setDays(prev => ({ ...prev, [d]: { ...prev[d], end_time: e.target.value } }))} className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </div>
              )}
              {days[d].is_available && !editMode && days[d].start_time && (
                <p className="text-xs text-gray-500">{days[d].start_time} — {days[d].end_time}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Team availability overview */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Team Availability</h3>
        <div className="bg-gray-900 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                {dayShort.map(d => <th key={d} className="text-center px-2 py-3 text-gray-400 font-medium">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.values(staffAvail).map((s) => (
                <tr key={s.name} className="border-b border-gray-800/50">
                  <td className="px-4 py-2 text-white whitespace-nowrap">
                    {s.name}
                    {!s.hasSet && <span className="ml-1 text-[10px] text-yellow-400">(not set)</span>}
                  </td>
                  {[0, 1, 2, 3, 4, 5, 6].map(d => {
                    const day = s.days[d]
                    if (!day.hasRecord) {
                      return (
                        <td key={d} className="text-center px-2 py-2">
                          <span className="inline-block px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-[9px]">?</span>
                        </td>
                      )
                    }
                    if (!day.is_available) {
                      return (
                        <td key={d} className="text-center px-2 py-2">
                          <span className="inline-block px-1 py-0.5 rounded bg-gray-800 text-gray-600 text-[9px]">Off</span>
                        </td>
                      )
                    }
                    return (
                      <td key={d} className="text-center px-2 py-2">
                        <span className="inline-block px-1 py-0.5 rounded bg-green-500/10 text-green-400 text-[9px]">
                          {day.start_time && day.end_time
                            ? `${formatShortTime(day.start_time)}-${formatShortTime(day.end_time)}`
                            : 'Y'
                          }
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
