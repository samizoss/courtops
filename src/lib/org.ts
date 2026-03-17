import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Get the current org based on subdomain (from middleware header)
 * or fall back to the user's profile org.
 */
export async function getCurrentOrg() {
  const headerStore = await headers()
  const slug = headerStore.get('x-org-slug')

  const supabase = await createClient()

  // If we have a subdomain slug, look up the org
  if (slug) {
    const { data: org } = await supabase
      .from('orgs')
      .select('*')
      .eq('slug', slug)
      .single()

    return org
  }

  // Otherwise fall back to user's org via their profile
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, orgs(*)')
    .eq('id', user.id)
    .single()

  return (profile as unknown as { org_id: string; orgs: Record<string, unknown> })?.orgs ?? null
}
