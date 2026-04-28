# CourtOps — Current State

> **Snapshot date:** 2026-04-21
> **For a fresh Claude session:** read this first. It's the single source of truth for what's shipped, what's in progress, what's been tried-and-shelved, and what's next. When in doubt, trust `git log`, Supabase schema, and the Vercel production deployment over anything written anywhere else.

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
