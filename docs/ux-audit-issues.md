# CourtOps UX Audit — Issue Tracker

**Date:** 2026-04-02
**Audited by:** Claude (acting as club manager perspective)
**Context:** Pre-launch audit for The Jar Pickleball Club. Geneva Olson is pilot customer. Phase 1 modules: Staff, Checklists, SOPs (+ Dashboard, Settings).

---

## TIER 1 — Trust Breakers (Fix Before Staff Rollout)

| # | Issue | Module | Effort | Risk of NOT Fixing | Risk of Breaking Things if Fixed | Status |
|---|-------|--------|--------|-------------------|----------------------------------|--------|
| 1 | No error handling on async actions — forms show "Saving..." forever if Supabase fails | Clock, Schedule, Time Off, Availability, Checklists | **Medium** — add try/catch + error state to ~8 components. Pattern is identical each time, just repetitive | Manager thinks data saved when it didn't. Staff clock hours lost. Time off requests vanish. Geneva loses trust in the system day one | **Very Low** — adding error handling is additive, doesn't change happy path logic | DONE |
| 2 | No success confirmations after actions (check item, approve time off, add shift, save settings) | Everywhere | **Medium** — build a small toast component, wire into ~10 action handlers | Manager clicks button, nothing visible happens, clicks again creating duplicates. Constant "did that work?" anxiety | **Very Low** — purely additive UI. Could briefly flash if page also refreshes, but harmless | DONE |
| 3 | Can't view historical checklists (only today) — manager can't audit yesterday | Checklists | **Medium** — add date picker to page, pass selected date to query instead of hardcoded `today` | Core use case broken. Geneva can't verify opening checklist was done yesterday. Defeats the accountability purpose of the module | **Low** — changes query filter from hardcoded today to dynamic date. Could surface old data with null `completed_by` (pre-backfill), but that's cosmetic | TODO |
| 4 | Dashboard grid layout broken — dynamic Tailwind classes (`grid-cols-${n}`) don't compile | Dashboard | **Quick** — replace with inline `style={{ gridTemplateColumns }}` or use fixed responsive classes | Admin users see single-column stat cards instead of a proper grid. Looks broken/unprofessional | **Very Low** — CSS-only change, no logic affected | DONE |
| 5 | No "unsaved changes" warning on Settings forms | Settings > General, Integrations | **Medium** — track dirty state, add `beforeunload` listener and/or in-app prompt | Manager fills out business hours, clicks sidebar link, changes silently lost. Has to re-enter everything | **Low** — `beforeunload` can be annoying if over-triggered, but standard UX pattern. Keep it scoped to dirty forms only | TODO |
| 6 | Delete shift has no confirmation dialog | Staff > Schedule | **Quick** — add `if (!confirm(...)) return` before delete call | Manager accidentally removes a shift, staff doesn't show up, no one knows | **None** — one line change | DONE |

---

## TIER 2 — Daily Friction (Fix Before or During Rollout)

| # | Issue | Module | Effort | Risk of NOT Fixing | Risk of Breaking Things if Fixed | Status |
|---|-------|--------|--------|-------------------|----------------------------------|--------|
| 7 | Can't edit shifts — only delete and re-create | Staff > Schedule | **Medium** — add edit form (pre-fill existing values), update instead of insert | Manager has to delete a shift and recreate it to change the time by 30 minutes. Annoying multiple times a day | **Low** — new code path for update. Make sure edit doesn't create duplicate if someone clicks fast | TODO |
| 8 | Can't edit staff details or deactivate/remove staff | Staff > Roster, Settings > Team | **Medium** — add edit modal for name/role, add deactivate toggle (soft delete via `is_active` flag on profiles) | Fired employee still has system access. Manager can't fix a typo in someone's name. Security risk | **Medium** — deactivation needs to also invalidate their auth session. If done wrong, user could still access via cached token. Need to also handle deactivated users in all queries | TODO |
| 9 | No total hours worked per employee (payroll view) | Staff > Clock | **Medium** — aggregate `time_clock` by user for selected date range, show summary table | Manager can't do payroll without exporting to Excel manually. Major workflow gap. Will fall back to SwipeClock and not adopt CourtOps | **Low** — read-only aggregation query, no write operations | TODO |
| 10 | Time off end_date not validated >= start_date | Staff > Time Off | **Quick** — add `min={form.start_date}` on end_date input + JS validation before submit | Manager submits backwards date range, creates garbage data in DB. Confusing for approval view | **None** — pure validation, no data changes | DONE |
| 11 | Role change in Team settings applies instantly with no confirmation | Settings > Team | **Quick** — add `confirm()` before the update call | Manager accidentally downgrades admin to viewer. That person loses access to modules mid-shift | **None** — one line change | DONE |
| 12 | Image upload available in SOP edit but not in create form | SOPs > New | **Quick** — copy the image upload button + handler from sop-detail.tsx into new-sop-form.tsx. Need Supabase Storage path without an SOP id yet (use temp UUID) | Manager creates new SOP, can't add images, has to save first then edit. Breaks their flow | **Low** — need to handle the case where SOP doesn't have an ID yet at upload time. Use a temp path, then move on save, or generate ID client-side | DONE |
| 13 | No "Test Connection" for Court Reserve API credentials | Settings > Integrations | **Medium** — add API endpoint that tries one lightweight CR API call and returns success/fail | Manager enters wrong password, clicks Save, thinks it's working. Sync silently fails days later. Support ticket | **Low** — new endpoint, no impact on existing sync. Just need to handle rate limits on CR API | TODO |
| 14 | Logo is paste-a-URL instead of file upload | Settings > General | **Medium** — add file input, upload to Supabase Storage, save public URL to `orgs.logo_url` | Non-technical manager has no idea how to get a URL for their logo. Setting feels broken to them | **Low** — need to create a `logos` storage bucket. Existing URL-based approach still works as fallback | TODO |

---

## TIER 3 — Polish (Fix as Time Allows)

| # | Issue | Module | Effort | Risk of NOT Fixing | Risk of Breaking Things if Fixed | Status |
|---|-------|--------|--------|-------------------|----------------------------------|--------|
| 15 | No breadcrumb navigation — only back arrows | All detail pages | **Medium** — build breadcrumb component, add to layout or per-page. Need to determine hierarchy per route | Manager gets lost in Settings > Team > Invite flow. Clicks browser back and lands somewhere unexpected | **Low** — purely additive UI component. Risk is visual clutter if overdone | TODO |
| 16 | Notification types show raw codes ("cadence_overdue", "task_assigned") | Notifications | **Quick** — add a display name map: `cadence_overdue → "Overdue Follow-up"` etc. | Manager sees programmer jargon, feels like unfinished product | **None** — display-only change | DONE |
| 17 | Tag input is free-form text, no autocomplete or suggestions | SOPs | **Medium** — query existing tags from DB, show dropdown/chips as user types | Duplicate tags from typos (#openning vs #opening). Tags become useless for filtering | **Low** — additive feature. Risk of performance issue if tag list is huge, but unlikely for SOPs | TODO |
| 18 | No skeleton loaders during page transitions | All pages | **Medium** — add loading.tsx files per route group with skeleton UI | Pages appear blank for 1-2 seconds on slow connections. Feels broken | **Very Low** — Next.js loading.tsx is a standard pattern, no impact on data | TODO |
| 19 | Availability grid shows Y/N but not actual time ranges | Staff > Schedule | **Quick** — already have start/end time in the data, just display it in the grid cells instead of Y/- | Manager sees "Sami: available Monday" but doesn't know if that's 8am-2pm or 2pm-close. Useless for scheduling | **None** — display-only change | DONE |
| 20 | `pt-18` is invalid Tailwind class in dashboard layout | Dashboard layout | **Quick** — change to `pt-16` (4rem = 64px, matches mobile top bar height) | Content overlaps mobile top bar on some devices | **Very Low** — may need to verify exact pixel height of top bar to pick correct value | DONE |
| 21 | Clock tab doesn't show elapsed time for active clocks | Staff > Clock | **Quick** — calculate `Date.now() - clock_in` and display "2h 35m" next to each active clock | Manager sees "Since 8:32 AM" but has to do mental math to know how long they've been on shift | **None** — client-side calculation, display only | DONE |
| 22 | Invite links expire in 48h with no warning shown to manager | Settings > Team | **Quick** — show expiry date next to each pending invite, add note on invite creation form | Manager sends invite Friday, staff tries Monday, silently fails. Manager doesn't know why | **None** — display-only | DONE |
| 23 | No "remove team member" functionality | Settings > Team | **Medium** — add remove/deactivate button, update profile status, revoke auth session | Security risk — fired employees retain access. Overlaps with #8 | **Medium** — same concerns as #8. Auth session invalidation must be correct | TODO |
| 24 | No notification preferences (can't mute specific types) | Notifications | **Large** — need preferences table, per-type toggles, filter notifications on insert | Manager gets flooded with low-priority notifications, stops checking entirely. Bell icon becomes noise | **Low** — new table + UI, no impact on existing notification creation. But need to update all notification insert points to check preferences | TODO |
| 25 | Schedule conflicts not prevented (can double-book staff) | Staff > Schedule | **Medium** — query existing shifts for same user + overlapping time before insert, show warning | Manager assigns John to two overlapping shifts. John is confused, shows up to wrong one | **Low** — pre-insert validation. Risk of false positives if time ranges touch but don't overlap (e.g., 8-2 and 2-6) — need to use `<` not `<=` for boundary | DONE |
| 26 | SOP categories are hardcoded (can't add custom ones) | SOPs | **Medium** — move categories to DB table or org_settings JSON field, build admin UI | Club's workflow doesn't match predefined categories. SOPs filed under "General" because nothing else fits | **Medium** — changing from enum to dynamic list touches the DB constraint, type definitions, and every component that renders category badges. Migration needed | TODO |
| 27 | No SOP version history or rollback | SOPs | **Large** — create `sop_versions` table, insert old content on each save, build history viewer with diff | Manager makes bad edit to critical SOP, can't recover previous version. Has to rewrite from memory | **Low** — new table + insert trigger. Existing save logic just needs one extra insert. But diff UI is complex | TODO |
| 28 | Availability not shown for staff who haven't set it (assumed available) | Staff > Schedule | **Quick** — add visual indicator: "Not set" vs "Available" vs "Off". Currently treats unset as available | Manager thinks everyone is available Monday because grid shows no data. Actually, no one has set their availability yet | **None** — display-only logic change in `isAvailableAt()` function | DONE |
| 29 | Business hours are single open/close time — can't set different hours per day (e.g., 6am-10pm weekdays, 8am-8pm Sunday) | Settings > General, Staff > Schedule | **Medium** — change `open_time`/`close_time` from single values to a JSONB column with per-day entries (e.g., `{ "1": {"open":"06:00","close":"22:00"}, "0": {"open":"08:00","close":"20:00"} }`). Update Settings UI to show 7 rows of open/close inputs. Update schedule tab to read per-day hours | Every club with different weekend hours sees wrong availability data. Schedule grid shows wrong time range on Sundays. Staff buffer calculations are wrong on those days. Renders the scheduling view unreliable | **Medium** — DB schema change (alter column type or add new column). Must update Settings > General UI, schedule-tab.tsx `openMin`/`closeMin` calculation, and any future feature that reads business hours. Existing single-value data needs migration to new format | TODO |

---

## TIER 2B — New Feature Builds (Identified 2026-04-02)

| # | Issue | Module | Effort | Risk of NOT Fixing | Risk of Breaking Things if Fixed | Status |
|---|-------|--------|--------|-------------------|----------------------------------|--------|
| 30 | **Staff toggle on/off** — admin can deactivate staff from roster/schedule/availability without deleting their account. Test accounts and former employees disappear from active views. Subsumes #8 and #23. | Staff > Roster, all staff views | **Medium** — add `is_active` boolean to profiles, filter all staff queries, add toggle UI in roster + team settings. Must also hide deactivated users from schedule grid, availability grid, clock, shift dropdowns | Geneva sees 3 test Sami accounts and former employees in every staff view. Makes the tool feel cluttered and unprofessional. Security risk if former staff still have access | **Medium** — must update every query that touches profiles to filter `is_active`. If missed, deactivated users appear in some views. Auth session should be invalidated on deactivate. Need to handle edge case: what if deactivated user has active clock entry or pending time off? | TODO |
| 31 | **Click-to-assign shifts from availability grid** — when Geneva sees a staff name in a time slot, she clicks it to assign a shift. No separate form needed for the common case. Includes: (a) if staff hasn't submitted availability, show warning "This person hasn't set availability — schedule is tentative" with confirm + note, (b) if staff IS unavailable at that time, show warning "Scheduling during unavailable time" with override + required note, (c) "Don't warn me again this session" checkbox for repeated overrides. Assigning someone without availability triggers a notification to that employee: "You've been tentatively scheduled. Submit your availability within 2 days before the schedule is locked." | Staff > Schedule | **Large** — rework availability grid rows to be clickable, add confirmation modals with conditional warnings, add notification creation, add "tentative" status to shifts, add session-level dismiss state | Core workflow blocker. Without this, Geneva has to: look at availability grid, remember who's free, switch to "Add Shift" form, fill in 5 fields. With click-to-assign, it's one click. This is the #1 speed improvement for daily scheduling | **Medium** — adds click handlers to grid cells that currently are display-only. New "tentative" shift status needs DB column or convention. Notification trigger needs to insert into notifications table. Session dismiss state is client-only (useState). Must not break existing "Add Shift" form which should still work for edge cases |
| 32 | **Merge Availability + Time Off into unified "Schedule Preferences" view** — staff submit monthly availability a month in advance (which days/times they can work). Within that month, they can submit special request-off for specific dates. Manager sees one combined view: the person's submitted monthly availability overlaid with any exception days off. Replaces current separate Availability + Time Off tabs with a unified flow | Staff module | **Large** — redesign two tabs into one. New data model: monthly availability submissions (not just recurring weekly). Keep time-off-request for exceptions. New UI: month calendar view where staff fill in their available days/times, plus a "request day off" flow for exceptions within an already-submitted month. Manager view shows combined calendar per person | Current two-tab split confuses Geneva's team. "Availability" feels like recurring preferences, but Geneva needs month-by-month submissions with a deadline. Time off requests feel disconnected from the schedule. Staff don't understand the relationship between the two | **High** — significant rework of availability data model (currently day-of-week recurring → needs to become date-specific monthly submissions). Time off stays as-is but UI merges. Migration needed for existing availability data. Schedule tab's availability grid reader needs to adapt to new model. Highest-risk item on this list — plan carefully |

---

## Quick Reference: Effort Estimates

- **Quick** = < 30 min, isolated change
- **Medium** = 1-3 hours, touches 2-3 files
- **Large** = half day+, new tables/components/patterns

## Counts (Updated)

- **Tier 1:** 6 issues — 4 DONE, 2 TODO (#3 DONE, #5 DONE)
- **Tier 2:** 8 issues — 3 DONE, 5 TODO
- **Tier 3:** 15 issues — 10 DONE, 5 TODO
- **Tier 2B (new builds):** 3 issues — all TODO
- **Total:** 32 issues (19 DONE, 13 TODO)

## Status Summary

### DONE (19)
1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 16, 19, 20, 21, 22, 25, 28, 29

### TODO (13)
8 *(subsumed by #30)*, 13, 14, 15, 17, 18, 23 *(subsumed by #30)*, 24, 26, 27, 30, 31, 32
