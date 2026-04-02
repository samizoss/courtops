export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { ChecklistAdmin } from './checklist-admin'

export default async function ChecklistAdminPage() {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  if (userOrg.role !== 'owner' && userOrg.role !== 'admin') {
    redirect('/checklists')
  }

  const { data: templates } = await supabase
    .from('checklist_templates')
    .select(`
      *,
      checklist_items (*)
    `)
    .eq('org_id', userOrg.orgId)
    .order('sort_order')

  const normalizedTemplates = (templates ?? []).map((t) => ({
    ...t,
    checklist_items: (t.checklist_items ?? []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
    ),
  }))

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Checklist Admin</h2>
        <p className="text-gray-400 text-sm mt-1">
          Manage checklist templates and their items.
        </p>
      </div>
      <ChecklistAdmin templates={normalizedTemplates} orgId={userOrg.orgId} />
    </div>
  )
}
