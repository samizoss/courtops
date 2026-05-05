'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditStaffModal } from '@/components/edit-staff-modal'
import { SHIFT_ROLE_LABELS, type Profile, type Role } from '@/types/database'

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

type SortKey = 'name' | 'role' | 'schedule' | 'target' | 'capabilities'
type SortDir = 'asc' | 'desc'
type RoleFilter = 'all' | Role
type ScheduleFilter = 'all' | 'on' | 'off'

function lastNameKey(p: Profile): string {
  // Sort by last name primarily, then first. Falls back to full_name lexicographic
  // when last_name isn't set (legacy rows).
  const last = (p.last_name ?? '').trim().toLowerCase()
  const first = (p.first_name ?? '').trim().toLowerCase()
  if (last) return `${last}|${first}`
  return p.full_name.toLowerCase()
}

export function RosterTab({ profiles: initial, isAdmin, orgId }: Props) {
  const router = useRouter()
  const [profiles, setProfiles] = useState(initial)
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'staff' as Role })

  // Filter + sort state
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function clickSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const visibleProfiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    let filtered = profiles
    if (q) {
      filtered = filtered.filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          (p.phone ?? '').toLowerCase().includes(q)
      )
    }
    if (roleFilter !== 'all') filtered = filtered.filter((p) => p.role === roleFilter)
    if (scheduleFilter === 'on') filtered = filtered.filter((p) => p.is_operational_staff)
    if (scheduleFilter === 'off') filtered = filtered.filter((p) => !p.is_operational_staff)

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = lastNameKey(a).localeCompare(lastNameKey(b))
          break
        case 'role':
          cmp = a.role.localeCompare(b.role)
          break
        case 'schedule':
          cmp = Number(b.is_operational_staff) - Number(a.is_operational_staff)
          break
        case 'target': {
          const at = a.target_weekly_hours ?? -1
          const bt = b.target_weekly_hours ?? -1
          cmp = at - bt
          break
        }
        case 'capabilities':
          cmp = (a.capabilities?.length ?? 0) - (b.capabilities?.length ?? 0)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [profiles, search, roleFilter, scheduleFilter, sortKey, sortDir])

  // Aggregate counts for chip badges
  const counts = useMemo(() => {
    const onSchedule = profiles.filter((p) => p.is_operational_staff).length
    const offSchedule = profiles.length - onSchedule
    const byRole: Record<Role, number> = { owner: 0, admin: 0, staff: 0, viewer: 0 }
    for (const p of profiles) byRole[p.role] = (byRole[p.role] ?? 0) + 1
    return { onSchedule, offSchedule, byRole, total: profiles.length }
  }, [profiles])

  async function handleToggleOperational(profileId: string, current: boolean) {
    setTogglingId(profileId)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: rows, error: updateError } = await supabase
        .from('profiles')
        .update({ is_operational_staff: !current })
        .eq('id', profileId)
        .select()
      if (updateError) throw updateError
      if (!rows || rows.length === 0) {
        throw new Error('Update was blocked — your role may not have permission to edit profiles.')
      }
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, is_operational_staff: !current } : p))
      )
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
      {/* Toolbar: search + filter chips + Add Staff */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone…"
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-500 min-w-[220px]"
        />

        <div className="flex items-center gap-1 ml-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide mr-1">Role</span>
          {(['all', 'owner', 'admin', 'staff', 'viewer'] as RoleFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                roleFilter === r
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              {r === 'all' ? `All (${counts.total})` : `${r} (${counts.byRole[r as Role] ?? 0})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide mr-1">Schedule</span>
          {([
            ['all', `All (${counts.total})`],
            ['on', `On (${counts.onSchedule})`],
            ['off', `Off (${counts.offSchedule})`],
          ] as [ScheduleFilter, string][]).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setScheduleFilter(f)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                scheduleFilter === f
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="ml-auto px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Staff'}
          </button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={handleAddStaff} className="bg-gray-900 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Add Team Member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Full Name *</label>
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="geneva@thepbjar.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Temporary Password *</label>
              <input
                required
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="They'll change this later"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
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
          Click <span className="text-green-400">On schedule</span> in the row to toggle whether
          someone appears on the schedule, availability grid, and hours reports. Use{' '}
          <span className="text-orange-400">Off schedule</span> for staff who shouldn&apos;t be on
          rotation. Different from active/inactive in <span className="font-medium">Settings → Team</span>,
          which controls login.
        </p>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/40 border-b border-gray-800">
            <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
              <SortableTh
                label="Name"
                sortKey="name"
                currentKey={sortKey}
                currentDir={sortDir}
                onClick={clickSort}
                className="px-4 py-2.5 min-w-[200px]"
              />
              <th className="px-3 py-2.5 font-medium hidden md:table-cell">Email</th>
              <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Phone</th>
              <SortableTh
                label="Role"
                sortKey="role"
                currentKey={sortKey}
                currentDir={sortDir}
                onClick={clickSort}
                className="px-3 py-2.5"
              />
              <SortableTh
                label="Schedule"
                sortKey="schedule"
                currentKey={sortKey}
                currentDir={sortDir}
                onClick={clickSort}
                className="px-3 py-2.5"
              />
              <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Capabilities</th>
              <SortableTh
                label="Target hrs"
                sortKey="target"
                currentKey={sortKey}
                currentDir={sortDir}
                onClick={clickSort}
                className="px-3 py-2.5 hidden md:table-cell text-right"
              />
              {isAdmin && <th className="px-3 py-2.5 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {visibleProfiles.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No staff match these filters.
                </td>
              </tr>
            )}
            {visibleProfiles.map((p) => {
              const placeholder = p.email.endsWith('@placeholder.thepbjar.club')
              const initials = p.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
              return (
                <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-[11px] font-bold text-gray-400 shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm text-white truncate">{p.full_name}</span>
                          {placeholder && (
                            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 shrink-0">
                              Placeholder
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500 md:hidden truncate">{p.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400 hidden md:table-cell truncate max-w-[220px]">
                    {p.email}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400 hidden lg:table-cell font-mono">
                    {p.phone ?? <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${roleBadge[p.role]}`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {isAdmin ? (
                      <button
                        onClick={() => handleToggleOperational(p.id, p.is_operational_staff)}
                        disabled={togglingId === p.id}
                        className={`text-[11px] px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 ${
                          p.is_operational_staff
                            ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                            : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                        }`}
                        title={
                          p.is_operational_staff
                            ? 'Click to take off the schedule'
                            : 'Click to put on the schedule'
                        }
                      >
                        {p.is_operational_staff ? 'On schedule' : 'Off schedule'}
                      </button>
                    ) : (
                      p.is_operational_staff && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                          On schedule
                        </span>
                      )
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-500 hidden lg:table-cell max-w-[200px]">
                    {p.capabilities && p.capabilities.length > 0 ? (
                      <span className="truncate block" title={p.capabilities.map((c) => SHIFT_ROLE_LABELS[c] ?? c).join(', ')}>
                        {p.capabilities.map((c) => SHIFT_ROLE_LABELS[c] ?? c).join(', ')}
                      </span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400 hidden md:table-cell text-right font-mono">
                    {p.target_weekly_hours != null ? `${p.target_weekly_hours}h` : <span className="text-gray-700">—</span>}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-xs text-gray-500 hover:text-orange-400 transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditStaffModal
          profile={editing}
          canChangeRole={editing.role !== 'owner'}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            setEditing(null)
          }}
          onDeleted={(profileId) => {
            setProfiles((prev) => prev.filter((p) => p.id !== profileId))
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function SortableTh({
  label,
  sortKey,
  currentKey,
  currentDir,
  onClick,
  className,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onClick: (key: SortKey) => void
  className?: string
}) {
  const active = currentKey === sortKey
  const arrow = active ? (currentDir === 'asc' ? '↑' : '↓') : ''
  return (
    <th className={`font-medium ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`flex items-center gap-1 uppercase tracking-wide hover:text-orange-400 transition-colors ${
          active ? 'text-orange-400' : ''
        }`}
      >
        {label}
        <span className="text-[8px] opacity-70">{arrow}</span>
      </button>
    </th>
  )
}
