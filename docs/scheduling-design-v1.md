# Scheduling Module — Design North-Star (v1)

> **What this is:** the *why* behind CourtOps' scheduling module — the mental model, the competitive differentiation, the compliance shape, and the smallest valuable roadmap.
>
> **What this is NOT:** a ticket-ready build spec. Three open questions in this doc directly affect V1.0 scope and need Geneva's input before we ticket V1.0. Compliance citations need re-verification against primary sources before encoding into the V2.0 enforcement engine.
>
> **Source:** Captured 2026-05-05. Author: Sami (with research input). Treat this as the canonical reasoning doc; `docs/CURRENT_STATE.md` remains the canonical "what's shipping when."

---

## Section 1 — UX Friction Audit & Feature Matrix

The **"Alicia Bar"**: a staff member must be able to manage their schedule in under two minutes via mobile web without downloading a native app. Current market leaders fall short of this via secondary app requirements or heavy "Live-Assignment" bias.

### Competitor friction audit

- **7shifts:** consolidated many features but often still relies on the `7punches` app for hardware-based time clocking or advanced setups. High-friction multi-app setup for a 13-person club.
- **Homebase:** robust "all-in-one" but prioritizes its native app for real-time notifications + GPS. Mobile-web PWA experience feels secondary.
- **Sling:** closest to our segment with focus on unassigned shifts. Lacks deep recreation-specific compliance guardrails for minor-labor laws.

### Feature matrix

| Dimension | 7shifts | Homebase | Sling | **CourtOps (Proposed)** |
|---|---|---|---|---|
| Primary workflow | Live-Assignment | Mixed (Auto-Schedule) | Unassigned Shifts | **Plan-then-Assign** |
| App friction | High (7punches app) | Moderate (native bias) | Low | **Zero (PWA only)** |
| Compliance focus | Restaurant/POS | General SMB | Minimal | **Recreation/Minor-specific** |
| Availability model | Preference-based | Mark Available | Mark Unavailable | **Sacred Unavailability** |

---

## Section 2 — The Availability Mental Model

To match the "Outlook/Google Calendar" metaphor used in recreation management, CourtOps uses the **"Mark Unavailable"** model.

### Open question for Geneva (affects V1.0 scope)

**Terminology choice:** While the system internally models "Sacred Unavailability," the team currently uses "Availability Submissions." Decide:

- Retain **"Set Availability"** (avoid retraining friction; what Geneva already says) — OR
- Flip to **"Block Time Off"** (reinforces the new mental model from day one)

### Mobile ergonomics

- Entry is via **tap-to-toggle 30-minute grid**.
- Allows "Alicia" to "paint" her school blocks onto her schedule with a single drag-tap gesture rather than fumbling with start/end time dropdowns.

---

## Section 3 — Federal Compliance & Simplified Data Model

The system treats Fair Labor Standards Act (FLSA) rules for 14- and 15-year-olds as **Hard Constraints** — they cannot be bypassed by Geneva or the AI drafting tool.

### FLSA product logic (ages 14–15) — DOL Fact Sheet #37

- **School days:** max 3 hours per day (including Fridays).
- **School weeks:** max 18 hours per week.
- **Non-school weeks:** max 8 hours per day, 40 hours per week.
- **Night work:** prohibited after 7:00 PM (extends to 9:00 PM between June 1 and Labor Day).

### The simplified data model

- **Staff Profile:** stores **Date of Birth (DOB)**.
- **Club School Calendar:** a boolean `is_school_day` flag for every date.
- **Employee Calendar Override:** single-table entity allowing Geneva to toggle the `is_school_day` status for individual employees (e.g. homeschooled students). Replaces complex District ID syncing.

### Implementation note

> This data model can be implemented now without waiting for compliance encoding (which is V2.0). Adding `profiles.date_of_birth`, a `club_school_calendar(org_id, date, is_school_day)` table, and a `profile_school_day_overrides` table is foundational and unblocks the V2.0 enforcement engine without committing to specific rule semantics.

---

## Section 4 — State-Specific Variance (Look-up List)

Material variances from federal standards. **All citations need re-verification against primary sources before encoding into a hard-block constraint engine.** "This rule exists" ≠ "this rule encoded as `if age < 16 and is_school_day: max_hours = 3` is correct in all edge cases."

- **California (CA):** Minors 16–17 limited to 4 hours on school days under Labor Code 1391(a)(4). Night work prohibited after 10:00 PM on nights preceding a school day.
- **New York (NY):** Minors 16–17 capped at 28 hours per week when school is in session. Cannot work past 10:00 PM before a school day without written parental + school permission.
- **Illinois (IL):** Under the Child Labor Law of 2024 (820 ILCS 206/30), combined hours of school + work cannot exceed 8 hours in a single day for minors under 16.
- **Washington (WA):** For 16–17 year-olds, HB 1121 (effective July 1, 2026) allows students in approved Career & Technical Education programs to work the same hours as during school breaks, provided employer is program-approved.
- **Massachusetts (MA):** State law prohibits any minor under 18 from working past 8:00 PM without direct, on-site adult supervision.
- **Oregon (OR):** Statewide law requires 10 hours of rest between shifts; back-to-back shifts within this window require time-and-a-half "predictability pay."

---

## Section 5 — "Plan-then-Assign" V2 Architecture

The **Coverage Map** visualizes the gap between Geneva's demand and staff availability.

### Request Extension Flow

- Geneva can nudge staff who have blocked time, but to prevent coercion, a **Rate Limit** is applied: max 1 extension request per staff member per rolling 7-day period.

### Trust Integrity

- The system **never** proposes a Draft that overrides a "Blocked Time Off" window.
- These gaps remain red on the heatmap until a staff member voluntarily overrides their block.

---

## Section 6 — Shift Swap & Audit Trail

### Swap validation

Staff can swap shifts with qualified coworkers, provided the system validates:

1. **Availability:** recipient has no conflicting shifts or active unavailability blocks.
2. **Role match:** recipient has the required qualification tag (the `capabilities` array we already have).
3. **Compliance:** accepting the shift does not breach state/federal caps (V2.0).

### The audit trail

Every shift change must generate an audit record:

- `original_assignee` / `accepted_by` / `approved_by`
- `timestamp_requested` / `timestamp_finalized`
- `reason_text` (staff-entered)

### Surface area

- Logs viewable in the Manager Dashboard.
- Included in all CSV/Payroll exports.

### Implementation note

> These audit fields should be **baked into the swap table from day one**, even before compliance enforcement is built. They're the legal/payroll record-keeping spine. Don't ship the swap feature without them.

---

## Section 7 — Smallest Valuable Roadmap

### V1.0 (this week) — Core Stability

- **Staff UI:** Unavailability 30-min grid submission + "Submit" button.
- **View My Schedule:** Mobile-web surface for Alicia to see her published shifts in-app (replaces text/email reliance).
- **Manager Grid:** Manual scheduling grid with "Sacred Unavailability" visual blocks.
- **Comms:** Email notification for published schedules + in-app notification banner on login. **No SMS to minimize costs.**

### V1.1 (this month) — Automation & PWA Push

- **PWA Push:** Web Push API integration for real-time mobile notifications without SMS fees.
- **Auto-Draft V1:** Rough first-draft auto-scheduler that fills the manual grid based on roles + unavailability blocks. *(One-line description here is misleading — when this gets built, do another short design pass on the auto-draft specifically.)*
- **Mediated Swaps:** 2-tap swap flow with manager approval and full audit logging.

### V2.0 (next quarter) — Advanced Compliance

- **Enforcement Engine:** Automated blocking of state/federal minor-labor violations.
- **AI Heatmap:** Strategic coverage-gap highlighting + labor cost projections.
- **Critical SMS:** SMS reserved exclusively as "Critical-Failure" backup for shifts starting in < 60 minutes.

---

## Open questions for the next Geneva meeting (block V1.0 ticketing)

1. **Terminology:** "Set Availability" (current) vs. "Block Time Off" (new mental model)? Affects all V1.0 staff-facing copy.
2. **Email-only notifications adequate for V1.0?** Or does Geneva expect SMS from day one (cost implication)?
3. **Time-off vs. unavailability — same flow or separate?** Today they're conflated; the design doc treats unavailability as the primary blocker. Need Geneva to confirm she's OK with that consolidation.

---

## What we already have that maps to this doc (as of 2026-05-05)

The current implementation overlaps significantly with V1.0:

- **Availability submission grid (PR #18, refined PR #24):** monthly grid (not 30-min granularity yet) with Available/Unavailable toggles + free-text hours + Submit/Edit per-staffer per-window. **Closest existing match for V1.0 staff UI; would need a granularity refactor (day-level → 30-min) to match the design fully.**
- **View My Schedule (PR #17):** restaurant-style timeline with My/Total filter. **Already covers "View My Schedule" V1.0 item.**
- **Manager Grid (PR #21):** schedule-tab calendar with click-to-assign + magic-schedule. **Already covers Manager Grid V1.0 item; "Sacred Unavailability" visual is partially there via the Day-assign popover that surfaces who's available.**
- **Comms:** None yet. V1.0 needs email-on-publish wiring through Resend.
- **Audit trail:** Not built. Section 6's spec is the source of truth when shift-swap (V1.1) gets built.
- **DOB / school calendar:** Not in schema. Foundational; can build now without committing to V2.0 enforcement semantics.

---

## What this doc does NOT replace

- `docs/CURRENT_STATE.md` — the canonical "what's shipped, what's queued, what conversations led to what."
- `docs/PRD.md` — the full 13-module product spec.
- Geneva's 2026-04-14 requirements doc — staff-module scope from her kickoff.

This doc is the **why** for the scheduling module specifically. CURRENT_STATE links here from the Active queue when scheduling-related items come up.
