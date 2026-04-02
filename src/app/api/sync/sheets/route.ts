import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SPREADSHEET_ID = '1EuRHdjSor-zYyeStMCQ9IHRDvfgUZyHI_MOUceytMKQ'

// Map sheet GIDs to pipeline slugs based on tab naming convention
const SHEET_CONFIG: { gid: string; name: string; pipelineSlug: string }[] = [
  { gid: '719290908', name: '2026.01.LTP', pipelineSlug: 'ltp' },
  { gid: '629691485', name: '2026.01.Membership', pipelineSlug: 'membership' },
  { gid: '0', name: 'Combined (Membership)', pipelineSlug: 'membership' },
  { gid: '1424090936', name: 'New Events - March 2026', pipelineSlug: 'events' },
  { gid: '742042037', name: '2025.12.Events', pipelineSlug: 'events' },
]

function csvExportUrl(gid: string) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`
}

/** Parse CSV text into array of objects keyed by header */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h.trim().toLowerCase()] = (values[i] || '').trim()
    })
    return row
  })
}

/** Handle quoted CSV fields */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

/** Normalize column names across different sheet formats */
function extractLead(row: Record<string, string>) {
  // Handle "Full Name" vs "First Name" / "Last Name"
  let name = ''
  if (row['full name']) {
    name = row['full name']
  } else {
    const first = row['first name'] || row['first'] || ''
    const last = row['last name'] || row['last'] || ''
    name = `${first} ${last}`.trim()
  }

  const email = (row['email'] || '').toLowerCase() || null
  const phone = row['phone number'] || row['phone'] || null
  const dateCreated = row['date created'] || null

  // Events-specific fields
  const eventDate = row['booked date'] || row['preferred date'] || row['pick the date'] || null
  const eventType = row['events type'] || row['event type'] || null
  const guestCount = row['guest count'] || row['estimated guest count'] || null

  return { name, email, phone, dateCreated, eventDate, eventType, guestCount }
}

/**
 * POST /api/sync/sheets
 * Syncs leads from the published Google Sheet into the pipeline.
 * Deduplicates by email or phone against existing leads.
 */
export async function POST() {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only admins can trigger sync' }, { status: 403 })
  }

  const orgId = profile.org_id

  // Fetch pipeline IDs and first-stage IDs for this org
  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, slug')
    .eq('org_id', orgId)

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id, sort_order')
    .in('pipeline_id', (pipelines || []).map((p) => p.id))
    .order('sort_order', { ascending: true })

  const pipelineMap: Record<string, { pipelineId: string; firstStageId: string }> = {}
  for (const p of pipelines || []) {
    const firstStage = (stages || []).find((s) => s.pipeline_id === p.id)
    if (firstStage) {
      pipelineMap[p.slug] = { pipelineId: p.id, firstStageId: firstStage.id }
    }
  }

  // Fetch existing leads for dedup (email + phone)
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('email, phone')
    .eq('org_id', orgId)

  const existingEmails = new Set((existingLeads || []).map((l) => l.email?.toLowerCase()).filter(Boolean))
  const existingPhones = new Set((existingLeads || []).map((l) => l.phone).filter(Boolean))

  let totalCreated = 0
  let totalSkipped = 0
  const results: { sheet: string; created: number; skipped: number }[] = []

  for (const sheet of SHEET_CONFIG) {
    const pipeline = pipelineMap[sheet.pipelineSlug]
    if (!pipeline) continue

    let csv: string
    try {
      const res = await fetch(csvExportUrl(sheet.gid))
      csv = await res.text()
    } catch {
      results.push({ sheet: sheet.name, created: 0, skipped: 0 })
      continue
    }

    const rows = parseCsv(csv)
    let created = 0
    let skipped = 0
    const batch: Record<string, unknown>[] = []

    for (const row of rows) {
      const lead = extractLead(row)

      // Skip empty rows
      if (!lead.name || lead.name === 'Test Test' || lead.name === 'test test 2' || lead.name === 'test test 1') {
        skipped++
        continue
      }

      // Dedup by email or phone
      if ((lead.email && existingEmails.has(lead.email)) || (lead.phone && existingPhones.has(lead.phone))) {
        skipped++
        continue
      }

      // Build notes from events fields
      const notes: string[] = []
      if (lead.eventDate) notes.push(`Event date: ${lead.eventDate}`)
      if (lead.eventType) notes.push(`Event type: ${lead.eventType}`)
      if (lead.guestCount) notes.push(`Guest count: ${lead.guestCount}`)

      batch.push({
        org_id: orgId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        source: 'syndicate-general' as const,
        pipeline_id: pipeline.pipelineId,
        current_stage_id: pipeline.firstStageId,
        pipeline_type: sheet.pipelineSlug,
        notes: notes.length > 0 ? notes.join(' | ') : null,
        next_action_date: new Date().toISOString().split('T')[0],
        created_at: lead.dateCreated || new Date().toISOString(),
      })

      // Track for dedup within this sync
      if (lead.email) existingEmails.add(lead.email)
      if (lead.phone) existingPhones.add(lead.phone)

      created++
    }

    // Batch insert
    if (batch.length > 0) {
      const { error } = await supabase.from('leads').insert(batch)
      if (error) {
        return NextResponse.json({ error: `Failed on sheet ${sheet.name}: ${error.message}` }, { status: 500 })
      }
    }

    totalCreated += created
    totalSkipped += skipped
    results.push({ sheet: sheet.name, created, skipped })
  }

  return NextResponse.json({
    success: true,
    total_created: totalCreated,
    total_skipped: totalSkipped,
    sheets: results,
  })
}
