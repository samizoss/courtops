'use client'

import type {
  Profile,
  AvailabilityEntry,
  AvailabilityWindow,
  AvailabilitySubmission,
  AvailabilityWindowAssignee,
} from '@/types/database'
import type { OrgHours } from '../staff-module'
import { AvailabilityByDateTab } from './availability-by-date'

interface Props {
  availabilityEntries: AvailabilityEntry[]
  availabilityWindows: AvailabilityWindow[]
  availabilitySubmissions: AvailabilitySubmission[]
  availabilityWindowAssignees: AvailabilityWindowAssignee[]
  /** Full active+visible profile list — used for the assignee picker which can include non-schedulable people. */
  profiles: Profile[]
  /** Operational subset (is_operational_staff=true OR self) — default basis for new windows' assignees. */
  operationalProfiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
  weekStartDay?: number
  orgHours?: OrgHours
}

export function AvailabilityTab({
  availabilityEntries,
  availabilityWindows,
  availabilitySubmissions,
  availabilityWindowAssignees,
  profiles,
  operationalProfiles,
  currentUser,
  isAdmin,
  weekStartDay,
  orgHours,
}: Props) {
  return (
    <AvailabilityByDateTab
      initialEntries={availabilityEntries}
      windows={availabilityWindows}
      submissions={availabilitySubmissions}
      assignees={availabilityWindowAssignees}
      profiles={profiles}
      operationalProfiles={operationalProfiles}
      currentUser={currentUser}
      isAdmin={isAdmin}
      weekStartDay={weekStartDay}
      orgHours={orgHours}
    />
  )
}
