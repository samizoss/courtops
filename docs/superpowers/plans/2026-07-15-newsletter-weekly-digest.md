# Newsletter Builder + Weekly Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two admin tools: an AI-assisted monthly newsletter builder (`/newsletter`) and a deterministic weekly events digest with email + social PNG (`/weekly-digest`), per `docs/superpowers/specs/2026-07-15-newsletter-weekly-digest-design.md`.

**Architecture:** Frozen HTML templates in `templates/` with `{{TOKEN}}` slots; the model (Feature 1 only) returns copy-only slot JSON via Anthropic structured outputs; pure-code injection + QA gate produce final HTML. Feature 2 is data→template with zero AI: CR events → normalized week → email HTML + `next/og` PNG, cron-triggered Fridays with Resend review email.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS), `@anthropic-ai/sdk` + `zodOutputFormat`, `next/og` (built-in — do NOT add `@vercel/og`), Resend, Vitest (new devDep).

## Global Constraints

- **The model writes copy only. Code writes all HTML.** Templates are frozen — never modified at runtime.
- Headings font `'Days One'` ALWAYS ALL CAPS (`text-transform:uppercase`); body `'Montserrat'`. Colors from `src/lib/jar-brand.ts` only; gold `#d4af37` is NOT used in these features.
- Event/program names verbatim — never rename or invent (Open Play, LTP, Liveball, Ladder Play, Play Pass, Save My Play, PB Vision, Ball Machine, Court Reserve, Passport Program).
- All date math in `America/Chicago`, never UTC-naive. CR `StartTime`/`EndTime` are parsed `new Date(...)` and formatted with `Intl` in org timezone (house pattern per sync route + PR #50 review).
- Auth: `getUserOrg()` from `src/lib/get-user-org.ts`; admin = role `owner` or `admin`. Cron auth: `authorization === 'Bearer ${process.env.CRON_SECRET}'` (mirror `src/app/api/cron/availability-reminders/route.ts`).
- Client components: dynamic-import supabase client inside handlers; `try/catch/finally` around mutations (see CLAUDE.md § Key patterns).
- Anthropic model: `claude-sonnet-4-6`. `ANTHROPIC_API_KEY` server-side only.
- Repo conventions: branch → PR → squash merge; `npm run build` and `npm run lint` must pass before PR.
- Migration numbering: **022 is reserved** (content Phase 4 plan). Weekly digest table is `023_weekly_digest_runs.sql`. Migrations are applied to prod by Sami/orchestrator, not by feature agents.

---

## Phase 0 — Foundation (orchestrator, merge to master before agents start)

### Task 1: Foundation PR

**Files:**
- Create: `src/lib/jar-brand.ts`
- Create: `templates/newsletter-skeleton.html` (copy of `C:\Users\samiz\Downloads\jar-newsletter-v2-skeleton.html`, byte-identical)
- Create: `vitest.config.ts`
- Modify: `package.json` (add `vitest` devDep + `"test": "vitest run"` script)
- Modify: `next.config.ts` (outputFileTracingIncludes for `templates/`)

**Interfaces:**
- Produces: `JAR_BRAND` const (colors/fonts/club facts) consumed by both features; `templates/` readable at runtime in prod.

- [ ] **Step 1: `src/lib/jar-brand.ts`**

```ts
/**
 * The Jar brand tokens + club facts. Hard-coded for the pilot;
 * structured so this becomes per-club config later.
 */
export const JAR_BRAND = {
  colors: {
    blue: '#004a8d',      // primary — headings, dark bg, buttons
    red: '#b42033',       // accents, CTAs, urgency
    navy: '#26256e',      // depth, alt dark bg
    lightBlue: '#65bee5', // highlights on dark bg
    cream: '#fffffb',     // light bg
    charcoal: '#231f20',  // body text
    gold: '#d4af37',      // premium only — NOT used in newsletter/digest
  },
  fonts: {
    heading: "'Days One', Montserrat, Impact, 'Arial Black', sans-serif", // ALWAYS ALL CAPS
    body: "'Montserrat', Calibri, Arial, sans-serif",
  },
  club: {
    name: 'The Jar Pickleball Club',
    address: '3701 S. Western Ave., Sioux Falls, SD',
    email: 'contactpbj@thepbjar.com',
    site: 'https://thepbjar.com',
    hours: 'Sun 8am–8pm | Mon/Wed 7am–9pm | Tue/Thu 5am–9pm | Fri/Sat 7am–10pm',
    tagline: 'Where Fun Meets Fierce Competition',
    timezone: 'America/Chicago',
    socials: {
      instagram: 'https://www.instagram.com/thejarpickleballclub/',
      facebook: 'https://www.facebook.com/thejarpickleballclub/',
      facebookGroup: 'https://www.facebook.com/share/g/1DGYNhVqYR/',
    },
    logoUrl: 'https://tgcstorage.blob.core.windows.net/court-reserve-13403/c4a7193c-7c56-4fa9-bd30-51bacb88bd4d.jpg',
  },
} as const
```

- [ ] **Step 2: Copy template** — `cp "C:\Users\samiz\Downloads\jar-newsletter-v2-skeleton.html" templates/newsletter-skeleton.html` (create `templates/` dir). Do not edit the file.

- [ ] **Step 3: Vitest** — `npm install -D vitest`, add `"test": "vitest run"` to scripts, create:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'] },
})
```

- [ ] **Step 4: next.config.ts** — add (merge into existing config object):

```ts
outputFileTracingIncludes: {
  '/api/newsletter/generate': ['./templates/**'],
  '/api/weekly-digest/run': ['./templates/**'],
},
```
Without this, `fs.readFileSync(path.join(process.cwd(), 'templates', ...))` works locally but 500s on Vercel.

- [ ] **Step 5: Verify** — `npm run build` passes, `npm test` runs (0 tests OK). Commit, PR, squash-merge to master.

---

## Phase A — Feature 1: Monthly Newsletter Builder (Agent A, branch `feat/newsletter-builder`)

### Task 2: Newsletter template engine + QA gate (`src/lib/newsletter.ts`)

**Files:**
- Create: `src/lib/newsletter.ts`
- Test: `src/lib/newsletter.test.ts`

**Interfaces:**
- Produces: `loadNewsletterTemplate(): string`, `escapeHtml(s)`, `injectSlots(template, slots)`, `expandBlock(template, blockName, rows)`, `applyUtm(html, campaign)`, `qaGate(html)` → `{ errors: string[]; warnings: string[] }`
- Consumed by Task 3's route.

- [ ] **Step 1: Write failing tests** (`src/lib/newsletter.test.ts`) covering: escapeHtml escapes `& < > "`; injectSlots replaces all occurrences of a token and escapes plain slots but not `html:true` slots; expandBlock repeats the marked block per row and removes markers, empty rows → empty region, missing block throws; applyUtm appends UTM only to thepbjar.com/courtreserve.com https links (uses `?` vs `&` correctly, skips links already carrying `utm_source=`); qaGate errors on leftover `{{`, on `MISSING:`, on `xx/xx`, on non-https/mailto hrefs, and warns (not errors) on `placehold.co`.

- [ ] **Step 2: `npm test` → fails** (module not found).

- [ ] **Step 3: Implement**

```ts
import fs from 'node:fs'
import path from 'node:path'

export function loadNewsletterTemplate(): string {
  return fs.readFileSync(path.join(process.cwd(), 'templates', 'newsletter-skeleton.html'), 'utf8')
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type SlotValue = string | { value: string; html: true }

/** Replace {{TOKEN}} slots. Plain strings are HTML-escaped; {html:true} values injected raw. */
export function injectSlots(template: string, slots: Record<string, SlotValue>): string {
  let out = template
  for (const [token, v] of Object.entries(slots)) {
    const raw = typeof v === 'string' ? escapeHtml(v) : v.value
    out = out.replaceAll(`{{${token}}}`, raw)
  }
  return out
}

/** Expand a repeatable block delimited by <!-- SLOT: NAME ... --> ... <!-- /NAME -->. */
export function expandBlock(template: string, blockName: string, rows: Array<Record<string, SlotValue>>): string {
  const re = new RegExp(`<!-- SLOT: ${blockName}[\\s\\S]*?-->([\\s\\S]*?)<!-- /${blockName} -->`)
  const m = template.match(re)
  if (!m) throw new Error(`Block ${blockName} not found in template`)
  const expanded = rows.map((row) => injectSlots(m[1], row)).join('\n')
  return template.replace(re, expanded)
}

/** QA rule 4: UTM-tag club + Court Reserve links. campaign = "YYYY-MM". */
export function applyUtm(html: string, campaign: string): string {
  return html.replace(/href="(https:\/\/[^"]+)"/g, (full, url: string) => {
    if (!/(thepbjar\.com|courtreserve\.com)/i.test(url)) return full
    if (/[?&]utm_source=/.test(url)) return full
    const sep = url.includes('?') ? '&' : '?'
    return `href="${url}${sep}utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}"`
  })
}

export interface QaResult { errors: string[]; warnings: string[] }

/** Pure-code QA gate. Any error blocks the Copy button. */
export function qaGate(html: string): QaResult {
  const errors: string[] = []
  const warnings: string[] = []
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g)
  if (leftover) errors.push(`Unfilled slots: ${[...new Set(leftover)].join(', ')}`)
  if (/xx\/xx/i.test(html)) errors.push('Placeholder date "xx/xx" found')
  const missing = html.match(/MISSING:[^<\n]*/g)
  if (missing) errors.push(...missing.map((m) => `Model flagged a missing fact — ${m.trim()}`))
  for (const m of html.matchAll(/href="([^"]*)"/g)) {
    if (!/^(https:\/\/|mailto:)/.test(m[1])) errors.push(`Insecure or malformed link: ${m[1] || '(empty)'}`)
  }
  const ph = (html.match(/placehold\.co/g) ?? []).length
  if (ph > 0) warnings.push(`${ph} photo placeholder(s) to replace in Court Reserve`)
  return { errors, warnings }
}
```

- [ ] **Step 4: `npm test` → all pass.**
- [ ] **Step 5: Commit** — `feat: newsletter template engine + QA gate`

### Task 3: Generate route (`src/app/api/newsletter/generate/route.ts`)

**Files:**
- Create: `src/app/api/newsletter/generate/route.ts`

**Interfaces:**
- Consumes: Task 2 exports; `getUserOrg()`; Anthropic pattern from `src/app/api/sops/suggest/route.ts` (read it first and mirror client construction + `zodOutputFormat` usage).
- Produces: `POST` accepting the request body below; returns `200 { html, warnings }` or `422 { errors }` (QA fail) or `4xx/5xx { error }`.

Request body (client sends everything; server trusts nothing to the model beyond notes):

```ts
interface GenerateRequest {
  month: string   // "August"
  year: number    // 2026
  notes: string   // messy freeform
  heroTopic: string
  heroUrl: string
  leagues: Array<{ name: string; detail: string; url: string }>
  events: Array<{ day: string; mon: string; name: string; detail: string; url: string }> // day "14", mon "AUG"
  memberRegOpen: string      // "Mon 8/4 @ 12:00 PM"
  dailyPlayerRegOpen: string
  coachQuote: string
  coachName: string
  spotlightName: string
  staffName: string
}
```

- [ ] **Step 1: Zod slot schema** — plain-text slots as `z.string()`; the model returns ONLY copy. Fields: `PREHEADER, HERO_HEADLINE, HERO_VALUE_LINE, HERO_CTA, HERO_IMAGE_SUGGESTION, HERO_IMAGE_ALT, GLANCE_ITEMS, LEAGUE_INTRO, LEAGUE_REG_DATES, CLINIC_CONTENT, ANNOUNCEMENT_BLOCKS, COMMUNITY_IMAGE_SUGGESTION, COMMUNITY_IMAGE_ALT, SPOTLIGHT_NAME, SPOTLIGHT_TEXT, STAFF_NAME, STAFF_TEXT, COACH_QUOTE, COACH_NAME, AHEAD_ITEMS, SIGNOFF_TEXT` — each with `.describe()` carrying its constraint from the spec (e.g. `HERO_HEADLINE: z.string().describe('Max 6 words, plain text')`; `GLANCE_ITEMS: z.string().describe('HTML allowed: 3-5 lines separated by <br>, each "• item — date"; inline styles only')`). HTML-allowed slots: `GLANCE_ITEMS, CLINIC_CONTENT, ANNOUNCEMENT_BLOCKS, AHEAD_ITEMS`.

- [ ] **Step 2: Route** — flow:
  1. `getUserOrg()`; 403 unless role `owner`/`admin`.
  2. Rate limit: module-level `let lastCall = 0`; reject 429 if `Date.now() - lastCall < 15_000`; set on accept. (Best-effort per lambda instance — fine for a solo admin; paid-API guard, not security.)
  3. Validate body with zod (`GenerateRequest` schema); 400 on failure.
  4. Anthropic call — model `claude-sonnet-4-6`, `max_tokens: 4096`, system prompt **verbatim from the spec § System prompt** (including voice, emoji whitelist, program-name list, HARD RULES), user message = month/year + structured facts block + notes. Use `zodOutputFormat` structured outputs exactly like `sops/suggest`.
  5. Assemble server-side:
     ```ts
     let html = loadNewsletterTemplate()
     html = expandBlock(html, 'LEAGUE_ROWS', body.leagues.map(l => ({ LEAGUE_NAME: l.name, LEAGUE_DETAIL: l.detail, LEAGUE_URL: l.url })))
     html = expandBlock(html, 'EVENT_ROWS', body.events.map(e => ({ EVENT_DAY: e.day, EVENT_MON: e.mon, EVENT_NAME: e.name, EVENT_DETAIL: e.detail, EVENT_URL: e.url })))
     html = injectSlots(html, {
       MONTH: body.month.toUpperCase(), YEAR: String(body.year), HERO_URL: body.heroUrl,
       HERO_IMAGE_SUGGESTION: { value: encodeURIComponent(slots.HERO_IMAGE_SUGGESTION), html: true },
       ...plainSlotsFromModel, ...htmlSlotsFromModelAs{value,html:true},
     })
     html = applyUtm(html, `${body.year}-${String(monthIndex).padStart(2, '0')}`)
     const qa = qaGate(html)
     ```
  6. `qa.errors.length ? 422 { errors: qa.errors } : 200 { html, warnings: qa.warnings }`. Wrap the Anthropic call in try/catch; 502 `{ error }` on API failure. Never return partially-injected HTML on the success path.

- [ ] **Step 3: Verify** — `npm run build` passes; hit the route locally with a crafted body (curl or a quick script) and confirm 200 with `{{`-free HTML and 422 when a required fact is omitted (model emits `MISSING:` → gate catches).
- [ ] **Step 4: Commit** — `feat: newsletter generate route (structured outputs + QA gate)`

### Task 4: `/newsletter` page + sidebar link

**Files:**
- Create: `src/app/(dashboard)/newsletter/page.tsx` (server: `export const dynamic = 'force-dynamic'`, `getUserOrg()`, redirect non-admins to `/`, render client component)
- Create: `src/app/(dashboard)/newsletter/newsletter-builder.tsx` (client)
- Modify: `src/components/sidebar.tsx` (admin-only "Newsletter" link to `/newsletter`, place directly under the Content entry; mirror the existing admin-gating of other entries)

**Interfaces:**
- Consumes: Task 3's POST contract.

- [ ] **Step 1: Client component** — plain form, ship speed over polish (existing form styling from `settings/content` pages for inputs/buttons):
  - Month/year selects (default: next calendar month).
  - `<textarea rows={12}>` "Paste your notes for this month".
  - Structured fields: hero topic + hero URL; repeatable league rows (name / detail / URL, add + remove buttons); repeatable event rows (day / month / name / detail / URL); member reg open; daily player reg open; coach quote + name; spotlight member name; staff shout-out name.
  - Generate button → `fetch('/api/newsletter/generate', { method: 'POST', ... })`, loading state, error banner on non-200 (show `errors[]` list verbatim).
  - On success: side-by-side (`grid md:grid-cols-2`): `<iframe srcDoc={html} className="w-full h-[80vh] bg-white" />` + right column with warnings list (amber), "Copy HTML" button (`navigator.clipboard.writeText(html)` → toast via existing ToastProvider), and "Regenerate copy" button that re-POSTs the same form state.
  - Copy button only renders when a successful (error-free) result exists — the 422 path never delivers HTML.
- [ ] **Step 2: Verify** — `npm run dev`, generate with real-ish August notes; confirm preview renders, copy works, missing hero URL → blocked with clear error.
- [ ] **Step 3: Commit** — `feat: newsletter builder page`

### Task 5: Feature 1 wrap-up

- [ ] `npm run lint` + `npm run build` + `npm test` all green.
- [ ] Push branch, open PR titled "Monthly Newsletter Builder (AI copy, code-built HTML)" with body-file (PowerShell heredoc gotcha — write body to a temp file, `gh pr create --body-file`). Do NOT merge — orchestrator reviews.

---

## Phase B — Feature 2: Weekly Digest (Agent B, branch `feat/weekly-digest`)

### Task 6: Digest data layer (`src/lib/weekly-digest.ts`)

**Files:**
- Create: `src/lib/weekly-digest.ts`
- Test: `src/lib/weekly-digest.test.ts`

**Interfaces:**
- Consumes: `CREventRegistration` from `@/lib/courtreserve`.
- Produces:
  - `getWeekWindow(now: Date): { start: string; end: string }` — ISO dates, coming Monday (today if Monday, in Chicago) → Sunday
  - `normalizeEvents(rows: CREventRegistration[], window): DigestEvent[]`
  - `interface DigestEvent { dayIndex: number /* 0=Mon..6=Sun */; startTime: string; endTime: string; startIso: string; name: string }`
  - `formatTimeRange(startIso: string, endIso: string): string` — `"7:00 - 10:00 AM"` (meridiem shown once when both sides match, Chicago time)
  - `formatDateRange(startDate: string, endDate: string): string` — `"7/20 – 7/26"`

- [ ] **Step 1: Failing tests** — getWeekWindow: Friday 2026-07-17T14:00Z → `{start:'2026-07-20', end:'2026-07-26'}`; a Monday in Chicago → start is that same day; a Saturday-night UTC instant that is still Friday in Chicago resolves from the Chicago date; window spanning a DST transition (e.g. Fri 2026-10-30) still yields Mon–Sun 7 days. normalizeEvents: de-dupes on `EventDateId` (fallback key `day|start|name` when EventDateId missing), drops `CancelledOnUtc` **sessions only if every row for that session is cancelled** (mirror sync: cancelled registrations don't remove the session — but a session whose registrations are ALL cancelled still renders; simplest faithful rule: keep session, since CR still holds it — test asserts session with one cancelled + one active row appears once), drops rows outside the window (Chicago date), sorts by dayIndex then start, keeps names verbatim. formatTimeRange: `7–10am → "7:00 - 10:00 AM"`, `11am–1pm → "11:00 AM - 1:00 PM"`.

- [ ] **Step 2: `npm test` → fail.**

- [ ] **Step 3: Implement**

```ts
import type { CREventRegistration } from '@/lib/courtreserve'
import { JAR_BRAND } from '@/lib/jar-brand'

const TZ = JAR_BRAND.club.timezone // America/Chicago

function chicagoYmdWeekday(d: Date): { y: number; m: number; d: number; weekday: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(d).map((p) => [p.type, p.value])
  )
  return { y: +parts.year, m: +parts.month, d: +parts.day, weekday: parts.weekday }
}

/** Coming Monday→Sunday in Chicago. If today is Monday (Chicago), the week starts today. */
export function getWeekWindow(now: Date): { start: string; end: string } {
  const { y, m, d, weekday } = chicagoYmdWeekday(now)
  const dow: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  const daysToMonday = (8 - dow[weekday]) % 7
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  // UTC noon avoids DST-transition date shifts when adding days
  return {
    start: iso(Date.UTC(y, m - 1, d + daysToMonday, 12)),
    end: iso(Date.UTC(y, m - 1, d + daysToMonday + 6, 12)),
  }
}

export interface DigestEvent { dayIndex: number; startTime: string; endTime: string; startIso: string; name: string }

function chicagoIsoDate(d: Date): string {
  const { y, m, d: day } = chicagoYmdWeekday(d)
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function normalizeEvents(rows: CREventRegistration[], window: { start: string; end: string }): DigestEvent[] {
  const seen = new Map<string, DigestEvent>()
  for (const r of rows) {
    const start = new Date(r.StartTime); const end = new Date(r.EndTime)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || !r.EventName) continue
    const dateIso = chicagoIsoDate(start)
    if (dateIso < window.start || dateIso > window.end) continue
    const key = r.EventDateId ? `id:${r.EventDateId}` : `${dateIso}|${r.StartTime}|${r.EventName}`
    if (seen.has(key)) continue
    const dayIndex = Math.round((Date.parse(dateIso + 'T12:00:00Z') - Date.parse(window.start + 'T12:00:00Z')) / 86400000)
    seen.set(key, {
      dayIndex,
      startIso: start.toISOString(),
      startTime: r.StartTime,
      endTime: r.EndTime,
      name: r.EventName, // verbatim from CR — never rename
    })
  }
  return [...seen.values()].sort((a, b) => a.dayIndex - b.dayIndex || a.startIso.localeCompare(b.startIso))
}

function fmtTime(d: Date, withMeridiem: boolean): string {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
  return withMeridiem ? s : s.replace(/\s?(AM|PM)$/i, '')
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const s = new Date(startIso); const e = new Date(endIso)
  const mer = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: true }).format(d).slice(-2)
  const same = mer(s) === mer(e)
  return `${fmtTime(s, !same)} - ${fmtTime(e, true)}`
}

export function formatDateRange(startDate: string, endDate: string): string {
  const md = (iso: string) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}` }
  return `${md(startDate)} – ${md(endDate)}`
}

export const DAY_LABELS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
```

Note: `normalizeEvents` keeps sessions that have cancelled registration rows (a cancelled *registration* ≠ cancelled *session*; mirror of sync route line 249). It only ever adds a session once.

- [ ] **Step 4: `npm test` → pass.**
- [ ] **Step 5: Commit** — `feat: weekly digest data layer (week window, normalize, formatting)`

### Task 7: Storage — migration + types

**Files:**
- Create: `supabase/migrations/023_weekly_digest_runs.sql` (**not 022** — reserved)
- Modify: `src/types/database.ts` (add `weekly_digest_runs` row type following the file's existing style)

- [ ] **Step 1: Migration**

```sql
-- 023: weekly digest run history (latest run per org drives /weekly-digest page)
create table weekly_digest_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  week_start date not null,
  week_end date not null,
  status text not null check (status in ('success', 'error')),
  error text,
  events jsonb not null default '[]'::jsonb,  -- DigestEvent[]
  triggered_by text not null default 'manual' check (triggered_by in ('manual', 'cron')),
  generated_at timestamptz not null default now()
);
create index weekly_digest_runs_org_latest on weekly_digest_runs (org_id, generated_at desc);

alter table weekly_digest_runs enable row level security;

create policy "weekly_digest_runs_select" on weekly_digest_runs
  for select using (org_id = public.get_user_org_id());
-- No insert/update policies: writes go through server routes (service role / route auth).
```

- [ ] **Step 2:** Add the row type to `database.ts`. Do NOT apply to prod — orchestrator applies at merge time.
- [ ] **Step 3: Commit** — `feat: weekly_digest_runs migration + types`

### Task 8: Email template + renderer

**Files:**
- Create: `templates/weekly-digest.html`
- Modify: `src/lib/weekly-digest.ts` (add `renderDigestEmail`)
- Test: extend `src/lib/weekly-digest.test.ts`

**Interfaces:**
- Produces: `renderDigestEmail(events: DigestEvent[], window: { start: string; end: string }): string`
- Reuses `injectSlots`/`expandBlock` from `@/lib/newsletter` (Feature 1 branch owns that file — **on this branch, import from `@/lib/newsletter` is unavailable; instead create `src/lib/template-engine.ts`** with copies of `escapeHtml`, `injectSlots`, `expandBlock` ONLY (no QA/UTM). At merge, orchestrator consolidates Feature 1's `newsletter.ts` to import these from `template-engine.ts`. Note this in the PR description.)

- [ ] **Step 1: Template** — frozen email-safe table layout, structure mirroring `templates/newsletter-skeleton.html` conventions (600–640px container, inline styles, Days One/Montserrat with fallbacks, Google Fonts link with mso guard):
  - Blue `#004a8d` bgcolor throughout.
  - Header: `THIS WEEK @ THE JAR` (Days One, ALL CAPS, white, ~34px) + `{{DATE_RANGE}}` in red `#b42033`, bold.
  - `<!-- SLOT: DAY_ROWS --> ... <!-- /DAY_ROWS -->` block: one `<tr>` per day; left cell `{{DAY_LABEL}}` lowercase white bold (Montserrat 700, ~16px, width 130, top-aligned, `border-top:2px solid #ffffff`); right cell `{{DAY_EVENTS}}` (html slot) with `border-top:2px solid #ffffff`, `font-size:{{ROW_FONT_SIZE}}px` on the cell.
  - Footer: logo img (white-bg-safe, width 120), address, hours, all white on blue.
- [ ] **Step 2: Renderer** in `weekly-digest.ts`:

```ts
export function renderDigestEmail(events: DigestEvent[], window: { start: string; end: string }): string {
  const template = fs.readFileSync(path.join(process.cwd(), 'templates', 'weekly-digest.html'), 'utf8')
  const byDay = DAY_LABELS.map((_, i) => events.filter((e) => e.dayIndex === i))
  const maxPerDay = Math.max(0, ...byDay.map((d) => d.length))
  const fontSize = maxPerDay > 5 ? 13 : 15 // >5 events: shrink one step, never truncate
  const rows = DAY_LABELS.map((label, i) => ({
    DAY_LABEL: label,
    ROW_FONT_SIZE: String(fontSize),
    DAY_EVENTS: {
      value: byDay[i]
        .map((e) => `${escapeHtml(formatTimeRange(e.startTime, e.endTime))} | <strong>${escapeHtml(e.name)}</strong>`)
        .join('<br>'),
      html: true as const,
    },
  }))
  let html = expandBlock(template, 'DAY_ROWS', rows)
  html = injectSlots(html, { DATE_RANGE: formatDateRange(window.start, window.end) })
  return html
}
```
(Empty day → empty right cell, row still renders.)
- [ ] **Step 3: Tests** — 7 rows always render; empty Sunday renders empty cell; 6-events day switches font size token to 13; output contains no `{{`.
- [ ] **Step 4: `npm test` → pass. Commit** — `feat: weekly digest email template + renderer`

### Task 9: Social graphic route (`/api/weekly-digest/image`)

**Files:**
- Create: `src/app/api/weekly-digest/image/route.tsx` (note `.tsx` — JSX for ImageResponse)
- Create: `src/app/api/weekly-digest/image/fonts/DaysOne-Regular.ttf`, `Montserrat-Regular.ttf`, `Montserrat-Bold.ttf`

- [ ] **Step 1: Fonts** — download static TTFs:
  - `https://raw.githubusercontent.com/google/fonts/main/ofl/daysone/DaysOne-Regular.ttf`
  - `https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Regular.ttf` and `Montserrat-Bold.ttf`
  (Both OFL-licensed — fine to commit. Satori does not support variable fonts, hence the static files.)
- [ ] **Step 2: Route** — `GET`, auth via `getUserOrg()` (admin only). Loads the latest `weekly_digest_runs` row for the org (optionally `?week=YYYY-MM-DD` to pick a specific week_start), 404 if none. Renders `new ImageResponse(<Digest .../>, { width: 1080, height: 1350, fonts: [...] })` from `next/og`:
  - Fonts loaded via `fetch(new URL('./fonts/DaysOne-Regular.ttf', import.meta.url)).then(r => r.arrayBuffer())` — module scope, cached.
  - Layout (flexbox — satori supports flex only, every multi-child div needs explicit `display:'flex'`): full-bleed `#004a8d` background; subtle court texture = two absolutely-positioned rectangles in `#26256e` at low opacity suggesting court lines; title `THIS WEEK` / `@ THE JAR` in Days One white uppercase ~72px; date range in `#b42033` bold on white pill (or red text on blue — match email); 7 day rows separated by 2px white borders, lowercase day label (Days One, white, ~30px, fixed 220px column), events column with `"7:00 - 10:00 AM"` regular Montserrat + event name Montserrat 700, font size stepping down (24 → 19) when any day has >5 events; logo `JAR_BRAND.club.logoUrl` bottom-center height ~80.
  - `Content-Disposition: inline; filename="this-week-at-the-jar-{week_start}.png"`.
- [ ] **Step 3: Verify** — dev server, hit route in browser after a manual run exists; confirm 1080×1350 PNG, all 7 rows, empty days blank.
- [ ] **Step 4: Commit** — `feat: weekly digest social graphic (next/og, 1080x1350)`

### Task 10: Run route + cron (`/api/weekly-digest/run`)

**Files:**
- Create: `src/app/api/weekly-digest/run/route.ts`
- Modify: `vercel.json` (add cron)

**Interfaces:**
- `GET` = cron (Bearer CRON_SECRET); `POST` = manual (admin session). Both execute the same `runDigest(orgId)`.
- **Read `src/app/api/cron/availability-reminders/route.ts` FIRST** and mirror its Supabase client construction (cron has no session) and its notification/email pattern.

- [ ] **Step 1: `runDigest` flow** for each org with CR creds (cron iterates orgs like the reminders cron scopes its work; manual uses the caller's org):
  1. Read `org_settings.cr_api_user/cr_api_pass` + `organizations.courtreserve_org_id` (exactly like `/api/sync/courtreserve`). Skip org if absent.
  2. `const window = getWeekWindow(new Date())`; `cr.getEventRegistrations(window.start, window.end)` (≤7 days — single call, no chunking).
  3. `normalizeEvents(rows, window)` → insert `weekly_digest_runs` row `{ status: 'success', events, week_start, week_end, triggered_by }`.
  4. On any failure: insert `{ status: 'error', error: message, events: [] }` AND send alert email to org admins (Resend via `src/lib/email.ts` helper pattern): subject "Weekly digest failed", body includes the error + link `https://courtops.app/weekly-digest`.
  5. On cron success: Resend email to org admins — subject `This week's digest is ready to review`, body: link to `/weekly-digest`, reminder it is NOT sent anywhere automatically. Manual runs skip the email.
- [ ] **Step 2: vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/availability-reminders", "schedule": "0 14 * * *" },
    { "path": "/api/weekly-digest/run", "schedule": "0 14 * * 5" }
  ]
}
```
(Friday 14:00 UTC = 9am CDT / 8am CST — same accepted DST drift as the existing cron.)
- [ ] **Step 3: Verify** — local: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/weekly-digest/run` inserts a success row with real Jar events; break the CR creds → error row + (log of) alert email.
- [ ] **Step 4: Commit** — `feat: weekly digest run route + Friday cron`

### Task 11: `/weekly-digest` page + sidebar link

**Files:**
- Create: `src/app/(dashboard)/weekly-digest/page.tsx` (server, force-dynamic, admin redirect, fetch latest run + latest successful run)
- Create: `src/app/(dashboard)/weekly-digest/weekly-digest-client.tsx`
- Modify: `src/components/sidebar.tsx` (admin-only "Weekly Digest" link under Content — expect a merge conflict with Feature 1's Newsletter link; orchestrator resolves)

- [ ] **Step 1: Page** — server component passes `{ latestRun, latestSuccess }` (email HTML re-rendered server-side via `renderDigestEmail(run.events, ...)` — deterministic from stored events). Client shows:
  - Header: week range + generated-at + triggered-by badge; error banner when latest run failed (shows `error`, falls back to displaying `latestSuccess` artifacts).
  - "Generate now" button → POST `/api/weekly-digest/run` → reload (house pattern `window.location.reload()`).
  - Two panels: email preview (`iframe srcDoc` + Copy HTML button, toast on copy) and graphic (`<img src="/api/weekly-digest/image?week=...">` + "Download PNG" anchor with `download` attr).
  - Footnote: "Events with zero Court Reserve registrations don't appear (CR API limitation)."
- [ ] **Step 2: Verify in dev** — generate, preview both artifacts, copy + download work.
- [ ] **Step 3: Commit** — `feat: weekly digest admin page`

### Task 12: Feature 2 wrap-up

- [ ] `npm run lint` + `npm run build` + `npm test` green.
- [ ] PR titled "Weekly 'This Week @ The Jar' digest (deterministic, cron + manual)" via `--body-file`; note the `template-engine.ts` consolidation for the orchestrator. Do NOT merge.

---

## Phase C — Orchestrator: review, merge, ship

- [ ] Code-review both PRs (correctness focus: QA gate bypasses, timezone math, RLS on new table, cron auth). Fix findings.
- [ ] Merge Feature 1 (squash). Rebase Feature 2; resolve sidebar conflict (both links, Newsletter above Weekly Digest); consolidate `template-engine.ts` (newsletter.ts imports shared helpers; delete duplicates). Merge Feature 2.
- [ ] Apply migration 023 to prod (Supabase MCP if connected, else Management API Node-script pattern from CURRENT_STATE).
- [ ] Verify Vercel env: `CRON_SECRET` present (used by existing cron — confirm), `ANTHROPIC_API_KEY` present. `npx vercel env ls production`.
- [ ] Standing rule: update `/releases` entry, `roadmap.json`, and the guide (both features get a short "how Geneva uses it" section).
- [ ] Manual verify (production): generate August newsletter with real notes → paste into CR email test; run "Generate now" on `/weekly-digest` → confirm correct Mon–Sun window, real events, PNG downloads.
- [ ] Update `docs/CURRENT_STATE.md` session log.
