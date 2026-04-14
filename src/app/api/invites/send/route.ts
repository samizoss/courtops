import { createClient } from '@/lib/supabase/server'
import { sendInviteEmail } from '@/lib/email'
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
    return NextResponse.json({ error: 'Only owners and admins can send invites' }, { status: 403 })
  }

  const body = await request.json()
  const { email, role } = body

  if (!email || !role) {
    return NextResponse.json({ error: 'Email and role are required' }, { status: 400 })
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('name')
    .eq('id', caller.org_id)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { data: invite, error: inviteError } = await supabase
    .from('org_invites')
    .insert({
      org_id: caller.org_id,
      email,
      role,
      invited_by: user.id,
      token,
      expires_at: expiresAt,
    })
    .select('*, inviter:profiles!org_invites_invited_by_fkey(full_name)')
    .single()

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  const origin = request.headers.get('origin') ?? 'https://courtops.app'
  const inviteLink = `${origin}/invite/${token}`

  let emailSent = false
  let emailError: string | null = null

  try {
    await sendInviteEmail({
      to: email,
      orgName: org.name,
      inviterName: caller.full_name || 'A teammate',
      inviteLink,
      role,
      expiresAt,
    })
    emailSent = true
  } catch (err) {
    emailError = err instanceof Error ? err.message : 'Unknown email error'
  }

  return NextResponse.json({
    invite,
    inviteLink,
    emailSent,
    emailError,
  })
}
