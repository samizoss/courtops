'use client'

import { useState } from 'react'
import { useToast } from '@/components/toast'
import {
  defaultIncluded,
  isLeagueEvent,
  toEventRow,
  toLeagueRow,
  type PrefillEvent,
} from '@/lib/newsletter-prefill'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface LeagueRow {
  name: string
  detail: string
  url: string
  /** True while the row is an untouched Court Reserve prefill — cleared on any manual edit. */
  fromCr?: boolean
  /** CR EventId the row came from; survives edits so re-applying never duplicates it. */
  crEventId?: number
}

interface EventRow {
  day: string
  mon: string
  name: string
  detail: string
  url: string
  /** True while the row is an untouched Court Reserve prefill — cleared on any manual edit. */
  fromCr?: boolean
  /** CR EventId the row came from; survives edits so re-applying never duplicates it. */
  crEventId?: number
}

/** A row with no user content (e.g. the initial placeholder) — safe to drop on apply. */
function isBlankRow(row: LeagueRow | EventRow): boolean {
  return Object.values(row).every((v) => typeof v !== 'string' || !v.trim())
}

/**
 * Merge CR prefill rows into the existing rows. Untouched CR rows (fromCr)
 * are replaced by the fresh selection; manually added or edited rows are
 * NEVER touched (editing a CR row clears its fromCr flag, promoting it to
 * manual — its crEventId still blocks a duplicate from being re-added).
 */
function mergeCrRows<T extends LeagueRow | EventRow>(prev: T[], crRows: T[], blank: T): T[] {
  const kept = prev.filter((r) => !r.fromCr && !isBlankRow(r))
  const keptIds = new Set<number>(kept.map((r) => r.crEventId).filter((id): id is number => id != null))
  const next = [...kept, ...crRows.filter((r) => r.crEventId == null || !keptIds.has(r.crEventId))]
  return next.length > 0 ? next : [blank]
}

function defaultMonthYear(): { month: string; year: number } {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { month: MONTH_NAMES[next.getMonth()], year: next.getFullYear() }
}

const inputClass =
  'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent'
const labelClass = 'block text-xs text-gray-400 mb-1'

function CrChecklistRow({
  event,
  checked,
  onToggle,
}: {
  event: PrefillEvent
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-800/60 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="accent-orange-500 shrink-0"
      />
      <span className="shrink-0 px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] font-semibold text-gray-300 tracking-wide">
        {event.firstSession.mon} {event.firstSession.day}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-gray-200 truncate">{event.name}</span>
        <span className="block text-xs text-gray-500">{event.timeSummary}</span>
      </span>
      {event.isRecurring && (
        <span className="shrink-0 px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-[10px] text-blue-300 whitespace-nowrap">
          runs {event.sessionCount}&times; this month
        </span>
      )}
    </label>
  )
}

interface NewsletterBuilderProps {
  /** owner/admin only may generate; staff see the form + preview read-only. */
  isAdmin: boolean
}

export function NewsletterBuilder({ isAdmin }: NewsletterBuilderProps) {
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

  // "Load from Court Reserve" panel state
  const [crEvents, setCrEvents] = useState<PrefillEvent[] | null>(null)
  const [crLoadedLabel, setCrLoadedLabel] = useState('')
  const [crLoading, setCrLoading] = useState(false)
  const [crEventChecks, setCrEventChecks] = useState<Record<number, boolean>>({})
  const [crLeagueChecks, setCrLeagueChecks] = useState<Record<number, boolean>>({})

  // Any manual edit to a CR-prefilled row promotes it to a manual row
  // (fromCr cleared) so a later "Apply to newsletter" never clobbers it.
  function updateLeague(i: number, patch: Partial<LeagueRow>) {
    setLeagues((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch, fromCr: false } : row)))
  }

  function updateEvent(i: number, patch: Partial<EventRow>) {
    setEvents((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch, fromCr: false } : row)))
  }

  async function handleLoadFromCr() {
    const ym = `${year}-${String(MONTH_NAMES.indexOf(month) + 1).padStart(2, '0')}`
    setCrLoading(true)
    try {
      const res = await fetch(`/api/newsletter/cr-events?month=${ym}`)
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Could not load events from Court Reserve.', 'error')
        return
      }
      const loaded: PrefillEvent[] = data.events ?? []
      setCrEvents(loaded)
      setCrLoadedLabel(`${month} ${year}`)
      // Defaults: one-offs included, recurring series excluded — same rule
      // for the events checklist and the league-lineup checklist.
      const eventChecks: Record<number, boolean> = {}
      const leagueChecks: Record<number, boolean> = {}
      for (const e of loaded) {
        eventChecks[e.eventId] = defaultIncluded(e)
        if (isLeagueEvent(e)) leagueChecks[e.eventId] = defaultIncluded(e)
      }
      setCrEventChecks(eventChecks)
      setCrLeagueChecks(leagueChecks)
    } catch (err) {
      console.error('Load from Court Reserve failed:', err)
      toast('Could not load events from Court Reserve — check your connection and try again.', 'error')
    } finally {
      setCrLoading(false)
    }
  }

  function handleApplyCr() {
    if (!crEvents) return
    const includedEvents = crEvents.filter((e) => crEventChecks[e.eventId])
    const includedLeagues = crEvents.filter((e) => isLeagueEvent(e) && crLeagueChecks[e.eventId])

    setEvents((prev) =>
      mergeCrRows(
        prev,
        includedEvents.map((e) => ({ ...toEventRow(e), fromCr: true, crEventId: e.eventId })),
        { day: '', mon: '', name: '', detail: '', url: '' }
      )
    )
    setLeagues((prev) =>
      mergeCrRows(
        prev,
        includedLeagues.map((e) => ({ ...toLeagueRow(e), fromCr: true, crEventId: e.eventId })),
        { name: '', detail: '', url: '' }
      )
    )
    toast(
      `Applied ${includedEvents.length} event${includedEvents.length === 1 ? '' : 's'}` +
        (includedLeagues.length > 0
          ? ` and ${includedLeagues.length} league${includedLeagues.length === 1 ? '' : 's'}`
          : '') +
        ' from Court Reserve. Rows stay fully editable.'
    )
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
          // Strip the client-only fromCr/crEventId tracking fields — the
          // generate contract is unchanged by CR prefill.
          leagues: leagues
            .filter((l) => l.name.trim() || l.detail.trim() || l.url.trim())
            .map(({ name, detail, url }) => ({ name, detail, url })),
          events: events
            .filter((e) => e.name.trim() || e.detail.trim() || e.url.trim() || e.day.trim())
            .map(({ day, mon, name, detail, url }) => ({ day, mon, name, detail, url })),
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
        {!isAdmin && (
          <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-300 text-sm">
              View-only — ask an admin to generate. You can browse and fill in the form, but
              generating the newsletter requires an admin account.
            </p>
          </div>
        )}
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

          {/* Load from Court Reserve — read-only prefill for the Events/Leagues
              rows below. Visible and functional for all members (the GET
              endpoint is member-read); Generate stays admin-only. */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">Load from Court Reserve</h3>
              <button
                type="button"
                onClick={handleLoadFromCr}
                disabled={crLoading}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                {crLoading ? 'Loading...' : crEvents ? 'Reload' : 'Load events'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Pulls {month} {year} events straight from your Court Reserve calendar. Check what to
              include, then apply — one-off events start checked, weekly series start unchecked.
            </p>

            {crEvents &&
              (crEvents.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No Court Reserve events found for {crLoadedLabel}.
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">
                      Events — {crLoadedLabel}
                    </p>
                    <div className="space-y-0.5">
                      {crEvents.map((e) => (
                        <CrChecklistRow
                          key={e.eventId}
                          event={e}
                          checked={!!crEventChecks[e.eventId]}
                          onToggle={() =>
                            setCrEventChecks((prev) => ({ ...prev, [e.eventId]: !prev[e.eventId] }))
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {crEvents.some(isLeagueEvent) && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1">League Lineup</p>
                      <div className="space-y-0.5">
                        {crEvents.filter(isLeagueEvent).map((e) => (
                          <CrChecklistRow
                            key={e.eventId}
                            event={e}
                            checked={!!crLeagueChecks[e.eventId]}
                            onToggle={() =>
                              setCrLeagueChecks((prev) => ({
                                ...prev,
                                [e.eventId]: !prev[e.eventId],
                              }))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleApplyCr}
                    className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
                  >
                    Apply to newsletter ({crEvents.filter((e) => crEventChecks[e.eventId]).length}{' '}
                    events, {crEvents.filter((e) => isLeagueEvent(e) && crLeagueChecks[e.eventId]).length}{' '}
                    leagues)
                  </button>
                  <p className="text-[11px] text-gray-600">
                    Applying replaces earlier Court Reserve prefills but never touches rows you
                    added or edited yourself.
                  </p>
                </>
              ))}

            <p className="text-[11px] text-gray-600">
              Events with zero Court Reserve registrations don&apos;t appear (CR API limitation).
            </p>
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

          {/* Generate is owner/admin-only — the API route 403s regardless;
              disabling here keeps the affordance honest for staff (fields
              stay editable for drafting, they just can't call the API). */}
          <button
            onClick={handleGenerate}
            disabled={loading || !isAdmin}
            title={isAdmin ? undefined : 'View-only — ask an admin to generate'}
            className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Generating...' : html ? 'Regenerate copy' : 'Generate'}
          </button>
        </div>

        {/* Right: preview */}
        <div className="space-y-4">
          {html ? (
            <>
              <div className="bg-white rounded-xl overflow-hidden border border-gray-800">
                <iframe
                  srcDoc={html}
                  sandbox=""
                  className="w-full h-[80vh] bg-white"
                  title="Newsletter preview"
                />
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
