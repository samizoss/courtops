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
import {
  DEFAULT_SECTIONS,
  SECTION_LABELS,
  type SectionKey,
  type SectionToggles,
} from '@/lib/newsletter-section-keys'

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
  /** Set when the newsletter month changed after this CR row was applied. */
  stale?: boolean
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
  /** Set when the newsletter month changed after this CR row was applied. */
  stale?: boolean
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

function SectionSwitch({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Include ${label} section`}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? 'bg-orange-600' : 'bg-gray-700'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          on ? 'translate-x-4' : ''
        }`}
      />
    </button>
  )
}

/** Card wrapper with a section on/off switch in the header; children hidden while off. */
function ToggleCard({
  sectionKey,
  sections,
  onToggle,
  hint,
  headerExtra,
  children,
}: {
  sectionKey: SectionKey
  sections: SectionToggles
  onToggle: (key: SectionKey, next: boolean) => void
  hint?: string
  headerExtra?: React.ReactNode
  children?: React.ReactNode
}) {
  const on = sections[sectionKey]
  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4 ${on ? '' : 'opacity-70'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <SectionSwitch
            on={on}
            onChange={(next) => onToggle(sectionKey, next)}
            label={SECTION_LABELS[sectionKey]}
          />
          <h3 className="text-sm font-semibold text-gray-300 truncate">{SECTION_LABELS[sectionKey]}</h3>
        </div>
        {on && headerExtra}
      </div>
      {!on && <p className="text-xs text-gray-600">Off — this section won&apos;t appear in the email.</p>}
      {on && hint && <p className="text-xs text-gray-500">{hint}</p>}
      {on && children}
    </div>
  )
}

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

function StaleBadge() {
  return (
    <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-300 whitespace-nowrap">
      loaded for a different month — reload Court Reserve
    </span>
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
  const [leagueRegInfo, setLeagueRegInfo] = useState('')
  const [coachQuote, setCoachQuote] = useState('')
  const [coachName, setCoachName] = useState('')
  const [spotlightName, setSpotlightName] = useState('')
  const [staffName, setStaffName] = useState('')
  const [sections, setSections] = useState<SectionToggles>(DEFAULT_SECTIONS)

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

  function toggleSection(key: SectionKey, next: boolean) {
    setSections((prev) => ({ ...prev, [key]: next }))
  }

  // Any manual edit to a CR-prefilled row promotes it to a manual row
  // (fromCr + stale cleared) so a later "Apply to newsletter" never clobbers it.
  function updateLeague(i: number, patch: Partial<LeagueRow>) {
    setLeagues((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, ...patch, fromCr: false, stale: false } : row))
    )
  }

  function updateEvent(i: number, patch: Partial<EventRow>) {
    setEvents((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, ...patch, fromCr: false, stale: false } : row))
    )
  }

  /**
   * Changing the newsletter month invalidates anything loaded from Court Reserve:
   * the checklist is cleared (stale months would be misleading) and applied CR rows
   * are flagged stale — but kept, and manual rows are never touched (clobber-safe).
   */
  function handleMonthYearChange(nextMonth: string, nextYear: number) {
    const changed = nextMonth !== month || nextYear !== year
    setMonth(nextMonth)
    setYear(nextYear)
    if (!changed) return
    if (crEvents) {
      setCrEvents(null)
      setCrLoadedLabel('')
      setCrEventChecks({})
      setCrLeagueChecks({})
    }
    setLeagues((prev) => prev.map((r) => (r.fromCr ? { ...r, stale: true } : r)))
    setEvents((prev) => prev.map((r) => (r.fromCr ? { ...r, stale: true } : r)))
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
          // Strip the client-only fromCr/crEventId/stale tracking fields — the
          // generate contract is unchanged by CR prefill. Belt-and-braces: omit rows
          // entirely when their section is OFF, so a half-filled hidden row never
          // reaches the server (the route validates this too, defensively).
          leagues: sections.LEAGUES
            ? leagues
                .filter((l) => l.name.trim() || l.detail.trim() || l.url.trim())
                .map(({ name, detail, url }) => ({ name, detail, url }))
            : [],
          events: sections.EVENTS
            ? events
                .filter((e) => e.name.trim() || e.detail.trim() || e.url.trim() || e.day.trim())
                .map(({ day, mon, name, detail, url }) => ({ day, mon, name, detail, url }))
            : [],
          leagueRegInfo,
          coachQuote,
          coachName,
          spotlightName,
          staffName,
          sections,
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
          Pick the month, load your Court Reserve events, toggle the sections you want, and
          generate the monthly newsletter HTML to paste into a Court Reserve email. The AI writes
          copy only — code builds all the HTML.
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
          {/* 1. Month — everything below (CR preload, generated copy, UTM campaign) binds to this. */}
          <div className="bg-gray-900 rounded-xl border border-orange-500/40 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Newsletter month</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Month</label>
                <select
                  value={month}
                  onChange={(e) => handleMonthYearChange(e.target.value, year)}
                  className={inputClass}
                >
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
                  onChange={(e) => handleMonthYearChange(month, Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* 2. Load from Court Reserve — read-only prefill for the Events/Leagues
              rows below. Visible and functional for all members (the GET
              endpoint is member-read); Generate stays admin-only. */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Load from Court Reserve</h3>
            <button
              type="button"
              onClick={handleLoadFromCr}
              disabled={crLoading}
              className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
            >
              {crLoading ? 'Loading...' : `Load ${month} ${year} events from Court Reserve`}
            </button>
            <p className="text-xs text-gray-500">
              Pulls that month&apos;s events straight from your Court Reserve calendar. Check what to
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

          {/* 3. Notes */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
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

          {/* 4. Hero — always in the email, no toggle. */}
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

          {/* 5. Toggled sections, in email order. */}
          <ToggleCard
            sectionKey="LEAGUES"
            sections={sections}
            onToggle={toggleSection}
            headerExtra={
              <button
                type="button"
                onClick={() => setLeagues((prev) => [...prev, { name: '', detail: '', url: '' }])}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                + Add league
              </button>
            }
          >
            {leagues.map((row, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">League {i + 1}</span>
                  <span className="flex items-center gap-2">
                    {row.fromCr && row.stale && <StaleBadge />}
                    {leagues.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLeagues((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </span>
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
            <div>
              <label className={labelClass}>League registration info (optional, one line)</label>
              <input
                type="text"
                value={leagueRegInfo}
                onChange={(e) => setLeagueRegInfo(e.target.value)}
                placeholder="e.g. Members register Mon 8/4 @ noon; daily players Wed 8/6"
                className={inputClass}
              />
              <p className="text-[11px] text-gray-600 mt-1">
                Appears word-for-word under the league list. Leave blank to drop the line.
              </p>
            </div>
          </ToggleCard>

          <ToggleCard
            sectionKey="EVENTS"
            sections={sections}
            onToggle={toggleSection}
            headerExtra={
              <button
                type="button"
                onClick={() =>
                  setEvents((prev) => [...prev, { day: '', mon: '', name: '', detail: '', url: '' }])
                }
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                + Add event
              </button>
            }
          >
            {events.map((row, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">Event {i + 1}</span>
                  <span className="flex items-center gap-2">
                    {row.fromCr && row.stale && <StaleBadge />}
                    {events.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEvents((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </span>
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
          </ToggleCard>

          <ToggleCard
            sectionKey="CLINICS"
            sections={sections}
            onToggle={toggleSection}
            hint="Copy comes from your notes — mention LTP, Liveball, and clinic times there."
          />

          <ToggleCard
            sectionKey="ANNOUNCEMENTS"
            sections={sections}
            onToggle={toggleSection}
            hint="Copy comes from your notes — each announcement becomes its own block."
          />

          <ToggleCard
            sectionKey="COMMUNITY_IMAGE"
            sections={sections}
            onToggle={toggleSection}
            hint="Adds a photo placeholder you swap in the Court Reserve editor."
          />

          <ToggleCard sectionKey="SPOTLIGHT" sections={sections} onToggle={toggleSection}>
            <div>
              <label className={labelClass}>Member spotlight name</label>
              <input
                type="text"
                value={spotlightName}
                onChange={(e) => setSpotlightName(e.target.value)}
                className={inputClass}
              />
            </div>
          </ToggleCard>

          <ToggleCard sectionKey="STAFF" sections={sections} onToggle={toggleSection}>
            <div>
              <label className={labelClass}>Staff shout-out name</label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className={inputClass}
              />
            </div>
          </ToggleCard>

          <ToggleCard sectionKey="COACH_QUOTE" sections={sections} onToggle={toggleSection}>
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
          </ToggleCard>

          <ToggleCard
            sectionKey="AHEAD"
            sections={sections}
            onToggle={toggleSection}
            hint="Next-month teasers — copy comes from your notes."
          />

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
