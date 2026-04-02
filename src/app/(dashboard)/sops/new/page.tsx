export const dynamic = 'force-dynamic'

import { getUserOrg } from '@/lib/get-user-org'
import { redirect } from 'next/navigation'
import { NewSopForm } from './new-sop-form'

export default async function NewSopPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  // Only owners and admins can create SOPs
  if (userOrg.role !== 'owner' && userOrg.role !== 'admin') {
    redirect('/sops')
  }

  return <NewSopForm orgId={userOrg.orgId} userId={userOrg.userId} />
}
