# Payroll time-clock export (Phoenix) — design

**Date:** 2026-06-09
**Status:** Approved design, pre-implementation
**Author:** Sami Zoss (with Claude)

---

## Problem

The Jar is migrating off SwipeClock this summer. Their bookkeeper (Accountable to You /
CyberPay) needs employee hours imported into **CPO Phoenix** for payroll. CourtOps already
captures clock-in/clock-out in the `time_clock` table but has no way to get that data out.
We need an export that produces a Phoenix-importable file of worked hours.

## Scope & roles (the important framing)

CourtOps is a **timekeeping export, not a payroll engine.**

- **CourtOps' job:** produce accurate worked hours per employee, per day, for a chosen date
  range, in a Phoenix-importable CSV.
- **Phoenix / ATY's job:** wages, overtime calculation, taxes, pay-type setup, the import
  itself. We do **not** compute OT, gross pay, or rates.
- **Geneva's job:** map each CourtOps staffer to their Phoenix identifier, pick the date range,
  review hours (and warnings) before exporting.

**Target format:** Phoenix **"Excel Time Clock Import CSV"** (KB 622) — the KB's recommended
starting layout, a real headered CSV (not fixed-width), easiest to generate and debug.

**Granularity:** one row **per employee, per day** (the day's summed hours). This mirrors the
per-punch-date granularity SwipeClock already sends ATY today, and lets Phoenix compute OT.

This is **Approach A** (minimal canned export, Jar-tuned) with a thin seam toward future
generalization: the Phoenix column mapping is isolated in one module so adding another format
later is a sibling file, not a rewrite. We are **not** building a format registry or a full
review/approve workflow yet (see § Parked).

## Out of scope (deliberately)

- Hourly rate / gross pay / OT calculation — Phoenix owns these.
- Dept / Division / Location / CompanyCode columns — The Jar is single-location (pending ATY Q5).
- PTO / holiday hours — entered separately in Phoenix; this file is worked hours only (ATY Q8).
- Multi-format support, format registry, other payroll systems — parked.
- A dedicated timesheet review/approve UI — parked.

---

## Data model

One migration (next sequential number) adds:

1. **`profiles.payroll_id text` (nullable)** — the value Phoenix matches the employee on (their
   Employee ID, SSN, or TimeClock ID — *which* is ATY Q2). Set per staffer by Geneva in the
   Roster **EditStaffModal**. Null ⇒ that staffer is excluded from the export and surfaced as a
   warning.

2. **`org_settings.payroll_pay_type text`** — the single `Pay` code Phoenix expects for regular
   hourly work (External ID or description — ATY Q3). One value per club, set in
   **Settings → General** under a new "Payroll export" subsection. Default empty until ATY
   confirms.

Nothing else is added to the schema. No rate, no OT fields.

## Export pipeline

Three small, isolated, independently-testable pieces.

### 1. Aggregation — `src/lib/payroll/aggregate.ts` (pure)

`aggregatePayroll({ timezone, staff, entries, start, end })` →
`{ rows: PayrollDayRow[], warnings: Warning[], totals: { staffCount, totalHours } }`

- Buckets each `time_clock` entry by **(user_id, local calendar date of `clock_in` in the org
  timezone)** — an 11pm shift stays on its own day, doesn't bleed into the next.
- Sums `total_minutes` per bucket; computes it from `clock_in`/`clock_out` when the column is
  null; converts to **hours rounded to 2 decimals** per day.
- Includes manual entries (`is_manual_entry = true`) — they are real worked hours.
- `PayrollDayRow = { payrollId, firstName, lastName, hours, workDate }`.

### 2. Phoenix CSV builder — `src/lib/payroll/phoenix-excel.ts` (pure)

The **only** file that knows the Phoenix layout. `toPhoenixExcelCsv(rows, payType)` → string.

Header + rows: `EmployeeID,FirstName,LastName,Pay,Units,Hours,WorkDate`

- `EmployeeID` = `payrollId`
- `FirstName` / `LastName` = staffer name (optional in spec; included for readability)
- `Pay` = `payType` (the club pay-type code)
- `Units` = `Hours` = the day's hours, 2 decimals
- `WorkDate` = local date, **MM/DD/YYYY** (pending ATY Q4)
- Proper CSV quoting: any field containing comma, quote, or newline is double-quoted with
  internal quotes doubled.

A future format (e.g. "Swipe Clock Import 1") is a new sibling module + a selector — no change
to aggregation.

### 3. API route — `src/app/api/staff/payroll-export/route.ts`

GET, params `?start=YYYY-MM-DD&end=YYYY-MM-DD`.

- **Auth:** admin/owner only — mirrors the `sync/courtreserve` route's check (verify user, load
  profile, `role IN ('owner','admin')` else 403). Staff cannot pull payroll.
- Loads org (timezone, `payroll_pay_type`), staff profiles (`id, payroll_id, first_name,
  last_name`), and `time_clock` rows in range (FK-qualified select per the project's PostgREST
  300 gotcha if joining profiles).
- Calls `aggregatePayroll`, then:
  - **`&preview=1`** → JSON `{ totals, warnings }` (powers the pre-flight UI).
  - **default** → CSV via `toPhoenixExcelCsv`, returned with
    `Content-Type: text/csv` and
    `Content-Disposition: attachment; filename="payroll_thejar_<start>_<end>.csv"`.

### Edge cases — all surfaced as warnings, never silent drops

| Case | Behavior |
|---|---|
| Staffer has no `payroll_id` | Excluded from CSV; warning lists them by name |
| Entry still open (`clock_out` null) | Excluded; warning ("Cody clocked in 6/8, never out") |
| Day total > 16h | Included but flagged as suspicious for review |
| `total_minutes` null | Computed from `clock_in`/`clock_out` |
| No hours in range | Header-only CSV + clear "no hours found" message |

**Soft warnings vs hard blocker.** The cases above (missing `payroll_id`, open entries, >16h)
are **soft warnings**: they inform Geneva but do not block the download — she exports, fixes,
re-exports as needed. The **one hard blocker** is an unset org `payroll_pay_type`: without it
every row's `Pay` column would be invalid, so the pre-flight disables Download with "Set your
payroll pay code in Settings → General."

Daily rounding to 2 decimals is applied per day (standard payroll practice); the period total is
the sum of rounded daily values.

## UI / UX

**Entry point:** the Clock tab's existing **Hours Summary** (already a date range + per-person
totals). Add an admin-only **"Export for payroll"** button.

**`PayrollExportModal` (new client component):**
1. Opens pre-filled with the Hours Summary's current date range; admin can adjust. Quick presets
   (last week / last 2 weeks / this month) added once ATY confirms cadence (Q7).
2. On open, calls the route with `preview=1` and shows a **pre-flight**: total staff, total
   hours, and any warnings in plain language.
3. **"Download CSV"** streams the file (fetch → blob → anchor download, or direct navigation).
   Warnings inform but do **not** block — Geneva can fix a missing ID / chase a clock-out and
   re-export.

**Setup surfaces:** `payroll_id` in the Roster EditStaffModal; `payroll_pay_type` in
Settings → General. If either is unset, the pre-flight says exactly what to fix and where.

## Open questions for ATY (Chris / Shannon)

Tracked with a sample in `docs/payroll/`:
- `docs/payroll/sample-phoenix-time-clock-export.csv` — sample output (placeholder IDs + pay code)
- `docs/payroll/aty-phoenix-export-questions.md` — cover note + the 8 questions

Working assumptions we build against until they answer: EmployeeID = Phoenix Employee ID; one
`Hourly` pay code with Phoenix computing OT; WorkDate MM/DD/YYYY; no Dept/Division/Location;
PTO/holidays handled separately in Phoenix. None of these block building — they're config values
or column toggles we adjust on their reply.

## Testing

- **Unit:** `aggregate.ts` — timezone bucketing, minute summing, null `total_minutes` compute,
  open-entry exclusion, >16h flag, multi-punch same-day summing.
- **Unit:** `phoenix-excel.ts` — header, 2-decimal formatting, CSV escaping, empty input.
- **Manual:** generate a CSV for a known range; hand to Travis/ATY to test-import into Phoenix
  (the whole point of targeting Phoenix — instant feedback loop).

## Parked (revisit after the Jar proves an import succeeds)

Lands in `docs/CURRENT_STATE.md` under a payroll-export entry:
- **Approach B** — config-driven format registry (multiple Phoenix layouts, CyberPay, other
  clubs). Trigger: a second club with a different payroll system. Aligns with roadmap #24
  ("don't build a report builder; ship canned reports, charge for new ones").
- **Approach C** — full timesheet review/approve workflow (employee×day grid, flag manual
  entries / missing clock-outs / over-40 weeks, approve → export).
- Date-preset cadence wiring once ATY confirms pay period.
