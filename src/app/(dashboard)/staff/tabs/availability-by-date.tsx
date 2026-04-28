'use client'

import { useState, useMemo, useEffect } from 'react'
import { useToast } from '@/components/toast'
import type { Profile, AvailabilityEntry } from '@/types/database'

interface Props {
  initialEntries: AvailabilityEntry[]
  profiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
}

const dayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Given any date, return the Monday of that week (using local time).
 */
function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = out.getDay() // 0 = Sun, 1 = Mon, ...
  const diff = dow === 0 ? -6 : 1 - dow // shift to Monday
  out.setDate(out.getDate() + diff)
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + n)
  return out
}

function fmtDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDateLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function weekRangeLabel(start: Date): string {
  const end = addDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const startStr = sameMonth
    ? `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}`
    : start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = sameMonth
    ? `${end.getDate()}`
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}`
}

interface CellState {
  shifts: string
  is_unavailable: boolean
  saving: boolean
  dirty: boolean
}

function emptyCell(): CellState {
  return { shifts: '', is_unavailable: false, saving: false, dirty: false }
}

export function AvailabilityByDateTab({
  initialEntries,
  profiles,
  currentUser,
  isAdmin,
}: Props) {
  const { toast } = useToast()

  // Default view: Monday of the current week.
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  // How many weeks to show in the grid. Geneva's sheet shows ~3 weeks at a time.
  const [weeksVisible, setWeeksVisible] = useState<number>(3)

  // Keyed by `${user_id}|${YYYY-MM-DD}`
  const [cells, setCells] = useState<Record<string, CellState>>(() => {
    const map: Record<string, CellState> = {}
    for (const e of initialEntries) {
      map[`${e.user_id}|${e.entry_date}`] = {
        shifts: e.shifts ?? '',
        is_unavailable: e.is_unavailable,
        saving: false,
        dirty: false,
      }
    }
    return map
  })

  // Visible date range
  const dates: Date[] = useMemo(() => {
    const out: Date[] = []
    for (let i = 0; i < weeksVisible * 7; i++) out.push(addDays(weekStart, i))
    return out
  }, [weekStart, weeksVisible])

  // Visible employees: staff sees only themselves; admin sees all operational
  // (parent passed already-filtered profiles).
  const visibleProfiles = useMemo(() => {
    if (!isAdmin) return profiles.filter((p) => p.id === currentUser.userId)
    // Put the current user first if present, then alpha
    const me = profiles.find((p) => p.id === currentUser.userId)
    const others = profiles
      .filter((p) => p.id !== currentUser.userId)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    return me ? [me, ...others] : others
  }, [profiles, currentUser.userId, isAdmin])

  function getCell(userId: string, date: Date): CellState {
    return cells[`${userId}|${fmtDateKey(date)}`] ?? emptyCell()
  }

  function updateCell(userId: string, date: Date, patch: Partial<CellState>) {
    const key = `${userId}|${fmtDateKey(date)}`
    setCells((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? emptyCell()), ...patch, dirty: true },
    }))
  }

  /**
   * Save the cell on blur (autosave). Upserts to availability_entries.
   * If both shifts are blank AND is_unavailable is false → delete the row
   * so we don't accumulate empty entries.
   */
  async function saveCell(userId: string, date: Date) {
    const key = `${userId}|${fmtDateKey(date)}`
    const cell = cells[key]
    if (!cell || !cell.dirty) return

    setCells((prev) => ({ ...prev, [key]: { ...prev[key], saving: true } }))

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const trimmed = cell.shifts.trim()

      if (!trimmed && !cell.is_unavailable) {
        // Cleared → delete any existing row
        await supabase
          .from('availability_entries')
          .delete()
          .eq('org_id', currentUser.orgId)
          .eq('user_id', userId)
          .eq('entry_date', fmtDateKey(date))
      } else {
        const { error } = await supabase
          .from('availability_entries')
          .upsert(
            {
              org_id: currentUser.orgId,
              user_id: userId,
              entry_date: fmtDateKey(date),
              shifts: trimmed || null,
              is_unavailable: cell.is_unavailable,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,user_id,entry_date' }
          )
        if (error) throw error
      }

      setCells((prev) => ({
        ...prev,
        [key]: { ...prev[key], saving: false, dirty: false },
      }))
    } catch (err) {
      setCells((prev) => ({ ...prev, [key]: { ...prev[key], saving: false } }))
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
      console.error('Save availability cell failed:', err)
    }
  }

  // Group dates by week so we render one row per week (matching Geneva's sheet)
  const weeks: Date[][] = useMemo(() => {
    const out: Date[][] = []
    for (let w = 0; w < weeksVisible; w++) {
      const start = addDays(weekStart, w * 7)
      const days: Date[] = []
      for (let i = 0; i < 7; i++) days.push(addDays(start, i))
      out.push(days)
    }
    return out
  }, [weekStart, weeksVisible])

  // Auto-fetch when week range changes (admin viewing a different range may need
  // entries we don't have yet). Skip on first render.
  const [hasFetched, setHasFetched] = useState(false)
  useEffect(() => {
    if (!hasFetched) {
      setHasFetched(true)
      return
    }
    let cancelled = false
    ;(async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const startKey = fmtDateKey(weekStart)
      const endKey = fmtDateKey(addDays(weekStart, weeksVisible * 7 - 1))
      const { data } = await supabase
        .from('availability_entries')
        .select('*')
        .eq('org_id', currentUser.orgId)
        .gte('entry_date', startKey)
        .lte('entry_date', endKey)

      if (cancelled || !data) return

      setCells((prev) => {
        // Clear any cells that fall in this range (we're refreshing them)
        const next = { ...prev }
        const inRange = (k: string) => {
          const [, dateKey] = k.split('|')
          return dateKey >= startKey && dateKey <= endKey
        }
        for (const k of Object.keys(next)) {
          if (inRange(k) && !next[k].dirty) delete next[k]
        }
        for (const e of data as AvailabilityEntry[]) {
          const k = `${e.user_id}|${e.entry_date}`
          if (next[k]?.dirty) continue // don't clobber unsaved edits
          next[k] = {
            shifts: e.shifts ?? '',
            is_unavailable: e.is_unavailable,
            saving: false,
            dirty: false,
          }
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [weekStart, weeksVisible, currentUser.orgId, hasFetched])

  return (
    <div>
      {/* Range navigator */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7 * weeksVisible))}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          title="Earlier"
        >
          ←
        </button>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          This week
        </button>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7 * weeksVisible))}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          title="Later"
        >
          →
        </button>

        <div className="text-sm text-gray-300 ml-2">
          {weekRangeLabel(weekStart)} – {weekRangeLabel(addDays(weekStart, (weeksVisible - 1) * 7))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-1">Show</span>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setWeeksVisible(n)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                weeksVisible === n
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              {n}wk
            </button>
          ))}
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-gray-500 mb-4">
          Type your available hours per day, e.g. <span className="text-gray-300 font-mono">7 - 230</span> or
          {' '}<span className="text-gray-300 font-mono">open - 9, 5 - close</span>. Leave blank if you have no preference,
          or check &ldquo;Unavailable&rdquo; if you can&apos;t work that day. Saves automatically.
        </p>
      )}

      {visibleProfiles.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No staff to show.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {weeks.map((weekDates) => (
            <div key={fmtDateKey(weekDates[0])} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="bg-gray-800/40 px-4 py-2 text-xs font-medium text-gray-300 uppercase tracking-wide">
                {weekRangeLabel(weekDates[0])}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase">
                      <th className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-900 z-10 min-w-[140px]">
                        Employee
                      </th>
                      {weekDates.map((d, i) => (
                        <th key={i} className="px-2 py-2 font-medium text-left min-w-[140px]">
                          <div className="flex items-baseline gap-1.5">
                            <span>{dayShort[i]}</span>
                            <span className="text-gray-600 font-normal">{fmtDateLabel(d)}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {visibleProfiles.map((p) => {
                      const editable = isAdmin || p.id === currentUser.userId
                      return (
                        <tr key={p.id}>
                          <td className="px-3 py-2 text-white sticky left-0 bg-gray-900 z-10 whitespace-nowrap">
                            {p.full_name}
                            {p.id === currentUser.userId && <span className="text-[10px] text-orange-400 ml-1.5">(you)</span>}
                          </td>
                          {weekDates.map((d) => {
                            const cell = getCell(p.id, d)
                            return (
                              <td key={fmtDateKey(d)} className="px-1 py-1 align-top">
                                <Cell
                                  cell={cell}
                                  editable={editable}
                                  onChange={(patch) => updateCell(p.id, d, patch)}
                                  onBlur={() => saveCell(p.id, d)}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Cell({
  cell,
  editable,
  onChange,
  onBlur,
}: {
  cell: CellState
  editable: boolean
  onChange: (patch: Partial<CellState>) => void
  onBlur: () => void
}) {
  if (!editable) {
    if (cell.is_unavailable) {
      return <div className="px-2 py-1.5 text-xs text-red-400/70 italic">Unavailable</div>
    }
    if (!cell.shifts.trim()) {
      return <div className="px-2 py-1.5 text-xs text-gray-700">—</div>
    }
    return <div className="px-2 py-1.5 text-xs text-gray-300 font-mono">{cell.shifts}</div>
  }

  return (
    <div className="space-y-1">
      <input
        type="text"
        value={cell.shifts}
        disabled={cell.is_unavailable}
        onChange={(e) => onChange({ shifts: e.target.value })}
        onBlur={onBlur}
        placeholder="e.g. 7 - 230"
        className={`w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500 ${
          cell.is_unavailable ? 'opacity-40' : ''
        }`}
      />
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={cell.is_unavailable}
          onChange={(e) => {
            onChange({ is_unavailable: e.target.checked })
            // Save immediately on toggle (no blur to wait for)
            setTimeout(onBlur, 0)
          }}
          className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-red-500 focus:ring-red-500"
        />
        <span className="text-[10px] text-gray-500">Unavailable</span>
        {cell.saving && <span className="text-[10px] text-gray-600 italic ml-auto">saving…</span>}
      </label>
    </div>
  )
}
