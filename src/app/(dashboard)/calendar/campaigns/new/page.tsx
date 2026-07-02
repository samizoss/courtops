export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserOrg } from '@/lib/get-user-org'
import { NewCampaignForm } from './new-campaign-form'

export default async function NewCampaignPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  // Viewers are read-only across the content module — no create form for them.
  if (userOrg.role === 'viewer') {
    redirect('/calendar/campaigns')
  }

  return <NewCampaignForm orgId={userOrg.orgId} userId={userOrg.userId} />
}
