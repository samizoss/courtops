export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserOrg } from '@/lib/get-user-org'
import { NewsletterBuilder } from './newsletter-builder'

export default async function NewsletterPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  // Staff get view-only access (2026-07-21): the builder renders with a
  // view-only banner and a disabled Generate button; POST
  // /api/newsletter/generate stays owner/admin-only server-side. Possible
  // future refinement: a per-staff "content" capability
  // (profiles.capabilities[]) instead of all-staff.
  if (!['owner', 'admin', 'staff'].includes(userOrg.role)) {
    redirect('/')
  }

  return <NewsletterBuilder isAdmin={['owner', 'admin'].includes(userOrg.role)} />
}
