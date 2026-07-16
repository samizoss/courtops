import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — bypasses RLS entirely.
 *
 * Use ONLY from trusted server contexts (cron routes, server-triggered
 * writes) and ONLY where the target table's RLS genuinely requires it.
 * `weekly_digest_runs` (migration 023) intentionally ships with a SELECT-only
 * RLS policy — "No insert/update policies: writes go through server routes
 * (service role / route auth)" — so both the cron (no user session) and the
 * manual admin trigger (a real session, but still no INSERT grant on this
 * table) need this client to persist a run. Reads that should stay scoped to
 * the logged-in user's org (e.g. the /weekly-digest page) should keep using
 * the normal session-based `@/lib/supabase/server` client instead.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) — required to write weekly_digest_runs.')
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}
