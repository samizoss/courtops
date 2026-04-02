import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Twilio status callback webhook.
 * Updates message delivery status and actual cost.
 *
 * TODO: Add Twilio signature validation
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const contentType = request.headers.get('content-type') || ''

  let messageSid: string, messageStatus: string, price: string | null

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData()
    messageSid = formData.get('MessageSid') as string
    messageStatus = formData.get('MessageStatus') as string
    price = formData.get('Price') as string | null
  } else {
    const json = await request.json()
    messageSid = json.message_sid
    messageStatus = json.status
    price = json.price
  }

  if (!messageSid || !messageStatus) {
    return NextResponse.json({ error: 'Missing MessageSid or MessageStatus' }, { status: 400 })
  }

  // Find the message
  const { data: message } = await supabase
    .from('messages')
    .select('id, org_id, cost_cents')
    .eq('twilio_sid', messageSid)
    .single()

  if (!message) {
    return NextResponse.json({ ok: true }) // Unknown message, ignore
  }

  // Update status
  const updates: Record<string, unknown> = { status: messageStatus }

  // If Twilio provides actual price, update cost and reconcile org spend
  if (price) {
    const actualCostCents = Math.ceil(Math.abs(parseFloat(price)) * 100)
    const costDiff = actualCostCents - message.cost_cents

    updates.cost_cents = actualCostCents

    if (costDiff !== 0) {
      // Reconcile org spend
      const { data: config } = await supabase
        .from('org_messaging_config')
        .select('id, current_spend_cents')
        .eq('org_id', message.org_id)
        .single()

      if (config) {
        await supabase
          .from('org_messaging_config')
          .update({
            current_spend_cents: Math.max(0, config.current_spend_cents + costDiff),
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id)
      }
    }
  }

  await supabase
    .from('messages')
    .update(updates)
    .eq('id', message.id)

  return NextResponse.json({ ok: true })
}
