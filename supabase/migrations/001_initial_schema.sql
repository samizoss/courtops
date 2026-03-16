-- CourtOps Multi-Tenant Schema
-- Every table has org_id for multi-tenancy

-- Organizations (each club is an org)
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  timezone text not null default 'America/Chicago',
  courtreserve_org_id text,
  created_at timestamptz not null default now()
);

-- User profiles (linked to Supabase Auth)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  org_id uuid not null references orgs on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff', 'viewer')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Checklist templates (reusable, e.g. "Opening Checklist")
create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  name text not null,
  shift text not null check (shift in ('opening', 'midday', 'closing', 'custom')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Checklist items within a template
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates on delete cascade,
  org_id uuid not null references orgs on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Daily checklist completions (one per item per day)
create table checklist_completions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references checklist_items on delete cascade,
  org_id uuid not null references orgs on delete cascade,
  completed_by uuid references profiles on delete set null,
  completed_date date not null default current_date,
  completed_at timestamptz not null default now(),
  notes text,
  unique (item_id, completed_date)
);

-- Sales leads / pipeline
create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  name text not null,
  email text,
  phone text,
  source text not null default 'walk-in' check (source in ('syndicate-ltp', 'syndicate-general', 'walk-in', 'referral', 'website', 'other')),
  campaign text,
  status text not null default 'new' check (status in ('new', 'contacted', 'follow-up', 'trial-booked', 'converted', 'lost', 'nurturing', 'archived')),
  assigned_to uuid references profiles on delete set null,
  next_action_date date,
  last_contact_date date,
  touch_count int not null default 0,
  converted boolean not null default false,
  conversion_date date,
  membership_type text,
  courtreserve_member_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SOPs / wiki pages
create table sops (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  title text not null,
  category text not null default 'general' check (category in ('operations', 'front-desk', 'sales', 'content', 'emergency', 'equipment', 'general')),
  content text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_by uuid references profiles on delete set null,
  updated_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  task_type text not null default 'admin' check (task_type in ('admin', 'content', 'janitorial', 'sales', 'events', 'facility', 'inventory', 'other')),
  assigned_to uuid references profiles on delete set null,
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table orgs enable row level security;
alter table profiles enable row level security;
alter table checklist_templates enable row level security;
alter table checklist_items enable row level security;
alter table checklist_completions enable row level security;
alter table leads enable row level security;
alter table sops enable row level security;
alter table tasks enable row level security;

-- RLS Policies: users can only access data in their org
create policy "Users see own org" on orgs
  for select using (id in (select org_id from profiles where id = auth.uid()));

create policy "Users see org profiles" on profiles
  for select using (org_id in (select org_id from profiles where id = auth.uid()));

create policy "Users see org checklist templates" on checklist_templates
  for all using (org_id in (select org_id from profiles where id = auth.uid()));

create policy "Users see org checklist items" on checklist_items
  for all using (org_id in (select org_id from profiles where id = auth.uid()));

create policy "Users manage org checklist completions" on checklist_completions
  for all using (org_id in (select org_id from profiles where id = auth.uid()));

create policy "Users manage org leads" on leads
  for all using (org_id in (select org_id from profiles where id = auth.uid()));

create policy "Users see org sops" on sops
  for all using (org_id in (select org_id from profiles where id = auth.uid()));

create policy "Users manage org tasks" on tasks
  for all using (org_id in (select org_id from profiles where id = auth.uid()));

-- Indexes for performance
create index idx_profiles_org on profiles(org_id);
create index idx_checklist_templates_org on checklist_templates(org_id);
create index idx_checklist_items_template on checklist_items(template_id);
create index idx_checklist_completions_date on checklist_completions(completed_date);
create index idx_leads_org_status on leads(org_id, status);
create index idx_leads_next_action on leads(next_action_date) where status not in ('converted', 'lost', 'archived');
create index idx_tasks_org_status on tasks(org_id, status);
create index idx_tasks_assigned on tasks(assigned_to) where status != 'done';
create index idx_sops_org_category on sops(org_id, category);
