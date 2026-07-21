/**
 * Court Reserve time conversion.
 *
 * CR's API returns *naive org-local wall-clock* datetime strings — no offset,
 * no Z (verified against The Jar's prod data 2026-07-21: session StartTime
 * "2026-07-20T18:00:00" is the "LTP-Monday 6pm" event; attendance DateTime
 * "2026-07-21T16:39:03.157" ships alongside TimeZone "America/Chicago" and
 * DateTimeDisplay "7/21/2026 4:39 PM"). Parsing these with `new Date(...)`
 * re-interprets them in the *server's* timezone — on Vercel (UTC) that
 * mislabels the wall clock as UTC, storing instants 5-6h early.
 *
 * This module converts a CR wall-clock string + IANA timezone into the real
 * UTC instant, DST-correct, with no dependencies (Intl only).
 *
 * NOTE: deliberately a separate file from weekly-digest.ts — that file is
 * owned by a parallel branch (fix/digest-v11).
 */

/** Naive `YYYY-MM-DD[THH:mm[:ss[.fff]]]` — CR's format. Space separator tolerated. */
const NAIVE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/

/** Strings that already carry an explicit UTC designator or offset. */
const EXPLICIT_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i

const dtfCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    dtfCache.set(timeZone, dtf)
  }
  return dtf
}

/** The zone's UTC offset (ms) at a given instant: wall time minus instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = getFormatter(timeZone).formatToParts(instant)
  const v: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') v[p.type] = Number(p.value)
  }
  const asUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour % 24, v.minute, v.second)
  return asUtc - instant.getTime()
}

/**
 * Convert a Court Reserve naive wall-clock string into the real UTC instant
 * for that wall-clock time in `timeZone`.
 *
 * - Strings with an explicit offset/Z are trusted as-is (`new Date(raw)`).
 * - Bare dates are treated as midnight wall clock in the zone.
 * - Unparseable input returns an invalid Date (`isNaN(d.getTime())`), so
 *   callers keep their existing skip-on-invalid behavior.
 * - Invalid `timeZone` throws RangeError (from Intl) — a config error, not bad
 *   row data, so it should fail the sync loudly rather than skip silently.
 *
 * DST edges (deterministic, documented):
 * - Fall-back ambiguous hour (wall time occurs twice): returns the EARLIER
 *   valid instant (first occurrence, i.e. the pre-transition offset).
 * - Spring-forward skipped hour (wall time never occurs): no valid mapping
 *   exists; returns the earliest candidate instant (the wall time interpreted
 *   with the post-transition offset — e.g. Chicago 02:30 on 2026-03-08 maps
 *   to 07:30Z, which renders as 01:30 CST).
 */
export function crWallClockToInstant(raw: string, timeZone: string): Date {
  if (typeof raw !== 'string') return new Date(NaN)
  const s = raw.trim()

  if (EXPLICIT_OFFSET_RE.test(s)) return new Date(s)

  const m = NAIVE_RE.exec(s)
  if (!m) return new Date(NaN)

  const [, year, month, day, hour = '0', minute = '0', second = '0'] = m
  const wallUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)
  // Reject component overflow (e.g. month 13) that Date.UTC would roll over.
  const check = new Date(wallUtc)
  if (
    Number.isNaN(wallUtc) ||
    check.getUTCFullYear() !== +year ||
    check.getUTCMonth() !== +month - 1 ||
    check.getUTCDate() !== +day ||
    check.getUTCHours() !== +hour ||
    check.getUTCMinutes() !== +minute ||
    check.getUTCSeconds() !== +second
  ) {
    return new Date(NaN)
  }

  // Standard Intl technique: guess the instant, measure the zone offset there,
  // adjust, and probe around the candidate so both offsets flanking a DST
  // transition are considered.
  const offsets = new Set<number>()
  const o1 = zoneOffsetMs(new Date(wallUtc), timeZone)
  offsets.add(o1)
  const c1 = wallUtc - o1
  offsets.add(zoneOffsetMs(new Date(c1), timeZone))
  // ±6h probes catch the other side of any nearby transition (fall-back
  // ambiguity where the first candidate validates against the later offset).
  offsets.add(zoneOffsetMs(new Date(c1 - 6 * 3600000), timeZone))
  offsets.add(zoneOffsetMs(new Date(c1 + 6 * 3600000), timeZone))

  const candidates = [...offsets].map((o) => wallUtc - o).sort((a, b) => a - b)
  const valid = candidates.filter((c) => zoneOffsetMs(new Date(c), timeZone) === wallUtc - c)

  // Earliest valid instant; for skipped wall times (none valid), earliest candidate.
  return new Date(valid.length > 0 ? valid[0] : candidates[0])
}
