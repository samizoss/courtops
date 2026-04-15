# CourtOps Phase 1-2 Development Requirements

**Product:** CourtOps — Operations platform for court sport clubs
**Client:** The Jar Pickleball Club (thepbjar.courtops.app)
**Date:** April 14, 2026
**Source:** Geneva Kickoff Meeting Transcript + Implementation Planning

---

## Context

CourtOps is a SaaS platform designed to be the "ops layer that Court Reserve doesn't have." The Jar is the pilot client. Geneva Olson is the primary user (General Manager), with ~8-10 staff members who will use the system for clocking in/out, checklists, availability submission, and shift management.

**Current State:** Basic scaffolding exists with admin views. Staff module is partially built but has bugs and missing features identified during the kickoff call.

**Goal:** Get Phase 1 (Staff Module) production-ready so Geneva can have her team submit May availability through the system by next week.

---

## CRITICAL: ASAP Fixes (Blocking Go-Live)

These are bugs and broken features identified during the call that must be fixed before staff can use the system:

### 1. Fix Broken Staff View Code
**Location:** Staff module — availability/scheduling section
**Issue:** "There's a broken code on the back end because I was trying to fix these and I'm in the middle of it."
**Acceptance Criteria:**
- Staff view loads without errors
- All navigation elements work
- Forms submit correctly

### 2. Fix Team Invite Flow
**Location:** Settings > Team
**Issue:** `gen_salt` function error was blocking invites. Fixed today but needs full end-to-end verification.
**Acceptance Criteria:**
- Admin can add team member (name, email, temp password, role)
- New team member receives invite notification
- New team member can log in with temp password
- New team member can set their own password on first login

### 3. Add "Missed Clock In" Button
**Location:** Staff view — Clock In/Out section
**Issue:** Staff frequently forget to clock in. Need a way to retroactively mark clock-in when they remember.
**Acceptance Criteria:**
- Staff sees a "Missed Clock In" button alongside regular clock in
- Clicking opens a form to enter the time they should have clocked in
- Submission creates a clock-in record with that time
- Record is flagged as "manual entry" for admin visibility
- Optional: Staff can add a note explaining the miss

### 4. Admin Ability to Edit Clock Times
**Location:** Admin view — Staff > Hours/Time Management
**Issue:** "Some things that we will want to that are sort of like still in works is an admin ability to edit. Right. So like your ability to like edit someone's hours if they forgot to clock in or out."
**Acceptance Criteria:**
- Admin can view all clock in/out records
- Admin can edit any clock in/out time
- Admin can add a clock in or clock out record for a staff member
- All admin edits are logged with timestamp and who made the edit
- Admin can add a note to any clock record (visible only to admins)

---

## Phase 1: Staff Module — Production-Ready Features

### 1.1 Monthly Availability Submission (HIGHEST PRIORITY)
**Current State:** Weekly availability view exists but needs to be converted to monthly
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

### 1.2 Schedule Builder (One-Click Assign)
**Current State:** Basic grid exists but assignment flow needs improvement
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

### 1.3 Shift Swap Requests (Separate from Time Off)
**Current State:** Combined with time off requests
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

### 1.4 Hours Summary Report (Scheduled vs. Actual)
**Current State:** Basic total hours view exists
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

### 1.5 Clock Notes (Admin-Only Visibility Option)
**Current State:** Notes exist but visibility unclear
**User Story:** As a staff member, I can add a note when clocking in/out. As an admin, I can choose whether notes are visible to all or admin-only.

**Geneva's Specific Request:** Sensitive notes like "Sammy was a pain in the ass today" or "member going through an emotional time" should be admin-only.

**Requirements:**
- Staff can add optional note on clock in and clock out
- Setting (per-club or global): Notes visible to all staff OR admin only
- If admin-only, staff sees their own notes but not others'
- Admin sees all notes in Hours Summary view
- Notes flagged appropriately in reporting

### 1.6 Roster Management with Role Toggle
**Current State:** Basic roster exists but includes non-operational users
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

### Business Hours
- Set open/close hours per day of week
- Set staff buffer time before open and after close (for setup/cleanup)
- Hours affect scheduling grid display

### Logo/Branding
**Current limitation:** Logo requires URL input
**Request:** Allow direct image upload instead of URL

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
