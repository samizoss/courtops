# Developer Collaboration Setup — Design Spec

**Date:** 2026-04-02
**Goal:** Enable a second developer (Colorado-based) to contribute to CourtOps safely, with full prod access but visibility guardrails on core files.

---

## Context

CourtOps is currently a single-developer project. Sami builds locally, deploys to Vercel prod, and manages Supabase directly. A second developer is joining — NDA in progress, GitHub username TBD. The goal is to get the infrastructure ready so that when he signs, adding him is a one-liner.

**Decisions made:**
- Full prod access (same Supabase creds, same Vercel project)
- Feature branches + PRs, no required reviews (option B — can tighten to C later)
- CODEOWNERS for visibility on core files (auto-requests Sami's review, doesn't block merge)
- PR template to capture what/why/issues/testing on every PR

---

## 1. Branch Protection on `master`

Configure GitHub branch protection rules for `master`:

- **Require pull requests** — no direct pushes to master
- **Required status checks** — CI (lint + typecheck) must pass before merge
- **Do NOT require approvals** — either developer can merge their own PR
- **Do NOT require linear history** — merge commits are fine
- **Allow force push: nobody** — protect commit history

This means: all code goes through a PR, CI must be green, but nobody is blocked waiting for a review.

---

## 2. GitHub Actions CI

A single workflow (`.github/workflows/ci.yml`) that runs on every PR to `master`:

**Jobs:**
1. **Lint** — `npm run lint`
2. **Typecheck** — `npx tsc --noEmit`
3. **Build** — `npm run build`

**Environment:**
- Node 20
- Needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as GitHub Actions secrets (these are the public/anon values — safe for CI, needed for the build to compile)

**Why build in CI:** The typecheck alone won't catch issues with dynamic imports or Next.js-specific compilation. The build is the real test. Lint catches style issues.

**Why NOT tests:** There's no test suite yet. Adding a test framework is a separate effort — don't block collaboration on it.

---

## 3. CODEOWNERS

A `.github/CODEOWNERS` file that auto-requests Sami's review when a PR touches core files:

```
# Database migrations — schema changes affect everything
supabase/migrations/                    @samizoss

# Auth + multi-tenancy middleware
src/middleware.ts                        @samizoss
src/lib/supabase/                        @samizoss
src/lib/org.ts                           @samizoss
src/lib/get-user-org.ts                  @samizoss

# Infrastructure config
.env*                                    @samizoss
vercel.json                              @samizoss
.github/                                 @samizoss
```

**Behavior:** When the dev opens a PR that touches any of these paths, GitHub automatically adds Sami as a reviewer. The dev sees "Sami was requested for review" — a signal to double-check. But since reviews aren't required, he can still merge if Sami's unavailable.

---

## 4. PR Template

A `.github/pull_request_template.md` that pre-fills every new PR:

```markdown
## What does this do?
<!-- Brief summary of the change -->

## Why?
<!-- What problem does this solve? Link to issue/audit item if applicable -->

## Issues hit / gotchas
<!-- Anything unexpected you ran into. Workarounds, things to watch out for -->

## How to test
<!-- Steps for the reviewer to verify this works -->

## Screenshots
<!-- If this is a UI change, paste before/after screenshots -->
```

This becomes the default PR description. The developer fills it in — can't miss it because it's already there when they open the PR.

---

## 5. CONTRIBUTING.md

A setup and conventions guide for new developers. Covers:

### Local Setup
1. Clone the repo
2. `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in values (Sami provides these)
4. `npm run dev` — runs on localhost:3000
5. Access via `localhost:3000` (subdomain routing only works in production)

### Project Architecture (brief)
- Point to CLAUDE.md for the full reference
- Highlight the key patterns: multi-tenancy via org_id, lazy Supabase imports in client components, server components use `getUserOrg()`

### PR Workflow
1. Create a feature branch from `master` (`git checkout -b feature/my-thing`)
2. Make changes, commit with clear messages
3. Push and open a PR — fill in the template
4. CI runs automatically (lint, typecheck, build)
5. If CODEOWNERS flags Sami, give him a heads-up but don't wait if it's urgent
6. Merge when CI is green

### What's "Core" (Handle With Care)
List the CODEOWNERS paths and explain why each one matters:
- `supabase/migrations/` — changes here affect the live database for The Jar
- `src/middleware.ts` — auth and subdomain routing; a bug here locks everyone out
- `src/lib/supabase/` — client initialization; wrong config = app can't talk to DB
- `src/lib/org.ts`, `src/lib/get-user-org.ts` — multi-tenancy; a bug here leaks data between orgs

### Database Migrations
- Never modify an existing migration file — always create a new one
- Name format: `NNN_description.sql` (next number in sequence)
- Test locally if possible, coordinate with Sami before applying to prod Supabase
- Current migrations: 001 (initial schema), 002 (pipelines rework), 003 (invite RLS fix)

### Environment Variables
- Never commit `.env.local`
- If a new env var is needed, add it to `.env.local.example` with a placeholder
- Public vars (`NEXT_PUBLIC_*`) are safe in CI — they're exposed to the browser anyway
- Secret vars (Twilio, etc.) go in Vercel env settings only

---

## 6. Add Collaborator (One-Liner)

When the dev signs the NDA and provides his GitHub username:

```bash
gh repo collaborator add <USERNAME> --repo samizoss/courtops --permission push
```

Then share:
- The `.env.local` values (via secure channel — not GitHub, not Slack)
- Link to CONTRIBUTING.md
- Vercel team invite (if he needs deploy access beyond PR previews)

---

## What This Does NOT Cover (Intentionally Deferred)

- **Staging/sandbox Supabase** — dev gets prod access for now. Revisit if data issues arise.
- **Dev role in the app** — dev logs in as owner/admin for now. A dedicated "dev" role that hides from rosters is a future item.
- **Test framework** — no tests exist yet. Adding Jest/Vitest is a separate effort.
- **Vercel preview deploy config** — Vercel auto-creates preview deploys for PRs on connected repos by default. No config needed unless it's not working.

---

## Summary

| Component | File/Location |
|-----------|--------------|
| Branch protection | GitHub repo settings (via `gh` CLI) |
| CI workflow | `.github/workflows/ci.yml` |
| CODEOWNERS | `.github/CODEOWNERS` |
| PR template | `.github/pull_request_template.md` |
| Contributing guide | `CONTRIBUTING.md` |
| Add collaborator | One `gh` command when ready |
