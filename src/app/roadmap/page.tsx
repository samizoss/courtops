import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import { IdeaForm } from './idea-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Roadmap — CourtOps',
  description: "What we're building, what's next, and what's shipped.",
}

interface RoadmapItem {
  title: string
  description: string
  shipped?: string
  release?: string
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

const colorMap = {
  green: {
    dot: 'bg-emerald-400',
    card: 'border-emerald-500/20 hover:border-emerald-500/40',
    header: 'text-emerald-400',
    count: 'text-emerald-400/70',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  orange: {
    dot: 'bg-orange-400',
    card: 'border-orange-500/20 hover:border-orange-500/40',
    header: 'text-orange-400',
    count: 'text-orange-400/70',
    badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  blue: {
    dot: 'bg-blue-400',
    card: 'border-blue-500/20 hover:border-blue-500/40',
    header: 'text-blue-400',
    count: 'text-blue-400/70',
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  gray: {
    dot: 'bg-gray-400',
    card: 'border-gray-700 hover:border-gray-600',
    header: 'text-gray-400',
    count: 'text-gray-500',
    badge: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  },
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

export default function RoadmapPage() {
  const data = getRoadmap()
  if (!data) return <p className="text-gray-500 text-center py-20">Roadmap not found.</p>

  const updatedDate = new Date(data.updated + 'T12:00:00')
  const updatedLabel = updatedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const ago = daysAgo(data.updated)

  const totalItems = data.categories.reduce((s, c) => s + c.items.length, 0)
  const shippedCount = data.categories.find((c) => c.key === 'shipped')?.items.length ?? 0
  const activeCount = totalItems - shippedCount

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/courtops-wordmark.svg" alt="CourtOps" className="h-8" />
          <div className="h-5 w-px bg-gray-700" />
          <span className="text-sm text-gray-400 font-medium">Roadmap</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            <span>Updated {ago}</span>
            <a href="/roadmap/detail" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">
              Detail view
            </a>
            <a href="/releases" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">
              Release notes
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-12">
        {/* Hero + idea form side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 mb-12">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Product Roadmap</h1>
            <p className="text-gray-400 mt-2">
              What we&apos;re building, what&apos;s next, and what&apos;s shipped.
            </p>
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="text-gray-300">{activeCount} in the pipeline</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-gray-300">{shippedCount} shipped</span>
              </div>
              <span className="text-xs text-gray-600">
                Updated {updatedLabel}
              </span>
            </div>
          </div>

          {/* Idea form — top right on desktop, inline on mobile */}
          <div className="border border-gray-800 rounded-xl bg-gray-900/60 px-5 py-5 lg:sticky lg:top-20 self-start">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="text-orange-500">+</span> Submit an idea
            </h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              What would make CourtOps better for your club?
            </p>
            <IdeaForm />
          </div>
        </div>

        {/* Roadmap columns */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {data.categories.map((cat) => {
            const colors = colorMap[cat.color]
            return (
              <div key={cat.key}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <h2 className={`text-sm font-semibold uppercase tracking-wide ${colors.header}`}>
                    {cat.label}
                  </h2>
                  <span className={`text-xs ${colors.count}`}>{cat.items.length}</span>
                </div>
                <div className="space-y-3">
                  {cat.items.map((item) => (
                    <div
                      key={item.title}
                      className={`bg-gray-900/60 border rounded-lg px-4 py-3 transition-colors ${colors.card}`}
                    >
                      <h3 className="text-sm font-semibold text-white leading-snug">{item.title}</h3>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{item.description}</p>
                      {item.shipped && (
                        item.release ? (
                          <a
                            href={`/releases#${item.release}`}
                            className={`inline-block text-[10px] font-medium mt-2 px-2 py-0.5 rounded-full border transition-colors ${colors.badge} hover:bg-emerald-500/25`}
                          >
                            {item.shipped} &rarr;
                          </a>
                        ) : (
                          <span className={`inline-block text-[10px] font-medium mt-2 px-2 py-0.5 rounded-full border ${colors.badge}`}>
                            {item.shipped}
                          </span>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-20">
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex items-center justify-between text-xs text-gray-600">
          <span>CourtOps</span>
          <span>courtops.app</span>
        </div>
      </footer>
    </div>
  )
}
