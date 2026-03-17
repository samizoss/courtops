export const dynamic = 'force-dynamic'

import { getUserOrg } from '@/lib/get-user-org'
import { NewLeadForm } from './new-lead-form'

export default async function NewLeadPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  return <NewLeadForm orgId={userOrg.orgId} />
}
