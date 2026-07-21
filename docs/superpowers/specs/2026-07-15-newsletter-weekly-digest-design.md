# Newsletter Builder + Weekly Digest — Design Spec

> **Date:** 2026-07-15
> **Source:** Sami's handoff doc (`courtops-newsletter-features-prompt.md`), adapted to repo reality.
> **Primary operator:** Geneva Olson (admin, The Jar).
> **Success criteria:** Geneva can produce the August newsletter and this week's digest without touching HTML.

Two admin-only features, built in parallel:

1. **Monthly Newsletter Builder** (`/newsletter`) — AI-assisted, admin-triggered
2. **Weekly "This Week @ The Jar" digest** (`/weekly-digest`) — fully deterministic, cron-triggered, NO AI

**Architecture rule for both: the model (when used) writes copy only. Code writes all HTML.**
Templates are frozen files in `templates/`; the model returns slot JSON; code injects, validates, renders. The model never touches markup.

---

## Deviations from the handoff doc (repo reality)

| Handoff doc said | Actual approach | Why |
|---|---|---|
| "Locate CR API docs and confirm event endpoints" (the one true unknown) | Already answered. `src/lib/courtreserve.ts` exists; `eventregistrationreport/listactive` is the ONLY event surface CR exposes (verified against Jar prod, 2026-06-09). No event catalog endpoint. Zero-registration events are invisible (accepted limitation). | Repo already learned this during content-calendar work. |
| "Does CR support creating a draft email/campaign?" | No. CR's API is read-only reports. **Paste flow (preview + Copy HTML) for both features.** | Same. |
| `COURTRESERVE_API_KEY` env var | CR creds live in DB (`org_settings.cr_api_user/cr_api_pass`) + `organizations.courtreserve_org_id`, same as the sync route. | Existing pattern. |
| Parse model JSON defensively (strip fences, try/catch) | Anthropic SDK **structured outputs** (`zodOutputFormat`) — the house pattern from `/api/sops/suggest`. QA gate stays as second layer. | Strictly better; schema enforced at the API layer. |
| Reference image of existing weekly graphic "provided" | Not found; **build from the written layout spec** (approved by Sami 2026-07-15). Tune against the real graphic later if needed. | Asset missing. |
| Cron "Friday 9:00 AM America/Chicago" | Vercel cron `0 14 * * 5` (UTC) — 9am CDT, 8am CST. Accepts 1-hr DST drift, same as existing availability-reminders cron. Auth via `Bearer ${CRON_SECRET}` header, same pattern. | Existing pattern. |
| — | Weekly digest fetches CR **live at generate time** (single ≤7-day window, no chunking) rather than reading synced `cr_events` tables. | Always fresh; avoids stale-sync dependency. |
| — | Admin-only sidebar links for both pages. | Geneva has to find them. |
| — | Standing rule: this build updates `/releases`, `roadmap.json`, and the guide. | Build checklist. |

---

## Shared foundation

### `src/lib/jar-brand.ts`
Brand tokens + club facts, hard-coded for the pilot, structured so it can become per-club config later.

```
Colors: blue #004a8d (primary), red #b42033 (accents/CTA), navy #26256e,
        lightBlue #65bee5, cream #fffffb, charcoal #231f20,
        gold #d4af37 (premium only — NOT used in these features)
Headings: 'Days One' — ALWAYS ALL CAPS (enforce text-transform:uppercase)
Body: 'Montserrat'  |  Fallbacks: Impact/Arial Black; Calibri/Arial

Club facts: The Jar Pickleball Club · 3701 S. Western Ave., Sioux Falls, SD
contactpbj@thepbjar.com · https://thepbjar.com
Hours: Sun 8am–8pm | Mon/Wed 7am–9pm | Tue/Thu 5am–9pm | Fri/Sat 7am–10pm
Tagline: Where Fun Meets Fierce Competition · TZ America/Chicago
IG https://www.instagram.com/thejarpickleballclub/
FB https://www.facebook.com/thejarpickleballclub/
FB Group https://www.facebook.com/share/g/1DGYNhVqYR/
Logo https://tgcstorage.blob.core.windows.net/court-reserve-13403/c4a7193c-7c56-4fa9-bd30-51bacb88bd4d.jpg
```

### Templates
- `templates/newsletter-skeleton.html` — copied from `Downloads/jar-newsletter-v2-skeleton.html`. Frozen; `{{TOKEN}}` slots with HTML comments describing each. Never modify layout at runtime.
- `templates/weekly-digest.html` — new, Feature 2 (same frozen rules).

### Env vars
- `ANTHROPIC_API_KEY` — already set (SOP suggest). Server-side only.
- `CRON_SECRET` — already used by availability-reminders cron; verify it's set.

---

## Feature 1 — Monthly Newsletter Builder

Admin-only page at `/newsletter` generating the monthly newsletter HTML for pasting into a Court Reserve email.

### UI (plain — ship speed over polish)
- Month/year picker
- Large textarea: "Paste your notes for this month" (any messy format)
- Structured fields for facts the model must NEVER invent:
  - Hero topic + Court Reserve registration URL
  - Leagues: name, detail line, registration URL (repeatable rows)
  - Member registration open date/time + Daily Player registration open date/time
  - Coach quote + attribution
  - Spotlight member name / Staff shout-out name
- Generate → loading state → side-by-side: iframe preview + "Copy HTML" button
- "Regenerate copy" keeps structured fields, re-runs only the model call

### Server route `/api/newsletter/generate`
- Admin-authenticated (`getUserOrg()`, role check). Rate-limited (paid API) — simple per-org cooldown is sufficient for a solo admin.
- Calls Anthropic `claude-sonnet-4-6` with structured outputs (`zodOutputFormat`) against the slot schema.
- Surface errors to the UI — never ship a half-filled email.

### System prompt (keep every rule)
```
You write email copy for The Jar Pickleball Club's monthly newsletter.
Voice: authentic, slightly corny, not over-polished. Direct. Short
sentences. No fluff. Welcoming to all skill levels. Hook → Value → CTA
on the hero. Emoji: sparingly, only 🥒 🏓 👟 🏆 🥇 📍 ❄️ 🔥.
Seasonal angle: winter = warmth/escape from SD cold; summer = no wind,
no humidity.

Club programs (use these terms exactly, never invent new ones):
Open Play, LTP (Learn To Play), Liveball, Ladder Play, Play Pass,
Save My Play, PB Vision, Ball Machine, Court Reserve, Passport Program.

HARD RULES:
- Use ONLY the dates, times, prices, names, and URLs provided in the
  input. If a required fact is missing, put the literal string
  "MISSING:" plus a description in that slot — never guess.
- HERO_HEADLINE: max 6 words. All slot copy is plain text (no HTML)
  except slots marked html:true in the schema.
```

### Slot schema (the model's contract)

> **v1.2 (2026-07-21):** the schema is now built DYNAMICALLY per request — sections are
> toggleable (`sections` map in the request), OFF sections are excised from the template
> before the model call, and only ON-section slots appear in the zod schema. The system
> prompt gains one dynamic line listing OFF sections. `LEAGUE_REG_DATES` is no longer a
> model slot — it's an optional admin-typed line injected verbatim (or its template line
> removed when empty). The global member/daily reg-open fields were removed.
> Always-on slots: PREHEADER, HERO_*, GLANCE_ITEMS, SIGNOFF_TEXT.

```
PREHEADER            string, 40–100 chars                      (always)
HERO_HEADLINE        string, ≤6 words                          (always)
HERO_VALUE_LINE      string, 1–2 sentences                     (always)
HERO_CTA             string, ≤4 words                          (always)
HERO_IMAGE_SUGGESTION string, short photo direction, URL-encodable (always)
HERO_IMAGE_ALT       string                                    (always)
GLANCE_ITEMS         html — •-separated lines with dates       (always)
LEAGUE_INTRO         string, one line                          (LEAGUES on)
CLINIC_CONTENT       html                                      (CLINICS on)
ANNOUNCEMENT_BLOCKS  html — h3+p pairs; inline styles only     (ANNOUNCEMENTS on)
COMMUNITY_IMAGE_SUGGESTION / COMMUNITY_IMAGE_ALT  string       (COMMUNITY_IMAGE on)
SPOTLIGHT_NAME       string   SPOTLIGHT_TEXT  string, 3–4 sentences (SPOTLIGHT on)
STAFF_NAME           string   STAFF_TEXT      string, 2–3 sentences (STAFF on)
COACH_QUOTE          string   COACH_NAME      string           (COACH_QUOTE on)
AHEAD_ITEMS          html                                      (AHEAD on)
SIGNOFF_TEXT         string, 1–2 sentences                     (always)
```
HERO_URL, LEAGUE rows, EVENT rows come from the structured fields, not the model
(pre-fillable from Court Reserve with include/exclude, since v1.1/PR #67).
Code builds LEAGUE_ROWS / EVENT_ROWS by repeating the marked blocks in the skeleton.

### QA gate — pure code, runs after injection, blocks Copy on failure
1. Zero `{{` remaining in output
2. Zero `xx/xx` or `MISSING:` strings
3. Every `href` starts with `https://` or `mailto:`
4. Append to every thepbjar.com / courtreserve link: `utm_source=newsletter&utm_medium=email&utm_campaign={YYYY-MM}`
5. Warn (non-blocking) if `placehold.co` URLs remain: "N photo placeholders to replace in Court Reserve"

### Acceptance
Geneva pastes notes + fills fields → under 60 seconds later has valid HTML on her clipboard that renders correctly pasted into a Court Reserve email.

---

## Feature 2 — Weekly "This Week @ The Jar" (deterministic, NO AI)

Pull the coming week's events from Court Reserve; produce (a) week-at-a-glance email HTML and (b) 1080×1350 social PNG. Model calls: none. Data → template.

### Data
- Existing `CourtReserveAPI.getEventRegistrations()` for next Monday–Sunday (America/Chicago).
- Registration rows are per-registration → normalize/de-dupe on `EventDateId` (fallback: day+start+name) to `{ day, startTime, endTime, name }`.
- Event names verbatim from CR (POP, LTP, HIP Class (3.5+), Beginner Guided Open Play, FAC, Singles Power Hour, Student Open Play, …). Never rename or invent.
- Cancelled sessions (`CancelledOnUtc` set) excluded.

### Email template (`templates/weekly-digest.html`, frozen)
- Header: "THIS WEEK @ THE JAR" (Days One, ALL CAPS, white) + date range in red (e.g., "7/20 – 7/26")
- Blue #004a8d background throughout, day rows mon→sun
- Row: lowercase day label (white, bold, left column) | entries `7:00 - 10:00 AM | **Event Name**` (time regular, name bold)
- Empty day = row renders with empty right cell
- Footer: white logo lockup, address, hours

### Social graphic
- Portrait grid matching the email layout: blue court-texture background, white 2px row dividers, title + red date range, lowercase day labels, bold event names, logo bottom center
- `@vercel/og` (satori) at 1080×1350; no player-photo overlay in v1
- Downloadable PNG from the admin page

### Trigger
- Vercel cron `0 14 * * 5` → `/api/weekly-digest/run`, protected by `Bearer ${CRON_SECRET}`
- Manual "Generate now" on `/weekly-digest` admin page with preview of both outputs
- On cron completion: Resend email to admin (Geneva) with a review link — auto-generate, human-approve, **never auto-send**
- Cron persists its run (see storage) so the page shows the latest artifacts without regenerating

### Storage
Latest run persisted per org (new table `weekly_digest_runs`: org_id, week_start, generated_at, events JSON, status, error) so (a) the review link shows the cron's output, (b) "last successful run" survives CR outages. Email HTML + PNG re-render deterministically from the stored events.

### Edge cases
| Case | Behavior |
|---|---|
| CR API down / auth fail | Alert email to admin; page shows last successful run |
| Day with no events | Render empty row |
| >5 events in a day | Render all; shrink row font one step; never truncate silently |
| Event spans midnight / odd hours | Display verbatim from CR times |
| Duplicate events from API | De-dupe on (day, start, name) / EventDateId |
| DST transitions | All date math in America/Chicago, never UTC-naive |
| Zero-registration events | Invisible to the CR API — accepted limitation, note it on the page |

### Acceptance
Cron produces both artifacts for the correct Mon–Sun window with zero manual input; Geneva reviews, copies the email into CR, downloads the PNG, posts.

---

## Build order

1. **Foundation PR** — `lib/jar-brand.ts`, `templates/newsletter-skeleton.html`, `@vercel/og` dep. Merge to master first so both feature branches start clean. (Each feature PR adds its own sidebar link.)
2. **Parallel:** Feature 1 branch (route + page + QA gate) ∥ Feature 2 branch (normalizer + templates + PNG + cron + storage).
3. QA review each PR, fix, merge. Update releases/roadmap/guide.
4. Manual test: generate August newsletter with real notes; generate this week's digest; paste both into CR emails.
