export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import type { SopCategory } from '@/types/database'

const categoryMeta: Record<SopCategory, { label: string; color: string }> = {
  operations: { label: 'Operations', color: 'bg-blue-500/10 text-blue-400' },
  'front-desk': { label: 'Front Desk', color: 'bg-green-500/10 text-green-400' },
  sales: { label: 'Sales', color: 'bg-orange-500/10 text-orange-400' },
  content: { label: 'Content', color: 'bg-purple-500/10 text-purple-400' },
  emergency: { label: 'Emergency', color: 'bg-red-500/10 text-red-400' },
  equipment: { label: 'Equipment', color: 'bg-yellow-500/10 text-yellow-400' },
  general: { label: 'General', color: 'bg-gray-500/10 text-gray-400' },
}

export default async function SopsPage() {
  const supabase = await createClient()

  const { data: sops } = await supabase
    .from('sops')
    .select('*')
    .eq('is_published', true)
    .order('category')
    .order('sort_order')

  // Group by category
  const grouped = (sops ?? []).reduce<Record<string, typeof sops>>((acc, sop) => {
    const cat = sop.category as SopCategory
    if (!acc[cat]) acc[cat] = []
    acc[cat]!.push(sop)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Standard Operating Procedures</h2>
        <p className="text-gray-400 text-sm mt-1">Staff reference guides and procedures</p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-400">No SOPs published yet.</p>
          <p className="text-gray-500 text-sm mt-1">An admin can create procedures to share with the team.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, catSops]) => {
            const meta = categoryMeta[category as SopCategory] ?? categoryMeta.general
            return (
              <div key={category}>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  {meta.label}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catSops!.map((sop) => (
                    <a
                      key={sop.id}
                      href={`/sops/${sop.id}`}
                      className="bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-gray-700 transition-colors block"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{sop.title}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {sop.content.slice(0, 120)}{sop.content.length > 120 ? '...' : ''}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
