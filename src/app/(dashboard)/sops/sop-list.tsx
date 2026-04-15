'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Sop, SopCategory } from '@/types/database'

const categoryMeta: Record<SopCategory, { label: string; color: string }> = {
  operations: { label: 'Operations', color: 'bg-blue-500/10 text-blue-400' },
  'front-desk': { label: 'Front Desk', color: 'bg-green-500/10 text-green-400' },
  sales: { label: 'Sales', color: 'bg-orange-500/10 text-orange-400' },
  content: { label: 'Content', color: 'bg-purple-500/10 text-purple-400' },
  emergency: { label: 'Emergency', color: 'bg-red-500/10 text-red-400' },
  equipment: { label: 'Equipment', color: 'bg-yellow-500/10 text-yellow-400' },
  general: { label: 'General', color: 'bg-gray-500/10 text-gray-400' },
}

const allCategories = Object.keys(categoryMeta) as SopCategory[]

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')       // italic
    .replace(/!\[.*?\]\(.*?\)/g, '')    // images
    .replace(/\[(.+?)\]\(.*?\)/g, '$1') // links
    .replace(/^[-*]\s+/gm, '')         // list items
    .replace(/^\d+\.\s+/gm, '')        // numbered lists
    .replace(/`(.+?)`/g, '$1')         // inline code
    .replace(/\n{2,}/g, ' ')           // collapse newlines
    .replace(/\n/g, ' ')
    .trim()
}

export function SopList({ sops, canEdit }: { sops: Sop[]; canEdit: boolean }) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<SopCategory | 'all'>('all')

  const query = search.toLowerCase()

  const filtered = sops.filter((sop) => {
    // Category filter
    if (selectedCategory !== 'all' && sop.category !== selectedCategory) return false

    // Search filter — matches title, content, or tags
    if (query) {
      const matchesTitle = sop.title.toLowerCase().includes(query)
      const matchesContent = sop.content.toLowerCase().includes(query)
      const matchesTags = sop.tags?.some((t) => t.toLowerCase().includes(query)) ?? false
      if (!matchesTitle && !matchesContent && !matchesTags) return false
    }

    return true
  })

  // Group by category
  const grouped = filtered.reduce<Record<string, Sop[]>>((acc, sop) => {
    const cat = sop.category as SopCategory
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(sop)
    return acc
  }, {})

  // Collect all tags across SOPs for quick filter chips
  const allTags = Array.from(new Set(sops.flatMap((s) => s.tags ?? [])))

  // Categories that actually have SOPs
  const activeCategories = allCategories.filter((c) => sops.some((s) => s.category === c))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Standard Operating Procedures</h2>
          <p className="text-gray-400 text-sm mt-1">Staff reference guides and procedures</p>
        </div>
        {canEdit && (
          <Link
            href="/sops/new"
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New SOP
          </Link>
        )}
      </div>

      {/* Search + filters */}
      <div className="mb-6 space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SOPs by title, content, or tag..."
          className="w-full max-w-md px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
        />

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              selectedCategory === 'all'
                ? 'bg-white text-gray-900 font-medium'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            All
          </button>
          {activeCategories.map((cat) => {
            const meta = categoryMeta[cat]
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? 'all' : cat)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  selectedCategory === cat
                    ? 'bg-white text-gray-900 font-medium'
                    : `${meta.color} hover:opacity-80`
                }`}
              >
                {meta.label}
              </button>
            )
          })}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSearch(search === tag ? '' : tag)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  search === tag
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          {search || selectedCategory !== 'all' ? (
            <>
              <p className="text-gray-400">No SOPs match your search.</p>
              <button
                onClick={() => { setSearch(''); setSelectedCategory('all') }}
                className="text-orange-500 text-sm mt-2 hover:text-orange-400"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-400">No SOPs published yet.</p>
              <p className="text-gray-500 text-sm mt-1">An admin can create procedures to share with the team.</p>
            </>
          )}
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
                  {catSops.map((sop) => (
                    <Link
                      key={sop.id}
                      href={`/sops/${sop.id}`}
                      className="bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-gray-700 transition-colors block"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white">{sop.title}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.color}`}>
                          {meta.label}
                        </span>
                        {!sop.is_published && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                            Draft
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {(() => { const plain = stripMarkdown(sop.content); return plain.slice(0, 120) + (plain.length > 120 ? '...' : '') })()}
                      </p>
                      {sop.tags && sop.tags.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {sop.tags.map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>
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
