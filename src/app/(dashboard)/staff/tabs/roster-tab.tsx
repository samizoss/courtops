'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile, Role } from '@/types/database'

const roleBadge: Record<Role, string> = {
  owner: 'bg-orange-500/10 text-orange-400',
  admin: 'bg-blue-500/10 text-blue-400',
  staff: 'bg-gray-500/10 text-gray-400',
  viewer: 'bg-gray-500/10 text-gray-500',
}

interface Props {
  profiles: Profile[]
  isAdmin: boolean
  orgId: string
}

export function RosterTab({ profiles, isAdmin, orgId }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'staff' as Role })

  async function handleToggleOperational(profileId: string, current: boolean) {
    setTogglingId(profileId)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_operational_staff: !current })
        .eq('id', profileId)
      if (updateError) throw updateError
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    }
    setTogglingId(null)
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setError('')

    try {
      const res = await fetch('/api/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, org_id: orgId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add staff')
      setShowAdd(false)
      setForm({ full_name: '', email: '', password: '', role: 'staff' })
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add staff')
    }
    setAdding(false)
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Staff'}
          </button>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAddStaff} className="bg-gray-900 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Add Team Member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Full Name *</label>
              <input
                required
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Geneva Olson"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Email *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="geneva@thepbjar.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Temporary Password *</label>
              <input
                required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="They'll change this later"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {adding ? 'Adding...' : 'Add Team Member'}
          </button>
        </form>
      )}

      {isAdmin && (
        <p className="text-xs text-gray-500 px-1">
          Toggle <span className="text-green-400">Operational</span> off for accounts that shouldn&apos;t appear on the schedule, availability grid, or hours reports (e.g. dev/test accounts).
        </p>
      )}

      <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800/50">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-400">
              {p.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{p.full_name}</p>
              <p className="text-xs text-gray-500">{p.email}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge[p.role]}`}>
              {p.role}
            </span>
            {isAdmin ? (
              <button
                onClick={() => handleToggleOperational(p.id, p.is_operational_staff)}
                disabled={togglingId === p.id}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 ${
                  p.is_operational_staff
                    ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
                title={p.is_operational_staff ? 'Click to mark as non-operational (hidden from schedule)' : 'Click to mark as operational staff'}
              >
                {p.is_operational_staff ? 'Operational' : 'Non-operational'}
              </button>
            ) : (
              p.is_operational_staff && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                  Operational
                </span>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
