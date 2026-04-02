import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Accept an invite: look up token, create auth user, insert profile, mark accepted.
 * This runs server-side where the Supabase client has broader access than
 * an unauthenticated browser client constrained by RLS.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { token, full_name, password } = body

  if (!token || !full_name || !password) {
    return NextResponse.json({ error: 'token, full_name, and password are required' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const supabase = await createClient()

  // Look up the invite
  const { data: invite, error: inviteErr } = await supabase
    .from('org_invites')
    .select('id, email, role, org_id, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (inviteErr || !invite) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 400 })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired. Ask your admin to resend.' }, { status: 400 })
  }

  // Create auth user
  const { data: authData, error: signUpErr } = await supabase.auth.signUp({
    email: invite.email,
    password,
  })

  if (signUpErr) {
    return NextResponse.json({ error: signUpErr.message }, { status: 400 })
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
  }

  // Insert profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      org_id: invite.org_id,
      full_name,
      email: invite.email,
      role: invite.role,
    })

  if (profileErr) {
    return NextResponse.json({ error: 'Failed to create profile: ' + profileErr.message }, { status: 500 })
  }

  // Mark invite as accepted
  await supabase
    .from('org_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ success: true })
}

/**
 * GET: Look up an invite by token (public, no auth required)
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: invite, error } = await supabase
    .from('org_invites')
    .select('id, email, role, org_id, expires_at, accepted_at, org:orgs(name)')
    .eq('token', token)
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
  }

  return NextResponse.json({ invite })
}
