'use client'

import { useState } from 'react'
import { useToast } from '@/components/toast'
import {
  ALL_SHIFT_ROLES,
  SHIFT_ROLE_LABELS,
  type Profile,
  type Role,
  type ShiftRole,
} from '@/types/database'

interface Props {
  profile: Profile
  /** roles assignable via this modal. Owner is excluded for safety. */
  assignableRoles?: Role[]
  /** Whether the current user can change the role field (false = display-only). */
  canChangeRole?: boolean
  onClose: () => void
  /** Called after successful save with the updated profile. */
  onSaved: (updated: Profile) => void
}

const DEFAULT_ASSIGNABLE: Role[] = ['admin', 'staff', 'viewer']

export function EditStaffModal({
  profile,
  assignableRoles = DEFAULT_ASSIGNABLE,
  canChangeRole = true,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone ?? '',
    role: profile.role,
    target_weekly_hours: profile.target_weekly_hours?.toString() ?? '',
    capabilities: new Set<ShiftRole>(profile.capabilities ?? ['front-desk']),
  })
  const [sendReset, setSendReset] = useState(false)

  const emailChanged = form.email.trim().toLowerCase() !== profile.email.trim().toLowerCase()

  function toggleCap(cap: ShiftRole) {
    setForm((f) => {
      const next = new Set(f.capabilities)
      if (next.has(cap)) next.delete(cap)
      else next.add(cap)
      return { ...f, capabilities: next }
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) {
      toast('Name and email are required', 'error')
      return
    }
    if (form.capabilities.size === 0) {
      toast('Pick at least one capability', 'error')
      return
    }

    setSaving(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const targetHours = form.target_weekly_hours.trim()
        ? Number(form.target_weekly_hours)
        : null
      if (targetHours !== null && (Number.isNaN(targetHours) || targetHours < 0)) {
        toast('Target hours must be a positive number', 'error')
        setSaving(false)
        return
      }

      const { data, error } = await supabase.rpc('update_staff_profile', {
        p_profile_id: profile.id,
        p_full_name: form.full_name.trim(),
        p_email: form.email.trim(),
        p_phone: form.phone.trim() || null,
        p_role: canChangeRole ? form.role : profile.role,
        p_target_weekly_hours: targetHours,
        p_capabilities: Array.from(form.capabilities),
      })
      if (error) throw error
      const result = data as { success?: boolean; error?: string; email_changed?: boolean }
      if (result?.error) throw new Error(result.error)

      // Optionally trigger password reset on the new email so the staffer can set their own.
      if (sendReset && (result?.email_changed || emailChanged)) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          form.email.trim(),
          { redirectTo: `${window.location.origin}/reset-password` }
        )
        if (resetError) {
          toast(`Saved, but password reset email failed: ${resetError.message}`, 'error')
        } else {
          toast('Saved + password reset email sent')
        }
      } else {
        toast('Staff profile saved')
      }

      onSaved({
        ...profile,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        role: canChangeRole ? form.role : profile.role,
        target_weekly_hours: targetHours,
        capabilities: Array.from(form.capabilities),
      })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
      console.error('Save staff failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit staff member</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Full name</label>
              <input
                required
                type="text"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Target hours / week</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.target_weekly_hours}
                onChange={(e) => setForm((f) => ({ ...f, target_weekly_hours: e.target.value }))}
                placeholder="e.g. 20"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Login role</label>
              {canChangeRole ? (
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <div className="px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 text-sm">
                  {profile.role} <span className="text-gray-600">(role can&apos;t be changed here)</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-2">
              Capabilities <span className="text-gray-600 normal-case">— what kinds of work this staffer can do</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {ALL_SHIFT_ROLES.map((cap) => {
                const active = form.capabilities.has(cap)
                return (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCap(cap)}
                    className={`text-xs px-3 py-2 rounded border transition-colors ${
                      active
                        ? 'bg-orange-600/20 border-orange-500/50 text-orange-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {active ? '✓ ' : ''}{SHIFT_ROLE_LABELS[cap]}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">
              Magic-schedule (coming soon) only assigns shifts to staff whose capabilities include the shift role.
            </p>
          </div>

          {emailChanged && (
            <label className="flex items-start gap-2 cursor-pointer p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <input
                type="checkbox"
                checked={sendReset}
                onChange={(e) => setSendReset(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
              />
              <div>
                <p className="text-xs text-blue-300 font-medium">
                  Email is changing — send password reset to {form.email.trim() || 'new address'}?
                </p>
                <p className="text-[10px] text-blue-300/70 mt-0.5">
                  They&apos;ll get a link to set their own password. Use this for placeholder accounts being upgraded with the staffer&apos;s real email.
                </p>
              </div>
            </label>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
