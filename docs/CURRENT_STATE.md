# CourtOps — Current State

> **Snapshot date:** 2026-04-28 (post-Geneva walkthrough)
> **For a fresh Claude session:** read this first. It's the single source of truth for what's shipped, what's in progress, what's been tried-and-shelved, and what's next. When in doubt, trust `git log`, Supabase schema, and the Vercel production deployment over anything written anywhere else.

> **PR #12 (2026-04-28) shipped:** Migration 006 (`availability_windows`, `is_unavailable` → `is_available`, `profiles.target_weekly_hours`), shared `<CalendarMonthGrid>` component, Availability tab rebuilt as month calendar with opt-in semantics + window release/lock workflow, Schedule tab rebuilt as calendar with click-to-assign popover + hours summary. The "NEXT-SESSION BIG BUNDLE" section below is now historic context — see new "Geneva walkthrough 2026-04-28" section for the actual current queue.

> **Placeholder May seed (2026-04-28):** The Jar's prod tenant has 7 placeholder staff profiles (Julio, Alesia, Ella, Cody, Daniel, Cade, Conner) seeded from Geneva's "Jar Employee Schedule" PDF, plus Geneva and Maddie (real). Emails are `<firstname>@placeholder.thepbjar.club` so they're easy to find. May 4-31 availability + schedule (~99 availability entries, ~92 shifts) loaded so Geneva can preview the system. Window "May 2026" is open. **Cleanup when done:** `DELETE FROM auth.users WHERE email LIKE '%@placeholder.thepbjar.club';` cascades through profile + shifts + availability_entries. **When Geneva sends real emails/last names:** UPDATE the `email` + `full_name` on the existing profile rows rather than creating new ones — preserves the seeded data and triggers a Supabase password-reset flow on the new email.

---

## Geneva walkthrough — 2026-04-28 outcomes

Sami walked Geneva through PR #12 live. She liked the direction; specific feedback (in roughly the order she raised it) becomes the new ordered queue. **Next meeting ~2026-05-05** — Sami committed to having all of this ready, with the "magic schedule" button as the headline stretch item.

### Bugs to fix first

1. **Manual-entry note disappears after clock out** — When a staffer logs a missed clock-in with a note, the `admin_note` shows correctly while clocked in, but vanishes from the entry once they clock out. Make it persist on the row. (Likely a missing field in the clock-out update path; check `src/app/(dashboard)/staff/tabs/clock-tab.tsx` + the `time_clock` update query.)
2. **Operational toggle bug** — pre-existing, Sami had it on his list before the meeting. Roster's "operational" flip doesn't always stick / refresh. Investigate the `RosterTab` → Supabase update flow.

### Availability polish (PR #12 follow-ups)

3. **Quick "Available all day" / "Unavailable all day" checkboxes per cell.** Geneva's reasoning: most days a staffer is just available the whole day and doesn't want to type "7 - close." Sami's design: green checkbox = available all day, red checkbox = unavailable all day, free-text shifts field still available for partial-day constraints. Replace the current single "Available" checkbox + free text with: two visible state toggles (green ✓ / red ✗) + an "or specify hours" text input that only appears when neither toggle is set OR when "Available" is checked.
4. **Add `due_date` to `availability_windows`.** Geneva: "I am hounding people for their availability — give me a deadline I can put on the window." Migration 007 adds `due_date DATE` to the table; UI shows it on the pill ("Due May 15"); when admin opens a window the form gets a 3rd date field.
5. **Submit + Edit button on availability.** Today it autosaves silently. Geneva wants a clear "I'm done" action plus a way to reopen if she/the staffer changes their mind — but only while the admin's window is still open. Behavior:
   - Autosave during draft (unchanged from PR #12).
   - "Submit availability" button → flips a per-user-per-window `submitted_at` timestamp; cells become read-only for that staffer; UI shows "Submitted ✓" badge with the timestamp.
   - Once submitted, an "Edit submission" button appears (replacing Submit).
     - If `availability_windows.status === 'open'` → click clears `submitted_at` and re-enables edits. Staffer must Submit again.
     - If `availability_windows.status === 'locked'` → button is disabled with a tooltip/alert: *"Submissions are locked. To change a shift you've been assigned, request a shift swap from the Schedule tab."*
   - Schema: new table `availability_submissions(id, org_id, window_id, user_id, submitted_at, created_at)` with unique `(window_id, user_id)`. Soft-delete by setting `submitted_at = null` on Edit-reopen rather than deleting the row, so we keep history.
   - Admin view (later, not blocking): a roster strip on the window pill showing "5/8 submitted" so Geneva can see who's outstanding.

### Schedule polish (PR #12 follow-ups)

6. **Day view shows start time only — needs start AND end.** The shift pill currently renders `Sami 8:00`; should render `Sami 8:00–14:00` (or similar). Day view in general is "wonky" per Sami; spend extra time tightening that mode's layout.
7. **Schedule status state machine.** Today windows have status (open/locked) but the schedule itself doesn't. Add: schedule for a date range is `draft` (admin building it) → `published` (staff sees it). Only published shifts show in staff's "My schedule." Until then, staff sees "Schedule not published yet for this period." A `shift_publications` table or `shifts.published_at` column. Geneva mentioned this is the gate for shift-swap to be available — published is what staff can swap.

### Roster edit modal

8. **Edit-row modal on the Roster tab.** Fields: name, email, **cell phone (new column on `profiles` — needs migration 008)**, role, `target_weekly_hours` (column already exists from migration 006, no UI yet). Save updates the row. Phone is optional but adding the column now unblocks future Twilio per-staffer notifications.

### Magic schedule button (the headline ask, stretch)

9. **"Help schedule for me" button on the admin Schedule tab.** Auto-assigns shifts for the current view-mode range (week/month) based on (a) submitted availability, (b) target_weekly_hours per staffer, (c) approved time-off. Algorithm: greedy by day, prefer staffers furthest below their target; fall back to "no submission" staff with a tentative flag. Sami told Geneva: "won't be perfect but should at least be ready" by next meeting. Output is editable — admin sees the proposed assignments and can tweak before publishing.
10. **Flag overscheduling.** When admin assigns a shift that would push a staffer over their `target_weekly_hours` for the visible week, show a warning indicator on the shift pill or the hours summary row.

### Sidebar + Guide (small, but blocking the staff rollout)

11. **Role-filtered sidebar.** Staff users see only: Staff, SOPs, Checklists, Tasks, Notifications. Admin/owner sees everything. Today the sidebar is one-size-fits-all. Edit `src/components/sidebar.tsx` to filter by `userOrg.role`.
12. **Guide page should adapt to viewer role.** When a staff user is on `/guide`, hide the admin sections (Pipeline, Reports, Integrations, etc.). Either two markdown files or runtime filtering of the existing `docs/getting-started.md`.

### Lower-priority asks (not committed for next week)

- **Preferences** ("I prefer to close on Sunday nights") — soft hint per staffer the magic-schedule could weight, not a hard constraint. Geneva acknowledged this is nice-to-have.
- **Window-open SMS notifications** — waits for Twilio provisioning.
- **Per-staffer "preferred openers / preferred closers"** for the admin to lean on — Geneva mused about it but didn't ask for it explicitly.

### Notes from the meeting worth remembering

- Forgot-password URL bug (was hitting localhost) is fixed; Sami asked Geneva to retest. If she reports it still broken, that's a top-priority bug ahead of all of the above.
- Tango walkthroughs are seeded in SOPs and Geneva's bought into the model — she'll edit them via Tango (Sami's logged-in copy on her main computer) when memberships/reservations change. No CourtOps work needed there.
- The legacy weekly `availability` table is still in the DB unused (after PR #12 dropped the Weekly Default sub-tab). Do not delete yet — keep until June at the earliest.

---

---

## Quick orient

| What | Where |
|---|---|
| Live app | https://courtops.app (root redirects to login) and `thepbjar.courtops.app` (The Jar tenant) |
| Repo | https://github.com/samizoss/courtops |
| Supabase | Project `facrogjtbtvhuxzaboln` (us-east-1, `Zoss Collaborations` org) |
| Vercel | Project `courtops` in team `zoss-collaborations` |
| Pilot tenant | The Jar Pickleball Club (org_id `00000000-0000-0000-0000-000000000001`, slug `the-jar`) |
| Primary users | **Sami Zoss** (owner/developer), **Geneva Olson** GM of The Jar (admin), **Travis Thie** owner of The Jar, **Max Blanchard** owner/dev account |
| Phase | Phase 1 (Staff) in polish/iteration. Staff module *is* the focus right now. |

**Running locally:** `cd "C:\Users\samiz\courtops" && npm run dev` (port 3000)
**Deploying:** `cd "C:\Users\samiz\courtops" && npx vercel deploy --prod --yes` — or merge to `master` and GitHub → Vercel auto-deploys.

---

## What's been built (end-to-end, as of 2026-04-21)

Every item in this section is on `master` and live on `courtops.app`. Cross-reference the `git log` list at the bottom of this file for which PR each came in.

### Core platform
- **Next.js 16 / React 19 / TypeScript / Turbopack** app router, Tailwind v4, dark theme
- **Supabase (Postgres 17)** with RLS on every table
- **Wildcard subdomain routing** (`*.courtops.app`) — middleware extracts the org slug, server components call `getUserOrg()` (`src/lib/get-user-org.ts`) to scope data
- **Vercel preview deploys** — every PR gets a preview URL; Supabase env vars are scoped to Production+Preview; `NEXT_PUBLIC_ROOT_DOMAIN` does the right thing when served from `*.vercel.app`

### Auth & onboarding
- **Login** (`/login`) — email+password via Supabase Auth. Has `?message=` query param for success messages.
- **Forgot-password / reset-password flow** (`/forgot-password`, `/reset-password`) — via `supabase.auth.resetPasswordForEmail`.
- **Invite acceptance** (`/invite/[token]`) — public page, uses `POST /api/invite/accept` server route to bypass RLS correctly. Creates auth user + profile + marks invite accepted.
- **Invite email sending** — `POST /api/invites/send` fires a Resend email from `hello@courtops.app` with a branded HTML template. Falls back to copy-link if delivery fails. Team settings UI also exposes a "Copy Link" button on pending invites so you can always hand the link off manually.
- **Middleware** (`src/lib/supabase/middleware.ts`) allows `/login`, `/auth`, `/invite`, `/api/invite`, `/forgot-password`, `/reset-password` without auth.

### Dashboard (`/`)
- Stat cards: Today's Checklists, New Leads, Overdue Follow-ups, Open Tasks, Unread Notifications
- **Who's On Shift** widget (from `time_clock` where `clock_out is null`)
- **My Tasks Today** with inline completion checkbox
- **Cadence Due Today** — overdue leads with pipeline type, stage, days-overdue badge
- **Recent Activity** — last 10 activities across all leads

### Staff module (`/staff`) — Phase 1 focus
Five tabs: **Clock In/Out**, **Roster**, **Schedule**, **Time Off**, **Availability**.
- Personal clock in/out with optional notes
- "Forgot to clock in?" missed-entry modal (writes `is_manual_entry = true`)
- Admin can **edit any clock entry** — audit trail in `time_clock_edits` with who/when/old/new
- Admin can add clock entries on behalf of staff
- `is_active` toggle (removes staff from the active roster entirely)
- `is_operational_staff` toggle — dev/test accounts stay but vanish from schedule/availability/hours. Current user always included in their own views.
- Roster with click-to-flip operational + active states
- Weekly availability grid (Sunday–Saturday, set per day)
- Time-off requests with approve/deny
- Schedule: week view of shifts, click-to-assign from available staff
- Hours summary: date range, per-person totals, filters out non-operational staff
- Clock notes have visibility control (`all_staff` or `admin_only`) — column exists in `org_settings`, no settings UI yet

### Checklists (`/checklists` + `/checklists/admin`)
- Daily view: opening/midday/closing templates with per-item toggle, shows who completed when
- Admin editor: template CRUD, item CRUD (add/edit/reorder up/down/delete), active/inactive toggle
- The Jar seeded with 3 templates (23 items total)

### Pipeline (`/pipeline`)
- **4 pipeline types seeded for The Jar:** LTP (8 stages), Membership (11 stages), Upgrade (8 stages), Events (7 stages). Stored in `pipelines` and `pipeline_stages` tables.
- Kanban board with tabs per pipeline plus "All" and "Unassigned" (legacy status-based column) views
- Lead detail page (`/pipeline/[id]`) with:
  - Stage selector (auto-logs a `status_change` activity on change)
  - Activity timeline (call/text/email/in-person/voicemail/note) with direction + outcome
  - Related SOPs linked to the lead's pipeline
- New lead form with pipeline + stage picker
- Overdue view (`/pipeline/overdue`) — cross-pipeline

### SOPs (`/sops`)
- Category grid with search over title + content + tags, filter tabs per category
- Full detail page (`/sops/[id]`) with ReactMarkdown + GFM + `rehype-raw` + `rehype-sanitize`
- **Iframe embeds** — "Add Embed" button accepts any iframe snippet or https URL (Tango, Scribe, Loom, YouTube, Google Docs, etc.). Sanitized safely. 8 Tango walkthroughs currently seeded for The Jar.
- **Walkthrough badge** on list cards — detects embed provider (Tango/Scribe/Loom/YouTube/Vimeo/Google Docs) and shows "▶ Tango walkthrough" pill instead of raw iframe HTML
- **AI-suggested category + tags** — `POST /api/sops/suggest` uses Claude Haiku 4.5 with structured outputs (Zod schema). Manual ✨ Suggest button + auto-suggest on blur (600ms debounce, skips short inputs, dedupes on signature). Tags merge, don't overwrite. Admin/owner only. ~$0.0001 per call.
- Image uploads via Supabase Storage bucket `sop-images`
- Tags + version bump on save
- Admin/owner can unpublish without deleting; drafts visible to admins only

### Tasks (`/tasks`)
- Full CRUD: create, inline edit, quick-complete checkbox, delete
- Filter tabs (Open/Done/All) with counts
- Hover actions for quick status changes
- Priority + type + assignee + due date

### Reports (`/reports`)
- Top stats: leads this month, converted this month, activities this month, leads touched
- **Pipeline conversion rates** — per-pipeline bar (converted/active/lost) with conversion %
- **Lead source effectiveness** — table with total/converted/rate

### Content calendar (`/content`)
- Month view with click-to-create, platform + type + status coloring
- Inline edit on click; status buttons (planned/draft/ready/posted/skipped); delete

### Messaging (`/messaging`, `/messaging/settings`) — infra only, Twilio not yet provisioned
- Inbox with thread grouping, unread indicator, budget bar
- Settings page: monthly cap, warn threshold slider, pause toggle, alert phone
- `org_messaging_config` and `messages` tables live
- API routes built but dormant:
  - `POST /api/messaging/send` — budget check, inserts message, logs activity, updates spend
  - `POST /api/messaging/inbound` — Twilio SMS webhook (validates form-encoded), auto-matches to lead by phone
  - `POST /api/messaging/status` — delivery status + cost reconciliation
  - `POST /api/widget/contact` — public endpoint for `public/widget.js` embed; fires `notifyAdmins` on new lead
- `public/widget.js` is a self-contained embeddable contact form clubs can drop on their site

### Notifications (`/notifications`)
- Full list with type icons (cadence/task/time-off/new-lead/system), relative timestamps, "Mark All Read"
- Bell in sidebar with unread count badge, polls every 30s
- Notification creation utility (`src/lib/notifications.ts`) with `createNotification` and `notifyAdmins` helpers
- Currently wired: widget contact endpoint fires `new_lead` to admins. No other triggers yet.

### Settings (`/settings`)
- **General** — org name, slug (read-only), timezone, logo upload (Supabase Storage bucket `org-logos`)
- **Team** — roster with role change dropdown, pending invites table with Copy Link / Resend / Revoke, invite form (email + role), sends Resend email
- **Integrations** — Court Reserve API username + password + org ID, sync enabled toggle, "Sync Now" button, shows `cr_last_synced_at`

### Court Reserve sync (ported from `courtreserve-sync` project)
- `src/lib/courtreserve.ts` — TypeScript CR API client (Basic Auth, paginated members, attendance, transactions, tier mapping)
- `POST /api/sync/courtreserve` — authenticated admin-only endpoint. Pulls members, attendance (6mo), transactions (3mo). Upserts into `cr_members` in batches of 500. Flags upgrade candidates (Daily Player with ≥5 visits or ≥$50/month spend). Recommends tier + projected savings. Logs the run in `cr_sync_log`.
- **Last sync: 2026-04-14, 3,637 members, 339 upgrade candidates.** Button in Settings > Integrations triggers manually; no cron yet.
- **Known:** The `courtreserve-sync` Node project still exists and still syncs to Notion. We haven't sunset it yet. Plan is to either shut it down or delete it once CR-sync-inside-CourtOps proves reliable over a few weeks.

### Website widget (`public/widget.js`)
- Vanilla JS embeddable snippet, no React. Club pastes `<script src="https://courtops.app/widget.js" async>` with a config block.
- Floating button + panel, posts to `/api/widget/contact` with a shared secret header. Creates a lead, activity row, and (if messaging is configured) an inbound message row. Fires `new_lead` notification to admins.

### Guide (`/guide`)
Client-facing getting-started doc at `/docs/getting-started.md` rendered inside the app. Explains Dashboard / Checklists / Pipeline / Tasks / Staff / SOPs at an end-user level.

### Date-specific availability (`/staff` → Availability → "By Date" sub-tab) — partial, in active iteration

Phase 1.1 from Geneva's requirements. As of 2026-04-21 a working v1 is shipped; refinements queued (see "Next up"). Geneva's existing scheduling sheet (the `Jar Employee Schedule` CSV she shared) uses date-specific free-text shifts like `7 - 230`, `open - 9`, `5 - 7, 10 - 230, 5-630`. The recurring weekly `availability` table couldn't represent any of that.

**Built (PR #10, 2026-04-21):**
- New `availability_entries` table (migration 005): `org_id`, `user_id`, `entry_date`, `shifts text` (free-text), `is_unavailable`, `notes`. Unique on `(org_id, user_id, entry_date)`.
- New "By Date" sub-tab in the Availability tab (default sub-tab). Multi-week grid that mirrors Geneva's CSV layout: rows = employees, columns = dates, cells = free-text input + Unavailable toggle.
- Range navigator (← / This week / →) and "Show 1wk / 2wk / 3wk / 4wk" toggle.
- Autosaves on blur; empty cells delete the row.
- Staff sees only their own row; admin sees all operational staff.
- Existing weekly `availability` table → renamed in the UI to "Weekly Default" and stays as a recurring template.

**Decisions confirmed with Sami (2026-04-21):**
- **Calendar month is the default view**, not 3 weeks. View should anchor to "this calendar month" with navigation that snaps month-by-month.
- **Sunday-first** day ordering (revise from Mon-first that we shipped).
- **Free-text shifts stay free-text** for now — no parser. Geneva's team enters whatever format they're used to. Light input hygiene only (trim whitespace, cap length at e.g. 200 chars). Schema-aware parsing waits until Schedule Builder needs it.
- **Validation:** trim whitespace, soft-cap length. Don't try to parse semantically (that's Schedule Builder's job).
- **Notification on window open** is on the roadmap but waits until the rest of availability is solid.

**Next up on this feature (release/lock workflow — top priority before next iteration):**
The current implementation lets anyone edit any date freely. Geneva needs a controlled lifecycle:
1. Admin "opens an availability window" for a date range (e.g. "May 4 – May 31").
2. Staff submits during the window. They cannot edit dates outside an open window.
3. Admin "locks" the window when ready to build the schedule. Submissions become read-only.

**Spec for the release/lock workflow (implement next session):**

```sql
-- Migration 006
CREATE TABLE availability_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                -- e.g. "May 2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
  opened_by UUID REFERENCES profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES profiles(id),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE availability_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage org availability windows" ON availability_windows
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE INDEX idx_availability_windows_org_status ON availability_windows(org_id, status);
CREATE INDEX idx_availability_windows_dates ON availability_windows(start_date, end_date);
```

**UI changes:**
- Above the grid in "By Date" tab, add a "Windows" strip: list of open + recently-locked windows with status badges.
- Admin button: "Open availability window" → modal with label + start/end dates → inserts into `availability_windows` with status='open'.
- Each open window has a "Lock window" button (admin only) that flips status to 'locked' + records `locked_by`/`locked_at`.
- Staff: cells inside an open window are editable; cells outside any open window OR inside a locked window are read-only.
- Admin: can always edit, but locked windows show a "Locked" badge and require an explicit "Unlock" or "Override" before editing.
- Page query: also fetch `availability_windows` for the visible date range.
- Helper: `getWindowForDate(date, windows)` returns the window containing that date or null.

**After release/lock ships, the next big feature is Schedule Builder.** Confirmed with Sami: "Start with schedule builder we KNOW she needs/wants that."

### Schedule Builder spec (next major build, replaces current `/staff` Schedule tab)

Sami's direction (2026-04-21):

> "The schedule view should literally just be what is the upcoming schedule, and you should be able to filter to my schedule versus total schedule and view by day, week, and month."

> "When signed in as a staff, I shouldn't just automatically be able to see available staff. I think we could do that if it's like a need for a shift swap who had availability. Great, but staff availability should only be uniformly visible to admins."

**Spec for the Schedule tab rebuild:**

1. **Default: read-only schedule view of the upcoming schedule.**
2. **Filter toggle:** "My schedule" (default for staff) vs "Total schedule" (default for admin). Staff CAN see total schedule (everyone's shifts) — that's fine. They just can't see *availability data* on this view.
3. **View toggle:** Day / Week / Month.
4. **Privacy rule (CRITICAL, currently violated):** the existing Schedule tab has a "Staff Availability" panel that shows everyone's recurring availability and unset state. **Staff users must NOT see this panel.** Hide it for non-admins. The only place staff should see other people's availability is inside an explicit shift-swap flow ("who could cover my Tuesday shift?").
5. **Admin-only features:** click into a slot to assign / edit / unassign shifts, draft mode, publish button (notifies assigned staff once on publish), print-friendly month view (Geneva's "I print it and put it on the desk" use case from the April 14 meeting).

**Files to update for the immediate privacy fix (quick):**
- `src/app/(dashboard)/staff/tabs/schedule-tab.tsx` — gate the "Staff Availability" panel behind `if (isAdmin) { ... }`. The panel data is already passed in; we just don't render it for staff. The screenshot showing this panel for a staff session was the trigger.

**Files to touch for the full rebuild:**
- `src/app/(dashboard)/staff/tabs/schedule-tab.tsx` — likely a substantial rewrite. Keep the data fetched at the page level (shifts + profiles + availability + time-off + org-hours), reorganize the rendering around the new view-mode state machine.
- Add `viewMode: 'day' | 'week' | 'month'` and `filterMode: 'mine' | 'all'` state.
- For staff users, default `filterMode='mine'` and hide the Staff Availability panel entirely.
- Print stylesheet for the month view.

### NEXT-SESSION BIG BUNDLE — Sami's directive 2026-04-21

Sami wants the next session to ship **all of this together**:
1. Release/lock workflow on availability (spec above)
2. Schedule builder rebuild (spec above)
3. The availability "By Date" redesign described below
4. The admin schedule-builder UX described below

He'll start a fresh conversation and say "read CURRENT_STATE.md" — make sure these specs are exact.

#### Availability "By Date" tab redesign (replace current week-grid implementation)

Sami's feedback after seeing what shipped (PR #11):

**1. Make it look like an actual calendar**, not a stack of week-rows. A real month calendar grid (7 columns Sun-Sat × 4-6 rows of dates) with each day being a tappable cell. The current implementation is a series of "week blocks" stacked vertically — that doesn't match how she thinks about a month.

**2. Swap the "Unavailable" checkbox for "Available" — opt-in, not opt-out.**
- Default state: blank = not available (or no preference / didn't submit).
- Staff checks "Available" + (optionally) types specific hours if their availability is constrained.
- Removes the "is_unavailable" semantic — replace with `is_available` boolean.
- Schema migration needed: rename column or add new boolean. **Recommendation:** in migration 006, also rename `availability_entries.is_unavailable` to `is_available` with inverted meaning, OR add a new column and migrate data. Simpler: drop `is_unavailable`, add `is_available` boolean default false, update component logic.

**3. View modes: Day, Week (single week), Month — pick one at a time.** Remove the current "1wk / 2wk / 3wk / 4wk" multi-week toggle. Just three buttons: Day · Week · Month. Default to Month.

**4. The "This month" button text is confusing when viewing other months.** Two issues:
- The button still says "This month" even when navigated to e.g. June. Either always show it (and have it jump back to the current month), or rename/contextualize.
- The date display next to the arrows currently shows `Mar 29 – Apr 4 – Apr 26 – May 2` (range of the first week dash range of the last week). Sami wants it to just be **the start date and end date of what's being displayed**, e.g. `Mar 29 – May 2`. One range, not two.

**5. Remove or clarify the "Weekly Default" sub-tab.** Sami doesn't understand its role anymore. Decide: either remove the sub-tab entirely (and deprecate the recurring-weekly `availability` table), or rename it to something that makes sense in this context (e.g. "Default availability template" with a clear purpose: when a staffer hasn't filled in a specific date, fall back to this template). **Default action:** remove the sub-tab. The recurring `availability` table can stay in the DB unused; we can revisit if we ever want default templates.

**6. Sunday-first** is correct (already shipped). Keep that.

**7. Light validation on shifts** is fine as-is (trim whitespace, soft length cap). No semantic parsing yet.

#### Admin Schedule Builder UX (the "Schedule" tab redesign)

Sami's feedback (looking at the existing schedule tab):

**1. Same view modes as availability:** Day · Week · Month. Calendar-style.

**2. Calendar layout** (not the current grid of staff-rows × time-columns).

**3. Inline click-to-assign:** click a day on the calendar → see who's available that day (from `availability_entries`) → click a staffer to assign them to a shift on that day. "Here's who can work these shifts."

**4. Hours summary at top OR bottom of the schedule view, per staffer:**
- This week / month: assigned hours vs their submitted availability hours.
- Useful so Geneva can see "Maddie said she's available 30 hours but I've only scheduled her 12".
- **Future iteration:** assigned hours vs **target/average hours** (set per staffer). Add `target_weekly_hours` (or similar) to `profiles` later. Editable in Roster tab. Don't build target-hours now — just the availability-hours comparison.

**5. Filter toggles (already in spec above):**
- "My schedule" vs "Total schedule" filter.
- For staff: default to "my schedule".
- For admin: default to "total schedule".

**6. Privacy rule (already in spec above):** Staff users must not see other staff's availability data on the schedule view. Fine to see other staff's *shifts* (the published schedule), just not their availability.

#### Implementation notes for next session

- Both views (availability + schedule) should share a calendar grid component. Build once, use twice. Probably `src/components/calendar-month-grid.tsx` with day/week/month modes, accepting children renderers per cell.
- All this work + the release/lock spec + the schedule-builder rebuild should land **as a bundle** in one big PR (or a series of small PRs in the same session). Sami's preference is to fix the availability look + the schedule-builder UX at the same time so Geneva sees a coherent change.
- Migration 006 should bundle: `availability_windows` table (release/lock) AND any `availability_entries` schema changes (e.g. `is_unavailable` → `is_available`) AND optionally `profiles.target_weekly_hours` if you want to ship the future hours-target piece alongside.
- Test as both an admin AND a staff user (use `sami+staffview@samizoss.com` and `sami+adminview@samizoss.com` accounts that already exist) before claiming complete.

---

---

## Database (Supabase) — as of 2026-04-21

25 tables live in the public schema. Migration files under `supabase/migrations/`:

- `001_initial_schema.sql` — orgs, profiles, checklists + items + completions, leads, sops, tasks
- `002_pipeline_rework.sql` — pipelines, pipeline_stages, activities, cadence_rules, notifications, org_invites, content_calendar, org_settings, cr_members, cr_sync_log, org_messaging_config, messages + ALTERs to leads/sops/tasks/orgs
- `003_invite_rls_fix.sql` — public SELECT + UPDATE on org_invites so unauthenticated acceptance flow works; `Users can insert own profile` on profiles
- `004_staff_quick_wins.sql` — `profiles.is_operational_staff`, `time_clock.is_manual_entry / admin_note / last_edited_by / last_edited_at`, new `time_clock_edits` audit table, `org_settings.clock_notes_visibility`

**Migrations applied to prod Supabase:** all four. Use the Supabase MCP (`mcp__claude_ai_Supabase__apply_migration`) for further DDL rather than hand-applying SQL.

### Table cheat sheet
`orgs`, `profiles`, `checklist_templates`, `checklist_items`, `checklist_completions`, `leads`, `sops`, `tasks`, `pipelines`, `pipeline_stages`, `activities`, `cadence_rules`, `notifications`, `org_invites`, `content_calendar`, `org_settings`, `cr_members`, `cr_sync_log`, `org_messaging_config`, `messages`, `time_clock`, `time_clock_edits`, `time_off_requests`, `availability`, `shifts`.

### RLS gotcha worth remembering
Any new column that's a second foreign key to `profiles` on a table (like `time_clock.last_edited_by`) will make `profile:profiles(full_name)` auto-joins return HTTP 300 "Multiple Choices." When you add FKs that could cause ambiguity, also update every `.select()` that joins profiles on that table to specify the FK explicitly, e.g. `profile:profiles!time_clock_user_id_fkey(full_name)`. See PR #6 for the canonical fix.

### Seeded data
- The Jar org (slug `the-jar`, cr_org_id `13403`)
- 5 profiles (Sami owner, Geneva admin, 2 dev/test accounts flagged `is_operational_staff=true` but were Sami's sami+adminview / sami+staffview accounts — all are op-staff currently; consider toggling the test ones off), Max Blanchard owner
- 3 checklist templates with 23 items
- 4 pipelines with 34 stages + 426 leads from the original Notion pipeline
- 10 SOPs (2 original text SOPs + 8 Tango walkthroughs)
- 3,638 `cr_members` (last synced 2026-04-14; 339 upgrade candidates)

---

## Environment variables (Vercel)

Scoped to Production + Preview unless noted:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `courtops.app` — middleware uses this for subdomain detection |
| `RESEND_API_KEY` | Resend API key for invite emails (from `hello@courtops.app`) |
| `ANTHROPIC_API_KEY` | Claude Haiku 4.5 for SOP AI suggest |

Not yet configured (intentional):
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `WIDGET_API_SECRET` — Twilio / widget messaging not yet live
- No OpenAI key — we picked Anthropic (see "Things tried / considered" below)

---

## Known issues / active bugs

Clean at the moment. Recent bug fixes (all shipped on 2026-04-21):

- **SOP save hang** — handlers missing `try/catch`; if Supabase threw, `setLoading(false)` never ran. Wrapped in try/catch/finally. (PR #5)
- **Missed clock-in didn't update UI** — `router.refresh()` was unreliable after inserting a `time_clock` row. Switched to `window.location.reload()`. (PR #5)
- **Staff page showing "Not clocked in" with 0 recent entries while hours summary worked** — PostgREST returned HTTP 300 on `profile:profiles(full_name)` joins after migration 004 added a second FK to profiles. Specified the FK explicitly. (PR #6)
- **Invite flow returned empty from RLS** — added public SELECT/UPDATE policies on `org_invites` and INSERT policy on `profiles`. (migration 003)
- **Login page broke during build** (`useSearchParams` needs Suspense boundary) — wrapped in Suspense. (2026-04-21)
- **Dashboard occasionally crashed on one stale query** — rewrote with `Promise.allSettled` so a single query failure degrades gracefully instead of crashing the whole page.

---

## Next up (ordered)

Per Sami's 2026-04-21 direction, these come first before new features:

1. **Work through the Staff module** — Geneva is the primary user; it's in Phase 1. Pay close attention to the April 14 Geneva requirements doc (`docs/2026-04-14-geneva-phase-1-2-requirements.md`). Items still open there:
   - **Monthly availability submission** (currently weekly) — 1.1 in that doc. Highest priority.
   - **Schedule builder: availability-aware click-to-assign** — partially done (1.2). Needs availability overlay, draft/publish flow, and print-friendly month view.
   - **Hours summary: scheduled vs actual with variance flagging** (1.4) — currently only shows actual hours.
   - **Clock notes visibility UI** (1.5) — the column exists on `org_settings` but there's no UI to toggle it yet.
   - **Admin-view visual differentiation** — distinct tint/indicator so you know when you're in a privileged view.
   - **Business hours setting** — open/close per day + buffer min; affects scheduling grid.
2. **Troubleshooting** — whatever Geneva flags while using the Staff module live. No features until reported issues are resolved.
3. **Update availability** — convert Sunday-Saturday weekly to the month-level submission flow (see 1.1 above). Includes: admin opens a window ("Submit May availability by ___"), triggers a staff notification, staff sees a month calendar with configurable slot increments, save-draft + final-submit, admin sees who's submitted vs pending.
4. **Time Off → Shift Swap split** — currently the Time Off tab handles both. Per Geneva (1.3), split shift-swap into its own flow:
   - Only available after the schedule is published
   - Staff picks the shift they're swapping
   - Direct it at a specific coworker OR post as open to anyone available
   - Coworker accept/decline + admin approve/deny
   - Approved swap updates the schedule automatically

### After the staff module shakedown
Roughly prioritized, revisit with the user before starting:
- **Checklist reworks** — Phase 2 of Geneva's doc. Frequencies beyond opening/midday/closing (daily, weekly, monthly, etc.), items with optional SOP links, completion reporting.
- **Shift swap notifications in-app** — wire the notification creation utility to fire on swap requests, approvals, and new leads (only widget currently fires).
- **Court Reserve sync cron** — we run it manually via the "Sync Now" button. Needs a scheduled trigger (Vercel cron or a Supabase edge function + pg_cron).
- **Twilio provisioning** — UI is built; requires A2P 10DLC registration (~$14, 1–2 weeks) and one sub-account per org. See CLAUDE.md Messaging section.
- **Reporting module expansion** — Phase P1 per PRD. Staff performance, member tier trends, checklist completion rates.
- **Pipeline auto-advance + cadence-driven task auto-creation** — cadence_rules table exists; no engine writes to tasks yet.
- **Landing page at root `courtops.app`** — currently redirects to login. P2.
- **Ambassador / Instructor / League Leader roles** — mentioned by Geneva but deferred until there's a staffing scenario that needs it.

---

## Things tried / considered / rejected (so we don't relitigate)

**Claude Haiku vs OpenAI for AI suggest (2026-04-21):** Went with Haiku 4.5. Why: ~$0.0001 per call, Anthropic already in the stack (no new vendor), structured outputs with Zod works cleanly. OpenAI would have been fine but there was no reason to add a second AI vendor.

**Keyword rules vs LLM for category/tag suggest (2026-04-21):** Rejected keyword rules. Category enum is small (7) but titles are ambiguous (e.g., "Process Unpaid Registrations" could map to front-desk or sales depending on context). Free-form tags need contextual generation. LLM cost is negligible.

**Per-org Tango API integration (2026-04-21):** Rejected for now. Tango doesn't have a public API on non-Enterprise plans. Generic iframe-embed support covers 90% of the use case and is provider-agnostic (works with Scribe, Loom, YouTube, Google Docs, etc.).

**Upload-Word-or-PDF-and-AI-import-to-SOP (2026-04-21):** Deferred. Captured as `SOP-10 (P2 — future)` in `docs/PRD.md`. Will need a text extraction step (or Claude's native PDF vision) plus a markdown conversion pass. Not needed before Geneva has manually entered her SOPs.

**Role-based sidebar filtering (2026-03-27):** Considered after Geneva's launch call ("staff should see less, admins more"). Not implemented yet because we're still in admin-heavy build mode. When staff users actually start logging in, filter the sidebar by role: staff sees Checklists, SOPs, Staff (clock in/out only), Tasks (their own), Notifications.

**SwipeClock replacement vs integration (2026-03-27 Geneva call):** Geneva wants CourtOps to replace SwipeClock + RingCentral entirely. Needs sign-off from Travis (owner) and confirmation that the accountant just needs a payable report. Hours summary + CSV export will close this loop.

**Twilio sub-accounts vs shared account (2026-03-17 meeting + infra):** Going with **per-org sub-accounts**. Why: (1) each club gets their own phone number, (2) billing isolation, (3) easy shutdown per tenant. Sami manually provisions numbers for now; automate with Twilio Accounts API when onboarding club #2.

**MCP SDK for CR sync vs direct fetch (2026-04-21 CR port):** Direct fetch. CR API is simple Basic Auth, no benefit from adding an MCP layer for our own consumption.

**Vercel cron vs self-hosted cron for CR sync:** No decision yet. Sami runs it manually for now. Vercel Pro includes cron; alternative is a Supabase edge function on pg_cron.

**Context search of SOP embed body:** Known limitation. SOPs that are embed-only (like the 8 Tango walkthroughs) aren't full-text-searchable for content inside the video/walkthrough — search only hits title + tags. Accepted for now because Geneva's title discipline is strong. If search becomes an issue: either have authors add a one-line intro before the iframe, or fetch the Tango page text server-side on save.

**"Fix the build cache" vs "force Vercel redeploy":** When SSL or cache behaved weirdly mid-April, we tried both. Force redeploying after env-var changes is the reliable path; Vercel doesn't auto-redeploy on env change.

**PostgreSQL-side cadence engine vs application-level:** Deferred. Didn't want to commit to pg_cron + edge functions before the UX settled.

---

## Operational notes for future Claude sessions

- **Available MCPs (cloud-hosted, on Sami's Claude account):** Supabase, Vercel, Notion, Anthropic (via claude-api skill), Airtable, Slack, Linear, Figma, Canva, Fireflies, Gamma, Gmail, Google Calendar, Google Drive, Granola, Stripe, WordPress, ZDrive, Square. These attach per session; if a tool isn't loaded, use `ToolSearch` to load it.
- **Branch protection on master:** Requires reviews, but Sami has admin. Claude's been using `gh pr merge N --squash --delete-branch --admin` to self-merge; this is sanctioned.
- **Windows environment:** Bash paths in Git Bash. Quote paths with spaces. Never use `/mnt/c/...` — always `C:\Users\samiz\...` with double-quotes.
- **Development workflow Sami prefers:** Branch → PR → admin-merge squash → delete branch → pull master. All deploys go through Vercel (no manual `vercel deploy` needed when merging to master; auto-deploys).
- **When Sami asks "is this live?":** Check the most recent Vercel production deploy (the one targeting `courtops.app`) and confirm it contains the relevant commit SHA. Don't just say yes.
- **When something breaks:** Check Supabase API logs via `mcp__claude_ai_Supabase__get_logs` — HTTP status codes like 300 reveal PostgREST ambiguity bugs that look like "empty data" from the client side.

---

## Git log (reverse chronological, most recent first)

Last 10 commits as of 2026-04-21:

```
8e96470 2026-04-21 Add embed badge + AI-suggested category/tags on SOPs (#8)
1c90c63 2026-04-21 Add generic iframe embeds to SOPs (Tango, Scribe, Loom, etc.) (#7)
d49aabb 2026-04-21 Fix ambiguous profile FK joins causing 300 Multiple Choices (#6)
c9d3334 2026-04-21 Fix SOP save hang and missed clock-in not reflecting in UI (#5)
43a5a54 2026-04-21 Staff module quick wins: toggle, missed clock, admin edits, logo upload (#4)
b9701dc 2026-04-14 Wire real email sending to invite flow via Resend (#3)
50d8c52 2026-04-06 Fix Vercel preview deploys crashing on subdomain check
b6d0635 2026-04-03 Strip markdown from SOP card previews, fix <a> to <Link>
f371fe7 2026-04-03 Add developer collaboration setup + .github workflows (#1)
80b0fc1 2026-04-02 Phase 1 launch prep: SOPs, Staff, Checklists, Dashboard overhaul
```

Run `git log --oneline` in `C:\Users\samiz\courtops` for the full timeline.

---

## Related projects (outside this repo but linked)

- **`C:\Users\samiz\courtreserve-sync`** — legacy CR → Notion sync. Still runs, still feeds the old Notion pipeline. Targeted for sunset once the in-CourtOps sync proves out. Don't delete yet.
- **`C:\Users\samiz\jar-calendar`** — LTP event calendar at jar-calendar.vercel.app. Read-only view of Court Reserve LTP events. Not in CourtOps scope.
