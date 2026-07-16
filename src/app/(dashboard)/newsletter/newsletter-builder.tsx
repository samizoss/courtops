'use client'

import { useState } from 'react'
import { useToast } from '@/components/toast'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface LeagueRow {
  name: string
  detail: string
  url: string
}

interface EventRow {
  day: string
  mon: string
  name: string
  detail: string
  url: string
}

function defaultMonthYear(): { month: string; year: number } {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { month: MONTH_NAMES[next.getMonth()], year: next.getFullYear() }
}

const inputClass =
  'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent'
const labelClass = 'block text-xs text-gray-400 mb-1'

export function NewsletterBuilder() {
  const { toast } = useToast()
  const defaults = defaultMonthYear()

  const [month, setMonth] = useState(defaults.month)
  const [year, setYear] = useState(defaults.year)
  const [notes, setNotes] = useState('')
  const [heroTopic, setHeroTopic] = useState('')
  const [heroUrl, setHeroUrl] = useState('')
  const [leagues, setLeagues] = useState<LeagueRow[]>([{ name: '', detail: '', url: '' }])
  const [events, setEvents] = useState<EventRow[]>([
    { day: '', mon: '', name: '', detail: '', url: '' },
  ])
  const [memberRegOpen, setMemberRegOpen] = useState('')
  const [dailyPlayerRegOpen, setDailyPlayerRegOpen] = useState('')
  const [coachQuote, setCoachQuote] = useState('')
  const [coachName, setCoachName] = useState('')
  const [spotlightName, setSpotlightName] = useState('')
  const [staffName, setStaffName] = useState('')

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[] | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  function updateLeague(i: number, patch: Partial<LeagueRow>) {
    setLeagues((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  function updateEvent(i: number, patch: Partial<EventRow>) {
    setEvents((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  async function handleGenerate() {
    setLoading(true)
    setErrors(null)
    try {
      const res = await fetch('/api/newsletter/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          year,
          notes,
          heroTopic,
          heroUrl,
          leagues: leagues.filter((l) => l.name.trim() || l.detail.trim() || l.url.trim()),
          events: events.filter(
            (e) => e.name.trim() || e.detail.trim() || e.url.trim() || e.day.trim()
          ),
          memberRegOpen,
          dailyPlayerRegOpen,
          coachQuote,
          coachName,
          spotlightName,
          staffName,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // 422 (QA gate failure) returns { errors: string[] }; other 4xx/5xx return { error: string }.
        setHtml(null)
        setWarnings([])
        setErrors(Array.isArray(data.errors) ? data.errors : [data.error || 'Newsletter generation failed'])
        return
      }

      setHtml(data.html)
      setWarnings(data.warnings ?? [])
      setErrors(null)
    } catch (err) {
      console.error('Newsletter generate failed:', err)
      setHtml(null)
      setWarnings([])
      setErrors(['Newsletter generation failed — check your connection and try again.'])
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!html) return
    try {
      await navigator.clipboard.writeText(html)
      toast('Newsletter HTML copied to clipboard.')
    } catch (err) {
      console.error('Copy failed:', err)
      toast('Copy failed. Please try again.', 'error')
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Newsletter Builder</h2>
        <p className="text-gray-400 text-sm mt-1">
          Paste your notes, fill in the facts, and generate the monthly newsletter HTML to paste
          into a Court Reserve email. The AI writes copy only — code builds all the HTML.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-8">
        {/* Left: form */}
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Month</label>
                <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass}>
                  {MONTH_NAMES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Year</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Paste your notes for this month</label>
              <textarea
                rows={12}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any messy format is fine — bullet points, half sentences, copy-pasted texts..."
                className={inputClass}
              />
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Hero</h3>
            <div>
              <label className={labelClass}>Hero topic</label>
              <input
                type="text"
                value={heroTopic}
                onChange={(e) => setHeroTopic(e.target.value)}
                placeholder="e.g. Fall league registration opening"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Hero Court Reserve URL</label>
              <input
                type="url"
                value={heroUrl}
                onChange={(e) => setHeroUrl(e.target.value)}
                placeholder="https://app.courtreserve.com/..."
                className={inputClass}
              />
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">Leagues</h3>
              <button
                type="button"
                onClick={() => setLeagues((prev) => [...prev, { name: '', detail: '', url: '' }])}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                + Add league
              </button>
            </div>
            {leagues.map((row, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">League {i + 1}</span>
                  {leagues.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLeagues((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateLeague(i, { name: e.target.value })}
                  placeholder="Name (e.g. Ladder Play)"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={row.detail}
                  onChange={(e) => updateLeague(i, { detail: e.target.value })}
                  placeholder="Detail line"
                  className={inputClass}
                />
                <input
                  type="url"
                  value={row.url}
                  onChange={(e) => updateLeague(i, { url: e.target.value })}
                  placeholder="Registration URL"
                  className={inputClass}
                />
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">Events</h3>
              <button
                type="button"
                onClick={() =>
                  setEvents((prev) => [...prev, { day: '', mon: '', name: '', detail: '', url: '' }])
                }
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                + Add event
              </button>
            </div>
            {events.map((row, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Event {i + 1}</span>
                  {events.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setEvents((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={row.day}
                    onChange={(e) => updateEvent(i, { day: e.target.value })}
                    placeholder="Day (e.g. 14)"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={row.mon}
                    onChange={(e) => updateEvent(i, { mon: e.target.value })}
                    placeholder="Mon (e.g. AUG)"
                    className={inputClass}
                  />
                </div>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateEvent(i, { name: e.target.value })}
                  placeholder="Event name"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={row.detail}
                  onChange={(e) => updateEvent(i, { detail: e.target.value })}
                  placeholder="Detail"
                  className={inputClass}
                />
                <input
                  type="url"
                  value={row.url}
                  onChange={(e) => updateEvent(i, { url: e.target.value })}
                  placeholder="Sign-up URL"
                  className={inputClass}
                />
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Registration windows</h3>
            <div>
              <label className={labelClass}>Member registration open</label>
              <input
                type="text"
                value={memberRegOpen}
                onChange={(e) => setMemberRegOpen(e.target.value)}
                placeholder="Mon 8/4 @ 12:00 PM"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Daily player registration open</label>
              <input
                type="text"
                value={dailyPlayerRegOpen}
                onChange={(e) => setDailyPlayerRegOpen(e.target.value)}
                placeholder="Wed 8/6 @ 12:00 PM"
                className={inputClass}
              />
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Coach&apos;s Corner</h3>
            <div>
              <label className={labelClass}>Coach quote</label>
              <input
                type="text"
                value={coachQuote}
                onChange={(e) => setCoachQuote(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Coach name</label>
              <input
                type="text"
                value={coachName}
                onChange={(e) => setCoachName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Community</h3>
            <div>
              <label className={labelClass}>Member spotlight name</label>
              <input
                type="text"
                value={spotlightName}
                onChange={(e) => setSpotlightName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Staff shout-out name</label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {errors && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm font-medium mb-2">
                Could not generate the newsletter:
              </p>
              <ul className="list-disc list-inside text-red-300 text-sm space-y-1">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Generating...' : html ? 'Regenerate copy' : 'Generate'}
          </button>
        </div>

        {/* Right: preview */}
        <div className="space-y-4">
          {html ? (
            <>
              <div className="bg-white rounded-xl overflow-hidden border border-gray-800">
                <iframe srcDoc={html} className="w-full h-[80vh] bg-white" title="Newsletter preview" />
              </div>

              {warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                  <p className="text-amber-400 text-sm font-medium mb-2">Warnings:</p>
                  <ul className="list-disc list-inside text-amber-300 text-sm space-y-1">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={handleCopy}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
              >
                Copy HTML
              </button>
            </>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500 text-sm h-[80vh] flex items-center justify-center">
              Generate a newsletter to see the preview here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
