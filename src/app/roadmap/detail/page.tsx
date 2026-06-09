import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Roadmap Detail — CourtOps',
  description: 'Detailed sub-feature breakdown of the CourtOps product roadmap.',
}

interface DetailItem {
  feature: string
  status: 'built' | 'partial' | 'not-built'
  note?: string
}

interface RoadmapItem {
  title: string
  description: string
  shipped?: string
  release?: string
  details?: DetailItem[]
}

interface RoadmapCategory {
  key: string
  label: string
  color: 'green' | 'orange' | 'blue' | 'gray'
  items: RoadmapItem[]
}

interface RoadmapData {
  updated: string
  categories: RoadmapCategory[]
}

const statusConfig = {
  built: { label: 'Built', dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  partial: { label: 'Partial', dot: 'bg-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  'not-built': { label: 'Not built', dot: 'bg-gray-500', text: 'text-gray-500', bg: 'bg-gray-500/10' },
}

const colorConfig = {
  green: { border: 'border-emerald-500/30', header: 'text-emerald-400', accent: 'bg-emerald-500/10' },
  orange: { border: 'border-orange-500/30', header: 'text-orange-400', accent: 'bg-orange-500/10' },
  blue: { border: 'border-blue-500/30', header: 'text-blue-400', accent: 'bg-blue-500/10' },
  gray: { border: 'border-gray-700', header: 'text-gray-400', accent: 'bg-gray-500/10' },
}

function getRoadmap(): RoadmapData | null {
  const file = path.join(process.cwd(), 'docs', 'roadmap.json')
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  return `${diff} days ago`
}

export default function RoadmapDetailPage() {
  const data = getRoadmap()
  if (!data) return <p className="text-gray-500 text-center py-20">Roadmap not found.</p>

  const updatedDate = new Date(data.updated + 'T12:00:00')
  const updatedLabel = updatedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const stats = data.categories.reduce((acc, cat) => {
    for (const item of cat.items) {
      if (!item.details) continue
      for (const d of item.details) {
        acc[d.status] = (acc[d.status] || 0) + 1
      }
    }
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/courtops-wordmark.svg" alt="CourtOps" className="h-8" />
          <div className="h-5 w-px bg-gray-700" />
          <span className="text-sm text-gray-400 font-medium">Roadmap Detail</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            <span>Updated {daysAgo(data.updated)}</span>
            <a href="/roadmap" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">
              Overview
            </a>
            <a href="/releases" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">
              Releases
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Roadmap Detail</h1>
          <p className="text-gray-400 mt-2">Sub-feature breakdown for every roadmap item.</p>
          <div className="flex items-center gap-5 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-gray-300">{stats.built || 0} built</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-gray-300">{stats.partial || 0} partial</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="text-gray-300">{stats['not-built'] || 0} not built</span>
            </div>
            <span className="text-xs text-gray-600">Updated {updatedLabel}</span>
          </div>
        </div>

        <div className="space-y-12">
          {data.categories.map((cat) => {
            const colors = colorConfig[cat.color]
            const itemsWithDetails = cat.items.filter((i) => i.details && i.details.length > 0)
            if (itemsWithDetails.length === 0 && cat.key === 'shipped') {
              return (
                <section key={cat.key}>
                  <h2 className={`text-lg font-semibold uppercase tracking-wide mb-4 ${colors.header}`}>
                    {cat.label}
                    <span className="text-xs font-normal ml-2 text-gray-500">{cat.items.length} features</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cat.items.map((item) => (
                      <div key={item.title} className={`border ${colors.border} rounded-lg px-4 py-3 bg-gray-900/40`}>
                        <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                        <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                        {item.shipped && item.release ? (
                          <a
                            href={`/releases#${item.release}`}
                            className="inline-block text-[10px] font-medium mt-2 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                          >
                            {item.shipped} &rarr;
                          </a>
                        ) : item.shipped ? (
                          <span className="inline-block text-[10px] font-medium mt-2 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                            {item.shipped}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              )
            }

            return (
              <section key={cat.key}>
                <h2 className={`text-lg font-semibold uppercase tracking-wide mb-6 ${colors.header}`}>
                  {cat.label}
                  <span className="text-xs font-normal ml-2 text-gray-500">{cat.items.length} items</span>
                </h2>
                <div className="space-y-6">
                  {cat.items.map((item) => {
                    const builtCount = item.details?.filter((d) => d.status === 'built').length ?? 0
                    const totalCount = item.details?.length ?? 0
                    const pct = totalCount > 0 ? Math.round((builtCount / totalCount) * 100) : 0

                    return (
                      <div key={item.title} className={`border ${colors.border} rounded-xl bg-gray-900/40 overflow-hidden`}>
                        <div className="px-5 py-4 flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-base font-semibold text-white">{item.title}</h3>
                            <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                          </div>
                          {totalCount > 0 && (
                            <div className="text-right shrink-0">
                              <span className="text-sm font-semibold text-white">{builtCount}/{totalCount}</span>
                              <div className="w-20 h-1.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        {item.details && item.details.length > 0 && (
                          <div className="border-t border-gray-800/50">
                            {item.details.map((d, i) => {
                              const sc = statusConfig[d.status]
                              return (
                                <div
                                  key={i}
                                  className={`flex items-start gap-3 px-5 py-2.5 ${i > 0 ? 'border-t border-gray-800/30' : ''}`}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${sc.dot}`} />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm text-gray-200">{d.feature}</span>
                                    {d.note && (
                                      <span className="text-xs text-gray-500 ml-2">— {d.note}</span>
                                    )}
                                  </div>
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${sc.bg} ${sc.text}`}>
                                    {sc.label}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-20">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-gray-600">
          <span>CourtOps</span>
          <span>courtops.app</span>
        </div>
      </footer>
    </div>
  )
}
