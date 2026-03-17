'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile, ShiftRole } from '@/types/database'

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const roleColors: Record<ShiftRole, string> = {
  'front-desk': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  coaching: 'bg-green-500/15 text-green-400 border-green-500/30',
  management: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  other: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

interface Props {
  shifts: any[]
  profiles: Profile[]
  isAdmin: boolean
  orgId: string
}

export function ScheduleTab({ shifts, profiles, isAdmin, orgId }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    user_id: '',
    shift_date: new Date().toISOString().split('T')[0],
    start_time: '08:00',
    end_time: '14:00',
    role: 'front-desk' as ShiftRole,
    notes: '',
  })

  // Group shifts by date
  const grouped: Record<string, typeof shifts> = {}
  shifts.forEach((s) => {
    if (!grouped[s.shift_date]) grouped[s.shift_date] = []
    grouped[s.shift_date].push(s)
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    await supabase.from('shifts').insert({
      org_id: orgId,
      user_id: form.user_id,
      shift_date: form.shift_date,
      start_time: form.start_time,
      end_time: form.end_time,
      role: form.role,
      notes: form.notes || null,
    })

    setSaving(false)
    setShowAdd(false)
    router.refresh()
  }

  async function deleteShift(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('shifts').delete().eq('id', id)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Shift'}
          </button>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-gray-900 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Schedule a Shift</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray-400 mb-1">Staff Member *</label>
              <select required value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">Select...</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Date *</label>
              <input type="date" required value={form.shift_date} onChange={e => setForm(f => ({ ...f, shift_date: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as ShiftRole }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="front-desk">Front Desk</option>
                <option value="coaching">Coaching</option>
                <option value="management">Management</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Start *</label>
              <input type="time" required value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">End *</label>
              <input type="time" required value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? 'Saving...' : 'Add Shift'}
          </button>
        </form>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400">No shifts scheduled for the next 7 days.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, dayShifts]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">
                {dayNames[new Date(date + 'T12:00:00').getDay()]} — {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </h3>
              <div className="space-y-2">
                {dayShifts.map((shift: any) => (
                  <div key={shift.id} className="bg-gray-900 rounded-lg p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{shift.profile?.full_name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${roleColors[shift.role as ShiftRole]}`}>{shift.role}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}</p>
                    </div>
                    {isAdmin && (
                      <button onClick={() => deleteShift(shift.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
