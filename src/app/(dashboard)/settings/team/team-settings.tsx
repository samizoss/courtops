'use client'

import { useState } from 'react'
import Link from 'next/link'
import { EditStaffModal } from '@/components/edit-staff-modal'
import type { Profile, Role } from '@/types/database'

interface Invite {
  id: string
  email: string
  role: string
  token: string
  expires_at: string
  created_at: string
  inviter: { full_name: string } | null
}

interface Props {
  profiles: Profile[]
  invites: Invite[]
  currentUser: { userId: string; orgId: string; role: string; fullName: string }
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-orange-600/20 text-orange-400',
  admin: 'bg-blue-600/20 text-blue-400',
  staff: 'bg-green-600/20 text-green-400',
  viewer: 'bg-gray-600/20 text-gray-400',
}

const ASSIGNABLE_ROLES: Role[] = ['admin', 'staff', 'viewer']
const INVITE_ROLES: Role[] = ['admin', 'staff', 'viewer']

export function TeamSettings({ profiles, invites: initialInvites, currentUser }: Props) {
  const [members, setMembers] = useState(profiles)
  const [invites, setInvites] = useState(initialInvites)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('staff')
  const [sending, setSending] = useState(false)
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)

  async function handleToggleActive(profileId: string, currentlyActive: boolean) {
    const member = members.find((m) => m.id === profileId)
    const action = currentlyActive ? 'deactivate' : 'reactivate'
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${member?.full_name ?? 'this member'}? ${currentlyActive ? 'They will be hidden from staff views and scheduling.' : 'They will appear in staff views again.'}`)) return

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !currentlyActive })
      .eq('id', profileId)

    if (!error) {
      setMembers((prev) =>
        prev.map((m) => (m.id === profileId ? { ...m, is_active: !currentlyActive } : m))
      )
    }
  }

  async function handleRoleChange(profileId: string, newRole: Role) {
    if (profileId === currentUser.userId) return
    const member = members.find((m) => m.id === profileId)
    if (!confirm(`Change ${member?.full_name ?? 'this member'}'s role to "${newRole}"?`)) return

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId)

    if (!error) {
      setMembers((prev) =>
        prev.map((m) => (m.id === profileId ? { ...m, role: newRole } : m))
      )
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setMessage(null)
    setCreatedLink(null)

    try {
      const res = await fetch('/api/invites/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })

      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to send invite.')

      setInvites((prev) => [payload.invite, ...prev])
      setCreatedLink(payload.inviteLink)
      const sentTo = inviteEmail
      setInviteEmail('')

      if (payload.emailSent) {
        setMessage({ type: 'success', text: `Invite email sent to ${sentTo}.` })
      } else {
        setMessage({
          type: 'error',
          text: `Invite link created for ${sentTo}, but email failed to send${payload.emailError ? `: ${payload.emailError}` : ''}. Copy the link below and share it directly.`,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite.'
      setMessage({ type: 'error', text: msg })
    } finally {
      setSending(false)
    }
  }

  async function handleRevoke(inviteId: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const { error } = await supabase
      .from('org_invites')
      .delete()
      .eq('id', inviteId)

    if (!error) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
    }
  }

  async function handleResend(invite: Invite) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const newExpires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase
      .from('org_invites')
      .update({ expires_at: newExpires })
      .eq('id', invite.id)

    if (!error) {
      setInvites((prev) =>
        prev.map((i) => (i.id === invite.id ? { ...i, expires_at: newExpires } : i))
      )
      setCreatedLink(`${window.location.origin}/invite/${invite.token}`)
      setMessage({ type: 'success', text: `Invite link refreshed for ${invite.email}.` })
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-400 hover:text-white transition-colors">
          &larr; Back to Settings
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold">Team Settings</h2>
        <p className="text-gray-400 text-sm mt-1">Manage your team members and invitations</p>
      </div>

      {/* Current Team */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Current Team</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800">
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Email</th>
                <th className="text-left px-5 py-3">Phone</th>
                <th className="text-left px-5 py-3">Role</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Joined</th>
                <th className="text-right px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className={`border-b border-gray-800/50 last:border-0 ${!member.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 text-white font-medium">{member.full_name}</td>
                  <td className="px-5 py-3 text-gray-400">{member.email}</td>
                  <td className="px-5 py-3 text-gray-400">{member.phone ?? <span className="text-gray-700">—</span>}</td>
                  <td className="px-5 py-3">
                    {member.id === currentUser.userId || member.role === 'owner' ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[member.role] || ROLE_COLORS.viewer}`}>
                        {member.role}
                      </span>
                    ) : (
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {member.id === currentUser.userId || member.role === 'owner' ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-600/20 text-green-400">Active</span>
                    ) : (
                      <button
                        onClick={() => handleToggleActive(member.id, member.is_active !== false)}
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors ${
                          member.is_active !== false
                            ? 'bg-green-600/20 text-green-400 hover:bg-red-600/20 hover:text-red-400'
                            : 'bg-red-600/20 text-red-400 hover:bg-green-600/20 hover:text-green-400'
                        }`}
                      >
                        {member.is_active !== false ? 'Active' : 'Inactive'}
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {member.role !== 'owner' && (
                      <button
                        onClick={() => setEditing(member)}
                        className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold">Pending Invites</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800">
                  <th className="text-left px-5 py-3">Email</th>
                  <th className="text-left px-5 py-3">Role</th>
                  <th className="text-left px-5 py-3">Invited By</th>
                  <th className="text-left px-5 py-3">Expires</th>
                  <th className="text-left px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => {
                  const expired = new Date(invite.expires_at) < new Date()
                  return (
                    <tr key={invite.id} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-5 py-3 text-white">{invite.email}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[invite.role] || ROLE_COLORS.viewer}`}>
                          {invite.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400">{invite.inviter?.full_name ?? '—'}</td>
                      <td className={`px-5 py-3 ${expired ? 'text-red-400' : 'text-gray-500'}`}>
                        {expired ? 'Expired' : new Date(invite.expires_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 space-x-2">
                        <button
                          onClick={() => {
                            const link = `${window.location.origin}/invite/${invite.token}`
                            navigator.clipboard.writeText(link)
                            setMessage({ type: 'success', text: `Link copied for ${invite.email}` })
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Copy Link
                        </button>
                        <button
                          onClick={() => handleResend(invite)}
                          className="text-xs text-orange-400 hover:text-orange-300"
                        >
                          Resend
                        </button>
                        <button
                          onClick={() => handleRevoke(invite.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Form */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-lg font-semibold mb-4">Invite a Team Member</h3>
        <form onSubmit={handleSendInvite} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            placeholder="email@example.com"
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={sending}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {sending ? 'Sending...' : 'Send Invite'}
          </button>
        </form>

        {message && (
          <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        )}

        {createdLink && (
          <div className="mt-3">
            <label className="block text-xs text-gray-400 mb-1">Invite Link (copy and share — expires in 48 hours)</label>
            <input
              type="text"
              readOnly
              value={createdLink}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        )}
      </div>

      {editing && (
        <EditStaffModal
          profile={editing}
          canChangeRole={editing.role !== 'owner'}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
            setEditing(null)
          }}
          onDeleted={(profileId) => {
            // Soft-delete (is_active=false). On the Team page we keep the row visible but
            // dimmed via the existing is_active styling, so just flip the flag locally
            // rather than removing it — admin can re-activate from this same view.
            setMembers((prev) =>
              prev.map((m) => (m.id === profileId ? { ...m, is_active: false } : m))
            )
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
