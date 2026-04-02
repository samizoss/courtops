-- CourtOps Migration 002: Pipeline Rework + New Modules
-- Adds: pipelines, pipeline_stages, activities, cadence_rules, notifications,
--        org_invites, content_calendar, org_settings, cr_members, cr_sync_log
-- Alters: leads, sops, tasks, orgs

-- ============================================================
-- NEW TABLES
-- ============================================================

-- Pipeline types (LTP, Membership, Upgrade, Events)
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

-- Ordered stages within a pipeline
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  cadence_days INT,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pipeline_id, slug)
);

-- Activity timeline for leads (replaces touch_count)
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call', 'text', 'email', 'in_person', 'voicemail', 'note', 'status_change', 'system')),
  direction TEXT CHECK (direction IN ('outbound', 'inbound', 'internal')),
  outcome TEXT CHECK (outcome IN ('connected', 'voicemail', 'no_answer', 'booked', 'converted', 'not_interested', 'follow_up')),
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cadence rules per pipeline stage
CREATE TABLE cadence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  day_offset INT NOT NULL,
  touch_type TEXT NOT NULL CHECK (touch_type IN ('call', 'text', 'email', 'in_person')),
  script_key TEXT,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In-app notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('cadence_overdue', 'task_assigned', 'task_due', 'time_off_response', 'new_lead', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff invitations
CREATE TABLE org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'viewer')),
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Content calendar
CREATE TABLE content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL DEFAULT 'other' CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'email', 'other')),
  content_type TEXT NOT NULL DEFAULT 'post' CHECK (content_type IN ('post', 'story', 'reel', 'email', 'other')),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'draft', 'ready', 'posted', 'skipped')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  media_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-org settings
CREATE TABLE org_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES orgs(id) ON DELETE CASCADE,
  billing_plan TEXT NOT NULL DEFAULT 'free' CHECK (billing_plan IN ('free', 'pro', 'enterprise')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  features JSONB NOT NULL DEFAULT '{}',
  cr_api_user TEXT,
  cr_api_pass TEXT,
  cr_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  cr_last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Court Reserve member cache
CREATE TABLE cr_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  cr_member_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  membership_tier TEXT,
  cr_membership_type TEXT,
  membership_status TEXT DEFAULT 'Active',
  visit_count_6mo INT NOT NULL DEFAULT 0,
  last_visit_date DATE,
  monthly_spend NUMERIC(10,2),
  member_since DATE,
  city TEXT,
  state TEXT,
  upgrade_candidate BOOLEAN NOT NULL DEFAULT false,
  recommended_tier TEXT,
  projected_savings NUMERIC(10,2),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, cr_member_id)
);

-- Court Reserve sync log
CREATE TABLE cr_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  members_synced INT NOT NULL DEFAULT 0,
  members_created INT NOT NULL DEFAULT 0,
  members_updated INT NOT NULL DEFAULT 0,
  upgrade_candidates_found INT NOT NULL DEFAULT 0,
  leads_auto_created INT NOT NULL DEFAULT 0,
  error TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

-- Messaging config (per-org Twilio setup)
CREATE TABLE org_messaging_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES orgs(id) ON DELETE CASCADE,
  twilio_phone TEXT,
  twilio_subaccount_sid TEXT,
  monthly_cap_cents INT NOT NULL DEFAULT 2000,
  warn_threshold_pct INT NOT NULL DEFAULT 75,
  current_spend_cents INT NOT NULL DEFAULT 0,
  spend_month TEXT,
  paused BOOLEAN NOT NULL DEFAULT false,
  alert_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SMS messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  twilio_sid TEXT UNIQUE,
  status TEXT DEFAULT 'sent',
  cost_cents INT DEFAULT 1,
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ALTER EXISTING TABLES
-- ============================================================

-- leads: add pipeline fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_type TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cr_visit_count INT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cr_monthly_spend NUMERIC(10,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cr_membership_tier TEXT;

-- sops: add pipeline linking + version
ALTER TABLE sops ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL;
ALTER TABLE sops ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE sops ADD COLUMN IF NOT EXISTS tags TEXT[];

-- tasks: add lead linking + recurrence
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_rule TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- orgs: add SaaS fields
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise'));
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'active';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cr_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cr_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_messaging_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage org pipelines" ON pipelines
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org pipeline stages" ON pipeline_stages
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org activities" ON activities
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org cadence rules" ON cadence_rules
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage own notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users manage org invites" ON org_invites
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org content calendar" ON content_calendar
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org settings" ON org_settings
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org cr members" ON cr_members
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org cr sync log" ON cr_sync_log
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org messaging config" ON org_messaging_config
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users manage org messages" ON messages
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_pipelines_org ON pipelines(org_id);
CREATE INDEX idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
CREATE INDEX idx_activities_lead ON activities(lead_id);
CREATE INDEX idx_activities_org_created ON activities(org_id, created_at DESC);
CREATE INDEX idx_cadence_rules_pipeline ON cadence_rules(pipeline_id);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_org_invites_token ON org_invites(token);
CREATE INDEX idx_org_invites_email ON org_invites(email);
CREATE INDEX idx_content_calendar_org_date ON content_calendar(org_id, scheduled_date);
CREATE INDEX idx_cr_members_org ON cr_members(org_id);
CREATE INDEX idx_cr_members_upgrade ON cr_members(org_id) WHERE upgrade_candidate = true;
CREATE INDEX idx_leads_pipeline ON leads(pipeline_id);
CREATE INDEX idx_leads_stage ON leads(current_stage_id);
CREATE INDEX idx_tasks_lead ON tasks(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_messages_org ON messages(org_id);
CREATE INDEX idx_messages_lead ON messages(lead_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);

-- ============================================================
-- SEED DEFAULT PIPELINES FOR THE JAR
-- ============================================================

-- LTP Pipeline
INSERT INTO pipelines (org_id, name, slug, description, icon, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'LTP Leads', 'ltp', 'Learn to Play program leads from Syndicate ads', '🎾', 1);

INSERT INTO pipeline_stages (pipeline_id, org_id, name, slug, sort_order, cadence_days, is_terminal, color) VALUES
  ((SELECT id FROM pipelines WHERE slug = 'ltp' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'New', 'new', 1, NULL, false, 'blue'),
  ((SELECT id FROM pipelines WHERE slug = 'ltp' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Day 1 Contact', 'day-1-contact', 2, 1, false, 'yellow'),
  ((SELECT id FROM pipelines WHERE slug = 'ltp' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Day 3 Follow-up', 'day-3-followup', 3, 3, false, 'orange'),
  ((SELECT id FROM pipelines WHERE slug = 'ltp' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Day 7 Final', 'day-7-final', 4, 7, false, 'red'),
  ((SELECT id FROM pipelines WHERE slug = 'ltp' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Class Booked', 'class-booked', 5, NULL, false, 'purple'),
  ((SELECT id FROM pipelines WHERE slug = 'ltp' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Attended', 'attended', 6, NULL, false, 'teal'),
  ((SELECT id FROM pipelines WHERE slug = 'ltp' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Converted', 'converted', 7, NULL, true, 'green'),
  ((SELECT id FROM pipelines WHERE slug = 'ltp' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Lost', 'lost', 8, NULL, true, 'gray');

-- Membership Pipeline
INSERT INTO pipelines (org_id, name, slug, description, icon, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'New Membership Leads', 'membership', 'Membership interest leads from Syndicate ads', '🏠', 2);

INSERT INTO pipeline_stages (pipeline_id, org_id, name, slug, sort_order, cadence_days, is_terminal, color) VALUES
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'New', 'new', 1, NULL, false, 'blue'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Day 1 Call', 'day-1-call', 2, 1, false, 'yellow'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Day 2 Text', 'day-2-text', 3, 2, false, 'orange'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Day 5 Call', 'day-5-call', 4, 5, false, 'orange'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Day 10 Final', 'day-10-final', 5, 10, false, 'red'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Tour Booked', 'tour-booked', 6, NULL, false, 'purple'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Tour Completed', 'tour-completed', 7, NULL, false, 'purple'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Trial Active', 'trial-active', 8, NULL, false, 'teal'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Converted', 'converted', 9, NULL, true, 'green'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Nurturing', 'nurturing', 10, NULL, false, 'gray'),
  ((SELECT id FROM pipelines WHERE slug = 'membership' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Lost', 'lost', 11, NULL, true, 'gray');

-- Upgrade Pipeline
INSERT INTO pipelines (org_id, name, slug, description, icon, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Daily Player Upgrades', 'upgrade', 'Daily Players who should upgrade to membership', '📈', 3);

INSERT INTO pipeline_stages (pipeline_id, org_id, name, slug, sort_order, cadence_days, is_terminal, color) VALUES
  ((SELECT id FROM pipelines WHERE slug = 'upgrade' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Identified', 'identified', 1, NULL, false, 'blue'),
  ((SELECT id FROM pipelines WHERE slug = 'upgrade' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Research', 'research', 2, 1, false, 'yellow'),
  ((SELECT id FROM pipelines WHERE slug = 'upgrade' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Outreach', 'outreach', 3, 3, false, 'orange'),
  ((SELECT id FROM pipelines WHERE slug = 'upgrade' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Interested', 'interested', 4, NULL, false, 'purple'),
  ((SELECT id FROM pipelines WHERE slug = 'upgrade' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Trial Offered', 'trial-offered', 5, NULL, false, 'teal'),
  ((SELECT id FROM pipelines WHERE slug = 'upgrade' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Converted', 'converted', 6, NULL, true, 'green'),
  ((SELECT id FROM pipelines WHERE slug = 'upgrade' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Not Now', 'not-now', 7, NULL, false, 'gray'),
  ((SELECT id FROM pipelines WHERE slug = 'upgrade' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Declined', 'declined', 8, NULL, true, 'gray');

-- Private Events Pipeline
INSERT INTO pipelines (org_id, name, slug, description, icon, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Private Events', 'events', 'Birthday parties, corporate events, group bookings', '🎉', 4);

INSERT INTO pipeline_stages (pipeline_id, org_id, name, slug, sort_order, cadence_days, is_terminal, color) VALUES
  ((SELECT id FROM pipelines WHERE slug = 'events' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Inquiry', 'inquiry', 1, NULL, false, 'blue'),
  ((SELECT id FROM pipelines WHERE slug = 'events' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Quoted', 'quoted', 2, 1, false, 'yellow'),
  ((SELECT id FROM pipelines WHERE slug = 'events' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Follow-up', 'follow-up', 3, 3, false, 'orange'),
  ((SELECT id FROM pipelines WHERE slug = 'events' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Booked', 'booked', 4, NULL, false, 'purple'),
  ((SELECT id FROM pipelines WHERE slug = 'events' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Confirmed', 'confirmed', 5, NULL, false, 'teal'),
  ((SELECT id FROM pipelines WHERE slug = 'events' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Completed', 'completed', 6, NULL, true, 'green'),
  ((SELECT id FROM pipelines WHERE slug = 'events' AND org_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001', 'Lost', 'lost', 7, NULL, true, 'gray');

-- Seed org_settings for The Jar
INSERT INTO org_settings (org_id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT (org_id) DO NOTHING;
