'use client'

import type { Profile, AvailabilityEntry, AvailabilityWindow, AvailabilitySubmission } from '@/types/database'
import { AvailabilityByDateTab } from './availability-by-date'

interface Props {
  availabilityEntries: AvailabilityEntry[]
  availabilityWindows: AvailabilityWindow[]
  availabilitySubmissions: AvailabilitySubmission[]
  profiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
}

export function AvailabilityTab({
  availabilityEntries,
  availabilityWindows,
  availabilitySubmissions,
  profiles,
  currentUser,
  isAdmin,
}: Props) {
  return (
    <AvailabilityByDateTab
      initialEntries={availabilityEntries}
      windows={availabilityWindows}
      submissions={availabilitySubmissions}
      profiles={profiles}
      currentUser={currentUser}
      isAdmin={isAdmin}
    />
  )
}
