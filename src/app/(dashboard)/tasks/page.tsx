export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { TaskManager } from './task-manager'

export default async function TasksPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  const [{ data: tasks }, { data: staff }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name)')
      .order('status', { ascending: true })
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', userOrg.orgId)
      .eq('is_active', true)
      .order('full_name'),
  ])

  return (
    <TaskManager
      initialTasks={tasks ?? []}
      orgId={userOrg.orgId}
      staff={staff ?? []}
    />
  )
}
