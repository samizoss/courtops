import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  let body: { name?: string; email?: string; idea?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const idea = body.idea?.trim()
  if (!idea) {
    return NextResponse.json({ error: 'Idea is required' }, { status: 400 })
  }
  if (idea.length > 2000) {
    return NextResponse.json({ error: 'Idea too long (max 2000 chars)' }, { status: 400 })
  }

  const supabase = createClient(url, key)
  const { error } = await supabase.from('roadmap_ideas').insert({
    name: body.name?.trim() || null,
    email: body.email?.trim() || null,
    idea,
  })

  if (error) {
    console.error('roadmap idea insert error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
