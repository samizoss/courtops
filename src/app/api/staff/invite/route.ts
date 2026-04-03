import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  // Verify caller is authenticated and admin/owner
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Only admins can add staff' }, { status: 403 })
  }

  const body = await request.json()
  const { full_name, email, password, role, org_id } = body

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
  }

  if (org_id !== callerProfile.org_id) {
    return NextResponse.json({ error: 'Org mismatch' }, { status: 403 })
  }

  // Create auth user via Supabase admin (we use the service role for this)
  // Since we don't have service role key client-side, we create via SQL
  const { error: createError } = await supabase.rpc('create_staff_user', {
    p_email: email,
    p_password: password,
    p_full_name: full_name,
    p_org_id: org_id,
    p_role: role || 'staff',
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
