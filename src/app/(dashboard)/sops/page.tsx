export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { SopList } from './sop-list'

export default async function SopsPage() {
  const userOrg = await getUserOrg()
  const canEdit = userOrg?.role === 'owner' || userOrg?.role === 'admin'

  const supabase = await createClient()

  const query = supabase
    .from('sops')
    .select('*')
    .order('category')
    .order('sort_order')

  if (!canEdit) {
    query.eq('is_published', true)
  }

  const { data: sops } = await query

  return <SopList sops={sops ?? []} canEdit={canEdit} />
}
