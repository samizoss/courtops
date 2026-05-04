'use client'

import { useState } from 'react'
import type { Profile, TimeClock, TimeOffRequest, ScheduleShift, Availability, AvailabilityEntry, AvailabilityWindow, AvailabilitySubmission } from '@/types/database'
import { ClockTab } from './tabs/clock-tab'
import { RosterTab } from './tabs/roster-tab'
import { ScheduleTab } from './tabs/schedule-tab'
import { TimeOffTab } from './tabs/time-off-tab'
import { AvailabilityTab } from './tabs/availability-tab'

const tabs = [
  { id: 'clock', label: 'Clock In/Out' },
  { id: 'roster', label: 'Roster' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'timeoff', label: 'Time Off' },
  { id: 'availability', label: 'Availability' },
] as const

type TabId = typeof tabs[number]['id']

export interface OrgHours {
  open_time: string | null
  close_time: string | null
  open_days: number[] | null
  staff_arrive_before_min: number | null
  staff_depart_after_min: number | null
  daily_hours: Record<string, { open: string; close: string }> | null
}

interface Props {
  profiles: Profile[]
  activeClocks: TimeClock[]
  timeOffRequests: TimeOffRequest[]
  shifts: ScheduleShift[]
  availability: Availability[]
  availabilityEntries: AvailabilityEntry[]
  availabilityWindows: AvailabilityWindow[]
  availabilitySubmissions: AvailabilitySubmission[]
  recentClocks: TimeClock[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  orgHours?: OrgHours
  clockNotesVisibility?: 'all_staff' | 'admin_only'
}

export function StaffModule({ profiles, activeClocks, timeOffRequests, shifts, availability, availabilityEntries, availabilityWindows, availabilitySubmissions, recentClocks, currentUser, orgHours, clockNotesVisibility }: Props) {
  const [tab, setTab] = useState<TabId>('clock')
  const isAdmin = currentUser.role === 'owner' || currentUser.role === 'admin'

  // Operational staff are those who should appear on schedule/availability/hours reports.
  // Non-operational accounts (dev/test/consultant) still log in but are hidden from ops views.
  // Always include the current user so they can see their own clocks even if not operational.
  const operationalProfiles = profiles.filter(
    (p) => p.is_operational_staff || p.id === currentUser.userId
  )
  const opIds = new Set(operationalProfiles.map((p) => p.id))
  const operationalActiveClocks = activeClocks.filter((c) => opIds.has(c.user_id))
  const operationalRecentClocks = recentClocks.filter((c) => opIds.has(c.user_id))
  const operationalShifts = shifts.filter((s) => opIds.has(s.user_id))
  const operationalAvailability = availability.filter((a) => opIds.has(a.user_id))
  const operationalAvailabilityEntries = availabilityEntries.filter((e) => opIds.has(e.user_id))
  const operationalTimeOff = timeOffRequests.filter((r) => opIds.has(r.user_id))

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Staff</h2>
        <p className="text-gray-400 text-sm mt-1">
          {operationalProfiles.filter((p) => p.is_operational_staff).length} operational
          {profiles.length !== operationalProfiles.filter((p) => p.is_operational_staff).length &&
            ` · ${profiles.length - operationalProfiles.filter((p) => p.is_operational_staff).length} non-operational`}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-orange-600/15 text-orange-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'clock' && (
        <ClockTab activeClocks={operationalActiveClocks} recentClocks={operationalRecentClocks} currentUser={currentUser} profiles={operationalProfiles} isAdmin={isAdmin} clockNotesVisibility={clockNotesVisibility} />
      )}
      {tab === 'roster' && (
        <RosterTab profiles={profiles} isAdmin={isAdmin} orgId={currentUser.orgId} />
      )}
      {tab === 'schedule' && (
        <ScheduleTab
          shifts={operationalShifts}
          profiles={operationalProfiles}
          isAdmin={isAdmin}
          orgId={currentUser.orgId}
          availabilityEntries={operationalAvailabilityEntries}
          timeOffRequests={operationalTimeOff}
          orgHours={orgHours}
          currentUser={currentUser}
        />
      )}
      {tab === 'timeoff' && (
        <TimeOffTab requests={operationalTimeOff} currentUser={currentUser} isAdmin={isAdmin} availability={operationalAvailability} />
      )}
      {tab === 'availability' && (
        <AvailabilityTab
          availabilityEntries={operationalAvailabilityEntries}
          availabilityWindows={availabilityWindows}
          availabilitySubmissions={availabilitySubmissions}
          profiles={operationalProfiles}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}
