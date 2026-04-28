'use client'

import { useMemo } from 'react'
import {
  DAY_LABELS_SHORT,
  ViewMode,
  addDays,
  fmtDateKey,
  fmtDateRangeLabel,
  fmtMonthYear,
  fmtShortDate,
  isSameDay,
  startOfDay,
  stepAnchor,
  visibleRange,
  weeksInMonthView,
} from '@/lib/calendar'

interface RenderCellProps {
  date: Date
  isOutsideAnchorMonth: boolean
  isToday: boolean
}

interface Props {
  anchor: Date
  mode: ViewMode
  onAnchorChange: (next: Date) => void
  onModeChange: (next: ViewMode) => void
  renderCell: (props: RenderCellProps) => React.ReactNode
  topBanner?: React.ReactNode
  toolbarRight?: React.ReactNode
}

export function CalendarMonthGrid({
  anchor,
  mode,
  onAnchorChange,
  onModeChange,
  renderCell,
  topBanner,
  toolbarRight,
}: Props) {
  const range = useMemo(() => visibleRange(anchor, mode), [anchor, mode])
  const today = useMemo(() => startOfDay(new Date()), [])

  const rows = useMemo<Date[][]>(() => {
    if (mode === 'day') return [[range.start]]
    if (mode === 'week') {
      const days: Date[] = []
      for (let i = 0; i < 7; i++) days.push(addDays(range.start, i))
      return [days]
    }
    const weeks = weeksInMonthView(anchor)
    const out: Date[][] = []
    for (let w = 0; w < weeks; w++) {
      const week: Date[] = []
      for (let i = 0; i < 7; i++) week.push(addDays(range.start, w * 7 + i))
      out.push(week)
    }
    return out
  }, [mode, range.start, anchor])

  const anchorMonth = anchor.getMonth()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onAnchorChange(stepAnchor(anchor, mode, -1))}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          title={`Previous ${mode}`}
          aria-label={`Previous ${mode}`}
        >
          ←
        </button>
        <button
          onClick={() => onAnchorChange(new Date())}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => onAnchorChange(stepAnchor(anchor, mode, 1))}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          title={`Next ${mode}`}
          aria-label={`Next ${mode}`}
        >
          →
        </button>

        <div className="text-sm text-gray-200 ml-2 font-medium">
          {mode === 'month'
            ? fmtMonthYear(anchor)
            : mode === 'week'
            ? fmtDateRangeLabel(range.start, range.end)
            : fmtShortDate(anchor)}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {(['day', 'week', 'month'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`text-xs px-3 py-1.5 rounded transition-colors capitalize ${
                mode === m
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              {m}
            </button>
          ))}
          {toolbarRight && <div className="ml-2">{toolbarRight}</div>}
        </div>
      </div>

      {topBanner}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {mode !== 'day' && (
          <div className="grid grid-cols-7 border-b border-gray-800 bg-gray-800/40">
            {DAY_LABELS_SHORT.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
              >
                {d}
              </div>
            ))}
          </div>
        )}

        {mode === 'day' ? (
          <div className="p-3">
            {renderCell({
              date: rows[0][0],
              isOutsideAnchorMonth: false,
              isToday: isSameDay(rows[0][0], today),
            })}
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {rows.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 divide-x divide-gray-800">
                {week.map((d) => {
                  const outside = mode === 'month' && d.getMonth() !== anchorMonth
                  const today_ = isSameDay(d, today)
                  return (
                    <div
                      key={fmtDateKey(d)}
                      className={`min-h-[110px] p-1.5 ${
                        outside ? 'bg-gray-900/40' : ''
                      } ${today_ ? 'ring-1 ring-orange-500/40 ring-inset' : ''}`}
                    >
                      <div
                        className={`flex items-center justify-between mb-1 ${
                          outside ? 'text-gray-600' : 'text-gray-300'
                        }`}
                      >
                        <span className="text-xs font-medium">{d.getDate()}</span>
                        {today_ && (
                          <span className="text-[9px] uppercase tracking-wide text-orange-400">
                            Today
                          </span>
                        )}
                      </div>
                      {renderCell({
                        date: d,
                        isOutsideAnchorMonth: outside,
                        isToday: today_,
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
