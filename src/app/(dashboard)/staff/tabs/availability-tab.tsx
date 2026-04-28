'use client'

import type { Profile, AvailabilityEntry, AvailabilityWindow } from '@/types/database'
import { AvailabilityByDateTab } from './availability-by-date'

interface Props {
  availabilityEntries: AvailabilityEntry[]
  availabilityWindows: AvailabilityWindow[]
  profiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
}

export function AvailabilityTab({
  availabilityEntries,
  availabilityWindows,
  profiles,
  currentUser,
  isAdmin,
}: Props) {
  return (
    <AvailabilityByDateTab
      initialEntries={availabilityEntries}
      windows={availabilityWindows}
      profiles={profiles}
      currentUser={currentUser}
      isAdmin={isAdmin}
    />
  )
}
