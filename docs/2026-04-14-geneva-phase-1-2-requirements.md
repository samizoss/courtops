# CourtOps Phase 1-2 Development Requirements

**Product:** CourtOps — Operations platform for court sport clubs
**Client:** The Jar Pickleball Club (thepbjar.courtops.app)
**Date:** April 14, 2026 (status updated 2026-04-21)
**Source:** Geneva Kickoff Meeting Transcript + Implementation Planning

---

## Status legend

- ✅ **Done** — shipped to production
- 🚧 **In progress / partial** — some acceptance criteria met, more to do
- ⏳ **Not started** — still on the queue

---

## Context

CourtOps is a SaaS platform designed to be the "ops layer that Court Reserve doesn't have." The Jar is the pilot client. Geneva Olson is the primary user (General Manager), with ~8-10 staff members who will use the system for clocking in/out, checklists, availability submission, and shift management.

**Current State (2026-04-21):** Staff module is live with clock in/out, missed-clock-in, admin edits w/ audit trail, operational toggle, role management, and Resend-based invite emails. Remaining work centers on availability (week → month), schedule builder polish, hours variance reporting, and shift swap.

**Goal:** Get Phase 1 (Staff Module) production-ready so Geneva can have her team submit May availability through the system.

---

## CRITICAL: ASAP Fixes — ALL DONE ✅

### 1. Fix Broken Staff View Code ✅ Done
**Location:** Staff module — availability/scheduling section
**Resolved:** 2026-04-21 (PR #6 — PostgREST FK-ambiguity fix). Staff page now loads cleanly, active clocks + recent history populate, hours summary works.

### 2. Fix Team Invite Flow ✅ Done
**Location:** Settings > Team
**Resolved:** PR #3 (Resend integration, 2026-04-14) + migration 003 (invite RLS fix). Admin sends invite via `POST /api/invites/send`; recipient gets a branded email from `hello@courtops.app`; invite acceptance page creates auth user + profile + marks accepted. "Copy Link" button on pending invites as fallback.

### 3. Add "Missed Clock In" Button ✅ Done
**Location:** Staff view — Clock In/Out section
**Resolved:** PR #4 (2026-04-21). "Forgot to clock in? Log a missed entry →" link next to Clock In. Modal captures clock_in (required) + optional clock_out + note; row is flagged `is_manual_entry = true`. PR #5 fixed a UI refresh bug where the entry saved but the page didn't re-render — now does a hard reload.

### 4. Admin Ability to Edit Clock Times ✅ Done
**Location:** Admin view — Staff > Hours/Time Management
**Resolved:** PR #4 (2026-04-21). Admin can edit any clock in/out, add new clock records for anyone, and add admin-only notes. Every edit is logged in the `time_clock_edits` audit table (who, when, old values, new values, reason).

---

## Phase 1: Staff Module — Production-Ready Features

### 1.1 Monthly Availability Submission ⏳ Not started (HIGHEST PRIORITY — next up)
**Current State:** Weekly (Sunday–Saturday) availability grid exists in `/staff` → Availability tab. Needs to be converted to a monthly per-slot flow, plus admin-release + staff-submission lifecycle.
**User Story:** As a staff member, I can submit my availability for an entire month so Geneva can create the schedule.

**Requirements:**
- Admin releases availability window: "Release May availability, due by [date]"
- System notifies all roster members via email that availability is open
- Staff logs in and sees availability form for the specified month
- Each day shows time slots (configurable: hourly, 30-min, or 15-min increments)
- Staff marks each slot as: Available / Not Available / Preferred (stretch goal)
- Staff can save draft and return later
- Staff submits final availability
- Admin view shows:
  - Who has submitted vs. who hasn't (yellow "?" for pending)
  - Visual calendar showing all availability overlaid
  - Color coding: Green = available, Red = unavailable, Yellow = not yet submitted

**Technical Notes:**
- Current system uses Sunday-Saturday weekly view — needs to switch to monthly calendar
- Needs admin control to set deadline date and trigger notifications
- Consider reminder notification 2 days before deadline

### 1.2 Schedule Builder (One-Click Assign) 🚧 Partial
**Current State:** Week view of shifts with click-to-assign exists. Missing: availability overlay, draft mode, publish control, month view, print-friendly export. Geneva's line: *"Once May gets completely scheduled out, is there a way that we could, like, see it all? Normally I print it out and have it on the desk."*
**User Story:** As an admin, I can see who's available and assign shifts with one click.

**Requirements:**
- View shows the month with availability data overlaid
- Click on a time slot to see list of available staff
- One click assigns that staff member to that shift
- Can assign multiple staff to same shift (e.g., two front desk)
- System flags when assigning overlapping shifts for same person
- Draft mode: Assignments don't notify staff until admin publishes
- Publish button: Sends all shift notifications at once
- Post-publish: Can view/print full monthly schedule

**Geneva's Specific Request:** "Once May gets completely scheduled out, is there a way that we could, like, see it all? Normally I print it out and have it on the desk."

### 1.3 Shift Swap Requests (Separate from Time Off) ⏳ Not started (queued right after availability)
**Current State:** Time Off tab handles only time-off requests. Shift swap does not exist yet — needs its own flow.
**User Story:** As a staff member who already has a scheduled shift, I can request someone else take my shift.

**Requirements:**
- Only appears after availability is submitted and schedule is published
- Staff selects the shift they want to swap
- Staff can either:
  - Request specific coworker to take it, OR
  - Post it as open for anyone available
- Coworker sees notification and can accept/decline
- Admin sees pending swaps and can approve/deny
- Approved swap updates the schedule automatically
- Both parties get confirmation notification

**Technical Notes:** This is distinct from availability submission (which is before schedule creation) and time-off requests (which is "I can't work at all on this day").

### 1.4 Hours Summary Report (Scheduled vs. Actual) 🚧 Partial
**Current State:** Admin sees actual hours (from `time_clock`) per staff with date range selector. Filters out non-operational staff. Missing: scheduled-hours side, variance column, threshold flagging, CSV export, admin-edit notation.
**User Story:** As an admin preparing payroll, I can compare scheduled hours to actual hours worked.

**Geneva's Specific Request:** "I'll go through and check like okay, Sammy was there from 8am till 5pm but her shift ended at 2. Why was she there for three extra hours?"

**Requirements:**
- Date range selector (default: last pay period)
- Report shows per employee:
  - Scheduled hours (sum of assigned shifts)
  - Actual hours (sum of clock in/out)
  - Variance (over/under)
  - Flag if variance > threshold (configurable, e.g., 30 min)
- Drill down to see day-by-day breakdown
- Export to CSV for payroll processing
- Show any admin-edited clock records with notation

### 1.5 Clock Notes (Admin-Only Visibility Option) 🚧 Partial (column exists, no settings UI)
**Current State:** `org_settings.clock_notes_visibility` column shipped in migration 004 with values `all_staff` | `admin_only`. Clock tab already respects it (`canSeeNote` honors the setting). Admin can always see all notes and add admin-only notes. Missing: a settings page toggle to actually set the value.
**User Story:** As a staff member, I can add a note when clocking in/out. As an admin, I can choose whether notes are visible to all or admin-only.

**Geneva's Specific Request:** Sensitive notes like "Sammy was a pain in the ass today" or "member going through an emotional time" should be admin-only.

**Requirements:**
- Staff can add optional note on clock in and clock out
- Setting (per-club or global): Notes visible to all staff OR admin only
- If admin-only, staff sees their own notes but not others'
- Admin sees all notes in Hours Summary view
- Notes flagged appropriately in reporting

### 1.6 Roster Management with Role Toggle ✅ Done (PR #4, 2026-04-21)
**Current State:** Every profile has both `is_active` and `is_operational_staff` toggles. Non-operational staff are filtered out of schedule/availability/time-off/hours-summary/clock-views while remaining able to log in. The current user is always included in their own views regardless of flag. Roles supported: owner, admin, staff, viewer.
**User Story:** As an admin, I can distinguish between operational staff and system users who shouldn't appear on schedule.

**Requirements:**
- Each roster entry has toggle: "Operational Staff" (yes/no)
- Only operational staff appear in:
  - Availability requests
  - Schedule assignment
  - Hours reporting
- Non-operational users (e.g., developers, consultants) can still log in but don't clutter operational views
- Roles: Staff, Admin, Owner (Owner = full access)
- Future consideration: Additional roles (Instructor, League Leader, Ambassador)

---

## Phase 2: Checklists Module

### 2.1 Editable Checklist Templates
**Current State:** Basic checklists exist (Opening, Mid-Shift, Closing) but template editing is clunky
**User Story:** As an admin, I can create and edit checklist templates that staff complete each shift.

**Requirements:**
- Admin view shows list of all templates
- Can create new template with:
  - Name (e.g., "Opening Checklist", "Monthly Deep Clean")
  - Frequency: Every Shift / Daily / Specific Days (M/W/F) / Weekly / Biweekly / Monthly / Quarterly
  - Shift assignment (if applicable): Opening / Mid / Closing / All
  - Ordered list of items
- Each item has:
  - Description text
  - Optional: Expected duration
  - Optional: Link to SOP for detailed instructions
- Can reorder items via drag-and-drop
- Can edit/delete existing templates
- Templates auto-generate instances based on frequency rules

### 2.2 Staff Checklist Completion
**Current State:** Staff can mark items done but limited functionality
**User Story:** As a staff member on shift, I can see my assigned checklists and mark items complete.

**Requirements:**
- Staff dashboard shows today's applicable checklists
- Based on: current date + shift type (if clocked in)
- Staff clicks item to mark complete
- Can add optional note on any item
- Completion timestamp logged
- Shows who completed each item
- Admin can see completion status across all checklists

### 2.3 Checklist Reporting
**User Story:** As an admin, I can see checklist completion history and identify patterns.

**Requirements:**
- View checklist completion by date range
- See which items are frequently skipped or late
- See which staff complete checklists most thoroughly
- Export completion data

---

## Configuration & Settings

### Business Hours ⏳ Not started
- Set open/close hours per day of week
- Set staff buffer time before open and after close (for setup/cleanup)
- Hours affect scheduling grid display
- `org_settings` already has columns `open_time`, `close_time`, `open_days`, `staff_arrive_before_min`, `staff_depart_after_min`, `daily_hours` — needs a settings UI

### Logo/Branding ✅ Done
**Current limitation:** Logo requires URL input
**Resolved:** PR #4 (2026-04-21). Settings > General now supports direct image upload to Supabase Storage bucket `org-logos`.

---

## User Access Model

### Staff View (Default)
Can see and do:
- Clock in/out
- View their own schedule
- Submit availability (during open window)
- Request shift swaps
- Complete checklists
- View SOPs
- Add notes on clock events and checklist items

Cannot see:
- Other staff availability details
- Schedule draft (before published)
- Admin-only clock notes
- Hours summary / payroll reports
- Team management

### Admin View
All of Staff View PLUS:
- View all availability submissions
- Create/edit schedule (with publish control)
- Approve/deny shift swaps
- Edit clock in/out times
- View all notes (including admin-only)
- Hours summary and reporting
- Manage roster and team
- Edit checklist templates
- View all checklist completion data
- Settings and configuration

### Visual Differentiation
**Request:** When in admin-only sections, use a different background color (suggested: orange or distinct shade) so it's clear you're in a privileged view.

---

## Technical Notes from Call

### Sandbox vs. Production
- Sandbox environment now exists for development (Vercel preview deploys)
- All changes tested in sandbox before pushing to production
- Production URL: thepbjar.courtops.app

### Authentication
- Staff use personal email (not club email required)
- Modeled after restaurant shift apps (e.g., HotSchedules)
- Temporary password on invite, user sets own on first login

### Time Increments
- Schedule grid should support configurable increments: 15 min, 30 min, or 1 hour
- Default: 1 hour

### Notifications
- Email for: Availability window open, shift assignments (on publish), shift swap requests
- Future: Push notifications via app

---

## Out of Scope for Phase 1-2 (Do Not Build Yet)

These were discussed but explicitly deferred:

- **Pipeline / Lead Tracking** — Syncs with Syndicate Google Sheet, but not priority for staff module
- **Text Messaging** — Replaces Podium, needs Twilio setup, target: Month 2
- **Content Planner** — AI-assisted social media planning, target: Summer
- **Sales Tracking** — Tracking paddle/ticket sales for spiffs, needs Court Reserve API work
- **Ambassador/Volunteer Tracking** — Different from operational staff, needs role definition
- **League/Event Management** — Court Reserve API integration for leagues/events
- **Website Widgets** — Calendar widgets pulling from CourtOps

---

## Success Criteria

Phase 1 is complete when:
1. Geneva can release May availability request and all staff can submit through the system
2. Geneva can build May schedule using availability data with one-click assignment
3. Staff can clock in/out and Geneva can review/edit hours for payroll
4. Staff can request shift swaps and Geneva can approve/deny
5. 15-minute training video can be recorded covering the core staff features

Phase 2 is complete when:
1. Geneva has created all her checklist templates (opening, mid, closing, weekly, monthly)
2. Staff can complete daily checklists during their shifts
3. Completion data is logged and visible to admin

---

## Appendix: Geneva's Homework (For Reference)

Geneva was assigned these tasks between meetings:
1. Draft checklist templates in Word doc with frequencies and shift assignments
2. Add team members to roster and send invites
3. Review and update business hours in Settings
4. Compile wishlist of additional feature requests
5. Test staff view once credentials are provided and report issues

---

*This document was generated from the April 14, 2026 CourtOps Weekly meeting transcript with Geneva Olson, Travis Thie, and Bilhah.*

---

## Ordered Next-Up (added 2026-04-21)

The remaining work in this doc, in the order Sami wants it tackled:

1. **Staff module walkthrough + troubleshooting** — whatever Geneva flags while actually using it. No new work until reported issues clear.
2. **1.1 Monthly Availability Submission** — highest-priority feature. Week → month conversion, admin-release window, staff notifications, save-draft + submit lifecycle.
3. **1.3 Shift Swap Requests** — split shift-swap out of Time Off into its own flow. Direct-to-coworker or open-to-anyone + admin approval + auto-update schedule.
4. **1.2 Schedule Builder polish** — availability overlay, draft/publish, month view, print-friendly export.
5. **1.4 Hours variance reporting** — scheduled-vs-actual with threshold flagging, CSV export.
6. **1.5 Clock notes visibility toggle UI** — just needs a settings UI; DB + query already honor the flag.
7. **Business Hours setting UI** — columns exist, needs settings page.
8. **Admin visual differentiation** — distinct tint/indicator so it's obvious when you're in a privileged view.
9. **Phase 2: Checklists** — frequency scheduling, SOP links per item, completion reporting.

For the longer-tail product backlog beyond Phase 1-2 (Twilio, reporting, auto-cadence, landing page, etc.), see [`CURRENT_STATE.md`](./CURRENT_STATE.md) § Next up.
