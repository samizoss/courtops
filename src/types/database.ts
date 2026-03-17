export type Role = 'owner' | 'admin' | 'staff' | 'viewer'
export type Shift = 'opening' | 'midday' | 'closing' | 'custom'
export type LeadSource = 'syndicate-ltp' | 'syndicate-general' | 'walk-in' | 'referral' | 'website' | 'other'
export type LeadStatus = 'new' | 'contacted' | 'follow-up' | 'trial-booked' | 'converted' | 'lost' | 'nurturing' | 'archived'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskType = 'admin' | 'content' | 'janitorial' | 'sales' | 'events' | 'facility' | 'inventory' | 'other'
export type SopCategory = 'operations' | 'front-desk' | 'sales' | 'content' | 'emergency' | 'equipment' | 'general'
export type TimeOffStatus = 'pending' | 'approved' | 'denied'
export type ShiftRole = 'front-desk' | 'coaching' | 'management' | 'other'

export interface Org {
  id: string
  name: string
  slug: string
  logo_url: string | null
  timezone: string
  courtreserve_org_id: string | null
  created_at: string
}

export interface Profile {
  id: string
  org_id: string
  full_name: string
  email: string
  role: Role
  avatar_url: string | null
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
  created_at: string
  updated_at: string
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
  created_at: string
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

export interface ScheduleShift {
  id: string
  org_id: string
  user_id: string
  shift_date: string
  start_time: string
  end_time: string
  role: ShiftRole
  notes: string | null
  created_at: string
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
  created_at: string
  updated_at: string
}
