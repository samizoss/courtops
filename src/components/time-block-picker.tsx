'use client'

import { useState, useCallback } from 'react'

const START_HOUR = 6
const END_HOUR = 22
const SLOT_MINUTES = 30
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES

function slotToMinutes(slot: number): number {
  return START_HOUR * 60 + slot * SLOT_MINUTES
}

function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'p' : 'a'
  const hh = h % 12 || 12
  return m === 0 ? `${hh}${ampm}` : `${hh}:${m.toString().padStart(2, '0')}${ampm}`
}

function slotsToText(slots: Set<number>): string {
  if (slots.size === 0) return ''
  const sorted = Array.from(slots).sort((a, b) => a - b)
  const ranges: { start: number; end: number }[] = []
  let rangeStart = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i]
    } else {
      ranges.push({ start: slotToMinutes(rangeStart), end: slotToMinutes(prev) + SLOT_MINUTES })
      rangeStart = sorted[i]
      prev = sorted[i]
    }
  }
  ranges.push({ start: slotToMinutes(rangeStart), end: slotToMinutes(prev) + SLOT_MINUTES })
  return ranges.map((r) => `${minutesToLabel(r.start)} - ${minutesToLabel(r.end)}`).join(', ')
}

function textToSlots(text: string): Set<number> {
  const slots = new Set<number>()
  if (!text.trim()) return slots
  for (const tok of text.split(',')) {
    const halves = tok.split(/[-–]/).map((s) => s.trim())
    if (halves.length !== 2) continue
    const a = parseTime(halves[0])
    const b = parseTime(halves[1])
    if (a == null || b == null || b <= a) continue
    for (let m = a; m < b; m += SLOT_MINUTES) {
      const slot = (m - START_HOUR * 60) / SLOT_MINUTES
      if (slot >= 0 && slot < TOTAL_SLOTS) slots.add(slot)
    }
  }
  return slots
}

function parseTime(raw: string): number | null {
  const lower = raw.toLowerCase().trim()
  if (!lower) return null
  const digits = lower.replace(/[^\d]/g, '')
  if (!digits) return null
  let h = 0
  let m = 0
  if (digits.length <= 2) h = parseInt(digits, 10)
  else if (digits.length === 3) {
    h = parseInt(digits.slice(0, 1), 10)
    m = parseInt(digits.slice(1), 10)
  } else {
    h = parseInt(digits.slice(0, 2), 10)
    m = parseInt(digits.slice(2, 4), 10)
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  if (lower.includes('p') && h < 12) h += 12
  if (lower.includes('a') && h === 12) h = 0
  if (!lower.includes('a') && !lower.includes('p') && h >= 1 && h <= 6) h += 12
  return h * 60 + m
}

interface Props {
  value: string
  onChange: (text: string) => void
}

export function TimeBlockPicker({ value, onChange }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => textToSlots(value))
  const [dragging, setDragging] = useState(false)
  const [dragValue, setDragValue] = useState(true)

  const commitSlots = useCallback(
    (slots: Set<number>) => {
      onChange(slotsToText(slots))
    },
    [onChange]
  )

  function toggleSlot(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      commitSlots(next)
      return next
    })
  }

  function handlePointerDown(index: number) {
    const newValue = !selected.has(index)
    setDragging(true)
    setDragValue(newValue)
    setSelected((prev) => {
      const next = new Set(prev)
      if (newValue) next.add(index)
      else next.delete(index)
      return next
    })
  }

  function handlePointerEnter(index: number) {
    if (!dragging) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (dragValue) next.add(index)
      else next.delete(index)
      return next
    })
  }

  function handlePointerUp() {
    if (dragging) {
      setDragging(false)
      commitSlots(selected)
    }
  }

  function selectAll() {
    const all = new Set<number>()
    for (let i = 0; i < TOTAL_SLOTS; i++) all.add(i)
    setSelected(all)
    commitSlots(all)
  }

  function clearAll() {
    setSelected(new Set())
    commitSlots(new Set())
  }

  const slots: { index: number; label: string; isHourMark: boolean }[] = []
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const min = slotToMinutes(i)
    slots.push({
      index: i,
      label: minutesToLabel(min),
      isHourMark: min % 60 === 0,
    })
  }

  return (
    <div
      className="select-none"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-500">
          Tap or drag to select hours ({selected.size > 0 ? slotsToText(selected) : 'none'})
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-[10px] text-gray-400 hover:text-green-400 underline"
          >
            All day
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-[10px] text-gray-400 hover:text-red-400 underline"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[40px_1fr] gap-0">
        {slots.map((s) => (
          <div key={s.index} className="contents">
            {s.isHourMark ? (
              <div className="text-[9px] font-mono text-gray-500 pr-1 text-right leading-[24px]">
                {s.label}
              </div>
            ) : (
              <div />
            )}
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                handlePointerDown(s.index)
              }}
              onPointerEnter={() => handlePointerEnter(s.index)}
              className={`h-[24px] border-b border-r border-gray-800 transition-colors touch-none ${
                s.isHourMark ? 'border-t border-gray-700' : ''
              } ${
                selected.has(s.index)
                  ? 'bg-green-500/30 hover:bg-green-500/40'
                  : 'bg-gray-900 hover:bg-gray-800'
              }`}
              title={`${s.label} – ${minutesToLabel(slotToMinutes(s.index) + SLOT_MINUTES)}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
