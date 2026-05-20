import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { sendAvailabilityWindowEmail } from '@/lib/email'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('profiles')
    .select('org_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!caller || !['owner', 'admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await request.json()
  const { windowId } = body
  if (!windowId) return NextResponse.json({ error: 'windowId required' }, { status: 400 })

  const [{ data: window }, { data: assigneeRows }, { data: org }] = await Promise.all([
    supabase.from('availability_windows').select('*').eq('id', windowId).single(),
    supabase
      .from('availability_window_assignees')
      .select('user_id, profile:profiles!availability_window_assignees_user_id_fkey(full_name, email)')
      .eq('window_id', windowId),
    supabase.from('orgs').select('name, slug').eq('id', caller.org_id).single(),
  ])

  if (!window || !org) return NextResponse.json({ error: 'Window or org not found' }, { status: 404 })
  if (!assigneeRows?.length) return NextResponse.json({ sent: 0 })

  const origin = request.headers.get('origin') ?? `https://${org.slug}.courtops.app`
  const link = `${origin}/staff?tab=availability&window=${windowId}`

  let notified = 0
  let emailed = 0

  for (const row of assigneeRows) {
    const profile = row.profile as unknown as { full_name: string; email: string } | null
    if (!profile) continue

    await createNotification({
      orgId: caller.org_id,
      userId: row.user_id,
      type: 'availability_open',
      title: `Availability window open: ${window.label}`,
      body: window.due_date
        ? `Submit your availability by ${new Date(window.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
        : 'Submit your availability when you can.',
      link: '/staff?tab=availability',
    })
    notified++

    try {
      await sendAvailabilityWindowEmail({
        to: profile.email,
        staffName: profile.full_name,
        orgName: org.name,
        windowLabel: window.label,
        dueDate: window.due_date,
        link,
      })
      emailed++
    } catch (err) {
      console.error(`Failed to email ${profile.email}:`, err)
    }
  }

  return NextResponse.json({ notified, emailed })
}
