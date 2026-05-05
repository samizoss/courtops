'use client'

import type {
  Profile,
  AvailabilityEntry,
  AvailabilityWindow,
  AvailabilitySubmission,
  AvailabilityWindowAssignee,
} from '@/types/database'
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
    />
  )
}
