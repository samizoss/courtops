'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

// Visibility per role.
//   owner  = CourtOps platform (Sami + future devs) — sees everything across orgs.
//   admin  = club admins (e.g. Geneva @ The Jar) — full edit access in their org.
//   viewer = read-only "co-owner" / observer (e.g. Travis + Kevin @ The Jar) —
//            sees what an admin sees but can't edit. Sidebar mirrors admin nav;
//            edit affordances on each page hide for viewer specifically.
//   staff  = day-to-day staff — clock, checklists, SOPs, schedule.
//
// 2026-05-05 — Sami trimmed admin/viewer/staff visibility for Tasks, Pipeline,
// Content, Messages, Guide, Notifications. These remain only on owner (Sami's
// dev view) until each module is production-ready. URLs still resolve if typed
// directly; only the sidebar entry is gated. Restore by adding 'admin' (and
// 'viewer'/'staff' as appropriate) back to the roles array when the module
// reopens to clubs.
const nav = [
  { href: '/', label: 'Dashboard', icon: '⊞', roles: ['owner', 'admin', 'staff', 'viewer'] },
  { href: '/checklists', label: 'Checklists', icon: '☑', roles: ['owner', 'admin', 'staff', 'viewer'] },
  { href: '/staff', label: 'Staff', icon: '◇', roles: ['owner', 'admin', 'staff', 'viewer'] },
  { href: '/sops', label: 'SOPs', icon: '◉', roles: ['owner', 'admin', 'staff', 'viewer'] },
  { href: '/pipeline', label: 'Pipeline', icon: '◎', roles: ['owner'] },
  { href: '/tasks', label: 'Tasks', icon: '▤', roles: ['owner'] },
  // Content opened to admin + staff 2026-07-01: content planning is a staff-role
  // job (Maddie). If the entry is clutter for front-desk staff, scope it to a
  // capability later — the pages + RLS already allow staff by design.
  { href: '/content', label: 'Content', icon: '📅', roles: ['owner', 'admin', 'staff'] },
  // Newsletter Builder — admin-only (Feature 1, 2026-07). Generates the monthly
  // Court Reserve newsletter HTML; not a staff-facing tool.
  { href: '/newsletter', label: 'Newsletter', icon: '✉', roles: ['owner', 'admin'] },
  { href: '/messaging', label: 'Messages', icon: '💬', roles: ['owner'] },
  { href: '/reports', label: 'Reports', icon: '📊', roles: ['owner', 'admin', 'viewer'] },
  { href: '/settings', label: 'Settings', icon: '⚙', roles: ['owner', 'admin', 'viewer'] },
  { href: '/getting-started', label: 'Guide', icon: '?', roles: ['owner'] },
]

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-orange-600/20 text-orange-400',
  admin: 'bg-blue-600/20 text-blue-400',
  staff: 'bg-green-600/20 text-green-400',
  viewer: 'bg-gray-600/20 text-gray-400',
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [userRole, setUserRole] = useState<string>('viewer')
  const [userFullName, setUserFullName] = useState<string>('')

  useEffect(() => {
    async function init() {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()

        // Fetch role + full name
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .single()
          if (profile?.role) setUserRole(profile.role)
          if (profile?.full_name) setUserFullName(profile.full_name)
        }

        // Fetch unread notifications
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('read', false)
        setUnreadCount(count ?? 0)
      } catch {
        // ignore
      }
    }
    init()
    const interval = setInterval(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('read', false)
        setUnreadCount(count ?? 0)
      } catch {}
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const visibleNav = nav.filter((item) => item.roles.includes(userRole))

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white tracking-tight">
          Court<span className="text-orange-500">Ops</span>
        </h1>
        <div className="flex items-center gap-2">
          {userRole === 'owner' && (
            <Link
              href="/notifications"
              className="relative text-gray-400 hover:text-white p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="text-gray-400 hover:text-white p-1"
          >
            {open ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:sticky top-0 left-0 z-50 h-screen w-56 bg-gray-900 border-r border-gray-800 flex flex-col
        transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>
        <div className="p-5 border-b border-gray-800 hidden md:block">
          <h1 className="text-xl font-bold text-white tracking-tight">
            Court<span className="text-orange-500">Ops</span>
          </h1>
        </div>

        {/* Spacer for mobile top bar */}
        <div className="h-14 md:hidden" />

        <nav className="flex-1 overflow-y-auto min-h-0 p-3 space-y-1">
          {visibleNav.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-orange-600/15 text-orange-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}

          {/* Notifications link — owner-only (2026-05-05 trim, see nav comment above). */}
          {userRole === 'owner' && (
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith('/notifications')
                  ? 'bg-orange-600/15 text-orange-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className="text-base">🔔</span>
              Notifications
              {unreadCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </Link>
          )}
        </nav>

        <div className="p-3 border-t border-gray-800 space-y-2">
          {userFullName && (
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-800 text-gray-300 text-xs font-semibold flex items-center justify-center">
                {getInitials(userFullName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-gray-200 truncate" title={userFullName}>
                  {userFullName}
                </div>
                <span
                  className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_COLORS[userRole] || ROLE_COLORS.viewer}`}
                >
                  {userRole === 'viewer' ? 'viewer · read-only' : userRole}
                </span>
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
