import { createClient as createServerClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { sendAvailabilityReminderEmail } from '@/lib/email'
import { NextResponse } from 'next/server'

const REMIND_DAYS_BEFORE = 3

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerClient()

  const today = new Date()
  const reminderDate = new Date(today)
  reminderDate.setDate(today.getDate() + REMIND_DAYS_BEFORE)
  const reminderDateStr = reminderDate.toISOString().slice(0, 10)

  const { data: windows } = await supabase
    .from('availability_windows')
    .select('*')
    .eq('status', 'open')
    .eq('due_date', reminderDateStr)

  if (!windows?.length) return NextResponse.json({ message: 'No windows due soon', reminded: 0 })

  let totalReminded = 0

  for (const window of windows) {
    const [{ data: assigneeRows }, { data: submissions }, { data: org }] = await Promise.all([
      supabase
        .from('availability_window_assignees')
        .select('user_id, profile:profiles!availability_window_assignees_user_id_fkey(full_name, email)')
        .eq('window_id', window.id),
      supabase
        .from('availability_submissions')
        .select('user_id')
        .eq('window_id', window.id),
      supabase
        .from('orgs')
        .select('name, slug')
        .eq('id', window.org_id)
        .single(),
    ])

    if (!assigneeRows?.length || !org) continue

    const submittedSet = new Set((submissions ?? []).map((s) => s.user_id))
    const needsReminder = assigneeRows.filter((a) => !submittedSet.has(a.user_id))

    const link = `https://${org.slug}.courtops.app/staff?tab=availability&window=${window.id}`

    for (const row of needsReminder) {
      const profile = row.profile as unknown as { full_name: string; email: string } | null
      if (!profile) continue

      await createNotification({
        orgId: window.org_id,
        userId: row.user_id,
        type: 'availability_reminder',
        title: `Reminder: ${window.label} availability due soon`,
        body: `Submit by ${new Date(window.due_date! + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
        link: '/staff?tab=availability',
      })

      try {
        await sendAvailabilityReminderEmail({
          to: profile.email,
          staffName: profile.full_name,
          orgName: org.name,
          windowLabel: window.label,
          dueDate: window.due_date!,
          link,
        })
      } catch (err) {
        console.error(`Reminder email failed for ${profile.email}:`, err)
      }

      totalReminded++
    }
  }

  return NextResponse.json({ reminded: totalReminded })
}
