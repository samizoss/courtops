'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'

interface InviteData {
  id: string
  email: string
  role: string
  expires_at: string
  accepted_at: string | null
  org_id: string
  org: { name: string } | null
}

export default function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()

  const [invite, setInvite] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/invite/accept?token=${token}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Invalid invite link.')
          return
        }

        const inv = data.invite
        if (inv.accepted_at) {
          setError('This invite has already been accepted. Please sign in.')
          return
        }

        if (new Date(inv.expires_at) < new Date()) {
          setError('This invite has expired. Please ask your admin to send a new one.')
          return
        }

        // Normalize org join (Supabase may return array)
        const normalized = {
          ...inv,
          org: Array.isArray(inv.org) ? inv.org[0] || null : inv.org,
        }
        setInvite(normalized as InviteData)
      } catch {
        setError('Something went wrong loading this invite.')
      } finally {
        setLoading(false)
      }
    }

    fetchInvite()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!invite) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, full_name: fullName, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account.')
      }

      router.push('/login?message=' + encodeURIComponent('Account created! Sign in with your new password.'))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create account.'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading invite...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
            Court<span className="text-orange-500">Ops</span>
          </h1>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-6">
            <p className="text-red-400 text-sm">{error}</p>
            <a href="/login" className="mt-4 inline-block text-sm text-orange-400 hover:text-orange-300">
              Go to Sign In
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (!invite) return null

  const orgName = invite.org?.name || 'the organization'

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Court<span className="text-orange-500">Ops</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            You&apos;ve been invited to join <span className="text-white font-medium">{orgName}</span> as{' '}
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
              invite.role === 'admin'
                ? 'bg-blue-600/20 text-blue-400'
                : invite.role === 'staff'
                ? 'bg-green-600/20 text-green-400'
                : 'bg-gray-600/20 text-gray-400'
            }`}>
              {invite.role}
            </span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={invite.email}
              readOnly
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-300 mb-1">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Geneva Olson"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {submitError && (
            <p className="text-red-400 text-sm">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {submitting ? 'Creating account...' : 'Accept Invite & Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
