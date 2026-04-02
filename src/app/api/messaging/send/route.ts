import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const body = await request.json()
  const { lead_id, text } = body

  if (!lead_id || !text) {
    return NextResponse.json({ error: 'lead_id and text are required' }, { status: 400 })
  }

  // Get org messaging config
  const { data: config } = await supabase
    .from('org_messaging_config')
    .select('*')
    .eq('org_id', profile.org_id)
    .single()

  if (!config) {
    return NextResponse.json({ error: 'Messaging not configured for this org' }, { status: 400 })
  }

  if (config.paused) {
    return NextResponse.json({ error: 'Messaging is paused. Check budget settings.' }, { status: 402 })
  }

  // Check budget
  if (config.current_spend_cents >= config.monthly_cap_cents) {
    return NextResponse.json({ error: 'Monthly SMS budget exceeded' }, { status: 402 })
  }

  // Get lead phone number
  const { data: lead } = await supabase
    .from('leads')
    .select('phone, name')
    .eq('id', lead_id)
    .single()

  if (!lead?.phone) {
    return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 })
  }

  // TODO: Send via Twilio when credentials are configured
  // For now, just log the message in the database
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      org_id: profile.org_id,
      lead_id,
      direction: 'outbound',
      body: text,
      from_number: config.twilio_phone || 'pending',
      to_number: lead.phone,
      status: 'pending', // will be 'sent' once Twilio is connected
      sent_by: user.id,
    })
    .select()
    .single()

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  // Increment spend estimate
  const currentMonth = new Date().toISOString().slice(0, 7)
  const spendUpdate: Record<string, unknown> = {
    current_spend_cents: config.spend_month === currentMonth
      ? config.current_spend_cents + 1
      : 1,
    spend_month: currentMonth,
    updated_at: new Date().toISOString(),
  }

  await supabase
    .from('org_messaging_config')
    .update(spendUpdate)
    .eq('id', config.id)

  // Log as activity on the lead
  await supabase.from('activities').insert({
    org_id: profile.org_id,
    lead_id,
    activity_type: 'text',
    direction: 'outbound',
    performed_by: user.id,
    notes: text,
  })

  // Update lead last_contact_date
  await supabase.from('leads').update({
    last_contact_date: new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  }).eq('id', lead_id)

  return NextResponse.json({ success: true, message_id: message.id })
}
