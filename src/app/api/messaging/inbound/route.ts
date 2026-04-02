import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Twilio inbound SMS webhook.
 * When Twilio is configured, this endpoint receives incoming SMS messages.
 *
 * Twilio sends POST with form data:
 * - From: sender phone number
 * - To: your Twilio number
 * - Body: message text
 * - MessageSid: unique message ID
 *
 * TODO: Add Twilio signature validation
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  let from: string, to: string, body: string, messageSid: string

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/x-www-form-urlencoded')) {
    // Twilio sends form data
    const formData = await request.formData()
    from = formData.get('From') as string
    to = formData.get('To') as string
    body = formData.get('Body') as string
    messageSid = formData.get('MessageSid') as string
  } else {
    // JSON fallback for testing
    const json = await request.json()
    from = json.from
    to = json.to
    body = json.body
    messageSid = json.message_sid
  }

  if (!from || !to || !body) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Look up org by the Twilio phone number
  const { data: config } = await supabase
    .from('org_messaging_config')
    .select('org_id')
    .eq('twilio_phone', to)
    .single()

  if (!config) {
    // Unknown number — return empty TwiML
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Try to match sender to a lead by phone number
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('org_id', config.org_id)
    .eq('phone', from)
    .limit(1)
    .single()

  // Store the message
  await supabase.from('messages').insert({
    org_id: config.org_id,
    lead_id: lead?.id || null,
    direction: 'inbound',
    body,
    from_number: from,
    to_number: to,
    twilio_sid: messageSid || null,
    status: 'received',
    cost_cents: 0,
    sent_by: null,
  })

  // If we matched a lead, log an activity and update last_contact_date
  if (lead) {
    await supabase.from('activities').insert({
      org_id: config.org_id,
      lead_id: lead.id,
      activity_type: 'text',
      direction: 'inbound',
      notes: body,
    })

    await supabase.from('leads').update({
      last_contact_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)
  }

  // Return empty TwiML (no auto-reply)
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
