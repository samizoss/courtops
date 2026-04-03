export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/get-user-org'
import { ChecklistView } from './checklist-view'
import { ChecklistDateNav } from './checklist-date-nav'

export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const supabase = await createClient()
  const userOrg = await getUserOrg()
  if (!userOrg) return null

  const params = await searchParams
  const today = new Date().toISOString().split('T')[0]
  const selectedDate = params.date || today
  const isToday = selectedDate === today
  const isAdmin = userOrg.role === 'owner' || userOrg.role === 'admin'

  const { data: templates } = await supabase
    .from('checklist_templates')
    .select(`
      *,
      checklist_items (
        *,
        checklist_completions (
          *,
          profile:profiles!checklist_completions_completed_by_fkey (full_name)
        )
      )
    `)
    .eq('is_active', true)
    .eq('checklist_items.checklist_completions.completed_date', selectedDate)
    .order('sort_order')

  const checklists = (templates ?? []).map((template) => ({
    ...template,
    items: (template.checklist_items ?? [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((item: { id: string; label: string; sort_order: number; checklist_completions?: { id: string; completed_by: string; completed_at: string; notes?: string; profile?: { full_name: string } }[] }) => ({
        id: item.id,
        label: item.label,
        sort_order: item.sort_order,
        completed: (item.checklist_completions?.length ?? 0) > 0,
        completion: item.checklist_completions?.[0]
          ? {
              id: item.checklist_completions[0].id,
              completed_by: item.checklist_completions[0].completed_by,
              completed_by_name: item.checklist_completions[0].profile?.full_name ?? null,
              completed_at: item.checklist_completions[0].completed_at,
              notes: item.checklist_completions[0].notes,
            }
          : null,
      })),
  }))

  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Daily Checklists</h2>
          <p className="text-gray-400 text-sm mt-1">{displayDate}</p>
        </div>
        {isAdmin && (
          <Link
            href="/checklists/admin"
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Admin
          </Link>
        )}
      </div>

      <ChecklistDateNav selectedDate={selectedDate} today={today} />

      {!isToday && (
        <div className="mb-4 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg">
          <p className="text-xs text-gray-400">
            Viewing historical data for {displayDate}. Checklists are read-only for past dates.
          </p>
        </div>
      )}

      {checklists.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400">No checklists set up yet.</p>
          <p className="text-gray-500 text-sm mt-1">An admin can create checklist templates to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {checklists.map((checklist) => (
            <ChecklistView
              key={checklist.id}
              checklist={checklist}
              orgId={userOrg.orgId}
              userId={userOrg.userId}
              isAdmin={isAdmin}
              readOnly={!isToday}
            />
          ))}
        </div>
      )}
    </div>
  )
}
