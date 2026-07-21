'use client'

import { useState } from 'react'
import { useToast } from '@/components/toast'
import type { WeeklyDigestRun } from '@/types/database'

interface Props {
  latestRun: WeeklyDigestRun | null
  previewRun: WeeklyDigestRun | null
  previewDateRange: string | null
  emailHtml: string | null
  /** owner/admin only may generate; staff see previews, Copy HTML, Download PNG. */
  isAdmin: boolean
}

export function WeeklyDigestClient({ latestRun, previewRun, previewDateRange, emailHtml, isAdmin }: Props) {
  const { toast } = useToast()
  const [generating, setGenerating] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/weekly-digest/run', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast(body.error || 'Failed to generate digest', 'error')
        return
      }
      window.location.reload()
    } catch (err) {
      console.error('Generate digest failed:', err)
      toast('Failed to generate digest', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    if (!emailHtml) return
    try {
      await navigator.clipboard.writeText(emailHtml)
      toast('Email HTML copied to clipboard')
    } catch (err) {
      console.error('Copy failed:', err)
      toast('Copy failed', 'error')
    }
  }

  const generatedAtLabel = latestRun
    ? new Date(latestRun.generated_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Weekly Digest</h1>
          <p className="text-sm text-gray-400 mt-1">
            {previewDateRange ? `This Week @ The Jar — ${previewDateRange}` : 'No digest generated yet'}
          </p>
          {generatedAtLabel && (
            <p className="text-xs text-gray-500 mt-1">
              Last run {generatedAtLabel} &middot;{' '}
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  latestRun?.triggered_by === 'cron' ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-700/40 text-gray-300'
                }`}
              >
                {latestRun?.triggered_by}
              </span>
            </p>
          )}
        </div>
        {/* Generate is owner/admin-only — the API route 403s regardless, this
            just avoids offering staff a button that can only fail. */}
        {isAdmin && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {generating ? 'Generating…' : 'Generate now'}
          </button>
        )}
      </div>

      {latestRun?.status === 'error' && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4">
          <p className="text-sm text-red-300 font-medium">Latest run failed</p>
          <p className="text-xs text-red-400/80 mt-1 font-mono break-words">{latestRun.error}</p>
          {previewRun && (
            <p className="text-xs text-gray-400 mt-2">Showing the last successful digest below instead.</p>
          )}
        </div>
      )}

      {!previewRun ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-sm text-gray-400">
            {isAdmin ? (
              <>
                No digest has been generated yet. Click <span className="text-gray-300">Generate now</span> to pull
                this week&apos;s Court Reserve events.
              </>
            ) : (
              <>No digest has been generated yet. Ask an admin to generate one.</>
            )}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300">Email preview</h3>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Copy HTML
              </button>
            </div>
            <iframe srcDoc={emailHtml ?? ''} className="w-full h-[600px] bg-white" title="Weekly digest email preview" />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300">Social graphic</h3>
              <a
                href={`/api/weekly-digest/image?week=${previewRun.week_start}`}
                download={`this-week-at-the-jar-${previewRun.week_start}.png`}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Download PNG
              </a>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 bg-gray-950 overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/weekly-digest/image?week=${previewRun.week_start}`}
                alt="This Week @ The Jar social graphic"
                className="max-w-full h-auto rounded-lg shadow-lg"
                style={{ maxHeight: 560 }}
              />
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-600">
        Events with zero Court Reserve registrations don&apos;t appear (CR API limitation).
      </p>
    </div>
  )
}
