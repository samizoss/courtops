'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/toast'
import { CalendarMonthGrid } from '@/components/calendar-month-grid'
import { ViewMode, fmtDateKey, startOfDay, visibleRange } from '@/lib/calendar'
import type { Profile, AvailabilityEntry, AvailabilityWindow } from '@/types/database'
import { AvailabilityWindowsStrip } from './availability-windows-strip'

const SHIFTS_MAX_LEN = 200

interface Props {
  initialEntries: AvailabilityEntry[]
  windows: AvailabilityWindow[]
  profiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
}

interface CellState {
  shifts: string
  is_available: boolean
  saving: boolean
  dirty: boolean
}

const emptyCell = (): CellState => ({
  shifts: '',
  is_available: false,
  saving: false,
  dirty: false,
})

const cellKey = (userId: string, dateKey: string) => `${userId}|${dateKey}`

function windowForDate(date: Date, windows: AvailabilityWindow[]): AvailabilityWindow | null {
  const k = fmtDateKey(date)
  for (const w of windows) {
    if (k >= w.start_date && k <= w.end_date) return w
  }
  return null
}

export function AvailabilityByDateTab({
  initialEntries,
  windows,
  profiles,
  currentUser,
  isAdmin,
}: Props) {
  const { toast } = useToast()
  const [mode, setMode] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))

  const [cells, setCells] = useState<Record<string, CellState>>(() => {
    const map: Record<string, CellState> = {}
    for (const e of initialEntries) {
      map[cellKey(e.user_id, e.entry_date)] = {
        shifts: e.shifts ?? '',
        is_available: e.is_available,
        saving: false,
        dirty: false,
      }
    }
    return map
  })

  const visibleProfiles = useMemo(() => {
    if (!isAdmin) return profiles.filter((p) => p.id === currentUser.userId)
    const me = profiles.find((p) => p.id === currentUser.userId)
    const others = profiles
      .filter((p) => p.id !== currentUser.userId)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    return me ? [me, ...others] : others
  }, [profiles, currentUser.userId, isAdmin])

  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true)
      return
    }
    let cancelled = false
    ;(async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { start, end } = visibleRange(anchor, mode)
      const startKey = fmtDateKey(start)
      const endKey = fmtDateKey(end)
      const { data } = await supabase
        .from('availability_entries')
        .select('*')
        .eq('org_id', currentUser.orgId)
        .gte('entry_date', startKey)
        .lte('entry_date', endKey)
      if (cancelled || !data) return

      setCells((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          const [, dateKey] = k.split('|')
          if (dateKey >= startKey && dateKey <= endKey && !next[k].dirty) delete next[k]
        }
        for (const e of data as AvailabilityEntry[]) {
          const k = cellKey(e.user_id, e.entry_date)
          if (next[k]?.dirty) continue
          next[k] = {
            shifts: e.shifts ?? '',
            is_available: e.is_available,
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
  }, [anchor, mode, currentUser.orgId, hasMounted])

  function getCell(userId: string, date: Date): CellState {
    return cells[cellKey(userId, fmtDateKey(date))] ?? emptyCell()
  }

  function updateCell(userId: string, date: Date, patch: Partial<CellState>) {
    const k = cellKey(userId, fmtDateKey(date))
    setCells((prev) => ({
      ...prev,
      [k]: { ...(prev[k] ?? emptyCell()), ...patch, dirty: true },
    }))
  }

  async function saveCell(userId: string, date: Date) {
    const k = cellKey(userId, fmtDateKey(date))
    const cell = cells[k]
    if (!cell || !cell.dirty) return

    setCells((prev) => ({ ...prev, [k]: { ...prev[k], saving: true } }))
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const trimmed = cell.shifts.trim().slice(0, SHIFTS_MAX_LEN)

      if (!trimmed && !cell.is_available) {
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
              is_available: cell.is_available,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,user_id,entry_date' }
          )
        if (error) throw error
      }
      setCells((prev) => ({ ...prev, [k]: { ...prev[k], saving: false, dirty: false } }))
    } catch (err) {
      setCells((prev) => ({ ...prev, [k]: { ...prev[k], saving: false } }))
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
      console.error('Save availability cell failed:', err)
    }
  }

  return (
    <div className="space-y-3">
      <AvailabilityWindowsStrip
        windows={windows}
        isAdmin={isAdmin}
        orgId={currentUser.orgId}
        userId={currentUser.userId}
      />

      {!isAdmin && (
        <p className="text-xs text-gray-500">
          Check <span className="text-green-400 font-medium">Available</span> on dates you can
          work; optionally type your hours, e.g.{' '}
          <span className="text-gray-300 font-mono">7 - 230</span>. Saves automatically. Cells
          outside an open window are read-only.
        </p>
      )}

      <CalendarMonthGrid
        anchor={anchor}
        mode={mode}
        onAnchorChange={setAnchor}
        onModeChange={setMode}
        renderCell={({ date }) => {
          const win = windowForDate(date, windows)
          const editable = isAdmin || win?.status === 'open'
          return (
            <DayCell
              date={date}
              window={win}
              profiles={visibleProfiles}
              currentUserId={currentUser.userId}
              isAdmin={isAdmin}
              editable={editable}
              getCell={getCell}
              updateCell={updateCell}
              saveCell={saveCell}
              compact={mode === 'month'}
            />
          )
        }}
      />
    </div>
  )
}

interface DayCellProps {
  date: Date
  window: AvailabilityWindow | null
  profiles: Profile[]
  currentUserId: string
  isAdmin: boolean
  editable: boolean
  getCell: (userId: string, date: Date) => CellState
  updateCell: (userId: string, date: Date, patch: Partial<CellState>) => void
  saveCell: (userId: string, date: Date) => void
  compact: boolean
}

function DayCell({
  date,
  window: win,
  profiles,
  currentUserId,
  isAdmin,
  editable,
  getCell,
  updateCell,
  saveCell,
  compact,
}: DayCellProps) {
  return (
    <div className="space-y-1">
      {win?.status === 'locked' && (
        <div className="text-[9px] uppercase tracking-wide text-gray-500">Locked</div>
      )}
      {!win && !isAdmin && (
        <div className="text-[10px] text-gray-600 italic">No window</div>
      )}
      {profiles.map((p) => {
        const cell = getCell(p.id, date)
        const isMe = p.id === currentUserId
        const rowEditable = editable && (isAdmin || isMe)
        return (
          <PersonRow
            key={p.id}
            label={isMe ? `${p.full_name.split(' ')[0]} (you)` : p.full_name.split(' ')[0]}
            cell={cell}
            editable={rowEditable}
            compact={compact}
            onChange={(patch) => updateCell(p.id, date, patch)}
            onCommit={() => saveCell(p.id, date)}
          />
        )
      })}
    </div>
  )
}

function PersonRow({
  label,
  cell,
  editable,
  compact,
  onChange,
  onCommit,
}: {
  label: string
  cell: CellState
  editable: boolean
  compact: boolean
  onChange: (patch: Partial<CellState>) => void
  onCommit: () => void
}) {
  if (!editable) {
    if (cell.is_available && cell.shifts.trim()) {
      return (
        <div className="text-[10px] flex items-center gap-1">
          <span className="text-green-400">✓</span>
          <span className="text-gray-500 truncate">{label}:</span>
          <span className="text-gray-300 font-mono truncate">{cell.shifts}</span>
        </div>
      )
    }
    if (cell.is_available) {
      return (
        <div className="text-[10px] flex items-center gap-1">
          <span className="text-green-400">✓</span>
          <span className="text-gray-500 truncate">{label}</span>
        </div>
      )
    }
    return <div className="text-[10px] text-gray-700 truncate">— {label}</div>
  }

  return (
    <div className="space-y-0.5">
      <label className="flex items-center gap-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={cell.is_available}
          onChange={(e) => {
            onChange({ is_available: e.target.checked })
            setTimeout(onCommit, 0)
          }}
          className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500"
        />
        <span
          className={`text-[10px] truncate ${
            cell.is_available ? 'text-green-400' : 'text-gray-500'
          }`}
        >
          {label}
        </span>
        {cell.saving && <span className="text-[9px] text-gray-600 italic ml-auto">saving</span>}
      </label>
      {cell.is_available && (
        <input
          type="text"
          value={cell.shifts}
          onChange={(e) => onChange({ shifts: e.target.value })}
          onBlur={onCommit}
          placeholder={compact ? 'hrs' : 'e.g. 7 - 230'}
          maxLength={SHIFTS_MAX_LEN}
          className="w-full px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] font-mono text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      )}
    </div>
  )
}
