export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { notFound } from 'next/navigation'
import { SopDetail } from './sop-detail'
import type { SopCategory } from '@/types/database'

const categoryMeta: Record<SopCategory, { label: string; color: string }> = {
  operations: { label: 'Operations', color: 'bg-blue-500/10 text-blue-400' },
  'front-desk': { label: 'Front Desk', color: 'bg-green-500/10 text-green-400' },
  sales: { label: 'Sales', color: 'bg-orange-500/10 text-orange-400' },
  content: { label: 'Content', color: 'bg-purple-500/10 text-purple-400' },
  emergency: { label: 'Emergency', color: 'bg-red-500/10 text-red-400' },
  equipment: { label: 'Equipment', color: 'bg-yellow-500/10 text-yellow-400' },
  general: { label: 'General', color: 'bg-gray-500/10 text-gray-400' },
}

export default async function SopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  const { data: sop } = await supabase
    .from('sops')
    .select('*')
    .eq('id', id)
    .single()

  if (!sop) notFound()

  const meta = categoryMeta[sop.category as SopCategory] ?? categoryMeta.general
  const canEdit = userOrg.role === 'owner' || userOrg.role === 'admin'

  return (
    <SopDetail
      sop={sop}
      categoryLabel={meta.label}
      categoryColor={meta.color}
      canEdit={canEdit}
      userId={userOrg.userId}
    />
  )
}
