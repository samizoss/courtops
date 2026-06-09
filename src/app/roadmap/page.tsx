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

export default function RoadmapPage() {
  const data = getRoadmap()
  if (!data) return <p className="text-gray-500 text-center py-20">Roadmap not found.</p>

  const updatedDate = new Date(data.updated + 'T12:00:00')
  const updatedLabel = updatedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/courtops-wordmark.svg" alt="CourtOps" className="h-8" />
          <div className="h-5 w-px bg-gray-700" />
          <span className="text-sm text-gray-400 font-medium">Roadmap</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Product Roadmap</h1>
          <p className="text-gray-400 mt-2">
            What we&apos;re building, what&apos;s next, and what&apos;s shipped.
          </p>
          <p className="text-xs text-gray-600 mt-1">Last updated {updatedLabel}</p>
        </div>

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

        {/* Idea submission */}
        <div className="mt-16 max-w-xl mx-auto">
          <div className="border border-gray-800 rounded-xl bg-gray-900/60 px-6 py-6">
            <h2 className="text-lg font-semibold text-white">Have an idea?</h2>
            <p className="text-sm text-gray-400 mt-1 mb-5">
              We&apos;re always looking for ways to make CourtOps better. Tell us what you&apos;d like to see.
            </p>
            <IdeaForm />
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-20">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-gray-600">
          <span>CourtOps</span>
          <span>courtops.app</span>
        </div>
      </footer>
    </div>
  )
}
