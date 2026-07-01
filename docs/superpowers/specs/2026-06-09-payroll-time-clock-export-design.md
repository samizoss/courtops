# Payroll time-clock export (Phoenix) — design

**Date:** 2026-06-09
**Status:** Approved design, pre-implementation (revised after 4-agent QA pass)
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

**This is the first "canned report" under roadmap #24** ("don't build a custom report builder;
ship canned reports, charge for new ones as paid customization"). Single fixed format, no
builder. See § Parked and § Roadmap relationship.

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
- Dept / Division / Location / CompanyCode columns — The Jar is single-location (pending ATY Q).
- PTO / holiday hours — entered separately in Phoenix; this file is worked hours only (ATY Q).
- **Multiple pay rates per employee** — a single org-wide pay code cannot represent a staffer
  paid differently for, e.g., coaching vs front desk. Flagged as a known limitation + ATY Q;
  not solved in v1.
- Multi-format support, format registry, other payroll systems — parked.
- A dedicated timesheet review/approve UI — parked.
- SSN-specific PII handling (masking/encryption) — we steer the identifier toward a Phoenix
  Employee ID / TimeClock ID instead (see § Identifier & PII). If ATY mandates SSN, that's a
  revisit, not v1.

---

## Data model

One migration (**019** — next sequential; current highest on disk is `018_week_start_day.sql`).
Applied via the Supabase MCP `apply_migration` per CLAUDE.md. It adds:

1. **`profiles.payroll_id text` (nullable)** — the value Phoenix matches the employee on
   (preferably a Phoenix **Employee ID** or **TimeClock ID** — see § Identifier & PII). Set per
   staffer by Geneva in the Roster **EditStaffModal**. Null ⇒ that staffer is excluded from the
   export and surfaced as a warning (if they're otherwise payable).
   - **Partial unique index:** `unique (org_id, payroll_id) where payroll_id is not null` — a DB
     guard against the silent "two people share an ID → Phoenix merges their pay" bug.
   - **RPC change (do not miss):** EditStaffModal does not write `profiles` directly — it writes
     through the SECURITY DEFINER function `update_staff_profile` (current signature in migration
     `014`). The migration must **drop/recreate `update_staff_profile`** with a new
     `p_payroll_id` parameter that writes the column, and the client `.rpc(...)` call must pass
     it. A bare `ALTER TABLE` is insufficient — the column would be unreachable from the UI.

2. **`org_settings.payroll_pay_type text`** — the single `Pay` code Phoenix expects for regular
   hourly work (External ID or description — ATY Q). One value per club, set in
   **Settings → General** under a new "Payroll export" subsection. Default empty until ATY
   confirms. No new RLS policy needed (migrations 011/012 already grant owner/admin UPDATE on
   `org_settings`; RLS is column-agnostic).

3. **`payroll_exports` audit table** — `id, org_id, exported_by (profiles.id), start_date,
   end_date, row_count, staff_count, total_hours, format_version, created_at`. One row written on
   each actual CSV download (not on preview). RLS: owner/admin SELECT + INSERT scoped to org.
   Mirrors the team's existing `time_clock_edits` audit standard for sensitive actions.

Nothing else is added. No rate, no OT fields.

**Timezone note:** the org timezone lives on **`orgs.timezone`**, *not* `org_settings`. The route
reads `orgs.timezone` and `org_settings.payroll_pay_type` as two separate fetches.

## Identifier & PII

`payroll_id` is whatever Phoenix matches employees on. Phoenix accepts Employee ID, SSN, or
TimeClock ID — **we will ask ATY to use the Employee ID or TimeClock ID, not SSN**, so we avoid
storing SSNs in a plaintext column and shipping them in a downloadable CSV. Decisions:

- Stored as plain `text`. Acceptable *because* we're steering away from SSN. No UI masking in v1.
- The downloaded CSV leaves CourtOps' security boundary by design once it's in Geneva's browser;
  that's an accepted property of any export, not a defect.
- If ATY insists the identifier must be SSN, we stop and revisit (add masking + reconsider
  at-rest handling) before shipping — it is not assumed-acceptable.

## Export pipeline

Three small, isolated, independently-testable pieces. `aggregate.ts` is **new code**, not a
reuse of the existing Hours Summary logic (that does a flat per-user sum, no timezone-day
bucketing, no warnings).

### 1. Aggregation — `src/lib/payroll/aggregate.ts` (pure)

`aggregatePayroll({ timezone, staff, entries, start, end })` →
`{ rows: PayrollDayRow[], warnings: Warning[], blockers: Blocker[], totals }`

**Staff inclusion (explicit):** only staff with `is_active = true` **and**
`is_operational_staff = true` are *payable*. Viewers (Travis/Kevin), non-operational, and dev/
hidden accounts are excluded entirely (not warned). Among payable staff, a null `payroll_id`
produces a warning ("expected to be paid but no Payroll ID: …").

**Day bucketing:** each entry is bucketed by **(user_id, local calendar date of `clock_in` in the
org timezone)**, using a **DST-aware** conversion (`Intl.DateTimeFormat` with `timeZone`, or
`date-fns-tz`) — never naive `Date` offset math.

**Minutes per entry:**
- Timestamps are `timestamptz`; compute the **true UTC delta** `clock_out − clock_in`.
- **Non-manual rows** require `clock_out`; if null → open entry → excluded + warning.
- **Manual rows** (`is_manual_entry = true`): trust `total_minutes` if present even when
  `clock_out` is null (manual "I worked 6h" entries often have no out-punch). Do **not** apply
  the open-entry exclusion to manual rows.
- If a stored `total_minutes` and the timestamp delta disagree beyond a small tolerance → use the
  timestamp delta and **flag** the discrepancy (covers DST-night mismatches).

**Per-day hours:** sum the bucket's minutes, convert to hours, **round half-up to 2 decimals**.
The pre-flight `totals.totalHours` is the **sum of these rounded daily values** so the displayed
total always ties to the CSV rows.

`PayrollDayRow = { payrollId, firstName, lastName, hours, workDate }`.

### 2. Phoenix CSV builder — `src/lib/payroll/phoenix-excel.ts` (pure)

The **only** file that knows the Phoenix layout. `toPhoenixExcelCsv(rows, payType)` → string.
Carries a `FORMAT_VERSION` constant (recorded in the audit row).

Header + rows: `EmployeeID,FirstName,LastName,Pay,Units,Hours,WorkDate`

- `EmployeeID` = `payrollId` — **quoted** so leading zeros survive Excel (`0042` stays `0042`).
- `FirstName` / `LastName` = staffer name (nullable in DB → emit empty string).
- `Pay` = `payType` (the club pay-type code).
- `Units` / `Hours` = the day's hours, `toFixed(2)` (forced `.` decimal, never locale-formatted).
  **NOTE:** that `Units == Hours` is an *assumption pending ATY confirmation* (KB says "we pay by
  the unit" — Units may be a multiplier quantity, not clock hours). This is now an explicit ATY
  question, not a settled fact.
- `WorkDate` = local date, **MM/DD/YYYY** (pending ATY).
- **CSV quoting:** any field containing comma, quote, or newline is double-quoted, internal
  quotes doubled.
- **Formula-injection neutralization:** any text field (names) whose first char is
  `= + - @ \t \r` is prefixed with a leading apostrophe before quoting, so the bookkeeper opening
  the CSV in Excel doesn't execute it. `payroll_id` is instead **validated** up front (reject
  values starting with `= + - @`) rather than mutated, since Phoenix matches on it exactly.

A future format (e.g. "Swipe Clock Import 1") is a new sibling module + a selector — no change
to aggregation.

### 3. API route — `src/app/api/staff/payroll-export/route.ts`

GET, params `?start=YYYY-MM-DD&end=YYYY-MM-DD`.

- **Auth:** owner/admin only — mirrors the `sync/courtreserve` check (verify user, load profile,
  `role IN ('owner','admin')` else 403). Staff **and viewers** cannot pull payroll (viewers have
  read visibility elsewhere but payroll is intentionally owner/admin-only).
- **Client:** standard **user-scoped** server client; org scoping via RLS + explicit `org_id`
  filter. **No service-role client.**
- **Param validation:** `start`/`end` must match `^\d{4}-\d{2}-\d{2}$`, else 400. Used for both
  the SQL range and the filename — never reflect raw params into the `Content-Disposition`
  header.
- Reads `orgs.timezone` and `org_settings.payroll_pay_type` (separate fetches), payable staff
  profiles (`id, payroll_id, first_name, last_name, is_active, is_operational_staff`), and
  `time_clock` rows in range. Loads staff and clock rows **separately** (avoids the PostgREST 300
  multiple-FK join issue; if a join is ever needed, FK-qualify per the project gotcha).
- Calls `aggregatePayroll`, then:
  - **`&preview=1`** → JSON `{ totals, warnings, blockers }` (powers the pre-flight UI). No audit
    row.
  - **default** → if any **blocker** present, 409 with the blocker list. Otherwise CSV via
    `toPhoenixExcelCsv`, returned with `Content-Type: text/csv` and
    `Content-Disposition: attachment; filename="payroll_thejar_<start>_<end>.csv"`, **and write a
    `payroll_exports` audit row** (actor, range, counts, total hours, format version).

### Hard blockers vs soft warnings

**Hard blockers** (pre-flight disables Download; default route returns 409):
| Blocker | Why |
|---|---|
| `org_settings.payroll_pay_type` unset | Every row's `Pay` would be invalid |
| Duplicate `payroll_id` among payable staff | Phoenix would silently merge two people's pay |
| `payroll_id` with a formula-injection prefix (`= + - @`) | Unsafe / would corrupt the match key |

**Soft warnings** (inform, never block — Geneva exports, fixes, re-exports):
| Warning | Behavior |
|---|---|
| Payable staffer has no `payroll_id` | Excluded; listed by name |
| Non-manual entry still open (`clock_out` null) | Excluded; listed |
| `clock_out ≤ clock_in` / negative / zero duration | Excluded; listed |
| Day total > 16h | Included; flagged for review |
| Overlapping entries, same user + day | Included; flagged (possible double-count) |
| Entry crosses local midnight | Included on the clock-in day; flagged (see § Open questions) |
| Stored `total_minutes` ≠ timestamp delta (e.g. DST night) | Uses delta; flagged |

**Re-import caution banner** (until ATY confirms append-vs-replace): the modal warns
"Re-importing a date range you already imported into Phoenix may duplicate hours — confirm with
your bookkeeper." The "export, fix, re-export" workflow is only safe if Phoenix *replaces* on
re-import (ATY Q).

Daily rounding to 2 decimals is round-half-up; the period total is the sum of rounded daily
values (and the pre-flight displays that same sum so it always ties to the file).

## UI / UX

**Entry point:** the Clock tab's existing **Hours Summary** (admin-gated already). Add an
owner/admin **"Export for payroll"** button.

**`PayrollExportModal` (new client component):**
1. Opens pre-filled with the Hours Summary's current date range; admin can adjust. Quick presets
   (last week / last 2 weeks / this month) added once ATY confirms cadence.
2. On open, calls the route with `preview=1` and shows a **pre-flight**: total staff, total
   hours, **blockers** (Download disabled until cleared) and **warnings** in plain language, plus
   the re-import caution banner.
3. **"Download CSV"** streams the file (and triggers the audit-row write server-side). Warnings
   don't block; blockers do.

**Setup surfaces:** `payroll_id` in the Roster EditStaffModal (via the updated RPC);
`payroll_pay_type` in Settings → General. If either is unset, the pre-flight says exactly what to
fix and where.

## Open questions for ATY (Chris / Shannon)

Tracked with a sample in `docs/payroll/` (`sample-phoenix-time-clock-export.csv` +
`aty-phoenix-export-questions.md`). The sharpened set:

1. Confirm layout = Phoenix "Excel Time Clock Import CSV"?
2. Identifier — **we'd prefer Employee ID or TimeClock ID, not SSN**; confirm which to use.
3. Pay code value for regular hourly work (External ID / description)?
4. **Units vs Hours** — for an hourly code, should `Units` equal worked hours, and should `Hours`
   also be populated? Do they differ? *(We show them equal as a guess — please confirm. This is
   the highest-risk mapping.)*
5. OT — confirm Phoenix computes overtime from the hours + work dates we send (we send raw daily
   hours under one code, no OT split)?
6. **Re-import behavior** — if we re-import an overlapping date range, does Phoenix **replace** or
   **append** (i.e., will re-export double-pay)?
7. Work-week start day + whether pay-period boundaries align to work-week ends (for OT)?
8. Phoenix's rounding convention (decimals, half-up vs truncate) so our totals tie out?
9. **Overnight punches** — how does SwipeClock attribute a shift that crosses midnight today, so
   we match it?
10. WorkDate format (MM/DD/YYYY ok)?
11. Extra columns (CompanyCode/Dept/Division/Location) needed? *(assume no — single location)*
12. Terminated/inactive employees with hours in range — include or exclude?
13. **Multiple pay rates** — does any staffer work two roles at two rates? *(structural — one
    pay code per club can't represent it)*
14. PTO/holidays — entered separately in Phoenix, or expected here? *(assume separate)*
15. Send a sample of the current SwipeClock export so we can diff our output.

Working assumptions we build against until they answer are parameterized (config values / column
toggles), so none block *building*. Two answers gate a *usable* export: Q3 (pay code — the hard
blocker) and Q4 (Units/Hours semantics).

## Testing

- **Unit — `aggregate.ts`:** timezone-day bucketing; **DST-night** (spring-forward/fall-back)
  delta vs stored-minutes; **cross-midnight** attribution; multi-punch same-day summing; null
  `total_minutes` compute; non-manual open-entry exclusion; **manual entry with null clock_out +
  total_minutes set** (included); negative/zero duration exclusion; overlapping-interval flag;
  >16h flag; staff inclusion filter (viewer/dev excluded); **rounding-aggregation** (period total
  = sum of rounded dailies).
- **Unit — `phoenix-excel.ts`:** header; `toFixed(2)` integer-hour day → `"8.00"`; CSV escaping;
  **formula-injection** neutralization (`=`,`+`,`-`,`@` names); leading-zero EmployeeID quoting;
  empty input → header only.
- **Route:** authz (staff + viewer → 403; admin/owner → 200); param validation (bad date → 400);
  blocker present → 409; preview shape; audit row written on download only.
- **Manual:** generate a CSV for a known range; hand to Travis/ATY to test-import into Phoenix.

## Roadmap relationship

- **#24 (canned reports, no builder):** this export *is* the first canned report under that
  policy. The parked format registry (Approach B) is the thing #24 forbids building now.
- **#25 (payout/commission report — Geneva's Excel):** a **separate** canned report, not this
  one. This export deliberately computes no pay. The `aggregatePayroll` primitive (per-user,
  per-day hours in org tz) is a plausible shared building block for #25 — designed to be reusable,
  but #25 stays out of scope here.

## Parked (revisit after the Jar proves an import succeeds)

Lands in `docs/CURRENT_STATE.md` under a payroll-export entry:
- **Approach B** — config-driven format registry (multiple Phoenix layouts, CyberPay, other
  clubs). Trigger: a second club with a different payroll system. (Aligns with #24.)
- **Approach C** — full timesheet review/approve workflow (employee×day grid, flag manual
  entries / missing clock-outs / over-40 weeks, approve → export).
- **Multiple pay rates per employee** — if a staffer is paid different rates per role, the single
  org pay code + single `payroll_id` model needs rework (per-shift rate or per-role pay codes).
- Date-preset cadence wiring once ATY confirms pay period; split-at-midnight attribution if ATY
  says overnight hours belong to day 2 / daily-OT clubs onboard.
