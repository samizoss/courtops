# Content v2 Phase 4 — Planning Flow + Fan-out (Implementation Plan)

**Status:** PREPPED, NOT BUILT. Written 2026-07-02 (late night pre-meeting) so Phase 4 can ship within a day of Geneva/Maddie's feedback.
**Prereqs live:** Phases 1–3 (PRs #48/#50/#53) — CR event sync, Settings → Content config, Campaigns.
**Spec:** `docs/superpowers/specs/2026-06-09-content-calendar-campaigns-cr-integration-design.md` §§ Planning flow, Content piece detail, Extensions to content_calendar, Status workflow.

---

## Why this phase is different from 1–3 (read before building)

1. It contains the night's-first **non-additive migration**: the `content_calendar` status CHECK constraint is *replaced* and existing rows must be remapped.
2. The current `/content` UI writes legacy statuses — it **breaks the moment the migration applies** unless patched in the same deploy. PR 1 below bundles them.
3. The form design should absorb the 7/2 meeting feedback (Maddie's reactions + channel config) before build. Update the "Feedback to fold in" section first.

---

## Migration 022 — content_calendar extensions (DRAFT — do NOT apply until PR 1 is ready to deploy)

```sql
-- 022_content_calendar_extensions.sql
-- Phase 4 of content v2. NON-ADDITIVE: replaces the status CHECK and remaps
-- existing rows. Must deploy in the same release as the /content status patch.

ALTER TABLE content_calendar
  ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN pillar_id UUID REFERENCES content_pillars(id) ON DELETE SET NULL,
  ADD COLUMN channel_id UUID REFERENCES content_channels(id) ON DELETE SET NULL,
  ADD COLUMN format TEXT,
  ADD COLUMN audience_ids UUID[] DEFAULT '{}',
  ADD COLUMN copy TEXT,
  ADD COLUMN asset_url TEXT,
  ADD COLUMN asset_type TEXT CHECK (asset_type IN ('image', 'video', 'link') OR asset_type IS NULL),
  ADD COLUMN posted_url TEXT,
  ADD COLUMN batch_id UUID REFERENCES content_batches(id) ON DELETE SET NULL,
  ADD COLUMN blocked_by TEXT CHECK (blocked_by IN ('geneva', 'sami', 'travis', 'maddie', 'external') OR blocked_by IS NULL),
  ADD COLUMN whats_needed TEXT,
  ADD COLUMN effort_comment TEXT;

-- Remap legacy statuses BEFORE swapping the constraint.
-- planned  -> idea_ready        (was: intended, not started)
-- draft    -> drafting          (direct)
-- ready    -> awaiting_approval (closest pre-publish state; see Decision D1)
-- posted   -> scheduled_posted  (Scheduled vs Posted badge is date-derived)
-- skipped  -> skipped           (direct)
UPDATE content_calendar SET status = CASE status
  WHEN 'planned' THEN 'idea_ready'
  WHEN 'draft'   THEN 'drafting'
  WHEN 'ready'   THEN 'awaiting_approval'
  WHEN 'posted'  THEN 'scheduled_posted'
  ELSE 'skipped'
END;

ALTER TABLE content_calendar DROP CONSTRAINT content_calendar_status_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
  CHECK (status IN ('idea_need_info', 'idea_ready', 'drafting',
                    'awaiting_approval', 'scheduled_posted', 'skipped'));
ALTER TABLE content_calendar ALTER COLUMN status SET DEFAULT 'idea_ready';

CREATE INDEX idx_content_calendar_campaign ON content_calendar(campaign_id);
CREATE INDEX idx_content_calendar_batch ON content_calendar(batch_id);
```

Notes:
- `platform` + `content_type` legacy enums stay (unused by new code, back-compat). `description` deprecated — new code writes `copy` (post text) + `notes` (internal).
- **Channel backfill from `platform`** (spec's migration idea): do NOT bake into 022 — The Jar had zero channel instances until Geneva's homework. Run as a one-off script AFTER channels are configured: `UPDATE content_calendar cc SET channel_id = ch.id FROM content_channels ch WHERE cc.channel_id IS NULL AND ch.org_id = cc.org_id AND ch.is_active AND ch.channel_type = CASE cc.platform WHEN 'instagram' THEN 'instagram' WHEN 'facebook' THEN 'facebook_page' WHEN 'tiktok' THEN 'tiktok' WHEN 'email' THEN 'courtreserve' ELSE 'other' END` — only where exactly one instance of that type exists.

## Storage — asset uploads

- New Supabase Storage bucket `content-assets` (mirror the `sop-images` bucket setup: public read, authenticated org-scoped write path `orgId/...`). Check `sop-images` policies via dashboard/Management API and copy the pattern.
- Client: single auto-detect zone (spec § Planning flow #8): paste image → upload; paste URL → `asset_type='link'`; drag/drop file → upload; click → file picker. Image/video by MIME.

---

## PR plan (three PRs, each independently deployable)

### PR 1 — Migration + legacy-UI compatibility (small, ships first)
- Apply 022 (remap + constraint) via Management API (Node script — never PowerShell for UTF-8).
- Patch `src/app/(dashboard)/content/content-calendar.tsx`:
  - statuses array (line ~42) → the six new values w/ labels+colors: Idea – need info (red), Idea ready (gray), Drafting (yellow), Awaiting approval (purple), Scheduled/Posted (green), Skipped (dim). "Scheduled" vs "Posted" badge derived: `status='scheduled_posted' && scheduled_date >= today ? 'Scheduled' : 'Posted'`.
  - default insert status `'idea_ready'` (line ~116).
- Update `src/types/database.ts` content_calendar row type with the new columns.
- Verify: old page loads, status changes save, existing rows show remapped statuses.

### PR 2 — Planning flow + fan-out (`/calendar/plan`)
- Server page: fetch org campaigns (planning/active), pillars (active), audiences (active), channel instances (active) + catalog.
- Form (single screen, spec § Planning flow — all 11 fields):
  1. Title (required, internal name)
  2. Campaign — searchable select + "None (standalone)" + inline "+ Create new campaign" mini-form (name/color/start only)
  3. Date (required; one date for all siblings; optional per-record time later)
  4. Pillar (required) — single-select chip row
  5. Audiences — multi-select chip row
  6. **Distribution (required)** — channel→format tree from org's `content_channels` × `allowedFormats()`: collapsible group per enabled instance, checkbox per format, selection counter + sibling preview list at the tree's foot. Each checked (channel instance, format) = one content_calendar row.
  7. Copy — one large textarea (hooks/body/CTA together, markdown OK)
  8. Asset — auto-detect zone (shared by all siblings at fan-out)
  9. Stage — default `idea_ready`
  10. Owner — default current user; writes to existing `assigned_to`
  11. Blocked by + What's needed — conditional, only when stage = `idea_need_info`
- Submit: insert 1 `content_batches` row → insert N `content_calendar` rows sharing `batch_id` (single `.insert([...])` array call + `.select()` count check; if rows < N, toast partial-failure warning). Navigate to `/content` (until Phase 5's `/calendar` exists).
- Entry points: "Plan content" button on `/content` header + "+ Add content" button on campaign detail (pre-selects that campaign — the button Phase 3 deliberately omitted).

### PR 3 — Content piece detail (`/calendar/content/[id]`)
- All planning fields editable per-record; conditional blocked_by/whats_needed; posted_url + effort_comment at the bottom.
- Sibling strip when `batch_id` set: "N siblings" + links (fetch same-batch rows).
- Copy-sync prompt: on saving an edited `copy`, if siblings exist → confirm "Sync copy to N siblings?" default NO; yes → update copy on sibling ids (`.select()` count check). No diff preview in v1 (spec open question #3).
- Make `/content` pills click through to this page for rows that have the new columns (legacy rows keep the old inline editor until Phase 5).

---

## Decisions made in this plan (revisit only if meeting contradicts)

- **D1**: legacy `ready` → `awaiting_approval` (not `scheduled_posted` — "ready" ≠ scheduled). If Geneva treats old "Ready" as "scheduled", flip the mapping before applying.
- **D2**: channel backfill is a post-config one-off script, not part of 022.
- **D3**: fan-out navigates to `/content` for now; Phase 5 changes it to `/calendar`.
- **D4**: no per-sibling time field in the form v1 (edit per-record after fan-out).

## Feedback to fold in from the 7/2 meeting (fill this in before building)

- [ ] Maddie's reaction to the form field list — anything missing/unnecessary?
- [ ] Channel instances Geneva/Maddie actually enabled (Distribution tree needs ≥1 to function — form should show a "configure channels first" empty state pointing to Settings → Content → Channels)
- [ ] Pillar descriptions filled in? (tooltips on the pillar chips can show them)
- [ ] Blocked-by names: spec hardcodes geneva/sami/travis/maddie/external — confirm, or switch to org profiles picklist (better multi-club; slightly bigger lift)
- [ ] Phase 4 green-lit at all, or punch-list items outrank it?

## Test plan (from spec § Pilot)

1. Maddie plans "Summer Kids Camp" in <5 min; fan-out produces the expected sibling records with one batch_id.
2. Legacy rows: status remap visually correct on /content; status buttons still save.
3. Copy-sync: edit one sibling's copy → prompt → yes → all siblings updated; no → only the one.
4. Viewer: /calendar/plan redirects (same gate as campaigns/new); content detail read-only.
5. Asset zone: paste image, paste URL, drag file — all three paths land correctly and render on the detail page.
