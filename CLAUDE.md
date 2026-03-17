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
│   ├── (auth)/              # Login, auth callback (no sidebar)
│   │   ├── login/
│   │   └── auth/callback/
│   ├── (dashboard)/         # All authenticated pages (with sidebar)
│   │   ├── page.tsx         # Dashboard with stats
│   │   ├── checklists/      # Daily checklists (opening/mid/closing)
│   │   ├── pipeline/        # Lead pipeline kanban + detail/edit
│   │   │   ├── [id]/        # Lead detail page
│   │   │   └── new/         # Add lead form
│   │   ├── tasks/           # Task list
│   │   └── sops/            # SOPs wiki
│   ├── layout.tsx           # Root layout (Inter font, dark theme)
│   └── globals.css
├── components/
│   └── sidebar.tsx          # Responsive sidebar (hamburger on mobile)
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser Supabase client
│   │   ├── server.ts        # Server component Supabase client
│   │   └── middleware.ts    # Auth session + subdomain routing
│   ├── org.ts               # getCurrentOrg() - resolve org from subdomain
│   └── get-user-org.ts      # getUserOrg() - get user's org_id, role, name
├── types/
│   └── database.ts          # TypeScript types for all tables
├── middleware.ts             # Next.js middleware entry point
scripts/
└── import-leads.js          # One-time Notion → Supabase lead import
supabase/
└── migrations/
    └── 001_initial_schema.sql  # Full DB schema (tables, RLS, indexes)
```

## Database Schema (Supabase)
All tables have `org_id` for multi-tenancy. RLS uses `public.get_user_org_id()` function.

| Table | Purpose |
|-------|---------|
| `orgs` | Organizations (each club). Has slug for subdomain routing. |
| `profiles` | User profiles linked to auth.users. Has role (owner/admin/staff/viewer). |
| `checklist_templates` | Reusable checklist definitions (opening/midday/closing/custom). |
| `checklist_items` | Individual items within a template. |
| `checklist_completions` | Daily completion records (unique per item per day). |
| `leads` | Sales pipeline. Status flow: new → contacted → follow-up → trial-booked → converted/lost. |
| `sops` | Standard operating procedures (markdown content, categorized). |
| `tasks` | Task tracker with status, priority, type, assignment. |

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

## Known Issues / TODOs
- GitHub push fails due to repo branch protection rules — check repo settings
- Lead sources all mapped as "other" — Notion lead source mapping needs refinement
- No SOP editor UI yet (content seeded via SQL)
- No task creation UI yet
- No staff management UI (users created via SQL)
- Court Reserve sync not yet feeding Supabase (still feeds Notion)
- Wildcard SSL for *.courtops.app may take time to propagate
