# CourtOps — Product Requirements Document

> **Version:** 1.0
> **Last Updated:** 2026-03-18
> **Authors:** Sami Zoss, Claude (AI)
> **Status:** Draft — Pending Review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technical Architecture](#2-technical-architecture)
3. [Data Model](#3-data-model)
4. [Modules](#4-modules)
   - 4.1 [Auth & Onboarding](#41-auth--onboarding)
   - 4.2 [Dashboard](#42-dashboard)
   - 4.3 [Pipeline (Leads)](#43-pipeline-leads)
   - 4.4 [Checklists](#44-checklists)
   - 4.5 [Tasks](#45-tasks)
   - 4.6 [SOPs](#46-sops)
   - 4.7 [Staff Management](#47-staff-management)
   - 4.8 [Court Reserve Integration](#48-court-reserve-integration)
   - 4.9 [Content Calendar](#49-content-calendar)
   - 4.10 [Reporting & Analytics](#410-reporting--analytics)
   - 4.11 [Settings & Admin](#411-settings--admin)
   - 4.12 [Notifications](#412-notifications)
   - 4.13 [Landing Page & Marketing](#413-landing-page--marketing)
5. [Integration Architecture](#5-integration-architecture)
6. [Phased Rollout](#6-phased-rollout)
7. [Success Metrics](#7-success-metrics)
8. [Appendices](#appendices)
   - A. [LTP Lead SOP (Full Scripts)](#appendix-a-ltp-lead-sop)
   - B. [Membership Lead SOP (Full Scripts)](#appendix-b-membership-lead-sop)
   - C. [Daily Player Upgrade Decision Tree](#appendix-c-daily-player-upgrade-decision-tree)
   - D. [Private Events SOP (Framework)](#appendix-d-private-events-sop)

---

## 1. Executive Summary

### What is CourtOps?

CourtOps is a multi-tenant operations platform purpose-built for court sport clubs (pickleball, tennis, padel). It wraps around Court Reserve — the booking and membership system thousands of clubs already use — and provides the operational tooling that Court Reserve doesn't: lead pipeline management, daily checklists, SOPs, staff scheduling, task tracking, and reporting.

Think of it as the "back of house" for running a court sport club. Court Reserve handles courts and memberships. CourtOps handles everything else.

### Why does this exist?

Court sport clubs (especially pickleball) are booming. New clubs open every week, staffed by people who know pickleball but not necessarily operations. They use Court Reserve for bookings, a Google Sheet for leads, text messages for scheduling, and Post-it notes for checklists. CourtOps replaces all of that with a single platform designed for how clubs actually operate.

### Current State

CourtOps is live at `courtops.app` with The Jar Pickleball Club (Sioux Falls, SD) as the pilot customer. The following is functional:

- **Auth**: Email/password login via Supabase
- **Dashboard**: 4 stat cards (checklists, leads, overdue follow-ups, tasks)
- **Checklists**: 3 templates (opening/midday/closing) with 23 items, daily completion tracking
- **Pipeline**: Kanban board with 426 real leads, lead detail/edit, add lead form
- **Tasks**: Read-only list view (stub — no create/edit UI)
- **SOPs**: 6 seeded procedures, category view (read-only — no editor or detail pages)
- **Staff**: Clock in/out, roster, schedule, time off requests, availability (5-tab module)
- **Multi-tenancy**: Subdomain routing (`thepbjar.courtops.app`), org-scoped RLS on all tables
- **Deployment**: Vercel with wildcard SSL, Supabase (PostgreSQL) on `us-east-1`

### Key Personas

| Persona | Role | Primary Use |
|---------|------|-------------|
| **Geneva** | GM (General Manager) | Daily lead follow-up, task management, staff scheduling, checklist oversight |
| **Front Desk Staff** | Hourly employees | Checklists, clock in/out, SOP reference, lead outreach calls |
| **Travis** | Owner | Reporting, lead conversion metrics, strategic oversight |
| **Sami** | Developer/Admin | Platform development, data integration, CourtReserve sync |
| **Future Club Owner** | SaaS Customer | Self-service onboarding, all features for their own club |

### The Jar's Immediate Needs (P0)

1. Four distinct lead pipelines with cadence enforcement (LTP, Membership, Daily Player Upgrade, Private Events)
2. Activity timeline on leads (replacing simple touch counter)
3. SOP editor and detail pages (staff training meeting imminent)
4. Task create/edit/complete UI
5. Checklist admin editor
6. Court Reserve data syncing directly to CourtOps (not Notion)

---

## 2. Technical Architecture

### 2.1 Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16 (App Router) | TypeScript, React 19, Turbopack |
| Styling | Tailwind CSS v4 | Dark theme, responsive |
| Database | Supabase (PostgreSQL 17) | Row Level Security, Edge Functions |
| Auth | Supabase Auth | Email/password, expandable to OAuth |
| Hosting | Vercel | Auto-deploy from `main`, Preview deploys on PRs |
| Domain | `courtops.app` | Wildcard SSL for `*.courtops.app` |

### 2.2 Multi-Tenant Architecture

Every table has an `org_id` column. Data isolation is enforced at three levels:

1. **Middleware** (`src/lib/supabase/middleware.ts`): Extracts org slug from subdomain, passes via `x-org-slug` header. Redirects unauthenticated users to `/login`.

2. **RLS Policies**: Every table has a Row Level Security policy that resolves the authenticated user's `org_id` from their `profiles` row:
   ```sql
   CREATE POLICY "Users manage org [table]" ON [table]
     FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
   ```
   There is also a helper function `public.get_user_org_id()` used by some policies.

3. **Application Layer**: Server components call `getUserOrg()` which returns `{ userId, orgId, role, fullName }`. Client components use the Supabase client which automatically scopes queries via RLS.

**Subdomain Routing:**
- `thepbjar.courtops.app` → The Jar Pickleball Club
- `anyclubname.courtops.app` → That club's data
- `courtops.app` (no subdomain) → Marketing site / login

### 2.3 Project Structure

```
courtops/
├── docs/
│   └── PRD.md                    # This document
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── auth/callback/route.ts
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx           # Dashboard
│   │   │   ├── layout.tsx         # Sidebar + main area
│   │   │   ├── checklists/
│   │   │   ├── pipeline/
│   │   │   │   ├── page.tsx       # Kanban board
│   │   │   │   ├── new/           # Add lead
│   │   │   │   └── [id]/          # Lead detail
│   │   │   ├── tasks/
│   │   │   ├── sops/
│   │   │   └── staff/
│   │   └── api/
│   │       └── staff/invite/route.ts
│   ├── components/
│   │   ├── sidebar.tsx
│   │   ├── checklist-view.tsx
│   │   ├── pipeline-board.tsx
│   │   ├── lead-detail.tsx
│   │   ├── new-lead-form.tsx
│   │   ├── clock-tab.tsx
│   │   ├── roster-tab.tsx
│   │   ├── schedule-tab.tsx
│   │   ├── time-off-tab.tsx
│   │   └── availability-tab.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts          # Browser client
│   │   │   ├── server.ts          # SSR client
│   │   │   └── middleware.ts      # Auth + org extraction
│   │   ├── org.ts                 # getCurrentOrg()
│   │   └── get-user-org.ts        # getUserOrg()
│   └── types/
│       └── database.ts            # TypeScript interfaces
├── CLAUDE.md
├── package.json
└── next.config.ts
```

### 2.4 Deployment & Infrastructure

- **Vercel Project**: `courtops` under `zoss-collaborations` team
- **Supabase Project**: `facrogjtbtvhuxzaboln` (us-east-1)
- **DNS**: Namecheap → `A @` → `76.76.21.21`, `A *` → `76.76.21.21`, `CNAME www` → `cname.vercel-dns.com`
- **Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ROOT_DOMAIN`
- **Future**: Supabase Edge Functions for CR sync cron, Stripe webhooks

---

## 3. Data Model

### 3.1 Existing Tables

These tables are live in production with data.

#### `orgs`
Organization (club) record. Every other table references this.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | "The Jar Pickleball Club" |
| slug | text UNIQUE | "thepbjar" — used for subdomain routing |
| logo_url | text | nullable |
| timezone | text | default 'America/Chicago' |
| courtreserve_org_id | text | nullable, The Jar's CR org ID |
| created_at | timestamptz | |

#### `profiles`
User profiles, linked 1:1 with Supabase `auth.users`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | FK → auth.users |
| org_id | uuid FK | → orgs |
| full_name | text | |
| email | text | |
| role | text | 'owner' / 'admin' / 'staff' / 'viewer' |
| avatar_url | text | nullable |
| created_at | timestamptz | |

#### `checklist_templates`
Reusable checklist definitions (e.g., "Opening Checklist").

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| name | text | "Opening Checklist" |
| shift | text | 'opening' / 'midday' / 'closing' / 'custom' |
| sort_order | int | |
| is_active | boolean | |
| created_at | timestamptz | |

#### `checklist_items`
Individual items within a template.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| template_id | uuid FK | → checklist_templates |
| org_id | uuid FK | |
| label | text | "Turn on court lights" |
| sort_order | int | |
| created_at | timestamptz | |

#### `checklist_completions`
One record per item per day when checked off.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| item_id | uuid FK | → checklist_items |
| org_id | uuid FK | |
| completed_by | uuid FK | → profiles, nullable |
| completed_date | date | UNIQUE with item_id |
| completed_at | timestamptz | exact timestamp for audit |
| notes | text | nullable |

#### `leads`
Sales leads / pipeline entries. Currently 426 records for The Jar.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| name | text | |
| email | text | nullable |
| phone | text | nullable |
| source | text | 'syndicate-ltp' / 'syndicate-general' / 'walk-in' / 'referral' / 'website' / 'other' |
| campaign | text | nullable, e.g. "2026.01.LTP" |
| status | text | 'new' / 'contacted' / 'follow-up' / 'trial-booked' / 'converted' / 'lost' / 'nurturing' / 'archived' |
| assigned_to | uuid FK | → profiles, nullable |
| next_action_date | date | nullable |
| last_contact_date | date | nullable |
| touch_count | int | **DEPRECATED** — replaced by activities table |
| converted | boolean | |
| conversion_date | date | nullable |
| membership_type | text | nullable, tier they converted to |
| courtreserve_member_id | text | nullable |
| notes | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `sops`
Standard Operating Procedures wiki entries.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| title | text | |
| category | text | 'operations' / 'front-desk' / 'sales' / 'content' / 'emergency' / 'equipment' / 'general' |
| content | text | Markdown body |
| sort_order | int | |
| is_published | boolean | |
| created_by | uuid FK | nullable |
| updated_by | uuid FK | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `tasks`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| title | text | |
| description | text | nullable |
| status | text | 'todo' / 'in_progress' / 'blocked' / 'done' |
| priority | text | 'high' / 'medium' / 'low' |
| task_type | text | 'admin' / 'content' / 'janitorial' / 'sales' / 'events' / 'facility' / 'inventory' / 'other' |
| assigned_to | uuid FK | nullable |
| due_date | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `time_clock`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| user_id | uuid FK | → profiles |
| clock_in | timestamptz | |
| clock_out | timestamptz | nullable |
| total_minutes | int | GENERATED: `EXTRACT(EPOCH FROM (clock_out - clock_in))::int / 60` |
| notes | text | nullable |
| created_at | timestamptz | |

#### `time_off_requests`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| user_id | uuid FK | → profiles |
| start_date | date | |
| end_date | date | |
| reason | text | nullable |
| status | text | 'pending' / 'approved' / 'denied' |
| reviewed_by | uuid FK | nullable |
| reviewed_at | timestamptz | nullable |
| review_notes | text | nullable |
| created_at | timestamptz | |

#### `availability`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| user_id | uuid FK | → profiles |
| day_of_week | int | 0=Sunday through 6=Saturday |
| start_time | time | nullable |
| end_time | time | nullable |
| is_available | boolean | |
| created_at | timestamptz | |
| **UNIQUE** | (user_id, day_of_week) | |

#### `shifts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | |
| user_id | uuid FK | → profiles |
| shift_date | date | |
| start_time | time | |
| end_time | time | |
| role | text | 'front-desk' / 'coaching' / 'management' / 'other' |
| notes | text | nullable |
| created_at | timestamptz | |

### 3.2 New Tables

These tables need to be created via migration.

#### `pipelines`
Defines the types of pipelines an org uses (e.g., LTP, Membership, Upgrade, Events).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | → orgs |
| name | text | "LTP Leads", "New Membership Leads", etc. |
| slug | text | "ltp", "membership", "upgrade", "events" |
| description | text | nullable, what this pipeline is for |
| icon | text | nullable, emoji or icon name |
| sort_order | int | display order |
| is_active | boolean | default true |
| created_at | timestamptz | |
| **UNIQUE** | (org_id, slug) | |

#### `pipeline_stages`
Ordered stages within a pipeline. Each stage can have cadence rules.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| pipeline_id | uuid FK | → pipelines |
| org_id | uuid FK | → orgs |
| name | text | "New", "Day 1 Call", "Day 3 Text", "Booked", etc. |
| slug | text | URL-safe identifier |
| sort_order | int | display order (left to right in kanban) |
| cadence_days | int | nullable — days after entering this stage before it's "overdue" |
| is_terminal | boolean | default false — if true, lead is "done" (converted, lost, etc.) |
| color | text | nullable, hex or tailwind color name |
| created_at | timestamptz | |
| **UNIQUE** | (pipeline_id, slug) | |

#### `activities`
Timeline of everything that happens with a lead. Replaces the integer `touch_count`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | → orgs |
| lead_id | uuid FK | → leads |
| activity_type | text | 'call' / 'text' / 'email' / 'in_person' / 'voicemail' / 'note' / 'status_change' / 'system' |
| direction | text | nullable — 'outbound' / 'inbound' / 'internal' |
| outcome | text | nullable — 'connected' / 'voicemail' / 'no_answer' / 'booked' / 'converted' / 'not_interested' / 'follow_up' |
| performed_by | uuid FK | → profiles, nullable (null for system-generated) |
| notes | text | nullable, free-form notes about the interaction |
| metadata | jsonb | nullable — for system activities (old_status, new_status, pipeline change, etc.) |
| created_at | timestamptz | when the activity occurred |

#### `cadence_rules`
Defines the expected touch schedule for each pipeline stage. Used by the cadence engine to determine overdue leads.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| pipeline_id | uuid FK | → pipelines |
| org_id | uuid FK | → orgs |
| stage_id | uuid FK | → pipeline_stages |
| day_offset | int | days after lead enters the pipeline (not the stage) |
| touch_type | text | 'call' / 'text' / 'email' / 'in_person' |
| script_key | text | nullable — reference to SOP appendix (e.g., "ltp_voicemail_day1") |
| description | text | "Day 1: Intro call + voicemail if no answer" |
| sort_order | int | |
| created_at | timestamptz | |

#### `cr_members`
Cached Court Reserve member data, synced nightly.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | → orgs |
| cr_member_id | text | Court Reserve's `OrganizationMemberId` |
| first_name | text | |
| last_name | text | |
| email | text | nullable |
| phone | text | nullable |
| membership_tier | text | Normalized: 'Daily' / 'Daily +' / 'Star' / 'Star +' / 'Patriot' / 'Patriot +' / 'Freedom' / 'Freedom +' / 'Founders' / 'Founders +' |
| cr_membership_type | text | Raw name from CR (e.g., "Star SFAP") |
| membership_status | text | 'Active' / 'Cancelled' / 'Suspended' / 'Inactive' |
| visit_count_6mo | int | default 0 |
| last_visit_date | date | nullable |
| monthly_spend | numeric(10,2) | nullable, avg over 3 months |
| member_since | date | nullable |
| city | text | nullable |
| state | text | nullable |
| upgrade_candidate | boolean | default false |
| recommended_tier | text | nullable, what they should upgrade to |
| projected_savings | numeric(10,2) | nullable, how much they'd save annually |
| last_synced_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| **UNIQUE** | (org_id, cr_member_id) | |

#### `cr_sync_log`
History of sync runs for monitoring and debugging.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | → orgs |
| started_at | timestamptz | |
| completed_at | timestamptz | nullable |
| members_synced | int | default 0 |
| members_created | int | default 0 |
| members_updated | int | default 0 |
| upgrade_candidates_found | int | default 0 |
| leads_auto_created | int | default 0 |
| error | text | nullable |
| status | text | 'running' / 'completed' / 'failed' |

#### `notifications`
In-app notification queue.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | → orgs |
| user_id | uuid FK | → profiles |
| type | text | 'cadence_overdue' / 'task_assigned' / 'task_due' / 'time_off_response' / 'new_lead' / 'system' |
| title | text | Short notification title |
| body | text | nullable, longer description |
| link | text | nullable, relative URL to navigate to |
| read | boolean | default false |
| read_at | timestamptz | nullable |
| metadata | jsonb | nullable |
| created_at | timestamptz | |

#### `org_invites`
Pending staff invitations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | → orgs |
| email | text | |
| role | text | 'admin' / 'staff' / 'viewer' |
| invited_by | uuid FK | → profiles |
| token | text UNIQUE | URL-safe random token |
| expires_at | timestamptz | 48 hours from creation |
| accepted_at | timestamptz | nullable |
| created_at | timestamptz | |

#### `content_calendar`
Content planning for social media and marketing.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK | → orgs |
| title | text | |
| description | text | nullable |
| platform | text | 'instagram' / 'facebook' / 'tiktok' / 'email' / 'other' |
| content_type | text | 'post' / 'story' / 'reel' / 'email' / 'other' |
| scheduled_date | date | |
| scheduled_time | time | nullable |
| status | text | 'planned' / 'draft' / 'ready' / 'posted' / 'skipped' |
| assigned_to | uuid FK | nullable |
| media_url | text | nullable |
| notes | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `org_settings`
Per-org configuration including billing state.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK UNIQUE | → orgs (1:1) |
| billing_plan | text | 'free' / 'pro' / 'enterprise', default 'free' |
| stripe_customer_id | text | nullable |
| stripe_subscription_id | text | nullable |
| features | jsonb | default '{}', feature flags |
| cr_api_user | text | nullable, encrypted |
| cr_api_pass | text | nullable, encrypted |
| cr_sync_enabled | boolean | default false |
| cr_last_synced_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 3.3 Modified Tables

These changes should be applied via migration to existing tables.

#### `leads` — add pipeline fields

```sql
ALTER TABLE leads ADD COLUMN pipeline_id uuid REFERENCES pipelines ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN current_stage_id uuid REFERENCES pipeline_stages ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN pipeline_type text; -- denormalized: 'ltp' / 'membership' / 'upgrade' / 'events'
ALTER TABLE leads ADD COLUMN cr_visit_count int;
ALTER TABLE leads ADD COLUMN cr_monthly_spend numeric(10,2);
ALTER TABLE leads ADD COLUMN cr_membership_tier text;
```

#### `sops` — add pipeline linking

```sql
ALTER TABLE sops ADD COLUMN pipeline_id uuid REFERENCES pipelines ON DELETE SET NULL;
ALTER TABLE sops ADD COLUMN version int NOT NULL DEFAULT 1;
ALTER TABLE sops ADD COLUMN tags text[];
```

#### `tasks` — add lead linking and recurrence

```sql
ALTER TABLE tasks ADD COLUMN lead_id uuid REFERENCES leads ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN recurring_rule text; -- 'daily' / 'weekly' / 'monthly' / null
ALTER TABLE tasks ADD COLUMN parent_task_id uuid REFERENCES tasks ON DELETE SET NULL;
```

#### `orgs` — add SaaS fields

```sql
ALTER TABLE orgs ADD COLUMN plan text DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise'));
ALTER TABLE orgs ADD COLUMN billing_status text DEFAULT 'active';
ALTER TABLE orgs ADD COLUMN onboarding_completed boolean DEFAULT false;
```

### 3.4 Entity Relationship Overview

```
orgs (1) ──── (*) profiles
  │                │
  │                ├── time_clock
  │                ├── time_off_requests
  │                ├── availability
  │                ├── shifts
  │                └── notifications
  │
  ├── (*) pipelines
  │        └── (*) pipeline_stages
  │                 └── (*) cadence_rules
  │
  ├── (*) leads ──── (*) activities
  │        │
  │        └── (*) tasks (via lead_id)
  │
  ├── (*) checklist_templates
  │        └── (*) checklist_items
  │                 └── (*) checklist_completions
  │
  ├── (*) sops
  ├── (*) tasks
  ├── (*) cr_members
  ├── (*) cr_sync_log
  ├── (*) content_calendar
  ├── (*) org_invites
  └── (1) org_settings
```

---

## 4. Modules

### 4.1 Auth & Onboarding

#### Overview
Authentication (login, password reset, invite flow) and new club onboarding wizard. Currently: Supabase email/password login works. No signup flow, no invite UI, no onboarding wizard.

**Who uses it:** Everyone (auth), Owner (onboarding), Admin (invites)

**Current state:** Login page works. Users are created via SQL. No self-service anything.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| AUTH-1 | As an owner, I can create a new org and get my subdomain (`myclubname.courtops.app`) | P2 |
| AUTH-2 | As an admin, I can invite staff members via email | P0 |
| AUTH-3 | As invited staff, I receive an email, click a link, set my password, and access my org | P0 |
| AUTH-4 | As a returning user, I can reset my password | P1 |
| AUTH-5 | As a new club owner, I go through an onboarding wizard that sets up my org with default pipelines, checklists, and SOPs | P2 |

#### Data Model
- `profiles` — exists, no changes
- `org_invites` — new (see 3.2)
- `orgs` — add `onboarding_completed` (see 3.3)

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/login` | Email/password login (exists, needs error handling polish) | P0 |
| `/forgot-password` | Password reset request form | P1 |
| `/reset-password` | Set new password (from email link) | P1 |
| `/invite/[token]` | Accept invite, set password, land in org | P0 |
| `/signup` | Org creation wizard (name, slug, timezone, admin email) | P2 |

#### Business Logic

- **Slug validation**: Unique, URL-safe (`/^[a-z0-9-]+$/`), min 3 chars, no reserved words (`www`, `api`, `app`, `admin`, `help`, `docs`, `blog`)
- **Invite flow**: Admin enters email + role → system generates token → sends email → staff clicks link → sets password → profile auto-created with org_id and role
- **Invite expiry**: 48 hours. Expired invites can be resent.
- **Onboarding seeding**: On new org creation, seed:
  - 4 default pipelines (LTP, Membership, Upgrade, Events) with stages and cadence rules
  - 3 default checklist templates (opening/midday/closing) with example items
  - Default SOP categories
  - `org_settings` record

#### Integration Points
- Supabase Auth (user creation, password reset emails)
- Supabase Edge Functions (custom invite email template)

#### Multi-Tenant Considerations
- Org creation is the multi-tenant entry point
- Slug must be globally unique across all orgs
- New org gets completely isolated data

#### Priority
- **P0**: Invite flow (The Jar needs to add Geneva, front desk staff)
- **P1**: Password reset
- **P2**: Self-service signup, onboarding wizard

---

### 4.2 Dashboard

#### Overview
Landing page after login. Shows key metrics at a glance so the user knows what to do first today. Currently: 4 stat cards (checklists completed today, new leads this week, overdue follow-ups, open tasks). Server component.

**Who uses it:** Everyone, with role-aware content

**Current state:** Basic but functional. Missing: who's on shift, cadence alerts, activity feed.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| DASH-1 | As Geneva, I see today's priorities: overdue leads, incomplete checklists, who's on shift, upcoming tasks | P0 |
| DASH-2 | As Travis, I see weekly/monthly conversion metrics and lead pipeline health | P1 |
| DASH-3 | As front desk staff, I see my assigned tasks and my checklists for today | P0 |
| DASH-4 | As anyone, I see a recent activity feed across all leads | P1 |

#### Data Model
No new tables. Dashboard aggregates from existing tables.

#### Key Screens

| Widget | Description | Priority |
|--------|-------------|----------|
| Today's Checklists | Progress bar per checklist template (exists) | P0 |
| New Leads | Count of leads created this week (exists) | P0 |
| Overdue Follow-ups | Count of leads past their `next_action_date` (exists) | P0 |
| Open Tasks | Count of tasks with status != 'done' (exists) | P0 |
| **Who's On Shift** | Names/avatars of staff currently clocked in | P0 |
| **Cadence Due Today** | Leads with cadence touches due today, grouped by pipeline | P0 |
| **Lead Conversion Funnel** | Visual funnel for each pipeline type (this week/month) | P1 |
| **Recent Activity Feed** | Last 10-15 activities across all leads | P1 |
| **My Tasks Today** | Tasks assigned to current user, due today or overdue | P0 |

#### Business Logic

- **Role-aware rendering**: Owner/admin see everything. Staff see only their assigned items.
- **Cadence Due Today**: Query leads where `current_stage.cadence_days` has elapsed since last activity. Group by pipeline type.
- **Who's On Shift**: Query `time_clock` for records where `clock_in IS NOT NULL AND clock_out IS NULL`, join with `profiles` for names.
- All queries run server-side in the page component (existing pattern).

#### Priority
- **P0**: Add Who's On Shift, Cadence Due Today, My Tasks Today
- **P1**: Conversion funnel, activity feed

---

### 4.3 Pipeline (Leads)

**This is the most complex and critical module. The March 17 meeting revealed that the single-pipeline approach must be replaced with 4 distinct pipeline types, each with their own stages, cadences, and SOPs.**

#### Overview
Lead management across multiple pipeline types, each with a Kanban board, activity timeline, cadence enforcement, and SOP integration. Currently: single Kanban board with 6 status columns, 426 leads, lead detail/edit page with "Log Touch" (increments a counter). No pipeline types, no activity timeline, no cadence logic.

**Who uses it:** Geneva (primary), Front desk staff (outreach), Travis (reporting), System (auto-creates upgrade candidates)

**Current state:** Functional but needs fundamental rework.

#### The Four Pipeline Types

##### Pipeline 1: LTP Leads (Learn to Play)
- **Source**: Syndicate Facebook ads → leads fill out form → email to front desk
- **Goal**: Book them into a free LTP class → attend → convert to membership
- **Temperature**: Warm (they expressed interest in learning)
- **Cadence**: Day 1 / Day 3 / Day 7
- **Key insight from meeting**: "The front desk's job is to do the hard work for them so all they have to do is sign their waiver and show up"

**Stages:**
| Order | Stage | Cadence | Action |
|-------|-------|---------|--------|
| 1 | New | — | Lead arrives from Syndicate |
| 2 | Day 1 Contact | +1 day | Call → voicemail + text if no answer |
| 3 | Day 3 Follow-up | +3 days | Call (no VM) + short text |
| 4 | Day 7 Final | +7 days | Final call + "break-up" text |
| 5 | Class Booked | — | Registered for LTP class as Daily Player |
| 6 | Attended | — | Showed up for class |
| 7 | Converted | terminal | Signed up for paid membership |
| 8 | Lost | terminal | No response after 3 touches or explicitly declined |

##### Pipeline 2: New Membership Leads
- **Source**: Syndicate Facebook ads → membership interest form
- **Goal**: Get them in the door for a club tour or guest trial → close membership
- **Temperature**: Hot (actively shopping for memberships, may be comparing clubs)
- **Cadence**: Day 1 / Day 2 / Day 5 / Day 10
- **Key insight from meeting**: "Call within the hour if we can. Membership leads are hotter and often price shopping." And: "Don't just give prices. Ask what's your current skill level? Are you looking for more social or competitive?"

**Stages:**
| Order | Stage | Cadence | Action |
|-------|-------|---------|--------|
| 1 | New | — | Lead arrives from Syndicate |
| 2 | Day 1 Call | +1 day | Call. Discovery questions. Goal: book tour/trial |
| 3 | Day 2 Text | +2 days | Value-add text (share league schedule, etc.) |
| 4 | Day 5 Call | +5 days | Second call attempt |
| 5 | Day 10 Final | +10 days | "Break-up" text — move to nurture or lost |
| 6 | Tour Booked | — | Scheduled club tour / guest pass |
| 7 | Tour Completed | — | Visited the club |
| 8 | Trial Active | — | On a guest pass or trial membership |
| 9 | Converted | terminal | Signed up for paid membership |
| 10 | Nurturing | — | Said "not now" — monthly newsletter only |
| 11 | Lost | terminal | Explicitly declined or no response after cadence |

##### Pipeline 3: Daily Player → Member Upgrades
- **Source**: Internal — auto-generated from Court Reserve data when a Daily Player meets upgrade thresholds
- **Goal**: Convert existing Daily Players into paid members by showing them their savings
- **Temperature**: Varies — requires checking visit history and spend before calling
- **Cadence**: More nuanced — depends on the person's history
- **Key insight from meeting**: "Bill's been here 12 times. So Bill knows what he's doing. Bill, you should absolutely 100% be a Freedom member." And: "These are two different pipelines... one you have the ability to gain more information and handle with more nuance."

**Stages:**
| Order | Stage | Cadence | Action |
|-------|-------|---------|--------|
| 1 | Identified | — | Auto-created from CR sync (meets upgrade thresholds) |
| 2 | Research | +1 day | Staff checks CR for visit history, spend, patterns |
| 3 | Outreach | +3 days | Personalized call with savings pitch |
| 4 | Interested | — | Expressed interest, may need time |
| 5 | Trial Offered | — | Offered guest pass for higher-tier benefits |
| 6 | Converted | terminal | Upgraded membership |
| 7 | Not Now | — | Declined for now — revisit in 30 days |
| 8 | Declined | terminal | Explicitly not interested |

**Upgrade Candidate Detection** (runs after each CR sync):
```
IF membership_tier = 'Daily' AND (
  visit_count_6mo >= 5 OR
  monthly_spend >= $50
)
THEN mark as upgrade_candidate = true
```

**Tier Recommendation Logic:**
```
IF visits_per_month >= 8 → recommend Freedom ($99/mo)
ELSE IF visits_per_month >= 4 → recommend Patriot ($79/mo)
ELSE IF visits_per_month >= 2 → recommend Star ($59/mo)
```

**Projected Savings Calculation:**
```
current_annual_cost = visits_per_month × 12 × daily_rate ($15)
recommended_annual_cost = recommended_tier_monthly × 12
projected_savings = current_annual_cost - recommended_annual_cost
```

##### Pipeline 4: Private Events
- **Source**: Website form, walk-in, phone call
- **Goal**: Book and execute private events (birthday parties, corporate events, etc.)
- **Temperature**: Interested but may be price-shopping
- **Cadence**: Simpler — standard follow-up

**Stages:**
| Order | Stage | Cadence | Action |
|-------|-------|---------|--------|
| 1 | Inquiry | — | Initial contact |
| 2 | Quoted | +1 day | Sent pricing/packages |
| 3 | Follow-up | +3 days | Check if they have questions |
| 4 | Booked | — | Deposit paid, date set |
| 5 | Confirmed | — | Final details confirmed |
| 6 | Completed | terminal | Event happened |
| 7 | Lost | terminal | Declined or went elsewhere |

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| PIPE-1 | As Geneva, I can view 4 separate pipeline boards, each with their own stages | P0 |
| PIPE-2 | As staff, I can log an activity (call, text, voicemail, email, in-person visit) with outcome and notes | P0 |
| PIPE-3 | As Geneva, I can see which leads are overdue for their next cadence touch | P0 |
| PIPE-4 | As staff, I can see a lead's full activity timeline (not just a count) | P0 |
| PIPE-5 | As admin, I can move a lead to a different stage by dragging on the kanban | P0 |
| PIPE-6 | As admin, I can add a new lead to any pipeline with source, contact info, and notes | P0 |
| PIPE-7 | As admin, I can reassign a lead to a different staff member | P0 |
| PIPE-8 | As the system, when a lead's cadence touch is overdue, a task is auto-created for the assigned staff member | P1 |
| PIPE-9 | As the system, upgrade candidates are auto-created in the Upgrade pipeline from CR sync data | P1 |
| PIPE-10 | As admin, I can configure pipeline stages and cadence rules in settings | P1 |
| PIPE-11 | As Travis, I can see conversion rates by pipeline type and source | P1 |
| PIPE-12 | As staff, when working a lead, I can see the relevant SOP and script for the current stage | P1 |
| PIPE-13 | As Geneva, I can see a cross-pipeline "Overdue" view of all leads needing attention today | P0 |

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/pipeline` | Pipeline type tabs + Kanban board per type. Default to most active pipeline. | P0 |
| `/pipeline/[id]` | Lead detail: info, activity timeline, stage, assignment, related SOP | P0 |
| `/pipeline/new` | Add lead form with pipeline type selector | P0 |
| `/pipeline/overdue` | Cross-pipeline view: all leads with overdue cadence touches | P0 |
| `/settings/pipelines` | Configure pipeline stages and cadence rules (admin) | P1 |

#### Business Logic

**Cadence Engine:**
The cadence engine determines when a lead's next touch is due and whether it's overdue.

```
last_activity_date = MAX(activities.created_at) WHERE lead_id = lead.id
days_since_last = today - last_activity_date

current_stage = pipeline_stages WHERE id = lead.current_stage_id
next_touch_due = last_activity_date + current_stage.cadence_days

IF next_touch_due < today → lead is OVERDUE
IF next_touch_due = today → lead is DUE TODAY
```

If no activities exist:
```
next_touch_due = lead.created_at + first_stage.cadence_days
```

**Auto-advance Logic:**
When an activity is logged, the system checks if the lead should advance to the next stage:
- If `outcome = 'booked'` → advance to "Booked" stage
- If `outcome = 'converted'` → advance to "Converted" stage, set `lead.converted = true`
- If `outcome = 'not_interested'` → advance to "Lost" stage
- Otherwise: advance to next sequential stage if cadence touch type matches

**Overdue Task Auto-creation** (P1):
A daily cron (or on-demand) checks all leads with overdue cadence touches and creates tasks:
```
Title: "Follow up: [lead name] - [pipeline type]"
Description: "Cadence touch overdue by [X] days. Stage: [current stage]"
Assigned to: lead.assigned_to
Task type: "sales"
Priority: "high" if overdue > 3 days, "medium" otherwise
Due date: today
Lead ID: lead.id
```

#### Integration Points
- **Court Reserve**: CR sync creates leads in Upgrade pipeline (auto), enriches existing leads with visit/spend data
- **SOPs**: Each pipeline type links to relevant SOPs. Pipeline stages can reference `cadence_rules.script_key` which maps to SOP content.
- **Tasks**: Overdue cadence touches auto-create tasks
- **Notifications**: Overdue leads trigger notifications to assigned staff
- **Syndicate (future)**: Webhook receiver to auto-create LTP and Membership leads

#### Multi-Tenant Considerations
- Each org gets their own set of pipelines, stages, and cadence rules
- Default pipeline templates seeded on org creation (customizable after)
- Pipeline slugs unique within org, not globally

#### Priority
- **P0**: 4 pipeline types with stages, activity timeline, overdue detection, cross-pipeline overdue view
- **P1**: Cadence auto-advance, overdue task auto-creation, pipeline config UI, SOP linking, conversion reporting
- **P2**: Syndicate webhook integration, drag-and-drop reorder stages

---

### 4.4 Checklists

#### Overview
Daily operational checklists (opening, midday, closing). Staff check off items as they complete them, with audit trail of who completed what and when. Currently: 3 templates with 23 items, daily completion tracking works perfectly. No admin UI for creating/editing templates.

**Who uses it:** Front desk staff (daily), Geneva (oversight), Admin (template management)

**Current state:** Fully functional for daily use. Missing admin editor and history view.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| CK-1 | As staff, I can see today's checklists and check items off (exists) | Done |
| CK-2 | As staff, I can see who completed each item and when (exists) | Done |
| CK-3 | As admin, I can create new checklist templates | P0 |
| CK-4 | As admin, I can add, edit, reorder, and delete items in a template | P0 |
| CK-5 | As admin, I can deactivate a template without deleting it | P0 |
| CK-6 | As Geneva, I can view a history calendar of past checklist completions | P1 |
| CK-7 | As Geneva, I can see a daily completion report (what was done, by whom, when) | P1 |

#### Data Model
No schema changes needed. Existing tables are well-designed.

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/checklists` | Daily view with toggles (exists, works) | Done |
| `/checklists/admin` | Template editor: list templates, add/edit/reorder items (new) | P0 |
| `/checklists/history` | Calendar view of past completions with daily drill-down (new) | P1 |

#### Business Logic
- One completion per item per day (unique constraint exists)
- Completion records include `completed_by` for audit trail
- Admin UI needs role check: owner/admin only
- Drag-to-reorder updates `sort_order` on items

#### Multi-Tenant Considerations
Already fully scoped by `org_id`. New org creation should seed default templates.

#### Priority
- **P0**: Admin editor (template CRUD, item CRUD, reorder)
- **P1**: History calendar, daily completion report

---

### 4.5 Tasks

#### Overview
General-purpose task management for club operations. Staff can create, assign, and complete tasks. Tasks can optionally be linked to leads (for pipeline-generated follow-ups). Currently: read-only list view showing open tasks. No create/edit/complete functionality.

**Who uses it:** Geneva (creates/assigns), Front desk staff (completes), System (auto-creates from cadence overdue)

**Current state:** Stub — viewing only, no interactivity.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| TASK-1 | As Geneva, I can create a task with title, description, priority, type, assignee, and due date | P0 |
| TASK-2 | As staff, I can see my assigned tasks and mark them complete | P0 |
| TASK-3 | As anyone, I can filter tasks by status, priority, assignee, type | P0 |
| TASK-4 | As Geneva, I can edit a task's details or reassign it | P0 |
| TASK-5 | As the system, overdue cadence touches auto-create tasks assigned to the lead's owner | P1 |
| TASK-6 | As staff, I can view tasks in a Kanban board (todo / in-progress / blocked / done) | P1 |
| TASK-7 | As admin, I can create recurring tasks (daily, weekly) | P2 |

#### Data Model
Add to `tasks` table (see 3.3):
- `lead_id` — optional FK to leads, for pipeline-generated tasks
- `recurring_rule` — nullable, 'daily' / 'weekly' / 'monthly'
- `parent_task_id` — nullable FK for subtasks

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/tasks` | List view with filters (exists, needs interactivity) | P0 |
| `/tasks` | Toggle: list view ↔ kanban view | P1 |
| `/tasks/new` or modal | Create task form | P0 |
| `/tasks/[id]` or modal | Task detail/edit | P0 |

#### Business Logic
- Overdue detection: `due_date < now() AND status != 'done'` (exists in UI concept)
- Completion: sets `completed_at = now()`, `status = 'done'`
- Lead-linked tasks show a link to the lead detail page
- Auto-created tasks (from cadence engine) include `lead_id` and descriptive title

#### Priority
- **P0**: Create, edit, complete, filter tasks
- **P1**: Kanban view, lead-linked tasks
- **P2**: Recurring tasks, subtasks

---

### 4.6 SOPs

#### Overview
Standard Operating Procedures wiki. Staff reference SOPs during their shift for lead follow-up scripts, checklists, emergency procedures, etc. SOPs can be linked to pipeline types so the relevant script appears when working a lead. Currently: 6 seeded procedures, grouped by category, read-only grid view. No detail pages, no editor.

**Who uses it:** Front desk staff (reference during calls), Geneva (writes/updates), Admin (manages), New hires (training)

**Current state:** Read-only stub. Critical gap — staff training meeting is imminent and SOPs need to be finalized and accessible.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| SOP-1 | As staff, I can browse SOPs by category and search by keyword | P0 |
| SOP-2 | As staff, I can read a full SOP with formatted content (markdown) | P0 |
| SOP-3 | As admin, I can create a new SOP with title, category, content (markdown editor) | P0 |
| SOP-4 | As admin, I can edit an existing SOP | P0 |
| SOP-5 | As admin, I can link an SOP to a pipeline type | P1 |
| SOP-6 | As staff, when working a lead, I can see "Related SOPs" for that pipeline type | P1 |
| SOP-7 | As admin, I can unpublish an SOP without deleting it | P0 |
| SOP-8 | As admin, I can track SOP versions (see edit history) | P2 |

#### Data Model
Add to `sops` table (see 3.3):
- `pipeline_id` — optional FK to link SOP to a pipeline type
- `version` — integer, incremented on save
- `tags` — text array for search/filtering

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/sops` | Category grid with search (exists, functional) | P0 |
| `/sops/[id]` | Full SOP detail page with markdown rendering (new) | P0 |
| `/sops/[id]/edit` | SOP editor with markdown preview (new) | P0 |
| `/sops/new` | Create new SOP form (new) | P0 |

#### Business Logic
- Markdown rendering with `react-markdown` or similar
- SOP editor: split pane (markdown source on left, preview on right) or simple textarea with preview toggle
- Category-based filtering on the index page
- Pipeline linking: when viewing a lead detail, show "Related SOPs" section with SOPs linked to that lead's pipeline type
- Version tracking: increment `version` on each save (future: keep history table)

#### Multi-Tenant Considerations
Already scoped by `org_id`. New org creation should seed example SOPs from Appendices A-D.

#### Priority
- **P0**: Detail page, editor, create (needed before staff training meeting)
- **P1**: Pipeline linking, search
- **P2**: Version history, SOP templates marketplace

---

### 4.7 Staff Management

#### Overview
Employee operations: clock in/out, roster, scheduling, time off, availability. Five-tab module. Currently: all 5 tabs are built and functional.

**Who uses it:** All staff (clock in/out, availability, time off requests), Geneva (scheduling, roster, approvals), Travis (payroll review)

**Current state:** Functional. Missing: payroll summary, clock entry corrections, and the staff invite actually creating users properly (relies on undefined RPC).

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| STAFF-1 | As staff, I can clock in and out with optional notes (exists) | Done |
| STAFF-2 | As admin, I can see who is currently clocked in (exists) | Done |
| STAFF-3 | As admin, I can view clock history for any staff member (exists) | Done |
| STAFF-4 | As admin, I can create and assign shifts (exists) | Done |
| STAFF-5 | As staff, I can set my weekly availability (exists) | Done |
| STAFF-6 | As staff, I can request time off (exists) | Done |
| STAFF-7 | As admin, I can approve/deny time off requests (exists) | Done |
| STAFF-8 | As admin, I can add new staff to the roster via invite email | P0 |
| STAFF-9 | As admin, I can view a payroll summary (hours per staff per period) | P1 |
| STAFF-10 | As admin, I can edit/correct clock entries (e.g., forgot to clock out) | P1 |
| STAFF-11 | As admin, I can export time clock data for a pay period | P1 |
| STAFF-12 | As admin, I can create shift templates (e.g., "opening shift" = 8am-2pm) | P2 |

#### Data Model
All staff tables exist. For P1 clock corrections, add:
```sql
ALTER TABLE time_clock ADD COLUMN edited_by uuid REFERENCES profiles;
ALTER TABLE time_clock ADD COLUMN edit_reason text;
```

#### Key Screens
All 5 tabs exist and work. Add:

| Tab/Route | Description | Priority |
|-----------|-------------|----------|
| Payroll Summary | Hours per staff per pay period (biweekly or custom range) | P1 |
| Clock Admin | Edit/correct clock entries with audit trail | P1 |
| Export | CSV download of time clock data | P1 |

#### Business Logic
- **Payroll summary**: Sum `total_minutes` grouped by `user_id` for a date range. Show as hours:minutes.
- **Clock corrections**: Admin can edit `clock_in` / `clock_out`. Original values preserved in audit. `edited_by` tracks who made the correction.
- **Staff invite**: Uses the `org_invites` flow from Auth module (4.1). When invite is accepted, profile is auto-created with the correct `org_id` and `role`.

#### Priority
- **P0**: Fix staff invite (use org_invites flow instead of broken RPC)
- **P1**: Payroll summary, clock corrections, CSV export
- **P2**: Shift templates, auto-scheduling based on availability

---

### 4.8 Court Reserve Integration

#### Overview
Sync Court Reserve member data into CourtOps for lead enrichment, upgrade candidate identification, and member-to-lead matching. Currently: a separate Node.js project (`courtreserve-sync`) syncs 3,265+ members to Notion daily. This needs to be ported to sync directly into CourtOps's Supabase database.

**Who uses it:** System (automated sync), Admin (configuration, manual sync trigger), Geneva (member data when working leads)

**Current state:** Working sync to Notion exists. Needs to be redirected to Supabase.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| CR-1 | As admin, I can enter my Court Reserve API credentials in settings | P0 |
| CR-2 | As the system, member data syncs nightly (tier, visits, spend, status) | P0 |
| CR-3 | As the system, Daily Players meeting upgrade thresholds are flagged as upgrade candidates | P0 |
| CR-4 | As the system, upgrade candidates are auto-created as leads in the Upgrade pipeline | P1 |
| CR-5 | As admin, I can manually trigger a sync | P1 |
| CR-6 | As admin, I can view sync history (when it ran, how many records, any errors) | P1 |
| CR-7 | As admin, I can browse synced CR members and search by name/email | P1 |
| CR-8 | As admin, I can manually link a CR member to a pipeline lead | P1 |
| CR-9 | As the system, when a lead converts, I auto-match to their CR member record by email | P1 |
| CR-10 | As a SaaS customer, I can connect my own Court Reserve account via OAuth | P2 |

#### Data Model
- `cr_members` — new (see 3.2)
- `cr_sync_log` — new (see 3.2)
- `org_settings` — stores CR credentials (encrypted)

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/settings/integrations` | CR credential entry, enable/disable sync | P0 |
| `/settings/integrations/sync-log` | Sync history table | P1 |
| `/members` | Browse synced CR members, search, filter by tier | P1 |
| `/members/[cr_member_id]` | Member detail: visit history, spend, linked leads | P1 |

#### Business Logic

**Sync Process** (ported from `courtreserve-sync/sync.js`):
1. Fetch all members via `/member/get` (paginated, 100/page)
2. Fetch membership types via `/membershiptype/get` (for ID → name mapping)
3. Fetch attendance (last 6 months, monthly chunks) via `/attendancereport/detailed`
4. Fetch transactions (last 3 months, monthly chunks) via `/transactions/list`
5. For each member:
   - Map membership type name → normalized tier using `TIER_MAP`
   - Calculate visit count (6mo) from attendance records
   - Calculate average monthly spend from transactions
   - Determine `upgrade_candidate` flag
   - Calculate `recommended_tier` and `projected_savings`
   - Upsert into `cr_members` table

**Tier Mapping** (from `courtreserve-sync/sync.js`):
```
'Daily Player'        → 'Daily'
'Daily Player +'      → 'Daily +'
'Star Membership'     → 'Star'
'Star + Family'       → 'Star +'
'Star SFAP'           → 'Star'
'Star + SFAP'         → 'Star +'
'Patriot Membership'  → 'Patriot'
'Patriot + Family'    → 'Patriot +'
'Patriot SFAP'        → 'Patriot'
'Patriot + SFAP'      → 'Patriot +'
'Freedom Membership'  → 'Freedom'
'Freedom + Family'    → 'Freedom +'
'Freedom SFAP'        → 'Freedom'
'Freedom + SFAP'      → 'Freedom +'
'Founders Membership' → 'Founders'
'Founders + Family'   → 'Founders +'
'Founders SFAP'       → 'Founders'
'Founders + SFAP'     → 'Founders +'
```
Types that don't map: `90 Day Trial Membership`, `Private Event Membership`, `Leads (Non Members)`, `Staff`

**Rate Limiting**: CR API allows 60 req/min. Existing sync uses 350ms delays between requests.

**Upgrade Candidate Detection** (runs after each sync):
```sql
UPDATE cr_members SET
  upgrade_candidate = (
    membership_tier = 'Daily' AND
    (visit_count_6mo >= 5 OR monthly_spend >= 50)
  ),
  recommended_tier = CASE
    WHEN visit_count_6mo >= 24 THEN 'Freedom'    -- 4+/month avg
    WHEN visit_count_6mo >= 12 THEN 'Patriot'    -- 2+/month avg
    WHEN visit_count_6mo >= 5  THEN 'Star'       -- ~1/month avg
    ELSE NULL
  END,
  projected_savings = CASE
    WHEN visit_count_6mo >= 24 THEN (visit_count_6mo * 15.0 / 6 * 12) - (99 * 12)
    WHEN visit_count_6mo >= 12 THEN (visit_count_6mo * 15.0 / 6 * 12) - (79 * 12)
    WHEN visit_count_6mo >= 5  THEN (visit_count_6mo * 15.0 / 6 * 12) - (59 * 12)
    ELSE 0
  END
WHERE org_id = [org_id];
```

**Auto-Lead Creation** (P1):
After sync, for each `cr_member` where `upgrade_candidate = true`:
- Check if a lead already exists in the Upgrade pipeline with `courtreserve_member_id = cr_member.cr_member_id`
- If not, create one with pre-populated data (name, email, phone, tier, visit count, spend, savings)

**Lead Matching** (P1):
When a lead is marked as converted, attempt to match to a `cr_member` by email. If matched, set `lead.courtreserve_member_id` and enrich with visit/spend data.

#### Integration Points
- **CR API Endpoints**: `/member/get`, `/membershiptype/get`, `/attendancereport/detailed`, `/transactions/list`
- **Future endpoints**: `/reservationreport/listactive` (court utilization), `/eventregistrationreport/listactive` (event tracking)
- **Sync runtime**: Vercel Cron (for Pro plan) or Supabase Edge Function on a schedule
- **Pipeline module**: Auto-creates leads in Upgrade pipeline
- **Lead detail**: Shows CR member data when linked

#### Multi-Tenant Considerations
- Each org stores their own CR credentials in `org_settings`
- Sync runs independently per org
- `cr_members` scoped by `org_id`
- For SaaS: future OAuth flow so clubs don't share raw credentials

#### Priority
- **P0**: Port sync to Supabase (TypeScript client in `src/lib/courtreserve/`), nightly cron, upgrade candidate flagging
- **P1**: Member browse UI, auto-lead creation, sync log, manual sync trigger
- **P2**: OAuth for SaaS customers, additional CR data (reservations, events)

---

### 4.9 Content Calendar

#### Overview
Plan and track social media and marketing content. Simple calendar interface for scheduling posts across platforms. Not yet built.

**Who uses it:** Sami (content planning), Geneva (content assignment), Staff (posting)

**Current state:** Not started. The Jar currently uses ad-hoc planning.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| CC-1 | As Geneva, I can plan content posts by date and platform | P2 |
| CC-2 | As staff, I can see what content is scheduled this week | P2 |
| CC-3 | As admin, I can mark content as posted/skipped | P2 |
| CC-4 | As admin, I can assign content tasks to staff | P2 |

#### Data Model
`content_calendar` — see 3.2

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/content` | Calendar view (month/week) with content cards | P2 |
| `/content/new` | Create content entry | P2 |
| `/content/[id]` | Edit content entry | P2 |

#### Priority
- **P2**: Entire module is future. Not critical for Jar launch.

---

### 4.10 Reporting & Analytics

#### Overview
Business intelligence dashboards for owners and GMs. Conversion funnels, staff performance, member trends. Not yet built beyond 4 dashboard cards.

**Who uses it:** Travis (owner metrics), Geneva (operational reporting)

**Current state:** Not started. Dashboard has basic counts only.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| RPT-1 | As Travis, I can see lead conversion rates by pipeline type and time period | P1 |
| RPT-2 | As Travis, I can see cost-per-conversion by lead source/campaign | P1 |
| RPT-3 | As Geneva, I can see staff performance: tasks completed, leads worked, hours logged | P2 |
| RPT-4 | As admin, I can see CR membership tier distribution and movement trends | P2 |
| RPT-5 | As admin, I can export any report to CSV | P2 |
| RPT-6 | As admin, I can see checklist completion rates by day, shift, and staff member | P2 |

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/reports` | Report index with cards linking to specific reports | P1 |
| `/reports/pipeline` | Conversion funnel per pipeline type, source effectiveness, cadence compliance | P1 |
| `/reports/staff` | Hours logged, tasks completed, leads touched per staff member per period | P2 |
| `/reports/members` | CR member tier distribution, upgrade conversion rate, churn | P2 |
| `/reports/checklists` | Completion rates by day, shift, staff | P2 |

#### Business Logic

- **Conversion rate**: `(leads with status = 'converted') / (total leads)` per pipeline per period
- **Cadence compliance**: `(touches made within cadence window) / (total touches due)` — requires activities + cadence_rules
- **Date range filtering**: This week, this month, last 30 days, last 90 days, custom range
- All reports are read-only aggregation queries — no new writes

#### Priority
- **P1**: Pipeline conversion report (Travis needs this)
- **P2**: Staff performance, member trends, checklist reports, CSV export

---

### 4.11 Settings & Admin

#### Overview
Org-level configuration for name, timezone, team management, integrations, pipeline config, and billing. Currently: no settings UI exists.

**Who uses it:** Owner (everything), Admin (team, pipelines, integrations)

**Current state:** Not started. All configuration done via SQL.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| SET-1 | As owner, I can update org name, logo, and timezone | P0 |
| SET-2 | As admin, I can invite new team members and set their role | P0 |
| SET-3 | As admin, I can change a team member's role or remove them | P1 |
| SET-4 | As admin, I can configure pipeline stages and cadence rules | P1 |
| SET-5 | As admin, I can set up Court Reserve integration | P0 |
| SET-6 | As owner, I can manage billing/subscription (Stripe portal) | P2 |

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `/settings` | Settings index with navigation | P0 |
| `/settings/general` | Org name, slug (read-only), logo upload, timezone | P0 |
| `/settings/team` | Team roster, invite button, role management | P0 |
| `/settings/pipelines` | Pipeline type list, stage editor, cadence rule editor | P1 |
| `/settings/integrations` | Court Reserve setup, future integrations | P0 |
| `/settings/billing` | Stripe customer portal embed | P2 |

#### Priority
- **P0**: General settings, team management (invite flow), CR integration setup
- **P1**: Pipeline configuration UI
- **P2**: Billing/Stripe

---

### 4.12 Notifications

#### Overview
In-app notification system for cadence overdue alerts, task assignments, time off approvals, and new lead alerts. Currently: not built.

**Who uses it:** All users

**Current state:** Not started.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| NOTIF-1 | As staff, I see a notification bell in the sidebar with unread count | P1 |
| NOTIF-2 | As staff, I receive a notification when assigned a task | P1 |
| NOTIF-3 | As staff, I receive a notification when my cadence touch is overdue | P1 |
| NOTIF-4 | As staff, I receive a notification when my time off request is approved/denied | P1 |
| NOTIF-5 | As admin, I receive a notification when a new lead comes in | P1 |
| NOTIF-6 | As staff, I can mark notifications as read | P1 |
| NOTIF-7 | As staff, I receive a daily email digest of unread notifications | P2 |

#### Data Model
`notifications` — see 3.2

#### Key Screens

| Element | Description | Priority |
|---------|-------------|----------|
| Notification bell | In sidebar/header, badge with unread count | P1 |
| `/notifications` | Full notification list with read/unread state | P1 |
| Click action | Clicking a notification navigates to the relevant page | P1 |

#### Business Logic
- Notifications created by:
  - Application logic (task assignment, time off response, new lead)
  - Cron job (cadence overdue check, runs daily)
  - Database triggers (future)
- `link` field contains relative URL (e.g., `/pipeline/abc-123`) for click-to-navigate
- Batch read: "Mark all as read" button

#### Priority
- **P1**: In-app notifications (bell, list, navigation)
- **P2**: Email digest

---

### 4.13 Landing Page & Marketing

#### Overview
Public-facing marketing site at `courtops.app` (root domain, no subdomain). Currently: root domain redirects to login.

**Who uses it:** Prospective customers

**Current state:** Not started. Middleware redirects all unauthenticated traffic to `/login`.

#### User Stories

| ID | Story | Priority |
|----|-------|----------|
| LAND-1 | As a prospective customer, I can learn what CourtOps does | P2 |
| LAND-2 | As a prospective customer, I can see pricing and sign up | P2 |
| LAND-3 | As a prospective customer, I can see a demo or screenshots | P2 |

#### Key Screens

| Route | Description | Priority |
|-------|-------------|----------|
| `courtops.app/` | Hero, features overview, CTA to signup | P2 |
| `courtops.app/pricing` | Pricing tiers (TBD — see note below) | P2 |
| `courtops.app/signup` | Links to org creation wizard | P2 |

#### Technical Notes
- Middleware must differentiate: if no subdomain → render marketing pages (no auth required). If subdomain → render app (auth required).
- Could be a separate route group `(marketing)` with its own layout (no sidebar, public).

#### Pricing Recommendation
Based on competitive analysis of club management SaaS:
- Court Reserve charges $99-299/mo for their platform
- Most club ops tools (Pike13, Mindbody, ClubAutomation) charge $100-400/mo
- CourtOps is positioned as a complement to Court Reserve, not a replacement

Suggested tiers (TBD — needs market validation):
| Tier | Price | Features |
|------|-------|----------|
| **Starter** | Free | 1 pipeline, 3 staff, basic checklists, no CR sync |
| **Pro** | $49/mo | All pipelines, unlimited staff, CR sync, SOPs, reporting |
| **Enterprise** | Custom | Multi-location, API access, priority support, custom integrations |

#### Priority
- **P2**: Entire module is future. Not needed until SaaS launch.

---

## 5. Integration Architecture

### 5.1 Court Reserve API

| Field | Value |
|-------|-------|
| Base URL | `https://api.courtreserve.com/api/v1` |
| Auth | Basic Auth (per-org credentials) |
| Rate Limit | 60 requests/minute |
| Direction | Read-only (CourtOps does not write to CR) |
| Transport | HTTPS GET with query params |

**Endpoints Used:**

| Endpoint | Purpose | Data Returned |
|----------|---------|---------------|
| `/member/get` | All members (paginated) | Name, email, phone, membership type, status, member since |
| `/membershiptype/get` | Membership type definitions | Type ID → name mapping, pricing |
| `/attendancereport/detailed` | Attendance records | Member ID, date/time, event type |
| `/transactions/list` | Financial transactions | Member ID, amount, date, type |
| `/reservationreport/listactive` | Court reservations | (Future: utilization data) |
| `/eventregistrationreport/listactive` | Event registrations | (Future: event pipeline enrichment) |

**Implementation Plan:**
1. Port `courtreserve-sync/courtreserve.js` to TypeScript at `src/lib/courtreserve/client.ts`
2. Port sync logic from `courtreserve-sync/sync.js` to `src/lib/courtreserve/sync.ts`
3. Run sync via Vercel Cron (`vercel.json` → `crons`) or Supabase Edge Function
4. CR credentials stored in `org_settings` (encrypted at rest by Supabase)

### 5.2 Syndicate (Lead Gen)

Syndicate is The Jar's Facebook ad agency. They run campaigns that generate leads.

**Current flow:**
1. Person clicks FB ad → fills out form on Syndicate landing page
2. Syndicate sends lead info to front desk email
3. Front desk manually enters lead into Google Sheet
4. Sami manually imports from Sheet into CourtOps

**Target flow (P1):**
1. Person clicks FB ad → fills out form
2. Syndicate sends lead info to front desk email AND posts to CourtOps webhook
3. Lead auto-created in the correct pipeline (LTP or Membership based on campaign type)
4. Notification sent to Geneva / assigned front desk staff

**Webhook Spec** (future):
```
POST /api/webhooks/syndicate
Headers: X-Webhook-Secret: [shared secret]
Body: {
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "6055551234",
  "campaign_type": "ltp" | "membership",
  "campaign_id": "2026.03.LTP",
  "source": "facebook",
  "timestamp": "2026-03-15T14:30:00Z"
}
```

**Priority:** P1 for specification, P2 for implementation (depends on Syndicate's cooperation)

### 5.3 Stripe (Billing)

For SaaS billing when selling to other clubs.

**Implementation:**
- Stripe Checkout for subscription creation
- Stripe Customer Portal for self-service management
- Webhook at `/api/webhooks/stripe` for lifecycle events (subscription created, updated, cancelled, payment failed)

**Key Events:**
| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create `org_settings` with plan, update `orgs.plan` |
| `customer.subscription.updated` | Update plan if changed |
| `customer.subscription.deleted` | Downgrade to free, restrict features |
| `invoice.payment_failed` | Send notification to owner, grace period |

**Priority:** P2 — not needed until SaaS launch

---

## 6. Phased Rollout

### Phase 0: Foundation (Week 1-2)
**Goal:** Fix the pipeline, make SOPs usable, give Geneva a working daily tool.

| Task | Module | Notes |
|------|--------|-------|
| Create `pipelines`, `pipeline_stages`, `cadence_rules` tables | Pipeline | Migration |
| Create `activities` table | Pipeline | Migration |
| Add `pipeline_id`, `current_stage_id`, `pipeline_type` to leads | Pipeline | Migration |
| Seed 4 pipeline types with stages for The Jar | Pipeline | SQL seed |
| Categorize existing 426 leads into correct pipelines | Pipeline | Migration script |
| Add pipeline type tabs to Kanban board | Pipeline | Frontend |
| Replace touch_count with activity timeline on lead detail | Pipeline | Frontend |
| Add activity logging (call/text/voicemail/email/note) to lead detail | Pipeline | Frontend |
| Build overdue leads view | Pipeline | Frontend |
| Create SOP detail page (`/sops/[id]`) with markdown rendering | SOPs | Frontend |
| Create SOP editor (`/sops/[id]/edit` and `/sops/new`) | SOPs | Frontend |
| Seed LTP and Membership SOPs from Appendices A and B | SOPs | SQL seed |
| Build task create/edit/complete UI | Tasks | Frontend |
| Build checklist admin editor | Checklists | Frontend |
| Fix staff invite flow (use org_invites) | Auth/Staff | Backend + Frontend |
| Create `org_invites` table | Auth | Migration |
| Build settings general page (org name, timezone) | Settings | Frontend |

### Phase 1: Intelligence (Week 3-4)
**Goal:** Cadence engine, Court Reserve sync to Supabase, smarter dashboard.

| Task | Module | Notes |
|------|--------|-------|
| Implement cadence overdue calculation (SQL function or app logic) | Pipeline | Backend |
| Add "Cadence Due Today" widget to dashboard | Dashboard | Frontend |
| Add "Who's On Shift" widget to dashboard | Dashboard | Frontend |
| Auto-create tasks for overdue cadence touches | Pipeline/Tasks | Backend (cron) |
| Port `CourtReserveAPI` class to TypeScript (`src/lib/courtreserve/client.ts`) | CR Integration | Backend |
| Port sync logic to `src/lib/courtreserve/sync.ts` | CR Integration | Backend |
| Create `cr_members` and `cr_sync_log` tables | CR Integration | Migration |
| Set up nightly sync via Vercel Cron | CR Integration | Infra |
| Implement upgrade candidate detection | CR Integration | Backend |
| Auto-create leads in Upgrade pipeline from candidates | CR/Pipeline | Backend |
| Build settings integrations page (CR credentials) | Settings | Frontend |
| Build notifications table and bell component | Notifications | Backend + Frontend |
| Link SOPs to pipeline types | SOPs/Pipeline | Frontend |

### Phase 2: Polish (Week 5-6)
**Goal:** Reporting, payroll, pipeline config, operational refinements.

| Task | Module | Notes |
|------|--------|-------|
| Build pipeline conversion report | Reporting | Frontend |
| Build settings pipeline config UI (stages, cadence rules) | Settings | Frontend |
| Build settings team management (invite, role change, remove) | Settings | Frontend |
| Build payroll summary view | Staff | Frontend |
| Build clock entry corrections | Staff | Frontend + Backend |
| Build member browse page (`/members`) | CR Integration | Frontend |
| Build sync log viewer | CR Integration | Frontend |
| Build task Kanban view | Tasks | Frontend |
| Build checklist history view | Checklists | Frontend |
| Add password reset flow | Auth | Frontend |
| Cadence auto-advance logic | Pipeline | Backend |

### Phase 3: SaaS Readiness (Week 7-10)
**Goal:** Make CourtOps sellable to other clubs.

| Task | Module | Notes |
|------|--------|-------|
| Build self-service signup/onboarding wizard | Auth | Full stack |
| Implement Stripe billing integration | Settings/Billing | Backend |
| Build landing page at `courtops.app` | Landing | Frontend |
| Build pricing page | Landing | Frontend |
| Implement org template seeding on creation | Auth/Onboarding | Backend |
| Build content calendar module | Content Calendar | Full stack |
| Build full reporting suite | Reporting | Frontend |
| Court Reserve OAuth flow | CR Integration | Backend |
| Multi-location support | Settings | Backend |
| Staff performance reports | Reporting | Frontend |
| Email digest notifications | Notifications | Backend |

---

## 7. Success Metrics

### The Jar Launch (Phase 0-1 Complete)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Geneva uses CourtOps daily | 5+ logins/week | Supabase Auth logs |
| Zero overdue leads unnoticed | 100% cadence compliance | Overdue leads = 0 at end of day |
| All 4 pipeline types active | 4 pipelines with leads | DB query |
| Staff complete checklists in CourtOps | 90%+ daily completion | Checklist completions table |
| SOPs accessible for staff training | All 4 SOPs published | SOP count |
| CR data flowing to CourtOps | Nightly sync succeeding | cr_sync_log |
| Lead conversion rate visible | Report functional | Pipeline conversion report |

### SaaS Metrics (Phase 3 Complete)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Time to onboard new club | < 15 minutes | From signup to first lead created |
| Second paying customer | Within 60 days of launch | Stripe |
| Monthly recurring revenue | $200+ (4 Pro customers) | Stripe dashboard |
| Uptime | 99.5% | Vercel/Supabase monitoring |
| Page load performance | < 2s for all pages | Vercel Analytics |

---

## Appendices

### Appendix A: LTP Lead SOP

**Title:** LTP (Learn to Play) Lead Follow-Up Process
**Pipeline Type:** LTP Leads
**Goal:** Convert a curious lead into a registered student for a free Learn to Play (LTP) class.

#### Overview

LTP leads come from Syndicate Facebook ads. These are people who have expressed interest in learning pickleball. They are warm leads — they want to try it, they just need someone to make it easy. The front desk's job is to **do the hard work for them** so all they have to do is sign their waiver and show up.

#### Day 1: Initial Contact (Within 2 hours of lead receipt)

**Action:** Call the lead.

##### If Answered — Call Script:

> "Hi [NAME], this is [YOUR NAME] at the Jar Pickleball Club.
>
> I am calling to follow up about your interest in our free Learn to Play Pickleball classes. We typically offer these classes on **Mondays at 6-7pm, Thursdays from 10-11am, and Saturdays from 10-11am**.
>
> If any of these times work for you, I would be happy to help you get signed up and registered for class on my end!"

**Internal process if they want to take class:**
1. Add them as a **Daily Player** in Court Reserve with name + email from the lead
2. Register them for their desired class so all they have to do is sign the waiver and show up
3. Walk them through this process
4. Make sure to explain where the club is located and that paddles are available to use
5. Close with: *"We cannot wait to see you!"* or *"We are looking forward to seeing you on the court!"*

##### If Not Answered — Voicemail Script:

> "Hi [NAME], this is [YOUR NAME] at the Jar Pickleball Club calling to follow up on your interest in our free Learn to Play Pickleball classes.
>
> We typically offer these classes on **Monday evenings from 6-7pm, Thursday mornings from 10-11am, and Saturday mornings from 10-11am**.
>
> If any of these times work for you please give us a call or send us a message at **605-501-9793** and we will get you signed up and registered for class on our end so all you have to do is sign your waiver and show up.
>
> We look forward to hearing back from you and welcoming you to the Jar!"

**Immediately after voicemail — send text:**

> "Hi [NAME]! This is [YOUR NAME] at the Jar Pickleball Club! Just following up on your interest in trying out pickleball with our free LTP (Learn to Play) class!
>
> We'd love to get you signed up. We typically offer these classes on:
> - Mondays 6-7pm
> - Thursdays 10-11am
> - Saturdays 10-11am
>
> Please message us back here or you can give us a call — our job is to do the hard work for you so all you need to do is sign your waiver and show up! Let us know if you have any questions and we look forward to 'dinking' with you!"

**Log in CourtOps:** Activity type: `call`, Direction: `outbound`, Outcome: `connected` or `voicemail` or `no_answer`, Notes: what was discussed or "left VM + sent text"

#### Day 3: Follow-Up (If no response)

**Action:** Call once (no voicemail). Then send text:

> "Hi [NAME], still want to try pickleball? We have a few spots left for [NEXT CLASS DAY]! – [YOUR NAME] @ The Jar"

**Log in CourtOps:** Activity type: `call` + `text`, Outcome: `no_answer` or `connected`

#### Day 7: Final Attempt (If no response)

**Action:** Call one last time. If no answer, send final text:

> "Hey [NAME], I know things get busy! If you'd still like to try our free LTP class, just shoot us a text whenever you're ready and we'll get you set up. No pressure — we'll be here when you are! 🏓"

**Log in CourtOps:** Activity type: `call` + `text`, Outcome: `no_answer` or `connected`. If still no response, move lead to **Lost** stage.

#### When They Confirm a Day/Time — Text:

> "Awesome! I will add you into our system as a Daily Player (free and no commitment!) and sign you up for class. Once I register you, you will be sent a welcome email with a link to set your password and sign a waiver. That is all you need to do before class. We have paddles here if you need to use one of those. Other than that all you need is tennis shoes and yourself :) Do you have any questions for me?"

**Then in Court Reserve:** Add as Daily Player → Register for class.

**Move lead to:** Class Booked stage.

---

### Appendix B: Membership Lead SOP

**Title:** Membership Lead Follow-Up Process
**Pipeline Type:** New Membership Leads
**Goal:** Move a lead from a general inquiry to a physical club visit (tour/trial) to close the membership sale.

#### Overview

Membership leads come from Syndicate Facebook ads targeting people interested in joining a pickleball club. These leads are **hotter than LTP** — they're often price-shopping and comparing clubs. Speed matters. The goal on the first call is NOT to sell the membership over the phone — it's to **book a club tour or guest trial** to get them in the building.

**Key principle from meeting:** "Don't just give prices. Ask what's your current skill level? Are you looking for more social or competitive leagues?"

**Key principle about urgency:** "The earlier the better. Membership leads are hotter and often price shopping. Call within the hour if we can."

#### Day 1: Initial Contact (Within 1 hour if possible)

**Action:** Call the lead immediately.

##### If Answered — Call Flow:

1. Introduce yourself: *"Hi [NAME], this is [YOUR NAME] at the Jar Pickleball Club. I saw you were interested in learning more about memberships!"*

2. **Ask discovery questions (don't jump to prices):**
   - "What's your current skill level? Have you played before?"
   - "Are you looking for more social play or competitive leagues?"
   - "How often do you think you'd want to play?"

3. **Based on their answers, recommend a path:**
   - If never played: *"The best way to start would be to come to one of our free Learn to Play classes, and then we can talk about which membership makes the most sense after you've tried it."*
   - If experienced: *"I'd love to get you in for a tour of the club — we can show you the courts, talk through our league options, and figure out the best membership fit for you."*

4. **The goal is to book a visit:**
   - Tour of the club
   - Guest trial pass
   - LTP class (if beginner)

5. Close with: *"We'd love to have you at the Jar. What day works best for you to come check us out?"*

##### If Not Answered — Voicemail:

> "Hi [NAME], this is [YOUR NAME] at the Jar Pickleball Club. I saw you were looking into membership options! I'd love to chat about what you're looking for — whether it's competitive league play or just getting some social games in. Give us a call or text back at **605-501-9793**. We'd love to show you around the Jar!"

**Immediately send text:**

> "Hi [NAME]! This is [YOUR NAME] from the Jar! Just following up on your interest in joining the club. We have some great member-only perks right now (like our league nights and early court access).
>
> Would you like to stop by this week for a quick tour or to hop in on a trial game? Let me know what works for you!"

**Log in CourtOps:** Activity type: `call`, Outcome: `connected`/`voicemail`/`no_answer`

#### Day 2: Value-Add Text (If no response)

> "Hi [NAME]! Just wanted to share our member league schedule so you can see when we play. Let me know if you want to stop by and see the courts! – [YOUR NAME] @ The Jar"

**Log in CourtOps:** Activity type: `text`, Direction: `outbound`

#### Day 5: Second Call (If no response)

**Action:** Call again. If answered, use Day 1 call flow. If not answered, leave a shorter voicemail:

> "Hey [NAME], just [YOUR NAME] from the Jar again. No pressure — just wanted to make sure you got my earlier messages about checking out the club. Text or call anytime at 605-501-9793."

**Log in CourtOps:** Activity type: `call`, Outcome: `connected`/`voicemail`/`no_answer`

#### Day 10: Final "Break-Up" Text (If no response)

> "Hey [NAME], I'll move you to our monthly newsletter list for now so you can stay in the loop on club events. Reach out whenever you're ready to play — we'd love to have you! 🏓"

**Why this works (from meeting):** "It makes them feel like they're disappointing somebody. It's sneaky because it's sales, but it's a version of 'hey, we're not going to keep bothering you' and it makes some people get off the pot."

**Log in CourtOps:** Activity type: `text`, Direction: `outbound`. Move to **Nurturing** (if they responded at any point) or **Lost** (if zero response).

#### If Hesitant at Any Point

Offer an **LTP class** or **guest pass** as a lower-commitment entry:

> "Would you want to come check it out first? We have free Learn to Play classes, or I can set you up with a guest pass so you can try it out before committing to anything."

#### When Tour is Booked

- Note it as scheduled in CourtOps with the date
- **Important from meeting:** Schedule tours when someone can actually give the tour. Don't book during the busiest time if there's no one to leave the front desk.
- Geneva's role is preferred for tours, but any staff can do it — just make sure the lead doesn't feel rushed
- Move lead to **Tour Booked** stage

#### Post-Tour / Post-Trial

Follow up within 24 hours:

> "Great meeting you today, [NAME]! Let me know if you have any questions about the membership options we talked about. Happy to text you over the details to review on your own."

---

### Appendix C: Daily Player Upgrade Decision Tree

**Title:** Daily Player → Member Upgrade Process
**Pipeline Type:** Daily Player → Member Upgrades
**Goal:** Convert existing Daily Players who would save money (and get more value) from a paid membership.

#### Overview

This pipeline is fundamentally different from LTP and Membership leads. These are people who **already come to the club**. You have their visit history, spending data, and can see exactly how much they'd save. The pitch is data-driven and personal.

**Key insight from meeting:** "Rather than picking up the phone and calling these people right away, get into Court Reserve, pull their name in, look at history. Oh, God. Bill's been here 12 times, right? So Bill knows what he's doing. Bill, you should absolutely 100% be a Freedom member."

#### Identification (Automated)

Upgrade candidates are auto-created by the CR sync when a Daily Player meets these thresholds:

| Criteria | Threshold | Rationale |
|----------|-----------|-----------|
| Visits in last 6 months | >= 5 | They're engaged enough to benefit from a membership |
| Monthly spend (avg 3mo) | >= $50 | They're already spending membership-level money |

#### Tier Recommendation Matrix

| Visits/Month (avg) | Recommended Tier | Monthly Cost | Projected Annual Savings* |
|---------------------|-----------------|--------------|--------------------------|
| 8+ visits/month | Freedom ($99/mo) | $99 | $1,188 → $99×12 = saves $340+ |
| 4-7 visits/month | Patriot ($79/mo) | $79 | $720-1,260 → saves $72-312 |
| 2-3 visits/month | Star ($59/mo) | $59 | $360-540 → saves up to $180 |

*Based on $15/day daily player rate

#### Step 1: Research (Before Calling)

**This is the critical difference from other pipelines.** Before calling, the staff member MUST:

1. Open the lead in CourtOps → see their CR data (visit count, spend, tier recommendation, projected savings)
2. Note any patterns: Do they play certain days? Do they come to events? Are they in leagues?
3. Understand their story: Long-time daily player? Just started? Family plays too?

#### Step 2: Personalized Outreach

**The call is personalized based on their data. This is NOT a cold call.**

##### If High-Volume Player (8+ visits/month):

> "Hey [NAME], this is [YOUR NAME] from the Jar! I was looking at your account and noticed you've been in [X] times in the last few months — that's awesome! I wanted to let you know that at your current pace, you're spending about $[X]/month as a daily player. If you switched to our Freedom membership at $99/month, you'd actually save about $[SAVINGS] a year and get unlimited access to leagues, events, and priority court booking. Would you be interested in chatting about it?"

##### If Moderate Player (4-7 visits/month):

> "Hey [NAME], this is [YOUR NAME] from the Jar! I noticed you've been coming in pretty regularly — about [X] times a month. I wanted to mention that our Patriot membership might actually save you money compared to paying daily. It's $79/month and includes [key benefits]. Want me to break down the numbers for you?"

##### If Lower-Volume but Consistent (2-3 visits/month):

> "Hey [NAME], it's [YOUR NAME] from the Jar! Thanks for being a regular — we love seeing you out there. I wanted to let you know about our Star membership. At $59/month, it might make sense if you're planning to keep playing a couple times a month. Plus you'd get access to member leagues and events. Want to hear more?"

#### Step 3: The Math Email/Text (After Call)

**The personalized savings email** (from meeting: "A literal message to them. Geneva, you've come this many times. If you keep up that pace, here's how much you're gonna spend as a daily player versus how much you would spend as a whatever member."):

> "Hey [NAME]! Here's the quick breakdown I mentioned:
>
> **Your current pace:** [X] visits/month × $15/day = **$[MONTHLY]** per month ($[ANNUAL]/year)
>
> **As a [RECOMMENDED TIER] member:** **$[TIER_PRICE]/month** ($[TIER_ANNUAL]/year)
>
> **You'd save: $[SAVINGS]/year** — plus you'd get [2-3 key benefits of that tier].
>
> No pressure at all — just wanted you to have the numbers! Let me know if you have any questions. 🏓"

#### Step 4: Follow-Up

| Day | Action |
|-----|--------|
| Day 1 | Research + call |
| Day 3-5 | If interested but undecided: send the math email/text |
| Day 14 | If no response: gentle check-in |
| Day 30 | Move to "Not Now" — revisit after next CR sync if still qualifying |

#### Important Notes

- **This is a nuanced pipeline** — there's no one-size-fits-all script
- Staff should use common sense: "These people have to use some form of common sense and understand what the value is of the different memberships"
- Family considerations: If they have family who also play, mention the "+" tiers
- Don't be pushy: These people already come to your club. The goal is to help them save money, not pressure them.

---

### Appendix D: Private Events SOP

**Title:** Private Events Lead Follow-Up Process
**Pipeline Type:** Private Events
**Goal:** Book and execute private events at the club.

#### Overview

Private event inquiries come from the website, walk-ins, or phone calls. These can be birthday parties, corporate team-building, school groups, etc. The process is simpler than other pipelines but requires attention to logistics.

> **Note:** This SOP is a framework. Detailed scripts and logistics will be developed as the events business grows.

#### Stages

| Stage | Action |
|-------|--------|
| **Inquiry** | Record contact info, event type, preferred date, group size, budget |
| **Quoted** | Send pricing package within 24 hours. Include: court rental, equipment, coaching options, food/drink partnerships |
| **Follow-up** | Check in 3 days after quote. Answer questions. |
| **Booked** | Collect deposit. Confirm date, time, court allocation, staffing needs. |
| **Confirmed** | 1 week before: confirm final headcount, special requests, staff assignments |
| **Completed** | Event happened. Follow up for feedback. Upsell membership/LTP for attendees. |
| **Lost** | Declined or went elsewhere. Note reason for future reference. |

#### Key Information to Capture

- Contact name, email, phone
- Event type (birthday, corporate, school, social, other)
- Preferred date(s) and time window
- Expected group size
- Budget (if mentioned)
- Special requests (food, coaching, tournament format)

#### Follow-Up Cadence

| Day | Action |
|-----|--------|
| Day 0 | Acknowledge inquiry, ask qualifying questions |
| Day 1 | Send quote/package |
| Day 3 | Follow up on quote |
| Day 7 | Final check — move to Lost if no response |

#### Post-Event

- Send thank you message
- Ask for review/testimonial
- Share event photos (with permission)
- Offer attendees a guest pass or LTP class signup

---

*End of CourtOps PRD v1.0*
