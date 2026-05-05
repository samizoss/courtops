import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CourtReserveAPI, mapTier, toISODate, fmt } from '@/lib/courtreserve'

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

  // Get CR org ID from orgs table
  const { data: org } = await supabase
    .from('orgs')
    .select('courtreserve_org_id')
    .eq('id', orgId)
    .single()

  if (!org?.courtreserve_org_id) {
    return NextResponse.json({ error: 'Court Reserve Org ID not set. Go to Settings > Integrations.' }, { status: 400 })
  }

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

    // 6. Update org_settings last synced
    await supabase
      .from('org_settings')
      .update({ cr_last_synced_at: new Date().toISOString() })
      .eq('org_id', orgId)

    // 7. Complete sync log
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
