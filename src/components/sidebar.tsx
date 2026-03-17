'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const nav = [
  { href: '/', label: 'Dashboard', icon: '⊞' },
  { href: '/checklists', label: 'Checklists', icon: '☑' },
  { href: '/pipeline', label: 'Pipeline', icon: '◎' },
  { href: '/tasks', label: 'Tasks', icon: '▤' },
  { href: '/sops', label: 'SOPs', icon: '◉' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

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

        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
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
        </nav>

        <div className="p-3 border-t border-gray-800">
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
