-- Migration 020 — Content Calendar v2 foundation (Phase 1 of the 2026-06-09
-- content-calendar/campaigns/CR-integration spec; spec called this 019 but 019
-- was taken by the audit-FK fix).
--
-- Creates the 9 new tables only. NO changes to the existing content_calendar
-- table (those come in a later phase). Additive and invisible to the current
-- /content UI.
--
-- Write access:
--  - cr_events / cr_event_sessions are READ-ONLY mirrors populated by the CR
--    sync (which runs as an admin) — org members read, admins write.
--  - User-authored tables (campaigns, milestones, links, pillars, channels,
--    audiences, batches) are writable by any org member: content planning is
--    done by social-media staff (Maddie, role 'staff'), not just admins.

-- ── CR mirrors ──────────────────────────────────────────────────────────

-- One row per CR EventId (the series/template). Derived from registration
-- sync; never written by users.
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

-- ── User-authored planning tables ───────────────────────────────────────

-- Planning container.
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

-- Flexible date anchors per campaign. Replaces rigid reg_opens/reg_closes
-- columns. A campaign has 0..N milestones; renders as labeled calendar pills.
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
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
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
-- (e.g., two Facebook Groups). Channel types + canonical formats live in
-- code (src/lib/content-channels.ts); this table is the org's enabled subset.
CREATE TABLE content_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  enabled_formats TEXT[] NOT NULL,
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

-- Groups sibling content records created from one planning batch. Enables
-- the "N siblings" badge and copy-sync prompt.
CREATE TABLE content_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX idx_cr_events_org ON cr_events(org_id);
CREATE INDEX idx_cr_event_sessions_org ON cr_event_sessions(org_id);
CREATE INDEX idx_cr_event_sessions_event ON cr_event_sessions(cr_event_id);
CREATE INDEX idx_cr_event_sessions_start ON cr_event_sessions(org_id, start_time);
CREATE INDEX idx_campaigns_org ON campaigns(org_id);
CREATE INDEX idx_campaign_milestones_campaign ON campaign_milestones(campaign_id);
CREATE INDEX idx_campaign_milestones_org_date ON campaign_milestones(org_id, date);
CREATE INDEX idx_campaign_linked_events_org ON campaign_linked_events(org_id);
CREATE INDEX idx_content_pillars_org ON content_pillars(org_id);
CREATE INDEX idx_content_channels_org ON content_channels(org_id);
CREATE INDEX idx_content_audiences_org ON content_audiences(org_id);
CREATE INDEX idx_content_batches_org ON content_batches(org_id);

-- ── RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE cr_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cr_event_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_linked_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_batches ENABLE ROW LEVEL SECURITY;

-- CR mirrors: org members read, admins write (sync runs as an admin).
CREATE POLICY "Users see org cr events" ON cr_events FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins manage cr events" ON cr_events FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

CREATE POLICY "Users see org cr event sessions" ON cr_event_sessions FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Admins manage cr event sessions" ON cr_event_sessions FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')));

-- User-authored planning tables: any org member reads + writes (content
-- planning is a staff-role job, matching content_calendar's access model).
CREATE POLICY "Org members read campaigns" ON campaigns FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Org members manage campaigns" ON campaigns FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members read campaign milestones" ON campaign_milestones FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Org members manage campaign milestones" ON campaign_milestones FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members read campaign linked events" ON campaign_linked_events FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Org members manage campaign linked events" ON campaign_linked_events FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members read content pillars" ON content_pillars FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Org members manage content pillars" ON content_pillars FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members read content channels" ON content_channels FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Org members manage content channels" ON content_channels FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members read content audiences" ON content_audiences FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Org members manage content audiences" ON content_audiences FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members read content batches" ON content_batches FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Org members manage content batches" ON content_batches FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE cr_events IS
  'Court Reserve event series (EventId level), mirrored by /api/sync/courtreserve from the registration report. Read-only for users.';
COMMENT ON TABLE cr_event_sessions IS
  'Court Reserve event occurrences (EventDateId level) with registration counts. Read-only for users.';
