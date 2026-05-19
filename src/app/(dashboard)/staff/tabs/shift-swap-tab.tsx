'use client'

import { useMemo } from 'react'
import { useToast } from '@/components/toast'
import { fmtTimeRange12h } from '@/lib/format'
import type {
  ShiftSwap,
  ScheduleShift,
  Profile,
  AvailabilityEntry,
  ShiftRole,
} from '@/types/database'
import { SHIFT_ROLE_LABELS } from '@/types/database'

interface ShiftWithProfile extends ScheduleShift {
  profile?: { full_name: string }
}

interface Props {
  swaps: ShiftSwap[]
  shifts: ShiftWithProfile[]
  profiles: Profile[]
  availabilityEntries: AvailabilityEntry[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
}

export function ShiftSwapTab({
  swaps,
  shifts,
  profiles,
  availabilityEntries,
  currentUser,
  isAdmin,
}: Props) {
  const { toast } = useToast()

  const profileMap = useMemo(() => {
    const map: Record<string, Profile> = {}
    for (const p of profiles) map[p.id] = p
    return map
  }, [profiles])

  const shiftMap = useMemo(() => {
    const map: Record<string, ShiftWithProfile> = {}
    for (const s of shifts) map[s.id] = s
    return map
  }, [shifts])

  const entryMap = useMemo(() => {
    const map: Record<string, AvailabilityEntry> = {}
    for (const e of availabilityEntries) map[`${e.user_id}|${e.entry_date}`] = e
    return map
  }, [availabilityEntries])

  const openSwaps = swaps.filter((s) => s.status === 'open')
  const claimedSwaps = swaps.filter((s) => s.status === 'claimed')

  function availableStaffForShift(shift: ShiftWithProfile): Profile[] {
    return profiles.filter((p) => {
      if (p.id === shift.user_id) return false
      if (!p.is_operational_staff) return false
      const entry = entryMap[`${p.id}|${shift.shift_date}`]
      return entry?.is_available === true
    })
  }

  async function claimSwap(swapId: string) {
    if (!confirm('Pick up this shift? An admin will review and approve.')) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data, error } = await supabase
        .from('shift_swaps')
        .update({
          status: 'claimed',
          claimed_by: currentUser.userId,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', swapId)
        .eq('status', 'open')
        .select()
      if (error) throw error
      if (!data || data.length === 0) {
        toast('Someone else already claimed this shift — refresh to see the latest', 'error')
        window.location.reload()
        return
      }
      toast('Shift claimed — waiting for admin approval')
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to claim', 'error')
      console.error(err)
    }
  }

  async function approveSwap(swap: ShiftSwap) {
    if (!confirm('Approve this swap? The shift will be reassigned.')) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      if (swap.claimed_by) {
        const { error: shiftErr } = await supabase
          .from('shifts')
          .update({ user_id: swap.claimed_by })
          .eq('id', swap.shift_id)
        if (shiftErr) throw shiftErr
      }

      const { error: swapErr } = await supabase
        .from('shift_swaps')
        .update({
          status: 'approved',
          approved_by: currentUser.userId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', swap.id)
        .eq('status', 'claimed')
      if (swapErr) throw swapErr

      toast('Swap approved — shift reassigned')
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to approve', 'error')
      console.error(err)
    }
  }

  async function denySwap(swapId: string) {
    const reason = prompt('Reason for denying (optional):')
    if (reason === null) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('shift_swaps')
        .update({
          status: 'denied',
          approved_by: currentUser.userId,
          approved_at: new Date().toISOString(),
          deny_reason: reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', swapId)
      if (error) throw error
      toast('Swap denied')
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to deny', 'error')
      console.error(err)
    }
  }

  async function cancelSwap(swapId: string) {
    if (!confirm('Cancel this swap request?')) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('shift_swaps')
        .update({
          status: 'cancelled',
          claimed_by: null,
          claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', swapId)
      if (error) throw error
      toast('Swap cancelled')
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to cancel', 'error')
      console.error(err)
    }
  }

  function copySwapLink(swapId: string) {
    const url = `${window.location.origin}/staff?tab=swaps&swap=${swapId}`
    navigator.clipboard.writeText(url).then(
      () => toast('Link copied — paste into your group chat'),
      () => toast('Failed to copy link', 'error')
    )
  }

  if (openSwaps.length === 0 && claimedSwaps.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
        <p className="text-gray-400 text-sm">No open shift swaps.</p>
        <p className="text-gray-600 text-xs mt-1">
          To open a shift for swap, go to the Schedule tab → click a published shift → &quot;Open for swap.&quot;
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {openSwaps.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Open shifts ({openSwaps.length})
          </h3>
          <div className="space-y-2">
            {openSwaps.map((swap) => (
              <SwapCard
                key={swap.id}
                swap={swap}
                shift={shiftMap[swap.shift_id]}
                profileMap={profileMap}
                availableStaff={shiftMap[swap.shift_id] ? availableStaffForShift(shiftMap[swap.shift_id]) : []}
                currentUser={currentUser}
                isAdmin={isAdmin}
                onClaim={() => claimSwap(swap.id)}
                onCancel={() => cancelSwap(swap.id)}
                onCopyLink={() => copySwapLink(swap.id)}
              />
            ))}
          </div>
        </div>
      )}

      {claimedSwaps.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Pending approval ({claimedSwaps.length})
          </h3>
          <div className="space-y-2">
            {claimedSwaps.map((swap) => (
              <SwapCard
                key={swap.id}
                swap={swap}
                shift={shiftMap[swap.shift_id]}
                profileMap={profileMap}
                availableStaff={[]}
                currentUser={currentUser}
                isAdmin={isAdmin}
                onApprove={() => approveSwap(swap)}
                onDeny={() => denySwap(swap.id)}
                onCancel={() => cancelSwap(swap.id)}
                onCopyLink={() => copySwapLink(swap.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SwapCard({
  swap,
  shift,
  profileMap,
  availableStaff,
  currentUser,
  isAdmin,
  onClaim,
  onApprove,
  onDeny,
  onCancel,
  onCopyLink,
}: {
  swap: ShiftSwap
  shift?: ShiftWithProfile
  profileMap: Record<string, Profile>
  availableStaff: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
  onClaim?: () => void
  onApprove?: () => void
  onDeny?: () => void
  onCancel: () => void
  onCopyLink: () => void
}) {
  if (!shift) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-500">
        Shift not found (may have been deleted).
        <button onClick={onCancel} className="ml-2 text-red-400 underline">Cancel swap</button>
      </div>
    )
  }

  const date = new Date(shift.shift_date + 'T12:00:00')
  const originalName = profileMap[swap.original_user_id]?.full_name ?? 'Unknown'
  const claimedName = swap.claimed_by ? (profileMap[swap.claimed_by]?.full_name ?? 'Unknown') : null
  const isMySwap = swap.original_user_id === currentUser.userId
  const canClaim = swap.status === 'open' && !isMySwap

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <span className="text-xs font-mono text-gray-400">
              {fmtTimeRange12h(shift.start_time, shift.end_time)}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">
              {SHIFT_ROLE_LABELS[shift.role as ShiftRole] ?? shift.role}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {originalName} wants to {swap.swap_type === 'take' ? 'give up' : 'swap'} this shift
            {swap.reason && <span className="text-gray-400"> — &quot;{swap.reason}&quot;</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium ${
            swap.status === 'open'
              ? 'bg-green-500/15 text-green-300 border border-green-500/25'
              : 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/25'
          }`}>
            {swap.status}
          </span>
        </div>
      </div>

      {swap.status === 'open' && availableStaff.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <p className="text-[10px] text-gray-500 mb-1">
            Previously available for this day (may no longer be available):
          </p>
          <div className="flex flex-wrap gap-1">
            {availableStaff.map((p) => (
              <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-300 border border-green-500/20">
                {p.full_name.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      )}

      {swap.status === 'claimed' && claimedName && (
        <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-400">
          Claimed by <span className="text-white">{claimedName}</span>
          {swap.claimed_at && (
            <span className="text-gray-600 ml-1">
              {new Date(swap.claimed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {' '} — waiting for admin approval
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {canClaim && onClaim && (
          <button
            onClick={onClaim}
            className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded transition-colors"
          >
            I&apos;ll take it
          </button>
        )}
        {isAdmin && swap.status === 'claimed' && onApprove && (
          <button
            onClick={onApprove}
            className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
          >
            Approve
          </button>
        )}
        {isAdmin && swap.status === 'claimed' && onDeny && (
          <button
            onClick={onDeny}
            className="text-xs px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded border border-red-500/30 transition-colors"
          >
            Deny
          </button>
        )}
        <button
          onClick={onCopyLink}
          className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          Copy link
        </button>
        {(isMySwap || isAdmin) && (
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 text-gray-500 hover:text-red-400 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
