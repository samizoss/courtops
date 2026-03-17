/**
 * Import leads from Notion pipeline DB into Supabase.
 * Run once: node scripts/import-leads.js
 */

const NOTION_API_KEY = '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'
const NOTION_DB_ID = '3b6cfa69ac084f9abde26730bb73ca67'
const SUPABASE_URL = 'https://facrogjtbtvhuxzaboln.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY // Need service role key for bypassing RLS
const ORG_ID = '00000000-0000-0000-0000-000000000001'

async function notionQuery(cursor) {
  const body = { page_size: 100 }
  if (cursor) body.start_cursor = cursor

  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

function extractProp(page, name, type) {
  const prop = page.properties[name]
  if (!prop) return null

  switch (type || prop.type) {
    case 'title':
      return prop.title?.[0]?.plain_text || null
    case 'rich_text':
      return prop.rich_text?.[0]?.plain_text || null
    case 'email':
      return prop.email || null
    case 'phone_number':
      return prop.phone_number || null
    case 'select':
      return prop.select?.name || null
    case 'status':
      return prop.status?.name || null
    case 'date':
      return prop.date?.start || null
    case 'number':
      return prop.number ?? null
    case 'checkbox':
      return prop.checkbox ?? false
    case 'people':
      return prop.people?.[0]?.name || null
    default:
      return null
  }
}

function mapStatus(notionStatus) {
  if (!notionStatus) return 'new'
  const s = notionStatus.toLowerCase()
  if (s.includes('new') || s.includes('not started')) return 'new'
  if (s.includes('contact')) return 'contacted'
  if (s.includes('follow')) return 'follow-up'
  if (s.includes('trial') || s.includes('book')) return 'trial-booked'
  if (s.includes('convert') || s.includes('won') || s.includes('member')) return 'converted'
  if (s.includes('lost') || s.includes('dead')) return 'lost'
  if (s.includes('nurtur')) return 'nurturing'
  if (s.includes('archiv')) return 'archived'
  return 'new'
}

function mapSource(notionSource) {
  if (!notionSource) return 'other'
  const s = notionSource.toLowerCase()
  if (s.includes('ltp') || s.includes('learn to play')) return 'syndicate-ltp'
  if (s.includes('syndicate')) return 'syndicate-general'
  if (s.includes('walk')) return 'walk-in'
  if (s.includes('refer')) return 'referral'
  if (s.includes('web') || s.includes('site')) return 'website'
  return 'other'
}

async function supabaseInsert(leads) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(leads),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase insert failed: ${res.status} ${err}`)
  }

  return leads.length
}

async function main() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('Set SUPABASE_SERVICE_KEY env var (service_role key from Supabase dashboard)')
    console.error('Usage: SUPABASE_SERVICE_KEY=eyJ... node scripts/import-leads.js')
    process.exit(1)
  }

  console.log('Fetching leads from Notion...')

  let allPages = []
  let cursor = undefined
  let hasMore = true

  while (hasMore) {
    const result = await notionQuery(cursor)
    allPages.push(...result.results)
    hasMore = result.has_more
    cursor = result.next_cursor
    console.log(`  Fetched ${allPages.length} so far...`)
  }

  console.log(`Total leads in Notion: ${allPages.length}`)

  // Map to Supabase format
  const leads = allPages.map((page) => {
    // Try common property names
    const name = extractProp(page, 'Name', 'title')
      || extractProp(page, 'Lead Name', 'title')
      || extractProp(page, 'Contact', 'title')
      || 'Unknown'

    const email = extractProp(page, 'Email', 'email')
      || extractProp(page, 'Email', 'rich_text')

    const phone = extractProp(page, 'Phone', 'phone_number')
      || extractProp(page, 'Phone', 'rich_text')

    const source = extractProp(page, 'Lead Source', 'select')
      || extractProp(page, 'Source', 'select')

    const status = extractProp(page, 'Status', 'status')
      || extractProp(page, 'Status', 'select')

    const notes = extractProp(page, 'Follow-up Notes', 'rich_text')
      || extractProp(page, 'Notes', 'rich_text')

    const touchCount = extractProp(page, 'Touch Count', 'number') ?? 0
    const converted = extractProp(page, 'Converted?', 'checkbox') ?? false
    const nextAction = extractProp(page, 'Next Action Date', 'date')
    const lastContact = extractProp(page, 'Last Contact Date', 'date')
    const conversionDate = extractProp(page, 'Conversion Date', 'date')
    const membershipType = extractProp(page, 'Membership Type', 'select')
      || extractProp(page, 'Current Tier', 'select')
    const crMemberId = extractProp(page, 'Court Reserve Member ID', 'rich_text')
      || extractProp(page, 'CR Member ID', 'rich_text')
    const campaign = extractProp(page, 'Lead Type/Campaign', 'rich_text')
      || extractProp(page, 'Campaign', 'select')

    return {
      org_id: ORG_ID,
      name,
      email: email || null,
      phone: phone || null,
      source: mapSource(source),
      campaign: campaign || null,
      status: mapStatus(status),
      next_action_date: nextAction || null,
      last_contact_date: lastContact || null,
      touch_count: touchCount,
      converted,
      conversion_date: conversionDate || null,
      membership_type: membershipType || null,
      courtreserve_member_id: crMemberId || null,
      notes: notes || null,
    }
  }).filter(l => l.name && l.name !== 'Unknown')

  console.log(`Mapped ${leads.length} leads for import`)

  // Insert in batches of 50
  let imported = 0
  for (let i = 0; i < leads.length; i += 50) {
    const batch = leads.slice(i, i + 50)
    const count = await supabaseInsert(batch)
    imported += count
    console.log(`  Imported ${imported}/${leads.length}`)
  }

  console.log(`\nDone! Imported ${imported} leads into Supabase.`)
}

main().catch(console.error)
