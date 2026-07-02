'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Profile, TimeClock, TimeOffRequest, ScheduleShift, Availability, AvailabilityEntry, AvailabilityWindow, AvailabilitySubmission, AvailabilityWindowAssignee, ShiftSwap } from '@/types/database'
import { ClockTab } from './tabs/clock-tab'
import { RosterTab } from './tabs/roster-tab'
import { ScheduleTab } from './tabs/schedule-tab'
import { AvailabilityTab } from './tabs/availability-tab'
import { ShiftSwapTab } from './tabs/shift-swap-tab'

const tabs = [
  { id: 'clock', label: 'Clock In/Out' },
  { id: 'roster', label: 'Roster' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'swaps', label: 'Shift Swap' },
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

export interface SchedulingSettings {
  min_shift_hours: number
  min_coverage_count: number
  default_target_hours: number
}

interface Props {
  profiles: Profile[]
  activeClocks: TimeClock[]
  timeOffRequests: TimeOffRequest[]
  shifts: ScheduleShift[]
  shiftSwaps: ShiftSwap[]
  availability: Availability[]
  availabilityEntries: AvailabilityEntry[]
  availabilityWindows: AvailabilityWindow[]
  availabilitySubmissions: AvailabilitySubmission[]
  availabilityWindowAssignees: AvailabilityWindowAssignee[]
  recentClocks: TimeClock[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  orgHours?: OrgHours
  schedulingSettings?: SchedulingSettings
  clockNotesVisibility?: 'all_staff' | 'admin_only'
  weekStartDay?: number
  /** Date-key bounds of the `shifts` prop as loaded server-side — lets
   *  ScheduleTab know when calendar navigation has gone outside them. */
  shiftsLoadedStart: string
  shiftsLoadedEnd: string
}

export function StaffModule({ profiles, activeClocks, timeOffRequests, shifts, shiftSwaps, availability, availabilityEntries, availabilityWindows, availabilitySubmissions, availabilityWindowAssignees, recentClocks, currentUser, orgHours, schedulingSettings, clockNotesVisibility, weekStartDay = 0, shiftsLoadedStart, shiftsLoadedEnd }: Props) {
  const searchParams = useSearchParams()
  const fromUrl = searchParams.get('tab')
  const urlTab = fromUrl && tabs.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : null
  // localTab starts null so a ?tab= deep link controls the initial view, but a
  // user's tab click always wins afterwards (otherwise the URL param pins the
  // tab forever and the tab bar appears dead).
  const [localTab, setLocalTab] = useState<TabId | null>(null)
  const tab = localTab ?? urlTab ?? 'clock'
  const setTab = setLocalTab
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
          availabilitySubmissions={availabilitySubmissions}
          availabilityWindows={availabilityWindows}
          timeOffRequests={operationalTimeOff}
          orgHours={orgHours}
          schedulingSettings={schedulingSettings}
          currentUser={currentUser}
          weekStartDay={weekStartDay}
          shiftsLoadedStart={shiftsLoadedStart}
          shiftsLoadedEnd={shiftsLoadedEnd}
        />
      )}
      {tab === 'swaps' && (
        <ShiftSwapTab
          swaps={shiftSwaps}
          shifts={operationalShifts}
          profiles={operationalProfiles}
          availabilityEntries={operationalAvailabilityEntries}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      )}
      {tab === 'availability' && (
        <AvailabilityTab
          availabilityEntries={operationalAvailabilityEntries}
          availabilityWindows={availabilityWindows}
          availabilitySubmissions={availabilitySubmissions}
          availabilityWindowAssignees={availabilityWindowAssignees}
          profiles={profiles}
          operationalProfiles={operationalProfiles}
          currentUser={currentUser}
          isAdmin={isAdmin}
          weekStartDay={weekStartDay}
          orgHours={orgHours}
        />
      )}
    </div>
  )
}
