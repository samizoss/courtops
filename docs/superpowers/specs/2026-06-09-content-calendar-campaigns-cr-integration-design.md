# Content Calendar + Campaigns + Court Reserve Integration

**Date:** 2026-06-09
**Author:** Sami Zoss + Claude (brainstorming session)
**Pilot user:** Geneva Olson (GM, The Jar) + Maddie Thie (social media)
**Status:** Approved for implementation planning

---

## Goal

Replace the flat `content_calendar` module with a parent/child model that unifies three things on one calendar:

1. **CR events and sessions** — pulled live from CourtReserve
2. **User-authored Campaigns** — planning containers for leagues, drives, recurring pushes
3. **Content pieces** — individual posts, emails, flyers planned around Campaigns or standalone

The current `/content` page is a flat month grid with no notion of grouping, no integration with CR, and no surface for the actual content workflow Maddie does daily. This rewrites it.

The downstream win: Geneva opens "Spring Leagues 2026" and sees in one place — what sessions CR has scheduled, the registration-opens anchor, every social/email/flyer post going out around it, and what stage each is in.

---

## Court Reserve API — known surface

Probed live on 2026-06-09 against The Jar's prod creds (raw outputs in `tmp/cr-probe-out/`). Findings constrain the data model:

- **Only two event-relevant endpoints respond:**
  - `GET /eventregistrationreport/listactive` — requires `eventDateFrom`/`eventDateTo`, max 31-day window. Returns event registration rows.
  - `GET /reservationreport/listactive` — requires `reservationsFromDate`/`reservationsToDate`, max 7-day window. Returns reservation rows.
- **No event catalog endpoint exists.** Every guess (`/event/list`, `/eventcategory/get`, `/league/list`, `/program/list`, etc.) 404'd.
- **Events with zero registrations are invisible to the API.** We accept this as a V1 limitation. Geneva learns to expect "newly-published-but-no-signups-yet" events won't appear in CourtOps until first registration arrives.
- **CR's own 2-level hierarchy is exposed in registration rows** — `EventId` (the series/template) + `EventDateId` (the individual occurrence). This means CR auto-groups sessions of a recurring league under one EventId. Geneva does not need to manually link six league nights — CR already does that.
- **Categories observed at The Jar:** Open Play, Adult Clinic, Adult Skill Level Play, LTP, Youth, SFAP.

**Registration row shape (every field present in all 203 sample rows):**

```
EventId, EventName, IsTeamEvent,
EventCategoryId, EventCategoryName,
EventDateId, StartTime, EndTime,
OrganizationMemberId, FirstName, LastName, Email, Phone,
PartnersInfo, PriceToPay, PaidAmount,
SignedUpOnUtc, CancelledOnUtc, Courts, UserDefinedFields
```

---

## Data model

### New tables

```sql
-- One row per CR EventId (the series/template). Derived from registration sync;
-- never written by users.
CREATE TABLE cr_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  cr_event_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  cr_category_id BIGINT,
  cr_category_name TEXT,
  is_team_event BOOLEAN DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, cr_event_id)
);

-- One row per CR EventDateId (the individual session occurrence).
CREATE TABLE cr_event_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  cr_event_id UUID NOT NULL REFERENCES cr_events(id) ON DELETE CASCADE,
  cr_event_date_id BIGINT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  registration_count INT DEFAULT 0,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, cr_event_date_id)
);

-- Planning container. User-authored.
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#f97316',
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'active', 'complete', 'archived')),
  goal TEXT
    CHECK (goal IN ('brand_awareness', 'engagement', 'follower_growth',
                    'event_attendance', 'sales_growth', 'customer_loyalty',
                    'content_sharing')),
  start_date DATE NOT NULL,
  end_date DATE,
  post_goal INT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Flexible date anchors per campaign. Replaces rigid reg_opens/reg_closes columns.
-- A campaign has 0..N milestones. Renders as labeled pills on the calendar.
CREATE TABLE campaign_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  date DATE NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- M:N — a campaign pulls sessions from one or more CR events.
CREATE TABLE campaign_linked_events (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  cr_event_id UUID NOT NULL REFERENCES cr_events(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, cr_event_id)
);

-- Per-org content theme list. Called "Pillar" in The Jar's vocabulary.
CREATE TABLE content_pillars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-org channel instances. Multiple instances of a channel type allowed
-- (e.g., two Facebook Groups). Channel types + their canonical formats live
-- in code; this table is the org's enabled subset.
CREATE TABLE content_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,        -- 'instagram' | 'facebook_page' | 'facebook_group' | 'tiktok' | 'courtreserve' | 'in_clubhouse' | 'other'
  name TEXT NOT NULL,                -- "Instagram" or "Facebook Group: Members-only"
  url TEXT,                          -- profile / page / group URL (null for in_clubhouse and courtreserve)
  enabled_formats TEXT[] NOT NULL,   -- subset of catalog's formats for this type
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-org audience list. Multi-select per content piece.
CREATE TABLE content_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Groups sibling content records created from one planning batch.
-- Enables "4 siblings" badge and copy-sync prompt.
CREATE TABLE content_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Extensions to existing `content_calendar`

```sql
ALTER TABLE content_calendar
  ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN pillar_id UUID REFERENCES content_pillars(id) ON DELETE SET NULL,
  ADD COLUMN channel_id UUID REFERENCES content_channels(id) ON DELETE SET NULL,
  ADD COLUMN format TEXT,                       -- 'post' | 'story' | 'reel' | 'live' | 'event' | 'text_only' | 'email' | 'bulk_text' | 'push' | 'global_announcement' | 'flyer' | 'digital_display' | 'poster'
  ADD COLUMN audience_ids UUID[] DEFAULT '{}',  -- multi-select FK to content_audiences
  ADD COLUMN copy TEXT,                         -- post copy/body/hook/asset prompt all in one
  ADD COLUMN asset_url TEXT,                    -- supabase storage path or external link
  ADD COLUMN asset_type TEXT,                   -- 'image' | 'video' | 'link'
  ADD COLUMN posted_url TEXT,                   -- live URL after posting
  ADD COLUMN batch_id UUID REFERENCES content_batches(id) ON DELETE SET NULL,
  ADD COLUMN blocked_by TEXT,                   -- 'geneva' | 'sami' | 'travis' | 'maddie' | 'external' | null
  ADD COLUMN whats_needed TEXT,
  ADD COLUMN effort_comment TEXT;

-- Replace status enum with the workflow Maddie's tracker uses.
ALTER TABLE content_calendar DROP CONSTRAINT content_calendar_status_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
  CHECK (status IN ('idea_need_info', 'idea_ready', 'drafting',
                    'awaiting_approval', 'scheduled_posted', 'skipped'));

-- Reuse existing columns:
-- - `assigned_to` (already FK to profiles) — this is "Owner" in the UI. No new owner_id column.
-- - `notes` — keeps its current meaning (internal team notes about the post).
-- - `description` — DEPRECATED. Current UI uses it ambiguously as both notes and copy.
--   New UI writes to `copy` (post text) and `notes` (internal). Description is left in the
--   schema for back-compat but not read/written by new code. A future cleanup migration
--   may drop it.
--
-- The legacy `platform` enum + `content_type` enum are also deprecated. We do NOT
-- drop them — the channel_id + format columns are now authoritative. UI stops
-- reading the old enums on day one; migration 021 backfills channel_id from
-- platform where possible (instagram → IG channel instance, facebook → FB Page, etc.).
```

### Channel catalog (code-level)

Lives in `src/lib/content-channels.ts`, not in the DB. Seeds `content_channels` for new orgs and validates `enabled_formats`.

```ts
export const CHANNEL_CATALOG = {
  instagram: {
    label: 'Instagram',
    supports_multi_instance: false,
    formats: ['post', 'story', 'reel', 'live'],
  },
  facebook_page: {
    label: 'Facebook Page',
    supports_multi_instance: false,
    formats: ['post', 'story', 'reel', 'live', 'event'],
  },
  facebook_group: {
    label: 'Facebook Group',
    supports_multi_instance: true,
    formats: ['post', 'text_only', 'live'],
  },
  courtreserve: {
    label: 'CourtReserve',
    supports_multi_instance: false,
    formats: ['email', 'bulk_text', 'push', 'global_announcement'],
  },
  in_clubhouse: {
    label: 'In Clubhouse',
    supports_multi_instance: false,
    formats: ['flyer', 'digital_display', 'poster'],
  },
  tiktok: {
    label: 'TikTok',
    supports_multi_instance: false,
    formats: ['post', 'story', 'live'],
  },
  other: {
    label: 'Other / Custom',
    supports_multi_instance: true,
    formats: [],   // configurable per-instance
  },
}
```

### Format definitions (shipped with the app, surfaced as tooltips in Settings)

| Format | Definition |
|---|---|
| post | Grid/Page post. Image, carousel, or short video — chosen at build time, not planning. |
| story | Vertical, 24-hour ephemeral content. |
| reel | Vertical short-form video. Distinct from story (not ephemeral) and feed post. |
| live | Real-time broadcast. |
| event | Facebook Event entity with RSVP/ticketing. |
| text_only | No media, copy only. Discussion-style. |
| email | Long-form newsletter via CourtReserve. |
| bulk_text | SMS to opted-in members via CourtReserve. |
| push | Mobile app push via CourtReserve. |
| global_announcement | Banner inside the CR portal. |
| flyer | Printed handout, 8.5×11 or half-page. |
| digital_display | Smart-TV rotation in the clubhouse. |
| poster | One-off larger printed sign. |

### Pillars, Audiences — seeded for The Jar from `The_Jar_Social_Tracker.pdf`

**Pillars (5):** Community, Programming, Education, Tech, Differentiator. Definitions from the tracker PDF.

**Audiences (8):** Members, Daily players, Non-members, Beginners, LTP grads, Competitive players, Corporate / event leads, Family.

Both per-org, both re-orderable and additive in Settings. Other clubs will pick their own.

### Status workflow

```
idea_need_info  ──► idea_ready  ──► drafting  ──► awaiting_approval  ──► scheduled_posted
                                                                              │
                                                                              ▼
                                                                          (auto-derived
                                                                           "Scheduled" or
                                                                           "Posted" badge
                                                                           from date)
                                                          ◄── skipped (any stage can be skipped)
```

`blocked_by` and `whats_needed` are required when `status = 'idea_need_info'`. Other states clear them.

The "Scheduled" vs "Posted" distinction in the UI is derived: `status = 'scheduled_posted' AND scheduled_date >= today` → "Scheduled"; `status = 'scheduled_posted' AND scheduled_date < today` → "Posted". No background job needed.

### Derivation rules

1. `cr_events` + `cr_event_sessions` are READ-ONLY mirrors. The sync writes them; users never edit. UI displays them but cannot create or modify.
2. `campaigns` are user-authored. A campaign can exist with no CR link (member drive, holiday push) or one or many CR links.
3. `content_calendar` rows can be standalone (`campaign_id = null`) OR campaign-bound. Standalone content is not forced into a campaign.
4. `batch_id` groups sibling records created from one planning entry. Each sibling is independently editable. The sibling-count and copy-sync prompt UI reads from `batch_id`.

---

## Sync strategy

- **Cadence:** add a nightly cron at the Vercel project level that calls `/api/sync/courtreserve` (already authenticated as the org's saved credentials). Plus the existing manual "Sync Now" button in Settings.
- **Window:** rolling 31-day forward + 31-day backward window for event registrations. Walked in 31-day chunks to respect the API limit. Sessions outside that window are not refreshed but remain in the DB unless manually purged.
- **Aggregation:** the sync builds `cr_events` + `cr_event_sessions` from the registration stream:
  - Unique `EventId` rows → upsert into `cr_events`
  - Unique `EventDateId` rows with `StartTime`/`EndTime` → upsert into `cr_event_sessions` with `registration_count` aggregated from the same-key rows
- **Failure handling:** logged in `cr_sync_log` (already exists). Sync errors visible in Settings → Integrations.

---

## UI surface

### Routes

```
/calendar              — master unified calendar (replaces /content)
/calendar/campaigns    — campaign list (with status + post count + linked events)
/calendar/campaigns/[id]  — campaign detail (fields + milestones + linked events + embedded child view)
/calendar/campaigns/new   — campaign create form
/calendar/plan         — content planning flow (multi-channel form + fan-out preview)
/calendar/content/[id] — single content piece detail (post-fan-out)
/settings/content/pillars     — manage org's pillar list
/settings/content/channels    — manage channel instances + format prune
/settings/content/audiences   — manage audience list
```

The legacy `/content` route 301-redirects to `/calendar` for backward compat for one release.

### Master calendar

- **Default view:** layered month. All three item types (CR sessions, campaign milestones, content pieces) share each day cell, color-coded by their campaign (or a fallback gray for standalone content / orange for unlinked CR sessions / yellow for milestones).
- **Filter chips at top:** All · Events · Content · Milestones · plus one chip per campaign for focused view.
- **Week view:** layered/swimlane toggle. Layered matches the month; swimlane stacks events/milestones/content in separate horizontal lanes per day. Defaults to layered.
- **No emojis** — color squares + plain labels. Channel-color square + format text on each content pill.

### Campaign detail

- **Fields panel (top):** name, description, color, status, goal, start_date, end_date, post_goal.
- **Milestones section:** 0..N rows of (label, date). Add / edit / delete inline. Renders on the master calendar as labeled pills.
- **Linked CR events section:** chip list. "+ Link CR event" opens a picker over `cr_events` table scoped to the org, searchable by name + category. Multiple events supported.
- **Sessions (auto):** sessions pulled from all linked CR events, in chronological order, with registration counts.
- **Embedded child view:** Month / Week / List tabs scoped to *this campaign's* items only (milestones + linked sessions + content). Same component as the master calendar, scoped.
- **+ Add content:** opens the Plan flow with this campaign pre-selected.

### Planning flow (Maddie's 5-minute form)

Single form. All fields visible on one screen. Most are picklist chips.

1. **Title** (required) — internal name, "Summer Kids Camp" not the post title.
2. **Campaign** — searchable dropdown over org's campaigns. Includes "None (standalone content)" and "✨ + Create new campaign…" (inline mini-form).
3. **Date** (required) — single date for all siblings. Time optional per-record.
4. **Pillar** (required) — single-select chip row from org's pillars.
5. **Audiences** — multi-select chip row from org's audiences.
6. **Distribution** (required) — channel→format tree. Each enabled channel is a collapsible group; user expands and checks formats. Each (channel, format) = one Content record. The selection count + sibling preview render at the bottom of the tree.
7. **Copy** — single large textarea. Holds hooks / body / asset prompt / CTA / subject lines. Markdown supported.
8. **Asset** — single auto-detect zone. Paste image from clipboard → uploads to Supabase Storage. Paste URL → stores as link. Drag file → upload. Click → file picker. Same asset shared by all siblings at fan-out, editable per-record after.
9. **Stage** — default `idea_ready`. Picklist.
10. **Owner** — default Maddie (or whoever's logged in if they have the social role). Picklist. Writes to existing `assigned_to` column.
11. **Blocked by + What's needed** — conditional fields that appear only when Stage = `idea_need_info`.

**Submit:** "Create N Content records." Server inserts N rows in `content_calendar`, all sharing one `batch_id`. UI navigates to the new master calendar with the new pills visible.

### Content piece detail (post-fan-out)

- All the planning fields above, editable per-record.
- **Sibling section:** if `batch_id` is set, shows "🔗 N siblings" with links to each. Clicking jumps to that sibling.
- **Copy sync prompt:** editing the Copy field shows "Sync to N siblings?" with default = No. Users opt-in to propagate.
- **Effort comment + Posted URL** at the bottom for post-mortem entry.

---

## Settings UI

### `/settings/content/channels`

- Standard catalog renders as enable/disable rows.
- Per enabled channel: URL field (one or many for `supports_multi_instance: true`), format prune checklist with tooltips.
- "Onboarding ask" — surface this page as the first content-related step in new-org onboarding. Defaults: all off; admin flips on what they use.

### `/settings/content/pillars`

- List with name + description + color + reorder handles.
- Add / edit / archive. Seeded for The Jar from the tracker PDF (Community, Programming, Education, Tech, Differentiator).

### `/settings/content/audiences`

- Same shape as pillars, simpler — just name + reorder.

---

## Migrations

Sequential, additive only. None drop tables or columns.

- `019_content_calendar_v2.sql` — creates `cr_events`, `cr_event_sessions`, `campaigns`, `campaign_milestones`, `campaign_linked_events`, `content_pillars`, `content_channels`, `content_audiences`, `content_batches`. Adds RLS policies scoped to `org_id` matching the existing pattern. Adds indexes.
- `020_content_calendar_extensions.sql` — `ALTER TABLE content_calendar` adds the new columns and the new status check constraint. Leaves the legacy `platform` + `content_type` enums in place but unused.
- `021_seed_the_jar_content_config.sql` — inserts The Jar's pillars, audiences, channel instances + format prune to match the tracker PDF + the v3 mockup.

---

## Out of scope for V1 (deferred)

- **Engagement metrics / audit column** — placeholder field reserved (`effort_comment`) but no metric capture. V2 task.
- **Multi-step approval workflow** — `awaiting_approval` is a status, not a workflow. Geneva approves verbally / out-of-band for now.
- **Posted URL auto-capture from platform APIs** — manual entry only.
- **Manual session add for non-CR events** — V1 surfaces only CR-derived sessions. Geneva-driven manual sessions wait.
- **Calendar annotations** (Holidays, Maintenance, Court closures) — these live in The Jar tracker's "Context" sheet. V1 punts; Geneva uses Campaign Milestones for org-wide markers ("Q1 Day to Day" campaign with milestones).
- **CR webhook** — CR doesn't expose webhooks; cron polling is the only mechanism.
- **Visual treatment difference between Milestone pills and CR session pills** — Spec says milestone = yellow flag pill, CR session = orange shift-style block. We tweak after Geneva uses it. Explicitly noted as build-and-iterate, not pre-locked.

## Explicit rejections

- **`reg_opens` / `reg_closes` as fixed campaign columns** — replaced by flexible Milestones. Sami's instinct that these don't fit campaigns like "Q1 Day to Day" was right.
- **Two parallel multi-selects for Channel + Format** — replaced by a channel→format tree where formats are scoped to their parent channel.
- **Three-mode asset picker (paste / upload / link as separate buttons)** — replaced by a single auto-detect zone.
- **Emojis as visual differentiation in the UI** — use color squares + plain text labels.
- **"Both" as a named format option** — handled implicitly by multi-select within a channel (pick Post + Story = "both").
- **Static / Carousel as planning-level distinctions** — these are build-time tactical decisions. Planning says "IG Post"; Maddie decides single vs. carousel when assets exist.
- **"Category" as the term for content theme** — The Jar's vocabulary is "Pillar."

---

## Open questions to resolve at build time

1. **Milestone vs. CR session visual treatment** — Sami flagged he wants to see it running before locking. Build with the spec defaults, iterate after Geneva uses it.
2. **Default campaign color picker** — should the UI auto-suggest from a curated palette, or freeform hex? Lean curated for V1.
3. **Sibling copy-sync prompt** — should it show a diff preview before propagating? V1 ships without diff (just "sync N siblings? yes/no"); add diff if it gets confusing.
4. **Cron failure notification** — if the nightly sync fails 2 days in a row, should we email Geneva? Probably yes. Out of V1 scope but noted.

---

## Recommended implementation phasing

This spec is intentionally larger than a single PR. The writing-plans skill should break it into roughly these phases, mergeable independently in this order:

1. **DB foundation + CR event sync** (migrations 019 + sync changes). Backend-only. New tables empty; no UI yet. Manual sync triggers `cr_events` + `cr_event_sessions` population.
2. **Settings → Content config** (migration 020 + 021 + the three /settings/content pages). Geneva can configure pillars, audiences, channel instances. Old `/content` route still works.
3. **Campaign CRUD** (campaign list, detail page, create form, milestone editor, CR event picker). Standalone — campaigns can exist without affecting content_calendar yet.
4. **Planning flow + fan-out** (the 5-min form, batch creation, sibling navigation). content_calendar gets the new columns. Old detail UI still works for legacy rows.
5. **Master calendar overhaul** (replace `/content` with `/calendar`, filter chips, campaign focus, layered month). 301 redirect from `/content`.
6. **Campaign embedded child view** (month/week/list toggle on campaign detail). Polish phase.

Each phase ships behind a feature flag or is fully additive so a partial merge can sit live without breaking the existing `/content` UI.

---

## Pilot test plan

When the implementation is ready, validate against The Jar's actual workflow:

1. **Settings flow** — Geneva configures pillars + audiences + channels (with two FB Group instances) in under 10 minutes.
2. **Campaign creation** — Geneva creates "Spring Leagues 2026" with two milestones and three linked CR events; sessions auto-populate.
3. **Planning flow** — Maddie plans the "Summer Kids Camp" entry in under 5 minutes; fan-out produces the expected sibling records.
4. **Calendar focus** — clicking the "Spring Leagues 2026" filter chip on the master calendar reveals only its sessions + milestones + content.
5. **CR sync** — overnight sync picks up a new CR event registration without manual intervention; the new session appears on tomorrow's calendar.
