export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { ChecklistView } from './checklist-view'

export default async function ChecklistsPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: templates } = await supabase
    .from('checklist_templates')
    .select(`
      *,
      checklist_items (
        *,
        checklist_completions (
          *
        )
      )
    `)
    .eq('is_active', true)
    .eq('checklist_items.checklist_completions.completed_date', today)
    .order('sort_order')

  // Reshape: attach today's completion status to each item
  const checklists = (templates ?? []).map((template) => ({
    ...template,
    items: (template.checklist_items ?? [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((item: { id: string; label: string; sort_order: number; checklist_completions: { id: string; completed_by: string; completed_at: string; notes: string }[] }) => ({
        id: item.id,
        label: item.label,
        sort_order: item.sort_order,
        completed: item.checklist_completions?.length > 0,
        completion: item.checklist_completions?.[0] ?? null,
      })),
  }))

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Daily Checklists</h2>
        <p className="text-gray-400 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {checklists.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400">No checklists set up yet.</p>
          <p className="text-gray-500 text-sm mt-1">An admin can create checklist templates to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {checklists.map((checklist) => (
            <ChecklistView key={checklist.id} checklist={checklist} />
          ))}
        </div>
      )}
    </div>
  )
}
