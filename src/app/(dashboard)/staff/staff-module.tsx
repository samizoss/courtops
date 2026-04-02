'use client'

import { useState } from 'react'
import type { Profile } from '@/types/database'
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
  activeClocks: any[]
  timeOffRequests: any[]
  shifts: any[]
  availability: any[]
  recentClocks: any[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  orgHours?: OrgHours
}

export function StaffModule({ profiles, activeClocks, timeOffRequests, shifts, availability, recentClocks, currentUser, orgHours }: Props) {
  const [tab, setTab] = useState<TabId>('clock')
  const isAdmin = currentUser.role === 'owner' || currentUser.role === 'admin'

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Staff</h2>
        <p className="text-gray-400 text-sm mt-1">{profiles.length} team members</p>
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
        <ClockTab activeClocks={activeClocks} recentClocks={recentClocks} currentUser={currentUser} profiles={profiles} isAdmin={isAdmin} />
      )}
      {tab === 'roster' && (
        <RosterTab profiles={profiles} isAdmin={isAdmin} orgId={currentUser.orgId} />
      )}
      {tab === 'schedule' && (
        <ScheduleTab shifts={shifts} profiles={profiles} isAdmin={isAdmin} orgId={currentUser.orgId} availability={availability} timeOffRequests={timeOffRequests} orgHours={orgHours} />
      )}
      {tab === 'timeoff' && (
        <TimeOffTab requests={timeOffRequests} currentUser={currentUser} isAdmin={isAdmin} availability={availability} />
      )}
      {tab === 'availability' && (
        <AvailabilityTab availability={availability} profiles={profiles} currentUser={currentUser} />
      )}
    </div>
  )
}
