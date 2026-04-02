import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notifyAdmins } from '@/lib/notifications'

/**
 * Public endpoint for the website widget.
 * Creates a new lead and logs the inquiry.
 * Rate limit: 10 req/min per IP (TODO: implement via Vercel middleware)
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  // Verify widget API secret
  const secret = request.headers.get('x-widget-secret')
  if (!secret || secret !== process.env.WIDGET_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, phone, message, org_slug } = body

  if (!name || !phone || !org_slug) {
    return NextResponse.json({ error: 'name, phone, and org_slug are required' }, { status: 400 })
  }

  // Look up org by slug
  const { data: org } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', org_slug)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  // Check messaging config
  const { data: config } = await supabase
    .from('org_messaging_config')
    .select('paused, current_spend_cents, monthly_cap_cents')
    .eq('org_id', org.id)
    .single()

  if (config?.paused) {
    return NextResponse.json({ error: 'Messaging is currently paused' }, { status: 503 })
  }

  if (config && config.current_spend_cents >= config.monthly_cap_cents) {
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }

  // Create the lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .insert({
      org_id: org.id,
      name,
      phone,
      source: 'website',
      notes: message || null,
      next_action_date: new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  if (leadErr) {
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }

  // Log the inquiry as an activity
  await supabase.from('activities').insert({
    org_id: org.id,
    lead_id: lead.id,
    activity_type: 'system',
    direction: 'inbound',
    notes: `Website inquiry: ${message || '(no message)'}`,
    metadata: { source: 'widget', phone },
  })

  // Store the message if messaging is configured
  if (config) {
    await supabase.from('messages').insert({
      org_id: org.id,
      lead_id: lead.id,
      direction: 'inbound',
      body: message || `New inquiry from ${name}`,
      from_number: phone,
      to_number: 'widget',
      status: 'received',
      cost_cents: 0,
    })
  }

  // Notify admins of new website lead
  await notifyAdmins({
    orgId: org.id,
    type: 'new_lead',
    title: `New website inquiry from ${name}`,
    body: message || undefined,
    link: `/pipeline/${lead.id}`,
  })

  return NextResponse.json({ success: true })
}
