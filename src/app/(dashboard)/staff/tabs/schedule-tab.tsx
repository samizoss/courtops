'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import type { Profile, ShiftRole, ScheduleShift, Availability, TimeOffRequest } from '@/types/database'
import type { OrgHours } from '../staff-module'

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const roleColors: Record<ShiftRole, string> = {
  'front-desk': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  coaching: 'bg-green-500/15 text-green-400 border-green-500/30',
  management: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  other: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

interface ShiftWithProfile extends ScheduleShift {
  profile?: { full_name: string }
}

interface TimeOffWithProfile extends TimeOffRequest {
  profile?: { full_name: string }
}

interface Props {
  shifts: ShiftWithProfile[]
  profiles: Profile[]
  isAdmin: boolean
  orgId: string
  availability: Availability[]
  timeOffRequests: TimeOffWithProfile[]
  orgHours?: OrgHours
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return `${hh}:${m.toString().padStart(2, '0')} ${ampm}`
}

export function ScheduleTab({ shifts, profiles, isAdmin, orgId, availability, timeOffRequests, orgHours }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [increment, setIncrement] = useState<15 | 30 | 60>(60)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [form, setForm] = useState({
    user_id: '',
    shift_date: new Date().toISOString().split('T')[0],
    start_time: '08:00',
    end_time: '14:00',
    role: 'front-desk' as ShiftRole,
    notes: '',
  })
  const [editingShift, setEditingShift] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ start_time: '', end_time: '', role: 'front-desk' as ShiftRole })

  // Click-to-assign state
  const [assignModal, setAssignModal] = useState<{
    profile: Profile
    slotMin: number
    status: 'available' | 'not-set' | 'unavailable' | 'time-off'
  } | null>(null)
  const [assignNote, setAssignNote] = useState('')
  const [assignRole, setAssignRole] = useState<ShiftRole>('front-desk')
  const [suppressWarnings, setSuppressWarnings] = useState(false)
  const [showAddAnyone, setShowAddAnyone] = useState<number | null>(null) // slotMin for "add anyone" dropdown

  // Org hours with buffer — use per-day hours if available, else fallback
  const openDays = orgHours?.open_days ?? [1, 2, 3, 4, 5, 6]
  const dailyHours = orgHours?.daily_hours ?? {}

  function getDayHours(dayOfWeek: number): { openMin: number; closeMin: number } {
    const dayConfig = dailyHours[String(dayOfWeek)]
    const buffer = orgHours?.staff_arrive_before_min ?? 0
    const afterBuffer = orgHours?.staff_depart_after_min ?? 0
    if (dayConfig) {
      return {
        openMin: timeToMinutes(dayConfig.open) - buffer,
        closeMin: timeToMinutes(dayConfig.close) + afterBuffer,
      }
    }
    return {
      openMin: timeToMinutes(orgHours?.open_time?.slice(0, 5) || '08:00') - buffer,
      closeMin: timeToMinutes(orgHours?.close_time?.slice(0, 5) || '17:00') + afterBuffer,
    }
  }

  // Figure out which day of week the selected date is
  const selectedDayOfWeek = new Date(selectedDate + 'T12:00:00').getDay()

  const { openMin, closeMin } = getDayHours(selectedDayOfWeek)

  // Generate time slots
  const slots: number[] = []
  for (let m = openMin; m < closeMin; m += increment) {
    slots.push(m)
  }

  // Build availability map: userId → { day_of_week → { start_time, end_time, is_available } }
  const availMap: Record<string, Record<number, { start: number; end: number; available: boolean }>> = {}
  for (const a of availability) {
    const uid = a.user_id
    if (!availMap[uid]) availMap[uid] = {}
    availMap[uid][a.day_of_week] = {
      start: a.start_time ? timeToMinutes(a.start_time.slice(0, 5)) : 0,
      end: a.end_time ? timeToMinutes(a.end_time.slice(0, 5)) : 0,
      available: a.is_available,
    }
  }

  // Build approved time-off set: userId → Set of date strings
  const timeOffMap: Record<string, Set<string>> = {}
  for (const req of timeOffRequests) {
    if (req.status !== 'approved') continue
    const uid = req.user_id
    if (!timeOffMap[uid]) timeOffMap[uid] = new Set()
    const start = new Date(req.start_date)
    const end = new Date(req.end_date)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      timeOffMap[uid].add(d.toISOString().split('T')[0])
    }
  }

  // Check if a staff member is available at a given slot on the selected date
  // Returns: 'available' | 'unavailable' | 'time-off' | 'not-set'
  function getAvailabilityStatus(userId: string, slotMin: number): 'available' | 'unavailable' | 'time-off' | 'not-set' {
    if (timeOffMap[userId]?.has(selectedDate)) return 'time-off'

    const dayAvail = availMap[userId]?.[selectedDayOfWeek]
    if (!dayAvail) return 'not-set'
    if (!dayAvail.available) return 'unavailable'
    if (slotMin >= dayAvail.start && slotMin < dayAvail.end) return 'available'
    return 'unavailable'
  }

  // Get available staff for each slot (includes "not-set" as potentially available)
  function getAvailableStaff(slotMin: number): { profile: Profile; status: 'available' | 'not-set' }[] {
    const result: { profile: Profile; status: 'available' | 'not-set' }[] = []
    for (const p of profiles) {
      const status = getAvailabilityStatus(p.id, slotMin)
      if (status === 'available' || status === 'not-set') {
        result.push({ profile: p, status })
      }
    }
    return result
  }

  // Get availability summary for a staff member on the selected day
  function getAvailSummary(userId: string): string {
    if (timeOffMap[userId]?.has(selectedDate)) return 'Time off'
    const dayAvail = availMap[userId]?.[selectedDayOfWeek]
    if (!dayAvail) return 'Not set'
    if (!dayAvail.available) return 'Off'
    return `${minutesToTime(dayAvail.start)} – ${minutesToTime(dayAvail.end)}`
  }

  // Group shifts by date
  const grouped: Record<string, typeof shifts> = {}
  shifts.forEach((s) => {
    if (!grouped[s.shift_date]) grouped[s.shift_date] = []
    grouped[s.shift_date].push(s)
  })

  // Next 7 days for date selector
  const next7: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + i * 86400000)
    next7.push(d.toISOString().split('T')[0])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      // #25: Check for conflicts
      const { data: existing } = await supabase
        .from('shifts')
        .select('id')
        .eq('user_id', form.user_id)
        .eq('shift_date', form.shift_date)
        .lt('start_time', form.end_time)
        .gt('end_time', form.start_time)

      if (existing && existing.length > 0) {
        const staff = profiles.find(p => p.id === form.user_id)
        if (!confirm(`${staff?.full_name ?? 'This person'} already has an overlapping shift on this date. Add anyway?`)) {
          setSaving(false)
          return
        }
      }

      const { error } = await supabase.from('shifts').insert({
        org_id: orgId,
        user_id: form.user_id,
        shift_date: form.shift_date,
        start_time: form.start_time,
        end_time: form.end_time,
        role: form.role,
        notes: form.notes || null,
      })

      if (error) throw error
      toast('Shift added')
      setShowAdd(false)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add shift', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteShift(id: string) {
    if (!confirm('Remove this shift?')) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('shifts').delete().eq('id', id)
      if (error) throw error
      toast('Shift removed')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove shift', 'error')
    }
  }

  async function updateShift(id: string) {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('shifts').update({
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        role: editForm.role,
      }).eq('id', id)
      if (error) throw error
      toast('Shift updated')
      setEditingShift(null)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update shift', 'error')
    }
  }

  // Click-to-assign: handle clicking a staff name in the grid
  function handleStaffClick(profile: Profile, slotMin: number) {
    if (!isAdmin) return
    const status = getAvailabilityStatus(profile.id, slotMin)

    // If available and warnings suppressed, assign immediately
    if (status === 'available' && suppressWarnings) {
      return executeQuickAssign(profile, slotMin, '')
    }

    // If available and no need for warning, assign immediately
    if (status === 'available') {
      return executeQuickAssign(profile, slotMin, '')
    }

    // Otherwise show modal with appropriate warning
    setAssignModal({ profile, slotMin, status })
    setAssignNote('')
    setAssignRole('front-desk')
  }

  async function executeQuickAssign(profile: Profile, slotMin: number, notes: string) {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      // Calculate end time based on increment
      const endMin = slotMin + increment
      const startHH = String(Math.floor(slotMin / 60)).padStart(2, '0')
      const startMM = String(slotMin % 60).padStart(2, '0')
      const endHH = String(Math.floor(endMin / 60)).padStart(2, '0')
      const endMM = String(endMin % 60).padStart(2, '0')

      const { error } = await supabase.from('shifts').insert({
        org_id: orgId,
        user_id: profile.id,
        shift_date: selectedDate,
        start_time: `${startHH}:${startMM}`,
        end_time: `${endHH}:${endMM}`,
        role: assignRole,
        notes: notes || null,
      })
      if (error) throw error

      // If staff hasn't set availability, send notification
      const status = getAvailabilityStatus(profile.id, slotMin)
      if (status === 'not-set') {
        await supabase.from('notifications').insert({
          org_id: orgId,
          user_id: profile.id,
          type: 'system',
          title: 'You\'ve been tentatively scheduled',
          body: `You were scheduled for ${minutesToTime(slotMin)} on ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}. Please submit your availability within 2 days so the schedule can be finalized.`,
          link: '/staff',
        }).then(() => {}) // fire and forget
      }

      toast(`${profile.full_name?.split(' ')[0]} assigned at ${minutesToTime(slotMin)}`)
      setAssignModal(null)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to assign shift', 'error')
    }
  }

  const isOpenDay = openDays.includes(selectedDayOfWeek)

  return (
    <div className="space-y-6">
      {/* Add Shift */}
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

      {/* Availability Grid */}
      <div className="bg-gray-900 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Staff Availability</h3>
          <div className="flex items-center gap-3">
            <select
              value={increment}
              onChange={(e) => setIncrement(Number(e.target.value) as 15 | 30 | 60)}
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value={60}>1 hour</option>
              <option value={30}>30 min</option>
              <option value={15}>15 min</option>
            </select>
          </div>
        </div>

        {/* Date selector */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {next7.map((date) => {
            const d = new Date(date + 'T12:00:00')
            const dayNum = d.getDay()
            const isOpen = openDays.includes(dayNum)
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex-shrink-0 px-3 py-2 rounded-lg text-center transition-colors ${
                  selectedDate === date
                    ? 'bg-orange-600 text-white'
                    : isOpen
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-gray-800/50 text-gray-600'
                }`}
              >
                <p className="text-xs font-medium">{dayNames[dayNum]}</p>
                <p className="text-lg font-bold">{d.getDate()}</p>
              </button>
            )
          })}
        </div>

        {/* Staff summary for selected day */}
        {isOpenDay && (
          <div className="mb-4 flex flex-wrap gap-2">
            {profiles.map((p) => {
              const summary = getAvailSummary(p.id)
              const isOff = summary === 'Off' || summary === 'Time off'
              const isNotSet = summary === 'Not set'
              return (
                <span key={p.id} className={`text-[10px] px-2 py-1 rounded ${
                  isOff ? 'bg-red-500/10 text-red-400' :
                  isNotSet ? 'bg-yellow-500/10 text-yellow-400' :
                  'bg-green-500/10 text-green-400'
                }`}>
                  {p.full_name?.split(' ')[0]}: {summary}
                </span>
              )
            })}
          </div>
        )}

        {!isOpenDay ? (
          <p className="text-gray-500 text-sm text-center py-4">Facility is closed on {dayNames[selectedDayOfWeek]}s</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-500 py-2 pr-4 whitespace-nowrap">Time</th>
                  <th className="text-left text-xs font-medium text-gray-500 py-2 pr-4">Available Staff</th>
                  <th className="text-right text-xs font-medium text-gray-500 py-2">#</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slotMin) => {
                  const available = getAvailableStaff(slotMin)
                  const count = available.length
                  return (
                    <tr key={slotMin} className="border-b border-gray-800/50">
                      <td className="py-2 pr-4 text-xs text-gray-400 whitespace-nowrap font-mono">
                        {minutesToTime(slotMin)}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1 items-center">
                          {count === 0 ? (
                            <span className="text-red-400 text-xs">No one available</span>
                          ) : (
                            available.map(({ profile: p, status }) => (
                              isAdmin ? (
                                <button
                                  key={p.id}
                                  onClick={() => handleStaffClick(p, slotMin)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-all hover:ring-1 hover:ring-orange-500 ${
                                    status === 'not-set' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'
                                  }`}
                                  title={`Click to assign ${p.full_name}`}
                                >
                                  {p.full_name?.split(' ')[0]}{status === 'not-set' ? '?' : ''}
                                </button>
                              ) : (
                                <span key={p.id} className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  status === 'not-set' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'
                                }`}>
                                  {p.full_name?.split(' ')[0]}{status === 'not-set' ? '?' : ''}
                                </span>
                              )
                            ))
                          )}
                          {isAdmin && (
                            <div className="relative">
                              <button
                                onClick={() => setShowAddAnyone(showAddAnyone === slotMin ? null : slotMin)}
                                className="text-[10px] w-5 h-5 rounded bg-gray-800 text-gray-500 hover:text-orange-400 hover:bg-gray-700 transition-colors flex items-center justify-center"
                                title="Assign anyone to this slot"
                              >
                                +
                              </button>
                              {showAddAnyone === slotMin && (
                                <div className="absolute left-0 top-6 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[140px]">
                                  {profiles
                                    .filter((p) => !available.some(({ profile: ap }) => ap.id === p.id))
                                    .map((p) => {
                                      const pStatus = getAvailabilityStatus(p.id, slotMin)
                                      return (
                                        <button
                                          key={p.id}
                                          onClick={() => {
                                            setShowAddAnyone(null)
                                            handleStaffClick(p, slotMin)
                                          }}
                                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors flex items-center gap-2"
                                        >
                                          <span className="text-gray-300">{p.full_name?.split(' ')[0]}</span>
                                          <span className={`text-[9px] ${
                                            pStatus === 'unavailable' ? 'text-red-400' :
                                            pStatus === 'time-off' ? 'text-red-400' :
                                            'text-yellow-400'
                                          }`}>
                                            {pStatus === 'unavailable' ? 'unavail' : pStatus === 'time-off' ? 'time off' : ''}
                                          </span>
                                        </button>
                                      )
                                    })}
                                  {profiles.filter((p) => !available.some(({ profile: ap }) => ap.id === p.id)).length === 0 && (
                                    <p className="px-3 py-1.5 text-xs text-gray-500">Everyone listed above</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <span className={`text-xs font-medium ${
                          count === 0 ? 'text-red-400' : count === 1 ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                          {count}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Existing Shifts */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Scheduled Shifts</h3>
        {Object.keys(grouped).length === 0 ? (
          <div className="bg-gray-900 rounded-xl p-8 text-center">
            <p className="text-gray-400">No shifts scheduled for the next 7 days.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([date, dayShifts]) => (
              <div key={date}>
                <h4 className="text-sm font-semibold text-gray-400 mb-2">
                  {dayNames[new Date(date + 'T12:00:00').getDay()]} — {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </h4>
                <div className="space-y-2">
                  {dayShifts.map((shift: ShiftWithProfile) => (
                    <div key={shift.id} className="bg-gray-900 rounded-lg p-3">
                      {editingShift === shift.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-white mr-2">{shift.profile?.full_name}</p>
                          <input type="time" value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500" />
                          <span className="text-gray-600 text-xs">to</span>
                          <input type="time" value={editForm.end_time} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500" />
                          <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as ShiftRole }))} className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-orange-500">
                            <option value="front-desk">Front Desk</option>
                            <option value="coaching">Coaching</option>
                            <option value="management">Management</option>
                            <option value="other">Other</option>
                          </select>
                          <button onClick={() => updateShift(shift.id)} className="px-2 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded transition-colors">Save</button>
                          <button onClick={() => setEditingShift(null)} className="px-2 py-1 text-gray-500 hover:text-gray-300 text-xs transition-colors">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-white">{shift.profile?.full_name}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${roleColors[shift.role as ShiftRole]}`}>{shift.role}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}</p>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingShift(shift.id); setEditForm({ start_time: shift.start_time.slice(0, 5), end_time: shift.end_time.slice(0, 5), role: shift.role }) }} className="text-gray-600 hover:text-orange-400 text-xs transition-colors">Edit</button>
                              <button onClick={() => deleteShift(shift.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Remove</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignment confirmation modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setAssignModal(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">
              Assign {assignModal.profile.full_name?.split(' ')[0]}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {minutesToTime(assignModal.slotMin)} on {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>

            {/* Warning based on status */}
            {assignModal.status === 'not-set' && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-xs text-yellow-400 font-medium">This person hasn&apos;t submitted their availability</p>
                <p className="text-xs text-yellow-400/70 mt-0.5">They&apos;ll be notified and given 2 days to confirm. The shift is tentative until then.</p>
              </div>
            )}
            {assignModal.status === 'unavailable' && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400 font-medium">This person is marked unavailable at this time</p>
                <p className="text-xs text-red-400/70 mt-0.5">You&apos;re overriding their availability. A note is required.</p>
              </div>
            )}
            {assignModal.status === 'time-off' && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400 font-medium">This person has approved time off on this date</p>
                <p className="text-xs text-red-400/70 mt-0.5">You&apos;re overriding their time off. A note is required.</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Role</label>
                <select
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value as ShiftRole)}
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="front-desk">Front Desk</option>
                  <option value="coaching">Coaching</option>
                  <option value="management">Management</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Note {(assignModal.status === 'unavailable' || assignModal.status === 'time-off') ? '(required)' : '(optional)'}
                </label>
                <input
                  type="text"
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  placeholder={
                    assignModal.status === 'unavailable' ? 'Why are you overriding availability?'
                    : assignModal.status === 'time-off' ? 'Why are you overriding time off?'
                    : 'Optional note...'
                  }
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  autoFocus
                />
              </div>

              {(assignModal.status === 'not-set' || assignModal.status === 'unavailable' || assignModal.status === 'time-off') && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={suppressWarnings}
                    onChange={(e) => setSuppressWarnings(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-xs text-gray-500">Don&apos;t warn me again this session</span>
                </label>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  if ((assignModal.status === 'unavailable' || assignModal.status === 'time-off') && !assignNote.trim()) {
                    toast('A note is required when overriding availability', 'error')
                    return
                  }
                  executeQuickAssign(assignModal.profile, assignModal.slotMin, assignNote)
                }}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Assign
              </button>
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
