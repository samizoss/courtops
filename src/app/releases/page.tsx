import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import ReactMarkdown from 'react-markdown'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Release Notes — CourtOps',
  description: 'Latest updates and improvements to CourtOps',
}

interface ReleaseNote {
  date: string
  label: string
  content: string
}

function parseRelease(filename: string, raw: string): ReleaseNote {
  const date = filename.replace('.md', '')
  const d = new Date(date + 'T12:00:00')
  const label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const lines = raw.split('\n')
  const bodyStart = lines.findIndex((l, i) => i > 0 && l.startsWith('---'))
  const content = bodyStart >= 0 ? lines.slice(bodyStart + 1).join('\n').trim() : lines.slice(1).join('\n').trim()
  return { date, label, content }
}

function getReleases(): ReleaseNote[] {
  const dir = path.join(process.cwd(), 'docs', 'releases')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse()
  return files.map((f) => parseRelease(f, fs.readFileSync(path.join(dir, f), 'utf-8')))
}

export default function ReleasesPage() {
  const releases = getReleases()

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/courtops-wordmark.svg" alt="CourtOps" className="h-8" />
          <div className="h-5 w-px bg-gray-700" />
          <span className="text-sm text-gray-400 font-medium">Release Notes</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight">Release Notes</h1>
          <p className="text-gray-400 mt-2">Latest updates, fixes, and improvements.</p>
        </div>

        <div className="space-y-10">
          {releases.map((r) => (
            <article key={r.date} id={r.date} className="group">
              <div className="flex items-center gap-3 mb-4">
                <time
                  dateTime={r.date}
                  className="text-sm font-semibold text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20"
                >
                  {r.label}
                </time>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl px-6 py-5 prose-invert">
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => (
                      <h2 className="text-lg font-semibold text-white mt-6 mb-3 first:mt-0">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-gray-200 mt-5 mb-2 first:mt-0">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm text-gray-300 leading-relaxed mb-3">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="space-y-1.5 mb-4">{children}</ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm text-gray-300 leading-relaxed flex gap-2">
                        <span className="text-orange-500 mt-1.5 shrink-0">-</span>
                        <span>{children}</span>
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className="text-white font-semibold">{children}</strong>
                    ),
                    code: ({ children }) => (
                      <code className="text-xs bg-gray-800 text-orange-300 px-1.5 py-0.5 rounded font-mono">{children}</code>
                    ),
                    hr: () => <hr className="border-gray-800 my-4" />,
                    a: ({ href, children }) => (
                      <a href={href} className="text-orange-400 hover:text-orange-300 underline underline-offset-2">{children}</a>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="text-sm w-full border-collapse">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-700 pb-2 pr-4">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="text-sm text-gray-300 py-1.5 pr-4 border-b border-gray-800/50">{children}</td>
                    ),
                  }}
                >
                  {r.content}
                </ReactMarkdown>
              </div>
            </article>
          ))}
        </div>

        {releases.length === 0 && (
          <p className="text-gray-500 text-center py-20">No release notes yet.</p>
        )}
      </main>

      <footer className="border-t border-gray-800 mt-20">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-gray-600">
          <span>CourtOps</span>
          <span>courtops.app</span>
        </div>
      </footer>
    </div>
  )
}
