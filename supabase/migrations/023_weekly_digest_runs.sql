-- 023: weekly digest run history (latest run per org drives /weekly-digest page)
create table weekly_digest_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
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
