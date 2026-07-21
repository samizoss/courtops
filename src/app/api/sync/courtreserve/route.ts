import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CourtReserveAPI, mapTier, toISODate, fmt } from '@/lib/courtreserve'
import { crWallClockToInstant } from '@/lib/cr-time'

/**
 * POST /api/sync/courtreserve
 * Triggers a Court Reserve → Supabase sync for the authenticated user's org.
 * Fetches members, attendance, transactions from CR API and upserts into cr_members.
 * Flags upgrade candidates and logs the sync run.
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

  // Get CR credentials from org_settings
  const { data: settings } = await supabase
    .from('org_settings')
    .select('cr_api_user, cr_api_pass, cr_sync_enabled')
    .eq('org_id', orgId)
    .single()

  if (!settings?.cr_api_user || !settings?.cr_api_pass) {
    return NextResponse.json({ error: 'Court Reserve API credentials not configured. Go to Settings > Integrations.' }, { status: 400 })
  }

  // Get CR org ID + timezone from orgs table (timezone lives on orgs,
  // edited via Settings → General; CR datetimes are org-local wall clock).
  const { data: org } = await supabase
    .from('orgs')
    .select('courtreserve_org_id, timezone')
    .eq('id', orgId)
    .single()

  if (!org?.courtreserve_org_id) {
    return NextResponse.json({ error: 'Court Reserve Org ID not set. Go to Settings > Integrations.' }, { status: 400 })
  }

  const orgTimezone = org.timezone || 'America/Chicago'

  // Create sync log entry
  const { data: syncLog } = await supabase
    .from('cr_sync_log')
    .insert({ org_id: orgId, status: 'running' })
    .select()
    .single()

  const syncId = syncLog?.id

  try {
    const cr = new CourtReserveAPI(settings.cr_api_user, settings.cr_api_pass, org.courtreserve_org_id)

    // 1. Fetch membership types + cache them in cr_membership_types so the
    //    Settings → Memberships page (admin) can display them without a
    //    fresh API call. Was previously thrown away after building typeMap.
    const membershipTypes = await cr.getMembershipTypes()
    const typeMap: Record<number, string> = {}
    for (const mt of membershipTypes) {
      typeMap[mt.Id] = mt.Name
    }

    if (membershipTypes.length > 0) {
      const typeRows = membershipTypes.map((mt) => ({
        org_id: orgId,
        cr_id: mt.Id,
        name: mt.Name,
        is_active: mt.IsActive,
        monthly_price: mt.MonthlyMembershipPrice ?? null,
        annual_price: mt.AnnualMembershipPrice ?? null,
        last_synced_at: new Date().toISOString(),
      }))
      const { error: typeErr } = await supabase
        .from('cr_membership_types')
        .upsert(typeRows, { onConflict: 'org_id,cr_id' })
      if (typeErr) console.error('Membership types upsert failed (continuing):', typeErr.message)
    }

    // 2. Fetch all members
    const members = await cr.getAllMembers()

    // 3. Fetch attendance (last 6 months in monthly chunks)
    const now = new Date()
    const attendanceByMemberId: Record<string, { count: number; lastDate: string | null }> = {}

    for (let i = 5; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      if (to > now) to.setTime(now.getTime())

      try {
        const records = await cr.getAttendance(fmt(from), fmt(to))
        for (const a of records) {
          const mid = a.OrganizationMemberId
          if (!mid) continue
          if (!attendanceByMemberId[mid]) attendanceByMemberId[mid] = { count: 0, lastDate: null }
          attendanceByMemberId[mid].count++
          const d = toISODate(a.DateTime)
          if (d && (!attendanceByMemberId[mid].lastDate || d > attendanceByMemberId[mid].lastDate)) {
            attendanceByMemberId[mid].lastDate = d
          }
        }
      } catch {
        // Skip failed months
      }
    }

    // 4. Fetch transactions (last 3 months)
    const spendByMemberId: Record<string, number> = {}

    for (let i = 2; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      if (to > now) to.setTime(now.getTime())

      try {
        const records = await cr.getTransactions(fmt(from), fmt(to))
        for (const t of records) {
          const mid = t.OrganizationMemberId
          const amount = Math.abs(t.Total || t.Subtotal || 0)
          if (!mid || amount === 0) continue
          spendByMemberId[mid] = (spendByMemberId[mid] || 0) + amount
        }
      } catch {
        // Skip failed months
      }
    }

    // Average spend over 3 months
    for (const mid of Object.keys(spendByMemberId)) {
      spendByMemberId[mid] = Math.round((spendByMemberId[mid] / 3) * 100) / 100
    }

    // 5. Build rows and batch upsert into cr_members
    let upgradeCandidates = 0
    const BATCH_SIZE = 500

    const rows = []
    for (const m of members) {
      const memberId = String(m.Id || m.id || m.OrganizationMemberId || '')
      if (!memberId) continue

      const firstName = m.FirstName || m.firstName || ''
      const lastName = m.LastName || m.lastName || ''
      const email = (m.Email || m.email || '').trim().toLowerCase() || null
      const phone = m.Phone || m.phone || null

      const membershipTypeId = m.MembershipTypeId || m.membershipTypeId
      const membershipTypeName = (membershipTypeId ? typeMap[membershipTypeId] : null) || m.MembershipTypeName || m.membershipTypeName || null
      const tier = mapTier(membershipTypeName)
      const membershipStatus = m.MembershipStatus || (m.IsActive || m.isActive ? 'Active' : 'Inactive')

      const stats = attendanceByMemberId[memberId] || { count: 0, lastDate: null }
      const monthlySpend = spendByMemberId[memberId] || null
      const memberSince = toISODate(m.MemberSince || m.DateCreated)

      // Upgrade candidate detection
      const isUpgradeCandidate = tier === 'Daily' && (stats.count >= 5 || (monthlySpend ?? 0) >= 50)

      // Recommended tier
      let recommendedTier: string | null = null
      let projectedSavings: number | null = null
      if (isUpgradeCandidate) {
        if (stats.count >= 24) recommendedTier = 'Freedom'
        else if (stats.count >= 12) recommendedTier = 'Patriot'
        else recommendedTier = 'Star'

        const currentAnnualCost = (stats.count / 6) * 12 * 15
        const recommendedMonthlyCost = recommendedTier === 'Freedom' ? 99 : recommendedTier === 'Patriot' ? 79 : 59
        projectedSavings = Math.round(currentAnnualCost - recommendedMonthlyCost * 12)
      }

      if (isUpgradeCandidate) upgradeCandidates++

      rows.push({
        org_id: orgId,
        cr_member_id: memberId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        membership_tier: tier,
        cr_membership_type: membershipTypeName,
        membership_status: membershipStatus,
        visit_count_6mo: stats.count,
        last_visit_date: stats.lastDate,
        monthly_spend: monthlySpend,
        member_since: memberSince,
        city: m.City || null,
        state: m.State || null,
        upgrade_candidate: isUpgradeCandidate,
        recommended_tier: recommendedTier,
        projected_savings: projectedSavings,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    // Batch upsert in chunks of 500
    let upserted = 0
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error: upsertErr } = await supabase
        .from('cr_members')
        .upsert(batch, { onConflict: 'org_id,cr_member_id' })

      if (!upsertErr) upserted += batch.length
    }

    // 6. CR events + sessions (content calendar Phase 1). Derived entirely
    //    from the registration report — CR has no event catalog endpoint.
    //    Rolling ±31-day window, walked in ≤31-day chunks (API hard limit).
    const eventsById = new Map<number, { name: string; catId: number | null; catName: string | null; isTeam: boolean }>()
    const sessionsByDateId = new Map<number, { crEventId: number; start: string; end: string; count: number }>()

    const chunks: Array<[Date, Date]> = [
      [new Date(now.getTime() - 30 * 86400000), now],
      [new Date(now.getTime() + 86400000), new Date(now.getTime() + 31 * 86400000)],
    ]
    for (const [from, to] of chunks) {
      try {
        const regs = await cr.getEventRegistrations(fmt(from), fmt(to))
        for (const r of regs) {
          if (!r.EventId || !r.EventDateId) continue
          if (!eventsById.has(r.EventId)) {
            eventsById.set(r.EventId, {
              name: r.EventName || `Event ${r.EventId}`,
              catId: r.EventCategoryId ?? null,
              catName: r.EventCategoryName ?? null,
              isTeam: !!r.IsTeamEvent,
            })
          }
          const s = sessionsByDateId.get(r.EventDateId) ?? {
            crEventId: r.EventId,
            start: r.StartTime,
            end: r.EndTime,
            count: 0,
          }
          // Cancelled registrations keep the session visible but don't count.
          if (!r.CancelledOnUtc) s.count++
          sessionsByDateId.set(r.EventDateId, s)
        }
      } catch (err) {
        console.error('CR event registration chunk failed (continuing):', err instanceof Error ? err.message : err)
      }
    }

    let eventsSynced = 0
    let sessionsSynced = 0
    if (eventsById.size > 0) {
      const eventRows = [...eventsById.entries()].map(([crEventId, e]) => ({
        org_id: orgId,
        cr_event_id: crEventId,
        name: e.name,
        cr_category_id: e.catId,
        cr_category_name: e.catName,
        is_team_event: e.isTeam,
        last_synced_at: new Date().toISOString(),
        // first_seen_at intentionally omitted so upserts keep the original value
      }))
      const { error: evErr } = await supabase
        .from('cr_events')
        .upsert(eventRows, { onConflict: 'org_id,cr_event_id' })
      if (evErr) {
        console.error('cr_events upsert failed (continuing):', evErr.message)
      } else {
        eventsSynced = eventRows.length

        // Map CR EventId → our UUID for the session FK.
        const { data: evLookup } = await supabase
          .from('cr_events')
          .select('id, cr_event_id')
          .eq('org_id', orgId)
        const evIdMap = new Map<number, string>((evLookup ?? []).map((e) => [Number(e.cr_event_id), e.id]))

        const sessionRows = []
        for (const [dateId, s] of sessionsByDateId) {
          const eventUuid = evIdMap.get(s.crEventId)
          // CR StartTime/EndTime are naive org-local wall-clock strings —
          // `new Date(s.start)` would mislabel them as UTC on Vercel and
          // store instants 5-6h early (see src/lib/cr-time.ts).
          const start = crWallClockToInstant(s.start, orgTimezone)
          const end = crWallClockToInstant(s.end, orgTimezone)
          if (!eventUuid || isNaN(start.getTime()) || isNaN(end.getTime())) continue
          sessionRows.push({
            org_id: orgId,
            cr_event_id: eventUuid,
            cr_event_date_id: dateId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            registration_count: s.count,
            last_synced_at: new Date().toISOString(),
          })
        }
        if (sessionRows.length > 0) {
          const { error: sessErr } = await supabase
            .from('cr_event_sessions')
            .upsert(sessionRows, { onConflict: 'org_id,cr_event_date_id' })
          if (sessErr) console.error('cr_event_sessions upsert failed (continuing):', sessErr.message)
          else sessionsSynced = sessionRows.length
        }
      }
    }

    // 7. Update org_settings last synced
    await supabase
      .from('org_settings')
      .update({ cr_last_synced_at: new Date().toISOString() })
      .eq('org_id', orgId)

    // 8. Complete sync log
    if (syncId) {
      await supabase
        .from('cr_sync_log')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          members_synced: members.length,
          members_created: 0,
          members_updated: upserted,
          upgrade_candidates_found: upgradeCandidates,
        })
        .eq('id', syncId)
    }

    return NextResponse.json({
      success: true,
      members_synced: members.length,
      upgrade_candidates: upgradeCandidates,
      events_synced: eventsSynced,
      event_sessions_synced: sessionsSynced,
    })
  } catch (err) {
    // Log failure
    if (syncId) {
      await supabase
        .from('cr_sync_log')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Unknown error',
        })
        .eq('id', syncId)
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
