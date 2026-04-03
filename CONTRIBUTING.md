# Contributing to CourtOps

Welcome! This guide covers everything you need to get set up and start contributing.

## Local Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/samizoss/courtops.git
   cd courtops
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```
   Ask Sami for the actual values. Never commit `.env.local`.

4. **Run the dev server**
   ```bash
   npm run dev
   ```
   Opens on `localhost:3000`. Note: subdomain routing (`thepbjar.courtops.app`) only works in production — locally everything runs on the root domain.

5. **Verify it works**
   - Go to `http://localhost:3000/login`
   - Log in with your credentials
   - You should see the dashboard

## Project Architecture

See [CLAUDE.md](CLAUDE.md) for the full reference — it covers the tech stack, project structure, database schema, and all key patterns.

**The patterns that will trip you up if you skip them:**

- **Client components + Supabase:** Never import `createClient` at the top of a client component. Always use `const { createClient } = await import('@/lib/supabase/client')` inside event handlers. This prevents build failures during static generation.
- **Server components + org_id:** Use `getUserOrg()` to get the current user's org_id. Pass it as a prop to client components that need to write data.
- **Every table has `org_id`:** All queries should filter by org_id. RLS policies enforce this at the DB level, but your queries should too.
- **`export const dynamic = 'force-dynamic'`** on every server page — we don't static-generate anything.

## PR Workflow

1. **Create a branch from master**
   ```bash
   git checkout master
   git pull origin master
   git checkout -b feature/my-thing
   ```

2. **Do your work, commit with clear messages**
   ```bash
   git add src/app/(dashboard)/staff/tabs/clock-tab.tsx
   git commit -m "Add export button to hours summary"
   ```

3. **Push and open a PR**
   ```bash
   git push -u origin feature/my-thing
   ```
   Then open a PR on GitHub. The PR template will pre-fill — fill in each section:
   - **What does this do?** — brief summary
   - **Why?** — what problem it solves, link to issue if applicable
   - **Issues hit / gotchas** — anything unexpected, workarounds, decisions
   - **How to test** — steps to verify
   - **Screenshots** — for UI changes

4. **CI runs automatically** — lint, typecheck, and build must pass (green check)

5. **CODEOWNERS may flag Sami** — if your PR touches core files (migrations, middleware, auth), Sami is auto-requested as reviewer. This isn't a blocker — you can merge when CI is green — but give him a heads-up if it's something sensitive.

6. **Merge when ready** — CI green, PR filled in, you're confident it works.

## What's "Core" (Handle With Care)

These files have CODEOWNERS rules that auto-flag Sami for review. You can edit them — just know they're sensitive:

| Path | Why it matters |
|------|---------------|
| `supabase/migrations/` | Changes here alter the live database for The Jar. A bad migration can break the app for all users. |
| `src/middleware.ts` | Auth and subdomain routing. A bug here locks everyone out or routes them to the wrong org. |
| `src/lib/supabase/` | Supabase client initialization. Wrong config = the app can't talk to the database. |
| `src/lib/org.ts` | Resolves which org the user belongs to from the subdomain. |
| `src/lib/get-user-org.ts` | Gets the current user's org_id and role. A bug here could leak data between orgs. |
| `.github/` | CI, CODEOWNERS, PR template. Changes affect the dev workflow for everyone. |

## Protecting Your Own Work

If you build something a specific way for a specific reason and want a flag when someone else changes it, **add yourself to `.github/CODEOWNERS`**:

```
# Payment flow — uses idempotency keys to prevent double-charges
src/lib/payments/                        @your-github-username
```

Include a comment explaining *why* so the reviewer has context. Since `.github/` is owned by Sami, your CODEOWNERS change will flag him — so you're both aware of what's protected and why.

## Database Migrations

- **Never modify an existing migration file** — always create a new one
- **Naming:** `NNN_description.sql` (next number in sequence, currently at 003)
- **Coordinate with Sami** before applying migrations to prod Supabase
- **Current migrations:**
  - `001_initial_schema.sql` — core tables (orgs, profiles, leads, tasks, sops, checklists)
  - `002_pipeline_rework.sql` — pipelines, stages, activities, notifications, invites, messaging, content
  - `003_invite_rls_fix.sql` — RLS policy fix for invite acceptance

## Environment Variables

- **Never commit `.env.local`** — it's in `.gitignore`
- If you need a new env var, add it to `.env.local.example` with a placeholder value
- `NEXT_PUBLIC_*` vars are exposed to the browser — they're not secrets
- Actual secrets (Twilio, etc.) go in Vercel environment settings only

## Commands

```bash
npm run dev          # Local dev server (localhost:3000)
npm run build        # Production build (same as CI)
npm run lint         # ESLint
npx tsc --noEmit     # Typecheck without building
```

## Questions?

Ping Sami. The CLAUDE.md file has extensive documentation on every module, the database schema, and known issues.
