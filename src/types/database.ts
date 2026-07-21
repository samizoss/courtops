export type Role = 'owner' | 'admin' | 'staff' | 'viewer'
export type Shift = 'opening' | 'midday' | 'closing' | 'custom'
export type LeadSource = 'syndicate-ltp' | 'syndicate-general' | 'walk-in' | 'referral' | 'website' | 'other'
export type LeadStatus = 'new' | 'contacted' | 'follow-up' | 'trial-booked' | 'converted' | 'lost' | 'nurturing' | 'archived'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskType = 'admin' | 'content' | 'janitorial' | 'sales' | 'events' | 'facility' | 'inventory' | 'other'
export type SopCategory = 'operations' | 'front-desk' | 'sales' | 'content' | 'emergency' | 'equipment' | 'general'
export type TimeOffStatus = 'pending' | 'approved' | 'denied'
export type ShiftRole = 'front-desk' | 'coaching' | 'instructor' | 'league-leader' | 'management' | 'other'

export const SHIFT_ROLE_LABELS: Record<ShiftRole, string> = {
  'front-desk': 'Front Desk',
  coaching: 'Coaching',
  instructor: 'Instructor',
  'league-leader': 'League Leader',
  management: 'Management',
  other: 'Other',
}

export const ALL_SHIFT_ROLES: ShiftRole[] = [
  'front-desk', 'coaching', 'instructor', 'league-leader', 'management', 'other',
]
export type ActivityType = 'call' | 'text' | 'email' | 'in_person' | 'voicemail' | 'note' | 'status_change' | 'system'
export type ActivityDirection = 'outbound' | 'inbound' | 'internal'
export type ActivityOutcome = 'connected' | 'voicemail' | 'no_answer' | 'booked' | 'converted' | 'not_interested' | 'follow_up'
export type NotificationType = 'cadence_overdue' | 'task_assigned' | 'task_due' | 'time_off_response' | 'new_lead' | 'system' | 'availability_open' | 'availability_reminder'
export type ContentPlatform = 'instagram' | 'facebook' | 'tiktok' | 'email' | 'other'
export type ContentType = 'post' | 'story' | 'reel' | 'email' | 'other'
export type ContentStatus = 'planned' | 'draft' | 'ready' | 'posted' | 'skipped'
export type BillingPlan = 'free' | 'pro' | 'enterprise'

export interface Org {
  id: string
  name: string
  slug: string
  logo_url: string | null
  address: string | null
  website_url: string | null
  timezone: string
  courtreserve_org_id: string | null
  plan: string
  billing_status: string
  onboarding_completed: boolean
  created_at: string
}

export interface Profile {
  id: string
  org_id: string
  full_name: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  role: Role
  avatar_url: string | null
  is_active: boolean
  is_operational_staff: boolean
  is_hidden: boolean
  target_weekly_hours: number | null
  capabilities: ShiftRole[]
  created_at: string
}

export interface ChecklistTemplate {
  id: string
  org_id: string
  name: string
  shift: Shift
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface ChecklistItem {
  id: string
  template_id: string
  org_id: string
  label: string
  sort_order: number
  created_at: string
}

export interface ChecklistCompletion {
  id: string
  item_id: string
  org_id: string
  completed_by: string | null
  completed_date: string
  completed_at: string
  notes: string | null
}

export interface Pipeline {
  id: string
  org_id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface PipelineStage {
  id: string
  pipeline_id: string
  org_id: string
  name: string
  slug: string
  sort_order: number
  cadence_days: number | null
  is_terminal: boolean
  color: string | null
  created_at: string
}

export interface Lead {
  id: string
  org_id: string
  name: string
  email: string | null
  phone: string | null
  source: LeadSource
  campaign: string | null
  status: LeadStatus
  assigned_to: string | null
  next_action_date: string | null
  last_contact_date: string | null
  touch_count: number
  converted: boolean
  conversion_date: string | null
  membership_type: string | null
  courtreserve_member_id: string | null
  notes: string | null
  pipeline_id: string | null
  current_stage_id: string | null
  pipeline_type: string | null
  cr_visit_count: number | null
  cr_monthly_spend: number | null
  cr_membership_tier: string | null
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  org_id: string
  lead_id: string
  activity_type: ActivityType
  direction: ActivityDirection | null
  outcome: ActivityOutcome | null
  performed_by: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface CadenceRule {
  id: string
  pipeline_id: string
  org_id: string
  stage_id: string
  day_offset: number
  touch_type: string
  script_key: string | null
  description: string | null
  sort_order: number
  created_at: string
}

export interface Sop {
  id: string
  org_id: string
  title: string
  category: SopCategory
  content: string
  sort_order: number
  is_published: boolean
  created_by: string | null
  updated_by: string | null
  pipeline_id: string | null
  version: number
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface TimeClock {
  id: string
  org_id: string
  user_id: string
  clock_in: string
  clock_out: string | null
  total_minutes: number | null
  notes: string | null
  is_manual_entry: boolean
  admin_note: string | null
  last_edited_by: string | null
  last_edited_at: string | null
  created_at: string
}

export interface TimeClockEdit {
  id: string
  time_clock_id: string
  org_id: string
  edited_by: string
  edited_at: string
  action: 'create' | 'edit' | 'delete'
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  reason: string | null
}

export interface TimeOffRequest {
  id: string
  org_id: string
  user_id: string
  start_date: string
  end_date: string
  reason: string | null
  status: TimeOffStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
}

export interface Availability {
  id: string
  org_id: string
  user_id: string
  day_of_week: number
  start_time: string | null
  end_time: string | null
  is_available: boolean
  created_at: string
}

/**
 * Date-specific availability entry — what a staff member submits when admin
 * opens an availability window. Free-text `shifts` matches Geneva's existing
 * scheduling format ("7 - 230", "open - 9", "5 - 7, 10 - 230, 5-630").
 *
 * Three-state semantics:
 *  - is_available=true   → "yes I can work this day" (optional `shifts` constrains hours)
 *  - is_unavailable=true → explicit "I cannot work this day" (no shifts shown)
 *  - both false          → no submission yet (UI shows neither toggle pressed)
 * UI enforces mutual exclusion (clicking one clears the other). Empty rows
 * (both false + no shifts) are deleted to keep the table clean.
 */
export interface AvailabilityEntry {
  id: string
  org_id: string
  user_id: string
  entry_date: string             // 'YYYY-MM-DD'
  shifts: string | null          // free text — what hours they can work
  is_available: boolean          // explicit "yes I can work this day"
  is_unavailable: boolean        // explicit "I cannot work this day"
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Admin opens an availability window for a date range; staff submits inside
 * the window; admin locks before building the schedule. Locked windows make
 * availability_entries inside the range read-only for staff (admins can still
 * override).
 *
 * `due_date` is the optional deadline shown to staff so they know when the
 * admin needs their availability submitted by.
 */
export interface AvailabilityWindow {
  id: string
  org_id: string
  label: string
  start_date: string
  end_date: string
  due_date: string | null
  status: 'open' | 'locked'
  opened_by: string | null
  opened_at: string
  locked_by: string | null
  locked_at: string | null
  created_at: string
}

/**
 * Per-staffer-per-window submission marker. Inserted when a staffer clicks
 * "Submit availability"; deleted when they reopen the submission for edits
 * (only allowed while the window is still open).
 *
 * UNIQUE (window_id, user_id) prevents duplicates. We delete on reopen rather
 * than soft-delete to keep the model simple — history isn't required yet.
 */
export interface AvailabilitySubmission {
  id: string
  org_id: string
  window_id: string
  user_id: string
  submitted_at: string
  created_at: string
}

/**
 * Per-window assignment of which staffers are expected to submit availability
 * for a specific window. Decoupled from is_operational_staff so admin can
 * adjust per-window (e.g. exclude a co-owner who's schedulable but doesn't
 * submit monthly). Defaults on window creation = previous window's assignees.
 */
export interface AvailabilityWindowAssignee {
  id: string
  org_id: string
  window_id: string
  user_id: string
  created_at: string
}

export interface ScheduleShift {
  id: string
  org_id: string
  user_id: string
  shift_date: string
  start_time: string
  end_time: string
  role: ShiftRole
  notes: string | null
  /** Null = draft (admin-only). Non-null = published timestamp (visible to staff). */
  published_at: string | null
  created_at: string
}

export type ShiftSwapType = 'swap' | 'take'
export type ShiftSwapStatus = 'open' | 'claimed' | 'approved' | 'denied' | 'cancelled'

export interface ShiftSwap {
  id: string
  org_id: string
  shift_id: string
  original_user_id: string
  swap_type: ShiftSwapType
  status: ShiftSwapStatus
  claimed_by: string | null
  claimed_at: string | null
  approved_by: string | null
  approved_at: string | null
  deny_reason: string | null
  reason: string | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  org_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  task_type: TaskType
  assigned_to: string | null
  due_date: string | null
  completed_at: string | null
  lead_id: string | null
  recurring_rule: string | null
  parent_task_id: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  org_id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  read_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface OrgInvite {
  id: string
  org_id: string
  email: string
  role: string
  invited_by: string
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface ContentCalendar {
  id: string
  org_id: string
  title: string
  description: string | null
  platform: ContentPlatform
  content_type: ContentType
  scheduled_date: string
  scheduled_time: string | null
  status: ContentStatus
  assigned_to: string | null
  media_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface OrgSettings {
  id: string
  org_id: string
  billing_plan: BillingPlan
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  features: Record<string, unknown>
  cr_api_user: string | null
  cr_api_pass: string | null
  cr_sync_enabled: boolean
  cr_last_synced_at: string | null
  clock_notes_visibility: 'all_staff' | 'admin_only'
  week_start_day: number
  min_shift_hours: number
  min_coverage_count: number
  default_target_hours: number
  created_at: string
  updated_at: string
}

export interface CrMember {
  id: string
  org_id: string
  cr_member_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  membership_tier: string | null
  cr_membership_type: string | null
  membership_status: string
  visit_count_6mo: number
  last_visit_date: string | null
  monthly_spend: number | null
  member_since: string | null
  city: string | null
  state: string | null
  upgrade_candidate: boolean
  recommended_tier: string | null
  projected_savings: number | null
  last_synced_at: string
  created_at: string
  updated_at: string
}

export interface CrSyncLog {
  id: string
  org_id: string
  started_at: string
  completed_at: string | null
  members_synced: number
  members_created: number
  members_updated: number
  upgrade_candidates_found: number
  leads_auto_created: number
  error: string | null
  status: string
}

export interface WeeklyDigestEvent {
  dayIndex: number // 0=Mon..6=Sun
  startTime: string
  endTime: string
  startIso: string
  name: string
  /** CR EventId for deep links. Absent on runs stored before 2026-07-21 — renderer shows plain text. */
  eventId?: number | null
}

export interface WeeklyDigestRun {
  id: string
  org_id: string
  week_start: string
  week_end: string
  status: 'success' | 'error'
  error: string | null
  events: WeeklyDigestEvent[]
  triggered_by: 'manual' | 'cron'
  generated_at: string
}

export interface OrgMessagingConfig {
  id: string
  org_id: string
  twilio_phone: string | null
  twilio_subaccount_sid: string | null
  monthly_cap_cents: number
  warn_threshold_pct: number
  current_spend_cents: number
  spend_month: string | null
  paused: boolean
  alert_phone: string | null
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  org_id: string
  lead_id: string | null
  direction: 'inbound' | 'outbound'
  body: string
  from_number: string
  to_number: string
  twilio_sid: string | null
  status: string
  cost_cents: number
  sent_by: string | null
  sent_at: string
  created_at: string
}
