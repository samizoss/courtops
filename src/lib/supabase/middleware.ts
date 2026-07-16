import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'courtops.app'

/**
 * Extract org slug from subdomain.
 * thepbjar.courtops.app → "thepbjar"
 * courtops.app → null
 * localhost:3000 → null (dev mode)
 */
export function getOrgSlug(request: NextRequest): string | null {
  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0] // strip port

  // Local dev: no subdomain resolution
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null
  }

  // Vercel preview deploys: treat like localhost (no subdomain)
  if (hostname.endsWith('.vercel.app')) {
    return null
  }

  // Check if it's a subdomain of ROOT_DOMAIN
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const slug = hostname.replace(`.${ROOT_DOMAIN}`, '')
    if (slug && slug !== 'www') return slug
  }

  return null
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse
  }

  // Resolve org slug from subdomain and pass via header
  const orgSlug = getOrgSlug(request)
  if (orgSlug) {
    request.headers.set('x-org-slug', orgSlug)
    supabaseResponse = NextResponse.next({ request })
    supabaseResponse.headers.set('x-org-slug', orgSlug)
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          if (orgSlug) {
            supabaseResponse.headers.set('x-org-slug', orgSlug)
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/invite') &&
    !request.nextUrl.pathname.startsWith('/api/invite') &&
    !request.nextUrl.pathname.startsWith('/forgot-password') &&
    !request.nextUrl.pathname.startsWith('/reset-password') &&
    !request.nextUrl.pathname.startsWith('/releases') &&
    !request.nextUrl.pathname.startsWith('/roadmap') &&
    !request.nextUrl.pathname.startsWith('/api/roadmap') &&
    // /api/weekly-digest/run is hit by Vercel Cron (Bearer CRON_SECRET, no
    // session cookie) — without this bypass, middleware redirects the cron's
    // request to /login before the route's own auth check ever runs. The
    // route itself still enforces auth (Bearer CRON_SECRET for GET, admin
    // session via getUserOrg() for POST); this only stops middleware from
    // pre-empting that with an HTML redirect. See PR for the same latent gap
    // affecting /api/cron/availability-reminders (out of scope here).
    !request.nextUrl.pathname.startsWith('/api/weekly-digest')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
