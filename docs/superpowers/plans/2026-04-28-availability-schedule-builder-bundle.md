# Availability + Schedule Builder Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four-feature bundle from `docs/CURRENT_STATE.md` § "NEXT-SESSION BIG BUNDLE" — release/lock workflow on availability, "By Date" calendar redesign, schedule-builder rebuild, admin schedule-builder UX — atop a shared month-calendar component, all in one PR series.

**Architecture:** A new shared `<CalendarMonthGrid>` component renders day/week/month views with custom per-cell renderers. Two consumers: the redesigned Availability tab (cell = staff's availability for that day) and the rebuilt Schedule tab (cell = published shifts + admin-only inline assign). Migration 006 adds `availability_windows` (release/lock state machine), inverts `availability_entries.is_unavailable` → `is_available` (opt-in semantics), and adds `profiles.target_weekly_hours` for future hours-target work. RLS policies follow the existing org-scoped pattern. No automated tests exist in this project — verification = `npm run build` (TypeScript + ESLint) + manual browser testing as both `sami+staffview@samizoss.com` (staff) and `sami+adminview@samizoss.com` (admin).

**Tech Stack:** Next.js 16 App Router (React 19, TypeScript), Tailwind v4, Supabase Postgres + RLS, Supabase JS client. Migrations applied via `mcp__claude_ai_Supabase__apply_migration` (per CLAUDE.md). Existing patterns this plan follows: `'use client'` for interactive tabs, dynamic-import the Supabase client inside event handlers, `try/catch/finally` around mutations, `router.refresh()` or `window.location.reload()` after writes, server-side `Promise.all` fetch in `page.tsx`.

---

## File structure

**New files:**
- `supabase/migrations/006_availability_windows_and_opt_in.sql` — Migration 006.
- `src/components/calendar-month-grid.tsx` — Shared day/week/month grid, accepts a `renderCell` prop. Used by both availability + schedule.
- `src/app/(dashboard)/staff/tabs/availability-windows-strip.tsx` — Window strip + open-window modal + lock controls (above the availability calendar).
- `src/lib/calendar.ts` — Pure date helpers (already partly inlined in `availability-by-date.tsx` — extract for sharing).

**Modified files:**
- `src/types/database.ts` — Add `AvailabilityWindow`, flip `AvailabilityEntry.is_unavailable` → `is_available`, add `target_weekly_hours` to `Profile`.
- `src/app/(dashboard)/staff/page.tsx` — Fetch `availability_windows` for the visible range; pass to module.
- `src/app/(dashboard)/staff/staff-module.tsx` — Plumb `availabilityWindows` prop down to availability + schedule tabs.
- `src/app/(dashboard)/staff/tabs/availability-tab.tsx` — Drop "Weekly Default" sub-tab; render the new calendar-based "By Date" view directly.
- `src/app/(dashboard)/staff/tabs/availability-by-date.tsx` — Substantial rewrite: month calendar, `is_available` opt-in, day/week/month view modes, single-range label, gating against `availability_windows`, top-of-page Windows strip.
- `src/app/(dashboard)/staff/tabs/schedule-tab.tsx` — Substantial rewrite: calendar view (day/week/month), my/total filter, click-day → availability popover → click-staffer to assign. Existing add/edit shift logic preserved.

**Files NOT touched in this plan (out of scope):**
- Other staff tabs (`clock-tab.tsx`, `roster-tab.tsx`, `time-off-tab.tsx`).
- Hours-summary section (will use new `target_weekly_hours` later, but UI deferred per spec: "Don't build target-hours now").
- The `availability` (recurring weekly) table — kept in DB unused; no UI references after this bundle.

---

## Phase A — Migration 006

### Task A1: Author migration 006

**Files:**
- Create: `supabase/migrations/006_availability_windows_and_opt_in.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/006_availability_windows_and_opt_in.sql`:

```sql
-- Migration 006 — Availability windows (release/lock workflow), opt-in availability,
-- and target weekly hours on profiles.
--
-- Why this migration:
-- 1. The "By Date" availability flow needs a release/lock lifecycle so admins can
--    open a window ("submit May availability"), staff fills it in, then admin locks
--    it before building the schedule. Without this, anyone could edit any date
--    indefinitely.
-- 2. The Unavailable checkbox is opt-out (default = available). Geneva wants opt-in
--    semantics: blank = nothing submitted; "Available" = explicit yes; with optional
--    free-text shifts. We invert is_unavailable → is_available accordingly.
-- 3. target_weekly_hours per staffer is reserved for the future hours-summary
--    comparison ("scheduled vs target"). No UI in this migration; column ready for
--    a later iteration.

-- 1. Availability windows
CREATE TABLE availability_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                              -- e.g. "May 2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'locked')),
  opened_by UUID REFERENCES profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES profiles(id),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

ALTER TABLE availability_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage org availability windows"
  ON availability_windows
  FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_availability_windows_org_status
  ON availability_windows(org_id, status);
CREATE INDEX idx_availability_windows_dates
  ON availability_windows(start_date, end_date);

-- 2. Invert availability_entries.is_unavailable → is_available
-- Existing rows with is_unavailable=true become is_available=false.
-- Existing rows with is_unavailable=false (most of them — the ones with shifts text)
-- become is_available=true so the data is preserved as "this person submitted hours
-- for this day, so they're available." Empty entries don't exist (they're deleted).
ALTER TABLE availability_entries
  ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT false;

UPDATE availability_entries
SET is_available = NOT is_unavailable;

ALTER TABLE availability_entries DROP COLUMN is_unavailable;

-- 3. Target weekly hours on profiles (no UI yet; column reserved for hours summary)
ALTER TABLE profiles
  ADD COLUMN target_weekly_hours NUMERIC(5, 2);

COMMENT ON COLUMN profiles.target_weekly_hours IS
  'Target hours/week for scheduling reference. Null = no target set. Used by Schedule Builder hours-summary comparison (UI added in a later iteration).';
```

- [ ] **Step 2: Apply the migration to production Supabase**

Use the Supabase MCP (per CLAUDE.md):

```
mcp__claude_ai_Supabase__apply_migration
  project_id: facrogjtbtvhuxzaboln
  name: 006_availability_windows_and_opt_in
  query: <full migration SQL above>
```

Expected: migration succeeds. Verify by checking `list_migrations` shows `006_availability_windows_and_opt_in`.

- [ ] **Step 3: Sanity-check the schema change**

Run via `mcp__claude_ai_Supabase__execute_sql`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'availability_entries'
ORDER BY ordinal_position;
```

Expected output includes `is_available boolean NO` and **does not** include `is_unavailable`.

```sql
SELECT id, label, status FROM availability_windows LIMIT 1;
```

Expected: empty result (no rows yet) without errors.

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'target_weekly_hours';
```

Expected: one row.

- [ ] **Step 4: Commit**

```bash
git checkout -b bundle/availability-schedule-builder
git add supabase/migrations/006_availability_windows_and_opt_in.sql
git commit -m "Migration 006: availability windows + opt-in availability + target hours"
```

---

### Task A2: Update TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Flip `is_unavailable` → `is_available` on `AvailabilityEntry`**

Open `src/types/database.ts:228-238`. Replace the `AvailabilityEntry` interface body:

```ts
/**
 * Date-specific availability entry — what a staff member submits when admin
 * opens an availability window. Free-text `shifts` matches Geneva's existing
 * scheduling format ("7 - 230", "open - 9", "5 - 7, 10 - 230, 5-630").
 *
 * Semantics: opt-in. is_available=false (default) means "no submission" — the
 * staffer hasn't said anything about this date. is_available=true means "yes,
 * I can work this day"; pair with non-null `shifts` to constrain the hours.
 */
export interface AvailabilityEntry {
  id: string
  org_id: string
  user_id: string
  entry_date: string             // 'YYYY-MM-DD'
  shifts: string | null          // free text — what hours they can work
  is_available: boolean          // explicit "yes I can work this day"
  notes: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Add `AvailabilityWindow` interface**

Add immediately below `AvailabilityEntry`:

```ts
/**
 * Admin opens an availability window covering a date range; staff submits
 * within the window; admin locks it before building the schedule. Locked
 * windows make availability_entries inside the range read-only for staff.
 */
export interface AvailabilityWindow {
  id: string
  org_id: string
  label: string                   // e.g. "May 2026"
  start_date: string              // 'YYYY-MM-DD'
  end_date: string                // 'YYYY-MM-DD'
  status: 'open' | 'locked'
  opened_by: string | null
  opened_at: string
  locked_by: string | null
  locked_at: string | null
  created_at: string
}
```

- [ ] **Step 3: Add `target_weekly_hours` to `Profile`**

Find the `Profile` interface and add the field. If the file's `Profile` definition currently looks like:

```ts
export interface Profile {
  id: string
  org_id: string
  full_name: string
  // ...existing fields...
}
```

Add the new field near `is_operational_staff`:

```ts
  target_weekly_hours: number | null
```

- [ ] **Step 4: Verify no type-check errors**

Run: `npm run build`
Expected: build progresses past TypeScript checks. If errors reference `is_unavailable`, that's expected — they'll be fixed in subsequent tasks. Stop the build after the type-check stage to confirm only the expected references break.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "Update database types for migration 006"
```

---

## Phase B — Shared calendar grid

### Task B1: Extract date helpers to `src/lib/calendar.ts`

**Files:**
- Create: `src/lib/calendar.ts`

- [ ] **Step 1: Write `src/lib/calendar.ts`**

```ts
// Pure date helpers used by the availability + schedule calendar views.
// Sunday-first, local time (no UTC drift), no Date mutation outside helper bodies.

export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LABELS_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  const out = startOfDay(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Sunday of the week containing d (local time). */
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d)
  out.setDate(out.getDate() - out.getDay())
  return out
}

/** Sunday of the week containing the 1st of d's month. Anchors a calendar-month grid. */
export function startOfMonthView(d: Date): Date {
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1)
  return startOfWeek(firstOfMonth)
}

/** Number of weeks (4-6) needed to cover the calendar month containing d. */
export function weeksInMonthView(d: Date): number {
  const start = startOfMonthView(d)
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const days = Math.ceil((lastOfMonth.getTime() - start.getTime()) / 86400000) + 1
  return Math.ceil(days / 7)
}

/** 'YYYY-MM-DD' in local time (NOT UTC — UTC silently shifts dates near midnight). */
export function fmtDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Mar 29 – May 2" — single date range across the visible window. */
export function fmtDateRangeLabel(start: Date, end: Date): string {
  return `${fmtShortDate(start)} – ${fmtShortDate(end)}`
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isInRange(d: Date, startKey: string, endKey: string): boolean {
  const k = fmtDateKey(d)
  return k >= startKey && k <= endKey
}

export type ViewMode = 'day' | 'week' | 'month'

/**
 * Visible date range for a given view mode anchored on `anchor`.
 * - 'day':   [anchor, anchor]
 * - 'week':  Sunday..Saturday containing anchor
 * - 'month': full calendar grid covering anchor's month (4-6 weeks, Sunday-first)
 */
export function visibleRange(anchor: Date, mode: ViewMode): { start: Date; end: Date } {
  if (mode === 'day') {
    const s = startOfDay(anchor)
    return { start: s, end: s }
  }
  if (mode === 'week') {
    const s = startOfWeek(anchor)
    return { start: s, end: addDays(s, 6) }
  }
  const s = startOfMonthView(anchor)
  const weeks = weeksInMonthView(anchor)
  return { start: s, end: addDays(s, weeks * 7 - 1) }
}

/** Step the anchor forward (n=1) or backward (n=-1) by one view-mode unit. */
export function stepAnchor(anchor: Date, mode: ViewMode, n: number): Date {
  if (mode === 'day') return addDays(anchor, n)
  if (mode === 'week') return addDays(anchor, n * 7)
  return new Date(anchor.getFullYear(), anchor.getMonth() + n, 1)
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: pure helpers, no errors introduced by this file alone (other files still reference removed `is_unavailable` — those will be fixed below).

- [ ] **Step 3: Commit**

```bash
git add src/lib/calendar.ts
git commit -m "Add shared calendar date helpers"
```

---

### Task B2: Build `<CalendarMonthGrid>` shared component

**Files:**
- Create: `src/components/calendar-month-grid.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
  startOfMonthView,
  startOfWeek,
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
  /** Renders the body of each cell. Cell wrapper (border, hover, etc) is provided. */
  renderCell: (props: RenderCellProps) => React.ReactNode
  /** Optional content to show above the grid header but below the toolbar. */
  topBanner?: React.ReactNode
  /** Optional badge in the toolbar, e.g. window status. */
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

  // Build the grid as rows of 7 (week / month) or one row (day).
  const rows = useMemo<Date[][]>(() => {
    if (mode === 'day') return [[range.start]]
    if (mode === 'week') {
      const days: Date[] = []
      for (let i = 0; i < 7; i++) days.push(addDays(range.start, i))
      return [days]
    }
    // month: Sunday-aligned grid covering the entire calendar month
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
      {/* Toolbar */}
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
          {mode === 'month' ? fmtMonthYear(anchor)
            : mode === 'week' ? fmtDateRangeLabel(range.start, range.end)
            : fmtShortDate(anchor)}
        </div>
        {mode !== 'day' && mode !== 'month' && (
          <span className="text-xs text-gray-500">
            ({fmtDateRangeLabel(range.start, range.end)})
          </span>
        )}

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

      {/* Calendar grid */}
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
                      <div className={`flex items-center justify-between mb-1 ${
                        outside ? 'text-gray-600' : 'text-gray-300'
                      }`}>
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
```

- [ ] **Step 2: Verify the component builds in isolation**

Add a temporary test render in `src/app/(dashboard)/page.tsx` (the dashboard page) — actually skip this; we'll exercise the component when the consumer tabs are wired up in Phase C.

Run: `npm run build`
Expected: TypeScript compiles `calendar-month-grid.tsx` without errors. Other files still break — that's fine for now.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar-month-grid.tsx
git commit -m "Add shared CalendarMonthGrid component (day/week/month, custom cell renderer)"
```

---

## Phase C — Availability "By Date" redesign

### Task C1: Plumb availability windows through the page + module

**Files:**
- Modify: `src/app/(dashboard)/staff/page.tsx`
- Modify: `src/app/(dashboard)/staff/staff-module.tsx`

- [ ] **Step 1: Add the windows query in `page.tsx`**

In `src/app/(dashboard)/staff/page.tsx`, inside the `Promise.all([...])` block, add a new query for `availability_windows`:

```ts
    supabase
      .from('availability_windows')
      .select('*')
      .gte('end_date', availabilityRangeStart)
      .lte('start_date', availabilityRangeEnd)
      .order('start_date', { ascending: false }),
```

The corresponding destructure entry:

```ts
const [
  { data: profiles },
  { data: activeClocks },
  { data: timeOffRequests },
  { data: shifts },
  { data: availability },
  { data: availabilityEntries },
  { data: availabilityWindows },
  { data: recentClocks },
  { data: orgSettings },
] = await Promise.all([ /* ...existing queries with the new one inserted... */ ])
```

(Order in `Promise.all` must match the destructure order. Place the windows query immediately after `availability_entries`.)

Then pass it to `<StaffModule>`:

```tsx
return (
  <StaffModule
    profiles={profiles ?? []}
    activeClocks={activeClocks ?? []}
    timeOffRequests={timeOffRequests ?? []}
    shifts={shifts ?? []}
    availability={availability ?? []}
    availabilityEntries={availabilityEntries ?? []}
    availabilityWindows={availabilityWindows ?? []}
    recentClocks={recentClocks ?? []}
    currentUser={userOrg}
    orgHours={orgHours}
    clockNotesVisibility={clockNotesVisibility}
  />
)
```

- [ ] **Step 2: Update `StaffModule` props**

In `src/app/(dashboard)/staff/staff-module.tsx`, update imports and `Props`:

```ts
import type {
  Profile, TimeClock, TimeOffRequest, ScheduleShift, Availability,
  AvailabilityEntry, AvailabilityWindow,
} from '@/types/database'
```

Add to `Props`:

```ts
  availabilityWindows: AvailabilityWindow[]
```

Destructure in the component signature, then thread it down. Replace the `<AvailabilityTab>` and `<ScheduleTab>` JSX:

```tsx
{tab === 'schedule' && (
  <ScheduleTab
    shifts={operationalShifts}
    profiles={operationalProfiles}
    isAdmin={isAdmin}
    orgId={currentUser.orgId}
    availabilityEntries={operationalAvailabilityEntries}
    availabilityWindows={availabilityWindows}
    timeOffRequests={operationalTimeOff}
    orgHours={orgHours}
    currentUser={currentUser}
  />
)}
{tab === 'availability' && (
  <AvailabilityTab
    availabilityEntries={operationalAvailabilityEntries}
    availabilityWindows={availabilityWindows}
    profiles={operationalProfiles}
    currentUser={currentUser}
    isAdmin={isAdmin}
  />
)}
```

(Note: the `availability` legacy weekly array and `<RosterTab>`/`<ClockTab>`/`<TimeOffTab>` calls stay as they are; we only remove `availability` and `timeOff.availability` references where the tab no longer needs them. Keep `<TimeOffTab availability={operationalAvailability} />` for now to avoid breaking that tab — it's out of scope.)

- [ ] **Step 3: Verify build still type-checks page + module**

Run: `npm run build`
Expected: errors now point to `availability-tab.tsx` and `schedule-tab.tsx` (next phases will fix). Page + module compile cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/staff/page.tsx src/app/\(dashboard\)/staff/staff-module.tsx
git commit -m "Plumb availability_windows through staff page + module"
```

---

### Task C2: Build the windows strip + open-window modal

**Files:**
- Create: `src/app/(dashboard)/staff/tabs/availability-windows-strip.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import type { AvailabilityWindow } from '@/types/database'
import { fmtShortDate } from '@/lib/calendar'

interface Props {
  windows: AvailabilityWindow[]
  isAdmin: boolean
  orgId: string
  userId: string
}

export function AvailabilityWindowsStrip({ windows, isAdmin, orgId, userId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [showOpen, setShowOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => {
    const now = new Date()
    const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const lastOfNext = new Date(now.getFullYear(), now.getMonth() + 2, 0)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      label: firstOfNext.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      start_date: fmt(firstOfNext),
      end_date: fmt(lastOfNext),
    }
  })

  const open = windows.filter((w) => w.status === 'open')
  const recentlyLocked = windows.filter((w) => w.status === 'locked').slice(0, 2)

  async function openWindow(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('availability_windows').insert({
        org_id: orgId,
        label: form.label.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        status: 'open',
        opened_by: userId,
      })
      if (error) throw error
      toast('Availability window opened')
      setShowOpen(false)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open window', 'error')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function lockWindow(id: string, label: string) {
    if (!confirm(`Lock "${label}"? Staff will no longer be able to edit availability inside this window.`)) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('availability_windows')
        .update({ status: 'locked', locked_by: userId, locked_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      toast('Window locked')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to lock window', 'error')
      console.error(err)
    }
  }

  async function unlockWindow(id: string) {
    if (!confirm('Unlock this window? Staff will be able to edit availability inside it again.')) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase
        .from('availability_windows')
        .update({ status: 'open', locked_by: null, locked_at: null })
        .eq('id', id)
      if (error) throw error
      toast('Window reopened')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to unlock window', 'error')
      console.error(err)
    }
  }

  if (open.length === 0 && recentlyLocked.length === 0 && !isAdmin) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-500">
        No open availability windows. Wait for an admin to open one.
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Windows</span>
          {open.map((w) => (
            <WindowPill key={w.id} window={w}>
              {isAdmin && (
                <button
                  onClick={() => lockWindow(w.id, w.label)}
                  className="ml-1.5 text-[10px] text-gray-400 hover:text-orange-400 underline"
                >
                  Lock
                </button>
              )}
            </WindowPill>
          ))}
          {recentlyLocked.map((w) => (
            <WindowPill key={w.id} window={w}>
              {isAdmin && (
                <button
                  onClick={() => unlockWindow(w.id)}
                  className="ml-1.5 text-[10px] text-gray-400 hover:text-orange-400 underline"
                >
                  Unlock
                </button>
              )}
            </WindowPill>
          ))}
          {open.length === 0 && recentlyLocked.length === 0 && (
            <span className="text-xs text-gray-500">No windows yet.</span>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowOpen((v) => !v)}
            className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showOpen ? 'Cancel' : '+ Open window'}
          </button>
        )}
      </div>

      {showOpen && (
        <form onSubmit={openWindow} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Label</label>
            <input
              type="text"
              required
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. May 2026"
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Start date</label>
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">End date</label>
            <input
              type="date"
              required
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {saving ? 'Opening...' : 'Open window'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function WindowPill({
  window: w,
  children,
}: {
  window: AvailabilityWindow
  children?: React.ReactNode
}) {
  const start = new Date(w.start_date + 'T12:00:00')
  const end = new Date(w.end_date + 'T12:00:00')
  return (
    <span
      className={`inline-flex items-center text-[11px] px-2 py-1 rounded font-medium ${
        w.status === 'open'
          ? 'bg-green-500/15 text-green-300 border border-green-500/25'
          : 'bg-gray-700/50 text-gray-400 border border-gray-700'
      }`}
    >
      <span>{w.label}</span>
      <span className="ml-1.5 text-[10px] opacity-70">
        {fmtShortDate(start)}–{fmtShortDate(end)}
      </span>
      <span className={`ml-1.5 text-[9px] uppercase tracking-wide ${
        w.status === 'open' ? 'text-green-400' : 'text-gray-500'
      }`}>
        {w.status}
      </span>
      {children}
    </span>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: this file compiles. Errors remain in `availability-by-date.tsx` and `schedule-tab.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/staff/tabs/availability-windows-strip.tsx
git commit -m "Add availability windows strip (open/lock controls)"
```

---

### Task C3: Rewrite `availability-by-date.tsx` as month-calendar with opt-in

**Files:**
- Modify: `src/app/(dashboard)/staff/tabs/availability-by-date.tsx` (substantial rewrite)

- [ ] **Step 1: Replace the file contents**

Open `src/app/(dashboard)/staff/tabs/availability-by-date.tsx` and replace the entire file:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/toast'
import { CalendarMonthGrid } from '@/components/calendar-month-grid'
import {
  ViewMode,
  fmtDateKey,
  startOfDay,
  visibleRange,
} from '@/lib/calendar'
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

/** Returns the window covering `date` (open OR locked), or null if outside any. */
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

  // Cells indexed by `${user_id}|${YYYY-MM-DD}`
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

  // Active staff: current user only for staff; alpha-sorted with current user first for admins.
  const visibleProfiles = useMemo(() => {
    if (!isAdmin) return profiles.filter((p) => p.id === currentUser.userId)
    const me = profiles.find((p) => p.id === currentUser.userId)
    const others = profiles
      .filter((p) => p.id !== currentUser.userId)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    return me ? [me, ...others] : others
  }, [profiles, currentUser.userId, isAdmin])

  // Refetch entries when the visible range shifts beyond what we have.
  // Page initially loads -1 to +6 weeks; as the user navigates further out we
  // hydrate on demand. Ignore the first render (initial data already populated).
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
    return () => { cancelled = true }
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

      // Empty cell with no availability flag → delete to keep the table clean.
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
          Check <span className="text-green-400 font-medium">Available</span> on
          dates you can work; optionally type your hours, e.g.{' '}
          <span className="text-gray-300 font-mono">7 - 230</span>. Saves automatically.
          Cells outside an open window are read-only.
        </p>
      )}

      <CalendarMonthGrid
        anchor={anchor}
        mode={mode}
        onAnchorChange={setAnchor}
        onModeChange={setMode}
        renderCell={({ date }) => {
          const win = windowForDate(date, windows)
          // Editability rule:
          //   - admin: always editable (locked window shows badge but admin can override)
          //   - staff: only editable if a window is OPEN and covers this date
          const editable = isAdmin || (win?.status === 'open')
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
  date, window: win, profiles, currentUserId, isAdmin, editable,
  getCell, updateCell, saveCell, compact,
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
    return (
      <div className="text-[10px] text-gray-700 truncate">— {label}</div>
    )
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
        <span className={`text-[10px] truncate ${cell.is_available ? 'text-green-400' : 'text-gray-500'}`}>
          {label}
        </span>
        {cell.saving && (
          <span className="text-[9px] text-gray-600 italic ml-auto">saving</span>
        )}
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
```

- [ ] **Step 2: Drop "Weekly Default" sub-tab from `availability-tab.tsx`**

Open `src/app/(dashboard)/staff/tabs/availability-tab.tsx` and replace the entire file with this thin wrapper (the sub-tab + weekly editor go away — the legacy `availability` table stays in DB unused per spec):

```tsx
'use client'

import type { Profile, AvailabilityEntry, AvailabilityWindow } from '@/types/database'
import { AvailabilityByDateTab } from './availability-by-date'

interface Props {
  availabilityEntries: AvailabilityEntry[]
  availabilityWindows: AvailabilityWindow[]
  profiles: Profile[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
  isAdmin: boolean
}

export function AvailabilityTab({
  availabilityEntries,
  availabilityWindows,
  profiles,
  currentUser,
  isAdmin,
}: Props) {
  return (
    <AvailabilityByDateTab
      initialEntries={availabilityEntries}
      windows={availabilityWindows}
      profiles={profiles}
      currentUser={currentUser}
      isAdmin={isAdmin}
    />
  )
}
```

- [ ] **Step 3: Verify build for the availability subtree**

Run: `npm run build`
Expected: TypeScript errors are now confined to `schedule-tab.tsx` (which still references `availability` array + `is_unavailable`). Availability tab compiles cleanly.

- [ ] **Step 4: Manual smoke test — staff persona**

1. Run `npm run dev` (port 3000).
2. Log in as `sami+staffview@samizoss.com` (staff).
3. Navigate to `/staff` → Availability tab.
4. Verify: month calendar, Sunday-first, no "Weekly Default" sub-tab, your name only, no "Open window" button visible.
5. If no windows are open: cells show "No window" and are read-only.
6. Switch view: Day → Week → Month buttons cycle correctly. Anchor label updates to month name (month view), single date range (week view), single date (day view).

If any step fails, fix before continuing.

- [ ] **Step 5: Manual smoke test — admin persona**

1. Log out and back in as `sami+adminview@samizoss.com`.
2. `/staff` → Availability.
3. Click "+ Open window" → label "May 2026", start `2026-05-01`, end `2026-05-31` → Open.
4. Verify: green pill appears with "May 2026 May 1–May 31 OPEN" and a "Lock" link.
5. Navigate calendar to May. Cells inside the window are editable for all visible staff.
6. Tick "Available" on one cell → optional shifts text → blur → "saving" flickers, persists.
7. Click "Lock" → confirm → window pill turns gray "LOCKED" with "Unlock" link.
8. (Admin view: cells inside locked window remain editable but show "Locked" badge above the rows.)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/staff/tabs/availability-by-date.tsx src/app/\(dashboard\)/staff/tabs/availability-tab.tsx
git commit -m "Rebuild availability By-Date tab as month calendar with opt-in + window gating"
```

---

## Phase D — Schedule Builder rebuild

### Task D1: Rewrite `schedule-tab.tsx` as calendar with click-to-assign

**Files:**
- Modify: `src/app/(dashboard)/staff/tabs/schedule-tab.tsx` (substantial rewrite)

- [ ] **Step 1: Replace the file contents**

Open `src/app/(dashboard)/staff/tabs/schedule-tab.tsx` and replace the entire file:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import { CalendarMonthGrid } from '@/components/calendar-month-grid'
import {
  ViewMode,
  addDays,
  fmtDateKey,
  fmtShortDate,
  startOfDay,
  visibleRange,
} from '@/lib/calendar'
import type {
  Profile, ShiftRole, ScheduleShift,
  AvailabilityEntry, AvailabilityWindow, TimeOffRequest,
} from '@/types/database'
import type { OrgHours } from '../staff-module'

const roleColors: Record<ShiftRole, string> = {
  'front-desk': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  coaching: 'bg-green-500/15 text-green-300 border-green-500/30',
  management: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  other: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
}

interface ShiftWithProfile extends ScheduleShift {
  profile?: { full_name: string }
}
interface TimeOffWithProfile extends TimeOffRequest {
  profile?: { full_name: string }
}

interface Props {
  shifts: ShiftWithProfile[]
  profiles: Profile[]
  isAdmin: boolean
  orgId: string
  availabilityEntries: AvailabilityEntry[]
  availabilityWindows: AvailabilityWindow[]
  timeOffRequests: TimeOffWithProfile[]
  orgHours?: OrgHours
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
}

type FilterMode = 'mine' | 'all'

/** Approximate hours from a free-text shifts string. Best-effort only — Geneva
 *  enters semi-structured text like "7 - 230" or "open - 9, 5 - close".
 *  Returns 0 if we can't parse anything sensible.
 *
 *  Heuristics:
 *    - Split on commas → individual shift tokens.
 *    - Each token: split on "-" or "–" → two halves.
 *    - Strip non-digits, treat 1-2 digits as hour, 3-4 as h+m (e.g. "230" = 2:30).
 *    - "open" / "close" / non-numeric halves → skip the token.
 *    - Assume PM if start hour < 7 and no explicit am/pm (matches sport-club shifts).
 */
function approximateHours(shifts: string | null): number {
  if (!shifts) return 0
  let total = 0
  for (const tok of shifts.split(',')) {
    const halves = tok.split(/[-–]/).map((s) => s.trim())
    if (halves.length !== 2) continue
    const a = parseHHMM(halves[0])
    const b = parseHHMM(halves[1])
    if (a == null || b == null) continue
    let dur = b - a
    if (dur < 0) dur += 24 * 60 // wrap (e.g. "10pm - 2am")
    total += dur
  }
  return total / 60
}

function parseHHMM(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  let h = 0
  let m = 0
  if (digits.length <= 2) h = parseInt(digits, 10)
  else if (digits.length === 3) { h = parseInt(digits.slice(0, 1), 10); m = parseInt(digits.slice(1), 10) }
  else { h = parseInt(digits.slice(0, 2), 10); m = parseInt(digits.slice(2, 4), 10) }
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  // Heuristic: lone "1"-"6" usually means PM in this domain.
  const lower = raw.toLowerCase()
  if (!lower.includes('a') && !lower.includes('p') && h >= 1 && h <= 6) h += 12
  return h * 60 + m
}

export function ScheduleTab({
  shifts, profiles, isAdmin, orgId,
  availabilityEntries, availabilityWindows, timeOffRequests,
  orgHours, currentUser,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [mode, setMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [filter, setFilter] = useState<FilterMode>(isAdmin ? 'all' : 'mine')
  const [dayPopover, setDayPopover] = useState<Date | null>(null)

  // Approved time off, indexed by user → set of date keys.
  const timeOffMap = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const r of timeOffRequests) {
      if (r.status !== 'approved') continue
      if (!map[r.user_id]) map[r.user_id] = new Set()
      const start = new Date(r.start_date + 'T12:00:00')
      const end = new Date(r.end_date + 'T12:00:00')
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        map[r.user_id].add(fmtDateKey(d))
      }
    }
    return map
  }, [timeOffRequests])

  // Availability entries indexed by `user_id|YYYY-MM-DD`.
  const entryMap = useMemo(() => {
    const map: Record<string, AvailabilityEntry> = {}
    for (const e of availabilityEntries) map[`${e.user_id}|${e.entry_date}`] = e
    return map
  }, [availabilityEntries])

  // Shifts indexed by date key.
  const shiftsByDate = useMemo(() => {
    const map: Record<string, ShiftWithProfile[]> = {}
    for (const s of shifts) {
      if (!map[s.shift_date]) map[s.shift_date] = []
      map[s.shift_date].push(s)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.start_time.localeCompare(b.start_time))
    }
    return map
  }, [shifts])

  const visibleShifts = (date: Date): ShiftWithProfile[] => {
    const all = shiftsByDate[fmtDateKey(date)] ?? []
    if (filter === 'mine') return all.filter((s) => s.user_id === currentUser.userId)
    return all
  }

  // Hours summary — only for the visible range (week/month). Day mode uses week.
  const hoursSummary = useMemo(() => {
    const range = visibleRange(anchor, mode === 'day' ? 'week' : mode)
    const startKey = fmtDateKey(range.start)
    const endKey = fmtDateKey(range.end)

    type Row = {
      profile: Profile
      assignedHours: number
      availableHours: number
    }
    const rows: Record<string, Row> = {}
    for (const p of profiles) {
      rows[p.id] = { profile: p, assignedHours: 0, availableHours: 0 }
    }
    // Assigned hours from shifts.
    for (const s of shifts) {
      if (s.shift_date < startKey || s.shift_date > endKey) continue
      const a = parseTimeMinutes(s.start_time)
      const b = parseTimeMinutes(s.end_time)
      if (a == null || b == null) continue
      const dur = (b - a) / 60
      if (rows[s.user_id]) rows[s.user_id].assignedHours += Math.max(0, dur)
    }
    // Available hours from availability_entries.
    for (const e of availabilityEntries) {
      if (e.entry_date < startKey || e.entry_date > endKey) continue
      if (!e.is_available) continue
      const hrs = approximateHours(e.shifts)
      // If they marked available with no specific hours, count a typical 8h day.
      const fallback = hrs > 0 ? hrs : 8
      if (rows[e.user_id]) rows[e.user_id].availableHours += fallback
    }
    return Object.values(rows)
      .filter((r) => r.assignedHours > 0 || r.availableHours > 0)
      .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name))
  }, [profiles, shifts, availabilityEntries, anchor, mode])

  return (
    <div className="space-y-4">
      <CalendarMonthGrid
        anchor={anchor}
        mode={mode}
        onAnchorChange={setAnchor}
        onModeChange={setMode}
        toolbarRight={
          <div className="flex items-center gap-1 ml-2">
            {(['mine', 'all'] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  filter === f
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                }`}
              >
                {f === 'mine' ? 'My schedule' : 'Total schedule'}
              </button>
            ))}
          </div>
        }
        renderCell={({ date }) => {
          const dayShifts = visibleShifts(date)
          return (
            <div className="space-y-0.5">
              {dayShifts.length === 0 && mode !== 'day' && (
                <div className="text-[9px] text-gray-700">—</div>
              )}
              {dayShifts.map((s) => (
                <div
                  key={s.id}
                  className={`text-[10px] px-1 py-0.5 rounded border truncate ${roleColors[s.role]}`}
                  title={`${s.profile?.full_name ?? ''} · ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)} · ${s.role}`}
                >
                  <span className="font-medium">{s.profile?.full_name?.split(' ')[0] ?? '?'}</span>
                  <span className="opacity-70 ml-1">{s.start_time.slice(0, 5)}</span>
                </div>
              ))}
              {isAdmin && (
                <button
                  onClick={() => setDayPopover(date)}
                  className="text-[10px] w-full text-left text-gray-500 hover:text-orange-400 transition-colors mt-0.5"
                >
                  + Assign
                </button>
              )}
            </div>
          )
        }}
      />

      {/* Hours summary */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Hours summary ({mode === 'day' ? 'this week' : `this ${mode}`})
        </h3>
        {hoursSummary.length === 0 ? (
          <p className="text-xs text-gray-600">No shifts or availability submitted in this range.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {hoursSummary.map((r) => {
              const target = r.profile.target_weekly_hours
              return (
                <div
                  key={r.profile.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg text-sm"
                >
                  <span className="text-gray-300 truncate">{r.profile.full_name}</span>
                  <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                    <span className="text-white font-semibold">{r.assignedHours.toFixed(1)}h</span>
                    {' / '}
                    <span title="Estimated from availability submissions (free-text parsing — approximate)">
                      ~{r.availableHours.toFixed(0)}h avail
                    </span>
                    {target != null && (
                      <span className="ml-2 text-orange-300" title="Target weekly hours">
                        target {target}h
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {dayPopover && isAdmin && (
        <DayAssignPopover
          date={dayPopover}
          orgId={orgId}
          profiles={profiles}
          entryMap={entryMap}
          timeOffMap={timeOffMap}
          existingShifts={shiftsByDate[fmtDateKey(dayPopover)] ?? []}
          onClose={() => setDayPopover(null)}
          onAssigned={() => {
            setDayPopover(null)
            router.refresh()
          }}
          onDeleteShift={async (id) => {
            try {
              const { createClient } = await import('@/lib/supabase/client')
              const supabase = createClient()
              const { error } = await supabase.from('shifts').delete().eq('id', id)
              if (error) throw error
              toast('Shift removed')
              router.refresh()
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Failed', 'error')
            }
          }}
        />
      )}
    </div>
  )
}

function parseTimeMinutes(t: string): number | null {
  const [h, m] = t.split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

interface DayAssignPopoverProps {
  date: Date
  orgId: string
  profiles: Profile[]
  entryMap: Record<string, AvailabilityEntry>
  timeOffMap: Record<string, Set<string>>
  existingShifts: ShiftWithProfile[]
  onClose: () => void
  onAssigned: () => void
  onDeleteShift: (id: string) => void
}

function DayAssignPopover({
  date, orgId, profiles, entryMap, timeOffMap,
  existingShifts, onClose, onAssigned, onDeleteShift,
}: DayAssignPopoverProps) {
  const { toast } = useToast()
  const dateKey = fmtDateKey(date)
  const [form, setForm] = useState<{
    user_id: string
    start_time: string
    end_time: string
    role: ShiftRole
    notes: string
  }>({ user_id: '', start_time: '08:00', end_time: '14:00', role: 'front-desk', notes: '' })
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    return profiles.map((p) => {
      const e = entryMap[`${p.id}|${dateKey}`]
      const offToday = timeOffMap[p.id]?.has(dateKey)
      let status: 'available' | 'no-submission' | 'time-off' = 'no-submission'
      if (offToday) status = 'time-off'
      else if (e?.is_available) status = 'available'
      return { profile: p, status, shifts: e?.shifts ?? null }
    }).sort((a, b) => {
      const order = { available: 0, 'no-submission': 1, 'time-off': 2 } as const
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      return a.profile.full_name.localeCompare(b.profile.full_name)
    })
  }, [profiles, entryMap, timeOffMap, dateKey])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.user_id) {
      toast('Pick a staff member first', 'error')
      return
    }
    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('shifts').insert({
        org_id: orgId,
        user_id: form.user_id,
        shift_date: dateKey,
        start_time: form.start_time,
        end_time: form.end_time,
        role: form.role,
        notes: form.notes || null,
      })
      if (error) throw error
      toast('Shift assigned')
      onAssigned()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to assign', 'error')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{fmtShortDate(date)}</h3>
            <p className="text-xs text-gray-500">
              {date.toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Existing shifts */}
        {existingShifts.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-800">
            <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Already assigned</h4>
            <div className="space-y-1">
              {existingShifts.map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <span className="text-white">{s.profile?.full_name}</span>
                  <span className="text-gray-500 font-mono text-xs">
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${roleColors[s.role]}`}>{s.role}</span>
                  <button
                    onClick={() => onDeleteShift(s.id)}
                    className="ml-auto text-gray-500 hover:text-red-400 text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Availability column */}
        <div className="px-5 py-3 border-b border-gray-800">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            Who&apos;s available
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {rows.map((r) => {
              const disabled = r.status === 'time-off'
              return (
                <button
                  key={r.profile.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, user_id: r.profile.id }))}
                  className={`text-left px-3 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                    form.user_id === r.profile.id
                      ? 'bg-orange-600/30 ring-1 ring-orange-500'
                      : 'bg-gray-800 hover:bg-gray-700'
                  } ${disabled ? 'opacity-60' : ''}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    r.status === 'available' ? 'bg-green-400'
                    : r.status === 'time-off' ? 'bg-red-400'
                    : 'bg-yellow-400'
                  }`} />
                  <span className="text-white truncate">{r.profile.full_name}</span>
                  {r.shifts && (
                    <span className="text-[10px] text-gray-500 font-mono ml-auto truncate">{r.shifts}</span>
                  )}
                </button>
              )
            })}
            {rows.length === 0 && (
              <p className="text-xs text-gray-600 italic">No staff to show.</p>
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1" />Available
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 ml-3 mr-1" />No submission
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 ml-3 mr-1" />Time off
          </p>
        </div>

        {/* Assign form */}
        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Start</label>
              <input
                type="time" required value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">End</label>
              <input
                type="time" required value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as ShiftRole }))}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="front-desk">Front Desk</option>
                <option value="coaching">Coaching</option>
                <option value="management">Management</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Notes</label>
              <input
                type="text" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="optional"
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || !form.user_id}
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Assigning...' : form.user_id ? 'Assign shift' : 'Pick a staff member above'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes end-to-end**

Run: `npm run build`
Expected: build completes (TypeScript + ESLint) with **no errors**. Warnings about React-Compiler optimizations are fine. If errors, fix at the reported line numbers — usually a missing prop on `<ScheduleTab>` or a stale `availability` reference in `staff-module.tsx`.

- [ ] **Step 3: Manual smoke test — admin schedule**

1. `npm run dev` and log in as admin.
2. `/staff` → Schedule tab.
3. Verify: month calendar (default view), Sunday-first, day/week/month toggle works, "Total schedule" filter is selected by default.
4. Existing shifts render as colored pills inside the day cell.
5. Click "+ Assign" inside a day → modal opens listing staff sorted by status (available first, no-submission, time off).
6. Pick a staffer → start 09:00 → end 13:00 → role → Assign. Modal closes; shift appears in the day cell.
7. Reopen modal for the same day → existing shift listed; click "Remove" → it goes away.
8. Switch to "My schedule" → only your shifts visible. Switch back to Total.
9. Hours summary at the bottom shows assigned vs ~available; if any profile has `target_weekly_hours` set in the DB, it appears as `target NNh`.

- [ ] **Step 4: Manual smoke test — staff schedule (privacy gate)**

1. Log in as `sami+staffview@samizoss.com`.
2. `/staff` → Schedule tab.
3. Verify: filter defaults to "My schedule" (not "Total schedule").
4. Other staff's shifts ARE visible when toggled to Total — that's allowed.
5. **No "Staff Availability" panel is rendered** anywhere on the schedule view (this was the privacy bug).
6. **No "+ Assign" button visible** on day cells (admin-only).
7. **No availability data leak**: clicking a day does not open the popover for staff users.
8. Hours summary shows your assigned hours only when filter=mine; everyone's when filter=all is selected by staff (this is acceptable — shifts are public, but availability is not).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/staff/tabs/schedule-tab.tsx
git commit -m "Rebuild Schedule tab as calendar with click-to-assign + hours summary"
```

---

## Phase E — Final QA + ship

### Task E1: End-to-end review pass

- [ ] **Step 1: Cross-feature integration test (admin)**

1. `npm run dev`. Admin login.
2. Open availability window for next month (e.g. May 2026).
3. Switch to staff persona, fill in 3 days as Available with shifts text.
4. Switch back to admin. Lock the window.
5. Verify: in Schedule tab, navigate to May → click "+ Assign" on a day where staff marked Available → that staffer appears as Available (green dot) in the popover.
6. Assign them a 9–1 shift.
7. Hours summary at bottom shows assigned 4h vs ~available for that staffer.

If anything misaligns (e.g. staff shows "no submission" despite ticking Available), debug — likely a stale `is_available` vs `is_unavailable` reference somewhere we missed.

- [ ] **Step 2: Run the full build one more time**

Run: `npm run build`
Expected: clean exit. No type errors, no ESLint failures. Capture the bundle-size diff in `git status` for the PR description.

- [ ] **Step 3: Update `docs/CURRENT_STATE.md`**

Open `docs/CURRENT_STATE.md` and:
1. Bump the snapshot date in the header to today.
2. Move "NEXT-SESSION BIG BUNDLE" content into a "Shipped 2026-04-28" section under Staff module.
3. Update the migration list to include `006_availability_windows_and_opt_in.sql`.
4. Update the table cheat sheet to include `availability_windows` (now 26 tables).
5. In "Next up", remove items now shipped (release/lock workflow, schedule builder rebuild, availability redesign).
6. Update the git log section with the new commits.

(Don't be exhaustive — the goal is the next-session-Claude reads it and isn't misled.)

- [ ] **Step 4: Commit doc + push**

```bash
git add docs/CURRENT_STATE.md
git commit -m "Update CURRENT_STATE for shipped availability + schedule bundle"
git push -u origin bundle/availability-schedule-builder
```

- [ ] **Step 5: Open the PR**

Use `gh pr create` (per CLAUDE.md the workflow is branch → PR → admin-merge):

```bash
gh pr create --title "Availability + Schedule Builder bundle" --body "$(cat <<'EOF'
## Summary
- Migration 006: `availability_windows` + invert `is_unavailable`→`is_available` + add `profiles.target_weekly_hours`
- Shared `<CalendarMonthGrid>` component (day/week/month, custom cell renderer)
- Availability "By Date" rebuilt as month calendar with opt-in semantics + window release/lock workflow
- Schedule tab rebuilt as calendar with click-to-assign popover that surfaces who's available + hours summary
- Privacy fix: staff users no longer see other staff's availability data on the Schedule view

## Test plan
- [ ] Admin: open window for May 2026, lock it, verify staff cells become read-only inside the locked range
- [ ] Staff: tick Available + type shifts inside an open window; verify autosave; verify cells outside any open window are read-only
- [ ] Admin Schedule tab: click "+ Assign" → see Available/No-submission/Time-off groups → assign a shift
- [ ] Staff Schedule tab: filter defaults to "My schedule"; no "+ Assign" button; no Staff Availability panel
- [ ] Hours summary: matches assigned shift hours; available hours are best-effort estimates from free-text shifts
- [ ] Day / Week / Month toggle on both tabs

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Self-merge once CI is green**

```bash
gh pr merge --squash --delete-branch --admin
git checkout master && git pull
```

- [ ] **Step 7: Verify Vercel production deploy contains the merge SHA**

Check the latest production deploy on Vercel; confirm its commit SHA matches the squashed merge. Then visit `thepbjar.courtops.app/staff` and walk through one cell of each new feature live.

---

## Notes for the implementing engineer

**Why no automated tests?** The CourtOps codebase has no test infrastructure (no Vitest/Jest/Playwright config, no `__tests__` dir). Adding it for this bundle would balloon scope. The project's verification stack is `npm run build` (TypeScript strict mode + ESLint) plus the manual personas described. If a test infra is later added, the most valuable units to cover would be: `src/lib/calendar.ts` helpers (pure, deterministic) and the `approximateHours()` parser inside `schedule-tab.tsx` (move it to `src/lib/schedule-hours.ts` if extracting).

**Why fold `availability-by-date.tsx` into the only consumer of `availability-tab.tsx`?** The "Weekly Default" sub-tab is being deleted (per the spec), leaving `<AvailabilityTab>` as a one-line passthrough. We keep it because `staff-module.tsx` and other plumbing already references it; we don't want a same-PR rename that touches more files than necessary.

**RLS gotcha worth re-reading before coding:** `docs/CURRENT_STATE.md:305` (the second-FK-to-profiles bug). None of the new tables in this bundle have a second FK to `profiles` (`opened_by` and `locked_by` are the only profile FKs on `availability_windows`), so they're safe — but if you `.select(...)` joins on `availability_windows` later, prefer explicit FK syntax: `opener:profiles!availability_windows_opened_by_fkey(full_name)`.

**Don't pre-extract the calendar grid into its own package.** It's used in two places. If a third consumer appears, then re-evaluate.

**Approximation in `approximateHours`:** Geneva's free-text shifts ("7 - 230") are deliberately not parsed semantically yet (per CURRENT_STATE.md). The hours-summary number is a best-effort estimate marked as "~Xh avail" in the UI to set the expectation. This is *not* a precision tool — it's a "did I forget to schedule this person who said they're available 30 hours" sanity check. Don't sink time into a perfect parser.
