-- 024: One-time correction of cr_event_sessions.start_time / end_time.
--
-- BUG: the CR sync route parsed Court Reserve's naive org-local wall-clock
-- strings ("2026-07-20T18:00:00", no offset) with `new Date(...)` on Vercel
-- (UTC), mislabeling wall-clock times as UTC. Stored values are therefore the
-- org-local wall clock stamped +00 — 5-6h earlier than the real instant
-- (verified in prod 2026-07-21: "LTP-Monday 6pm" stored as
-- 2026-07-27 18:00:00+00; the real instant is 23:00:00+00).
--
-- FIX: the stored value's UTC wall clock IS the org-local wall clock, so
-- re-interpret it in the org's timezone. Timezone is per-org (orgs.timezone,
-- edited via Settings -> General), so join orgs and coalesce to
-- 'America/Chicago' (the pilot org's zone).
--
-- ============================ SEQUENCING RULE ============================
-- APPLY EXACTLY ONCE, immediately AFTER the code fix (crWallClockToInstant
-- in the sync route) is deployed, and BEFORE any "Sync Now" runs against the
-- fixed code. Rows written by the fixed code already hold correct instants —
-- running this on them would DOUBLE-SHIFT them 5-6h late. If a sync has
-- already run on the fixed code, do not run this blindly: those rows were
-- upserted with correct times (the sync's rolling +/-31-day window rewrites
-- most rows, but historical rows outside the window would still be wrong —
-- reconcile by hand in that case).
-- Applied manually by the orchestrator via the Supabase Management API /
-- apply_migration — NOT auto-applied.
-- =========================================================================

update cr_event_sessions s
set
  start_time = (s.start_time at time zone 'UTC') at time zone coalesce(o.timezone, 'America/Chicago'),
  end_time   = (s.end_time   at time zone 'UTC') at time zone coalesce(o.timezone, 'America/Chicago')
from orgs o
where o.id = s.org_id;
