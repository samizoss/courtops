/**
 * Court Reserve API client.
 * Ported from C:\Users\samiz\courtreserve-sync\courtreserve.js
 */

const BASE_URL = 'https://api.courtreserve.com/api/v1'

export class CourtReserveAPI {
  private orgId: string
  private authHeader: string

  constructor(apiUser: string, apiPass: string, orgId: string) {
    this.orgId = orgId
    this.authHeader = 'Basic ' + Buffer.from(`${apiUser}:${apiPass}`).toString('base64')
  }

  async request(endpoint: string, params: Record<string, string | number> = {}): Promise<Record<string, unknown>> {
    const url = new URL(`${BASE_URL}${endpoint}`)
    url.searchParams.set('OrgId', this.orgId)
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) url.searchParams.set(key, String(val))
    }

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': this.authHeader, 'Content-Type': 'application/json' },
    })

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') || '60'
      await new Promise((r) => setTimeout(r, parseInt(retryAfter) * 1000))
      return this.request(endpoint, params)
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`CourtReserve API ${res.status}: ${text}`)
    }

    return res.json() as Promise<Record<string, unknown>>
  }

  async getAllMembers(): Promise<CRMemberRaw[]> {
    const members: CRMemberRaw[] = []
    let page = 1
    const pageSize = 100

    while (true) {
      const raw = await this.request('/member/get', { pageNumber: page, pageSize })
      const wrapper = (raw.Data || raw.data || raw) as Record<string, unknown>
      const items = (wrapper.Members || wrapper.members || (Array.isArray(wrapper) ? wrapper : [])) as CRMemberRaw[]
      const totalPages = (wrapper.TotalPages || wrapper.totalPages || 0) as number

      if (!Array.isArray(items) || items.length === 0) break
      members.push(...items)

      if (page >= totalPages || items.length < pageSize) break
      page++
      await new Promise((r) => setTimeout(r, 350))
    }

    return members
  }

  async getMembershipTypes(): Promise<CRMembershipType[]> {
    const data = await this.request('/membershiptype/get')
    const result = data.Data || data.data || data
    return Array.isArray(result) ? result : []
  }

  async getAttendance(fromDate: string, toDate: string): Promise<CRAttendanceRecord[]> {
    const data = await this.request('/attendancereport/detailed', {
      attendedFrom: fromDate,
      attendedTo: toDate,
    })
    const result = data.Data || data.data || data
    return Array.isArray(result) ? result : []
  }

  async getTransactions(startDate: string, endDate: string): Promise<CRTransaction[]> {
    const data = await this.request('/transactions/list', {
      transactionStartDate: startDate,
      transactionEndDate: endDate,
    })
    const result = data.Data || data.data || data
    return Array.isArray(result) ? result : []
  }

  /**
   * Event registration rows for a date window. CR enforces a max 31-day
   * window; callers must chunk. This is the ONLY event surface CR exposes —
   * there is no event catalog endpoint, and events with zero registrations
   * are invisible (accepted V1 limitation, see content-calendar design spec).
   */
  async getEventRegistrations(fromDate: string, toDate: string): Promise<CREventRegistration[]> {
    const data = await this.request('/eventregistrationreport/listactive', {
      eventDateFrom: fromDate,
      eventDateTo: toDate,
    })
    const result = data.Data || data.data || data
    return Array.isArray(result) ? result : []
  }
}

// --- Types ---

export interface CRMemberRaw {
  Id?: string
  id?: string
  OrganizationMemberId?: string
  FirstName?: string
  firstName?: string
  LastName?: string
  lastName?: string
  Email?: string
  email?: string
  Phone?: string
  phone?: string
  MembershipTypeId?: number
  membershipTypeId?: number
  MembershipTypeName?: string
  membershipTypeName?: string
  MembershipStatus?: string
  IsActive?: boolean
  isActive?: boolean
  City?: string
  State?: string
  MemberSince?: string
  DateCreated?: string
}

export interface CRMembershipType {
  Id: number
  Name: string
  IsActive: boolean
  MonthlyMembershipPrice?: number
  AnnualMembershipPrice?: number
}

export interface CRAttendanceRecord {
  OrganizationMemberId: string
  DateTime: string
  [key: string]: unknown
}

export interface CRTransaction {
  OrganizationMemberId: string
  Total?: number
  Subtotal?: number
  [key: string]: unknown
}

// Registration row shape verified against The Jar's prod data 2026-06-09
// (all fields present in all 203 sample rows — see content-calendar spec).
export interface CREventRegistration {
  EventId: number
  EventName: string
  IsTeamEvent?: boolean
  EventCategoryId?: number
  EventCategoryName?: string
  EventDateId: number
  StartTime: string
  EndTime: string
  CancelledOnUtc?: string | null
  [key: string]: unknown
}

// --- Tier mapping (from courtreserve-sync/sync.js) ---

const TIER_MAP: Record<string, string> = {
  'Daily Player': 'Daily',
  'Daily Player +': 'Daily +',
  'Star Membership': 'Star',
  'Star + Family': 'Star +',
  'Star SFAP': 'Star',
  'Star + SFAP': 'Star +',
  'Patriot Membership': 'Patriot',
  'Patriot + Family': 'Patriot +',
  'Patriot SFAP': 'Patriot',
  'Patriot + SFAP': 'Patriot +',
  'Freedom Membership': 'Freedom',
  'Freedom + Family': 'Freedom +',
  'Freedom SFAP': 'Freedom',
  'Freedom + SFAP': 'Freedom +',
  'Founders Membership': 'Founders',
  'Founders + Family': 'Founders +',
  'Founders SFAP': 'Founders',
  'Founders + SFAP': 'Founders +',
}

export function mapTier(crMembershipName: string | null | undefined): string | null {
  if (!crMembershipName) return null
  if (TIER_MAP[crMembershipName]) return TIER_MAP[crMembershipName]
  // Fuzzy match
  const tiers = ['Daily +', 'Daily', 'Star +', 'Star', 'Patriot +', 'Patriot', 'Freedom +', 'Freedom', 'Founders +', 'Founders']
  for (const tier of tiers) {
    if (crMembershipName.toLowerCase().includes(tier.toLowerCase())) return tier
  }
  return null
}

/**
 * Day-granularity date from a CR datetime string.
 *
 * CR sends naive org-local wall-clock strings (no offset — verified against
 * The Jar's prod data 2026-07-21, e.g. attendance DateTime
 * "2026-07-21T16:39:03.157" + TimeZone "America/Chicago"). The date the club
 * cares about is the WALL-CLOCK date, so extract it textually. The previous
 * `new Date(d).toISOString()` round-trip re-interpreted the string in the
 * server timezone and flipped late-evening times to the next date on any
 * non-UTC server (it was only accidentally correct on Vercel/UTC).
 */
export function toISODate(d: string | null | undefined): string | null {
  if (!d) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(d.trim())
  if (m) {
    // Validate it's a real calendar date (reject 2026-13-40).
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3])
    const check = new Date(t)
    if (check.getUTCFullYear() !== +m[1] || check.getUTCMonth() !== +m[2] - 1 || check.getUTCDate() !== +m[3]) return null
    return `${m[1]}-${m[2]}-${m[3]}`
  }
  // Non-CR shapes (e.g. explicit offset): fall back to the UTC date of the instant.
  const date = new Date(d)
  if (isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

/**
 * Calendar date of a Date's LOCAL components, for CR day-granularity query
 * params. Callers build windows with `new Date(year, month, 1)` (local), so
 * reading back via toISOString() shifted the date on non-UTC servers.
 */
export function fmt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
