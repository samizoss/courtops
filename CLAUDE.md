# CourtOps — Development Guide

> **👋 Fresh session? Read [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) FIRST.**
> That file is the authoritative snapshot of what's shipped, what's been tried, what's rejected, and what's next. This file covers the longer-lived conventions, patterns, and reference material.

---

## What is this?

CourtOps is a multi-tenant operations platform for court sport clubs. The "ops layer that sits on top of Court Reserve." Built for The Jar Pickleball Club (pilot), designed to sell to other clubs.

| Resource | Value |
|---|---|
| Live URL | https://courtops.app (+ `thepbjar.courtops.app` and future `*.courtops.app`) |
| GitHub | https://github.com/samizoss/courtops (`master` auto-deploys to Vercel prod) |
| Supabase | Project `facrogjtbtvhuxzaboln` (us-east-1, `Zoss Collaborations` org) |
| Vercel | Project `courtops` in team `zoss-collaborations` |
| Pilot tenant | The Jar Pickleball Club — org_id `00000000-0000-0000-0000-000000000001`, slug `the-jar`, Court Reserve org `13403` |
| Primary users | Sami Zoss (owner/dev), Geneva Olson (admin — GM of The Jar), Travis Thie (owner — The Jar) |

---

## Tech stack

- **Next.js 16** (App Router, Turbopack, React 19, TypeScript)
- **Tailwind CSS v4** (dark theme, responsive)
- **Supabase** (PostgreSQL 17, RLS on every table, Supabase Auth, Supabase Storage)
- **Vercel** (auto-deploy from `master`, preview deploys on every PR, wildcard SSL)
- **Resend** (transactional email for invites)
- **Anthropic (Claude Haiku 4.5)** (SOP AI suggest via `@anthropic-ai/sdk` + structured outputs)
- **Twilio** (messaging infrastructure built, not yet provisioned)
- **Multi-tenancy:** Subdomain routing via middleware (`*.courtops.app`)

---

## Commands

```bash
# Local dev (always use the repo directory, quote the path)
cd "C:\Users\samiz\courtops" && npm run dev

# Build
npm run build

# Deploy to prod (or just merge to master — GitHub auto-deploys via Vercel)
npx vercel deploy --prod --yes

# List Vercel env vars
npx vercel env ls production
```

### Git workflow Sami uses
Branch → PR → `gh pr merge N --squash --delete-branch --admin` → `git checkout master && git pull`.
Branch protection requires reviews for non-admins, but admin override is sanctioned for solo-dev work.

---

## Project structure

```
src/
├── app/
│   ├── (auth)/                   # Public-ish — no sidebar, middleware-allowed
│   │   ├── login/
│   │   ├── auth/callback/
│   │   ├── invite/[token]/       # Invite acceptance (uses /api/invite/accept for RLS)
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── (dashboard)/              # Authenticated — sidebar + ToastProvider
│   │   ├── page.tsx              # Dashboard (stats, who's on shift, my tasks, cadence due, activity)
│   │   ├── checklists/           # Daily view + /admin template editor
│   │   ├── pipeline/             # 4-pipeline kanban + tabs
│   │   │   ├── [id]/             # Lead detail with activity timeline + related SOPs
│   │   │   ├── new/              # Add lead with pipeline + stage picker
│   │   │   └── overdue/          # Cross-pipeline overdue view
│   │   ├── tasks/                # Full CRUD, filter tabs
│   │   ├── sops/                 # Search + filter
│   │   │   ├── [id]/             # Detail + inline editor (ReactMarkdown + rehype-raw/sanitize)
│   │   │   └── new/              # Create (with ✨ AI Suggest + iframe embeds)
│   │   ├── content/              # Content calendar (month view)
│   │   ├── messaging/            # Inbox + settings (infra only, Twilio pending)
│   │   ├── notifications/        # In-app list
│   │   ├── reports/              # Pipeline conversion + source effectiveness
│   │   ├── settings/
│   │   │   ├── general/          # Org name, timezone, logo upload
│   │   │   ├── team/             # Roster + invite flow (Resend email)
│   │   │   └── integrations/     # Court Reserve API creds + manual sync button
│   │   ├── staff/                # Clock + roster + schedule + time off + availability
│   │   └── guide/                # Client-facing getting-started.md renderer
│   └── api/
│       ├── invite/accept/        # Public invite acceptance (bypasses RLS safely)
│       ├── invites/send/         # Admin-only: creates invite + sends email via Resend
│       ├── messaging/send|inbound|status/   # Twilio plumbing (dormant)
│       ├── sops/suggest/         # Claude Haiku: ✨ AI category + tags
│       ├── staff/invite/         # Legacy (fallback, being phased out)
│       ├── sync/courtreserve/    # CR → Supabase sync
│       └── widget/contact/       # Public website embed endpoint
├── components/
│   ├── sidebar.tsx               # Responsive sidebar w/ notification bell + unread badge
│   ├── toast.tsx                 # Global toast ToastProvider
│   ├── sop-content.tsx           # Shared SOP markdown renderer w/ safe iframe support
│   ├── sop-suggest.tsx           # useSopSuggest hook + SopSuggestInline UI
│   └── embed-modal.tsx           # Paste-an-iframe modal for SOP editor
├── lib/
│   ├── supabase/{client,server,middleware}.ts
│   ├── courtreserve.ts           # CR API client (Basic Auth, paginated, tier mapping)
│   ├── email.ts                  # Resend helper + branded invite HTML template
│   ├── notifications.ts          # createNotification + notifyAdmins helpers
│   ├── org.ts                    # getCurrentOrg (subdomain-based)
│   └── get-user-org.ts           # getUserOrg (session-based)
├── types/
│   └── database.ts               # Source of truth for DB types (25 tables)
└── middleware.ts                 # Next.js middleware entry point

docs/
├── CURRENT_STATE.md              # ← read this first
├── PRD.md                        # Full product spec
├── 2026-04-14-geneva-phase-1-2-requirements.md   # Staff module scope
├── getting-started.md            # Client-facing onboarding (renders at /guide)
├── ux-audit-issues.md
└── superpowers/specs/*.md

supabase/migrations/
├── 001_initial_schema.sql
├── 002_pipeline_rework.sql
├── 003_invite_rls_fix.sql
└── 004_staff_quick_wins.sql

public/
└── widget.js                     # Embeddable website contact form
```

---

## Database (Supabase)

**25 tables**, all with `org_id` and RLS policies. See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) § Database for the full catalog and seeded data snapshot.

Migrations applied to production: `001`, `002`, `003`, `004`. Use `mcp__claude_ai_Supabase__apply_migration` for all further DDL.

### RLS gotcha — remember this
When a table has **two foreign keys to `profiles`** (e.g., `time_clock.user_id` + `time_clock.last_edited_by`), PostgREST auto-relationship inference returns **HTTP 300 Multiple Choices** on ambiguous joins like `profile:profiles(full_name)`. Clients see this as empty data. Fix: specify the FK explicitly:

```ts
profile:profiles!time_clock_user_id_fkey(full_name)
```

See PR #6 for the canonical fix and `docs/CURRENT_STATE.md` § Known issues.

---

## Key patterns

### Multi-tenancy
- Every table has `org_id`
- Middleware extracts org slug from subdomain: `thepbjar.courtops.app` → `thepbjar`
- RLS function `public.get_user_org_id()` scopes queries to user's org
- `getUserOrg()` in server components returns `{ userId, orgId, role, fullName }`
- Preview deploys (`*.vercel.app`) skip subdomain resolution and fall back to profile's org

### Auth
- Supabase email/password; Resend for invite emails; no OAuth yet
- Middleware allows `/login`, `/auth`, `/invite`, `/api/invite`, `/forgot-password`, `/reset-password`
- Invite RLS: public SELECT + UPDATE on `org_invites` so unauth users can read their invite and mark accepted; INSERT on `profiles` scoped by `id = auth.uid()`

### Client components + Supabase
- **NEVER** import `createClient` at module top level in client components
- Always use `const { createClient } = await import('@/lib/supabase/client')` inside event handlers
- Prevents build failures during static generation when env vars aren't available

### Mutations from the browser
- Wrap Supabase calls in `try/catch/finally` — if the call throws (network, auth refresh, etc.), `setLoading(false)` must still run or the button spins forever
- `console.error` the error so it's visible in DevTools
- When re-fetching after a write, prefer `window.location.reload()` over `router.refresh()` for server-rendered pages — `router.refresh()` has been unreliable with fresh Supabase data (see PR #5)

### Server components
- Add `export const dynamic = 'force-dynamic'`
- Use `getUserOrg()` → pass `orgId` / `userId` as props to client components
- Wrap multi-query fetches in `Promise.allSettled` so one failed query degrades gracefully instead of crashing the whole page (see dashboard)

---

## Environment variables

Scoped to Production + Preview unless noted. See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for currently-set values.

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `courtops.app` — middleware subdomain detection |
| `RESEND_API_KEY` | Invite email delivery |
| `ANTHROPIC_API_KEY` | Claude Haiku 4.5 for SOP AI suggest |

Not yet set (intentional): `TWILIO_*`, `WIDGET_API_SECRET`.

---

## PRD & planning docs

- **[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)** — current-state snapshot (read first)
- **[`docs/PRD.md`](docs/PRD.md)** — full 13-module PRD. Always reference before building a new feature.
- **[`docs/2026-04-14-geneva-phase-1-2-requirements.md`](docs/2026-04-14-geneva-phase-1-2-requirements.md)** — Phase 1-2 (Staff + Checklists) scope from Geneva's kickoff. **This is the current work queue.**
- **[`docs/getting-started.md`](docs/getting-started.md)** — client-facing, renders at `/guide`

---

## Next up (as of 2026-04-21)

Per Sami's latest direction, before any new feature work:

1. **Work through the Staff module** — Geneva is the primary user; Phase 1. Items open in Geneva's requirements doc:
   - Monthly availability submission (currently weekly)
   - Schedule builder: availability-aware click-to-assign with draft/publish
   - Hours summary: scheduled vs actual with variance flagging
   - Clock notes visibility toggle UI
   - Admin-view visual differentiation
   - Business hours setting

2. **Troubleshoot anything Geneva flags** — no new features until live issues are resolved.

3. **Update availability** — convert Sunday–Saturday weekly to month-level submission (admin opens window → staff notification → month calendar → save-draft + final-submit → admin sees who's submitted vs pending).

4. **Time Off → Shift Swap split** — currently conflated; needs to be two distinct flows. Shift swap only available after schedule is published; target specific coworker OR post open; coworker accept/decline + admin approve/deny; approved swap auto-updates schedule.

After Staff shakedown, re-plan with Sami. See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) § Next up for the longer-tail backlog.

---

## Related projects (outside this repo)

- **`C:\Users\samiz\courtreserve-sync`** — legacy CR → Notion sync. Still running; targeted for sunset once in-CourtOps sync proves stable.
- **`C:\Users\samiz\jar-calendar`** — LTP event calendar at jar-calendar.vercel.app. Read-only CR view. Not in CourtOps scope.
