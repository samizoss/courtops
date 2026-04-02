export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { NotificationList } from './notification-list'

export default async function NotificationsPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const supabase = await createClient()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userOrg.userId)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Notifications</h2>
        <p className="text-gray-400 text-sm mt-1">Stay up to date with your activity</p>
      </div>
      <NotificationList initialNotifications={notifications ?? []} />
    </div>
  )
}
