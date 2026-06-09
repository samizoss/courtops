'use client'

import { useState } from 'react'

export function IdeaForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [idea, setIdea] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!idea.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/roadmap/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), idea: idea.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('sent')
      setName('')
      setEmail('')
      setIdea('')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="text-center py-4">
        <div className="text-emerald-400 font-semibold">Thanks for your idea!</div>
        <p className="text-xs text-gray-500 mt-1">We review every submission.</p>
        <button
          onClick={() => setStatus('idle')}
          className="text-xs text-orange-400 hover:text-orange-300 mt-3 underline underline-offset-2"
        >
          Submit another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>
      <textarea
        required
        rows={3}
        placeholder="What would make CourtOps better for your club?"
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        maxLength={2000}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600">{idea.length}/2000</span>
        <button
          type="submit"
          disabled={status === 'sending' || !idea.trim()}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {status === 'sending' ? 'Sending...' : 'Submit Idea'}
        </button>
      </div>
      {status === 'error' && (
        <p className="text-xs text-red-400">Something went wrong. Please try again.</p>
      )}
    </form>
  )
}
