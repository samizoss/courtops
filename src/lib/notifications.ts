import { createClient } from '@/lib/supabase/server'
import type { NotificationType } from '@/types/database'

/**
 * Create an in-app notification for a user.
 * Call from server-side code (API routes, server components).
 */
export async function createNotification({
  orgId,
  userId,
  type,
  title,
  body,
  link,
  metadata,
}: {
  orgId: string
  userId: string
  type: NotificationType
  title: string
  body?: string
  link?: string
  metadata?: Record<string, unknown>
}) {
  const supabase = await createClient()

  await supabase.from('notifications').insert({
    org_id: orgId,
    user_id: userId,
    type,
    title,
    body: body ?? null,
    link: link ?? null,
    metadata: metadata ?? null,
  })
}

/**
 * Notify all admins/owners in an org.
 */
export async function notifyAdmins({
  orgId,
  type,
  title,
  body,
  link,
  metadata,
}: {
  orgId: string
  type: NotificationType
  title: string
  body?: string
  link?: string
  metadata?: Record<string, unknown>
}) {
  const supabase = await createClient()

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin'])

  if (!admins?.length) return

  await supabase.from('notifications').insert(
    admins.map((a) => ({
      org_id: orgId,
      user_id: a.id,
      type,
      title,
      body: body ?? null,
      link: link ?? null,
      metadata: metadata ?? null,
    }))
  )
}
