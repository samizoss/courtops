export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserOrg } from '@/lib/get-user-org'
import { NewsletterBuilder } from './newsletter-builder'

export default async function NewsletterPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (!['owner', 'admin'].includes(userOrg.role)) {
    redirect('/')
  }

  return <NewsletterBuilder />
}
