# CourtOps - Development Guide

## What is this?
CourtOps is a multi-tenant operations platform for court sport clubs. Think "the ops tool that sits on top of Court Reserve." Built for The Jar Pickleball Club as pilot customer, designed to sell to other clubs.

**Live URL:** https://courtops.app (+ subdomains like thepbjar.courtops.app)
**GitHub:** https://github.com/samizoss/courtops
**Supabase Project:** `facrogjtbtvhuxzaboln` (us-east-1, Zoss Collaborations org)
**Vercel Team:** zoss-collaborations

## Tech Stack
- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL with RLS)
- **Auth:** Supabase Auth (email/password)
- **Hosting:** Vercel
- **Multi-tenancy:** Subdomain routing via middleware (`*.courtops.app`)

## Project Structure
```
src/
├── app/
│   ├── (auth)/              # Login, auth callback, invite acceptance (no sidebar)
│   │   ├── login/
│   │   ├── auth/callback/
│   │   └── invite/[token]/  # Staff invite acceptance page
│   ├── (dashboard)/         # All authenticated pages (with sidebar)
│   │   ├── page.tsx         # Dashboard (stats + who's on shift + my tasks + activity feed)
│   │   ├── checklists/      # Daily checklists (opening/mid/closing)
│   │   │   └── admin/       # Checklist template + item CRUD (admin only)
│   │   ├── pipeline/        # Lead pipeline kanban (4 pipeline types)
│   │   │   ├── [id]/        # Lead detail + activity timeline
│   │   │   ├── new/         # Add lead form with pipeline selector
│   │   │   └── overdue/     # Cross-pipeline overdue view
│   │   ├── tasks/           # Task CRUD with create/edit/complete/filter
│   │   ├── sops/            # SOPs wiki with detail/editor/create
│   │   │   ├── [id]/        # SOP detail + inline editor
│   │   │   └── new/         # Create new SOP
│   │   ├── content/         # Content calendar (plan social media posts)
│   │   ├── messaging/       # SMS inbox + thread view
│   │   │   └── settings/    # SMS budget, Twilio config
│   │   ├── notifications/   # In-app notification list
│   │   ├── settings/        # Org settings hub
│   │   │   ├── general/     # Org name, timezone, logo
│   │   │   ├── team/        # Staff roster, invite flow, role management
│   │   │   └── integrations/ # Court Reserve API setup
│   │   └── staff/           # Clock in/out, roster, schedule, time off, availability
│   ├── api/
│   │   ├── staff/invite/    # Staff invite API
│   │   ├── messaging/
│   │   │   ├── send/        # Staff sends SMS
│   │   │   ├── inbound/     # Twilio incoming SMS webhook
│   │   │   └── status/      # Twilio delivery status callback
│   │   └── widget/
│   │       └── contact/     # Public website widget endpoint
│   ├── layout.tsx           # Root layout (Inter font, dark theme)
│   └── globals.css
├── components/
│   └── sidebar.tsx          # Responsive sidebar with notification bell
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser Supabase client
│   │   ├── server.ts        # Server component Supabase client
│   │   └── middleware.ts    # Auth session + subdomain routing
│   ├── org.ts               # getCurrentOrg() - resolve org from subdomain
│   └── get-user-org.ts      # getUserOrg() - get user's org_id, role, name
├── types/
│   └── database.ts          # TypeScript types for ALL tables (20+ interfaces)
├── middleware.ts             # Next.js middleware entry point
public/
└── widget.js                # Embeddable website contact widget (vanilla JS)
scripts/
└── import-leads.js          # One-time Notion → Supabase lead import
supabase/
└── migrations/
    ├── 001_initial_schema.sql     # Original schema
    └── 002_pipeline_rework.sql    # Pipelines, stages, activities, notifications, etc.
```

## Database Schema (Supabase)
All tables have `org_id` for multi-tenancy. RLS policies on every table.

### Original tables (migration 001)
| Table | Purpose |
|-------|---------|
| `orgs` | Organizations (each club). Has slug, plan, billing_status, onboarding_completed. |
| `profiles` | User profiles linked to auth.users. Has role (owner/admin/staff/viewer). |
| `checklist_templates` | Reusable checklist definitions (opening/midday/closing/custom). |
| `checklist_items` | Individual items within a template. |
| `checklist_completions` | Daily completion records (unique per item per day). |
| `leads` | Sales pipeline. Now has pipeline_id, current_stage_id, pipeline_type, CR fields. |
| `sops` | Standard operating procedures. Now has pipeline_id, version, tags. |
| `tasks` | Task tracker. Now has lead_id, recurring_rule, parent_task_id. |

### New tables (migration 002)
| Table | Purpose |
|-------|---------|
| `pipelines` | Pipeline types per org (LTP, Membership, Upgrade, Events). |
| `pipeline_stages` | Ordered stages within a pipeline with cadence_days. |
| `activities` | Activity timeline for leads (replaces touch_count). |
| `cadence_rules` | Expected touch schedule per pipeline stage. |
| `notifications` | In-app notification queue (bell icon in sidebar). |
| `org_invites` | Pending staff invitations with token + expiry. |
| `content_calendar` | Social media / marketing content planning. |
| `org_settings` | Per-org config: billing, CR API creds, feature flags. |
| `cr_members` | Cached Court Reserve member data for enrichment. |
| `cr_sync_log` | Sync run history for monitoring. |
| `org_messaging_config` | Per-org Twilio setup and SMS budget tracking. |
| `messages` | All SMS messages sent or received. |

## Key Patterns

### Multi-tenancy
- Every table has `org_id` column
- Middleware extracts org slug from subdomain: `thepbjar.courtops.app` → slug `thepbjar`
- Slug passed via `x-org-slug` header to server components
- RLS function `public.get_user_org_id()` ensures users only see their org's data
- `NEXT_PUBLIC_ROOT_DOMAIN` env var controls the root domain

### Auth
- Supabase Auth with email/password
- Middleware redirects unauthenticated users to `/login`
- Client components use lazy `await import('@/lib/supabase/client')` to avoid build-time errors
- Server components use `createClient()` from `@/lib/supabase/server`

### Client Components + Supabase
- NEVER import `createClient` at module top level in client components
- Always use: `const { createClient } = await import('@/lib/supabase/client')` inside event handlers
- This prevents build failures when env vars aren't available during static generation

### Server Components + org_id
- Use `getUserOrg()` to get the current user's org_id
- Pass org_id as a prop to client components that need to write data
- Server pages use `export const dynamic = 'force-dynamic'`

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://facrogjtbtvhuxzaboln.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_ROOT_DOMAIN=courtops.app
```

## Commands
```bash
npm run dev          # Local dev server (localhost:3000)
npm run build        # Production build
npx vercel deploy --prod --yes  # Deploy to Vercel
```

## The Jar (Pilot Customer)
- **Org ID:** `00000000-0000-0000-0000-000000000001`
- **Slug:** `the-jar`
- **Court Reserve Org ID:** `13403`
- **GM:** Geneva Olson (geneva@thepbjar.com)
- **Sami's login:** sami@samizoss.com (owner role)
- **Data seeded:** 3 checklists (23 items), 6 SOPs, 426 leads from Notion pipeline

## Related Projects
- `C:\Users\samiz\courtreserve-sync` — Daily Court Reserve → Notion sync (3,265 members). Runs at 6AM via Task Scheduler.
- `C:\Users\samiz\jar-calendar` — LTP event calendar deployed to jar-calendar.vercel.app

## PRD (Product Requirements Document)
The full PRD lives at `docs/PRD.md`. It covers:
- 13 modules (Auth, Dashboard, Pipeline, Checklists, Tasks, SOPs, Staff, CR Integration, Content Calendar, Reporting, Settings, Notifications, Landing Page)
- Complete data model (existing + new tables)
- 4 pipeline types with stages, cadences, and full SOP scripts (Appendices A-D)
- Phased rollout plan (Phase 0-3)
- Integration architecture (Court Reserve, Syndicate, Stripe)

**Always reference the PRD before building a new feature.** It contains the spec, user stories, data model, screens, business logic, and priority for every module.

## Known Issues / TODOs
- GitHub push may fail due to repo branch protection rules — check repo settings
- Lead sources all mapped as "other" — Notion lead source mapping needs refinement
- Migration 002 + 003 applied to Supabase (pipelines, activities, notifications, invite RLS fix — all live)
- **Default pipelines seeded for The Jar only** — new orgs need seeding logic in onboarding
- Court Reserve sync ported into CourtOps (`/api/sync/courtreserve`) — "Sync Now" button in Settings > Integrations
- Twilio not yet provisioned — messaging UI is built but SMS won't actually send until Twilio creds are added
- A2P 10DLC registration needed before SMS at scale
- Landing page / marketing site not built (P2)
- Reporting / analytics module not built (P1)
- No drag-and-drop on kanban (stage changes via buttons)
- Wildcard SSL for *.courtops.app may take time to propagate
---

## Messaging Module (BUILT — pending Twilio provisioning)

All messaging infrastructure is built. Twilio integration is stubbed — messages are logged in the DB but won't actually send until Twilio credentials are provisioned.

**What's built:**
- `/messaging` — Inbox with thread view, grouped by lead
- `/messaging/settings` — Budget cap, warn threshold, pause toggle, alert phone
- `/api/messaging/send` — Outbound SMS (logs activity, updates lead, tracks spend)
- `/api/messaging/inbound` — Twilio incoming webhook (matches to lead by phone)
- `/api/messaging/status` — Twilio delivery status + cost reconciliation
- `/api/widget/contact` — Public endpoint for website widget (creates lead + logs activity)
- `/public/widget.js` — Embeddable vanilla JS widget for club websites

**Env vars needed (add to Vercel + .env.local when ready):**
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WIDGET_API_SECRET=some-long-secret
```

**Twilio setup per org (manual for now):**
1. Create Twilio sub-account → buy local number
2. Set SMS webhook → `https://courtops.app/api/messaging/inbound`
3. Set status callback → `https://courtops.app/api/messaging/status`
4. Insert `org_messaging_config` row with twilio_phone + subaccount_sid
5. Register A2P 10DLC brand (~$14, 1-2 week approval)