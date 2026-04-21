'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SopCategory } from '@/types/database'

type SuggestResult = { category: SopCategory; tags: string[] }

export interface UseSopSuggestOptions {
  /**
   * Called when the user accepts the suggestion. Parent is responsible for
   * applying it to its form state (category dropdown, tags input, etc.).
   */
  onAccept: (s: SuggestResult) => void
  /**
   * Called when the user dismisses the suggestion (X button). Parent can use
   * this to remember "user rejected this one" and not re-show.
   */
  onDismiss?: () => void
}

/**
 * State machine:
 *   idle → loading → (suggestion | error) → idle
 *
 * `suggest(title, content)` triggers a request. Parent controls when to call it
 * (on Suggest button click, or debounced on content blur).
 */
export function useSopSuggest({ onAccept, onDismiss }: UseSopSuggestOptions) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [suggestion, setSuggestion] = useState<SuggestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const suggest = useCallback(async (title: string, content: string) => {
    // Cancel any in-flight request so a rapid auto-suggest doesn't race with
    // a manual click
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setState('loading')
    setError(null)

    try {
      const res = await fetch('/api/sops/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
        signal: ctrl.signal,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Suggestion failed')

      setSuggestion(data as SuggestResult)
      setState('idle')
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Suggestion failed')
      setState('error')
    }
  }, [])

  const accept = useCallback(() => {
    if (!suggestion) return
    onAccept(suggestion)
    setSuggestion(null)
  }, [suggestion, onAccept])

  const dismiss = useCallback(() => {
    setSuggestion(null)
    setError(null)
    onDismiss?.()
  }, [onDismiss])

  // Cancel on unmount
  useEffect(() => () => abortRef.current?.abort(), [])

  return { state, suggestion, error, suggest, accept, dismiss }
}

/**
 * Inline UI that shows the current suggestion with Apply / Dismiss actions.
 * Renders nothing when there's no suggestion to show.
 */
export function SopSuggestInline({
  state,
  suggestion,
  error,
  accept,
  dismiss,
}: ReturnType<typeof useSopSuggest>) {
  if (state === 'loading' && !suggestion) {
    return (
      <div className="mt-2 text-xs text-gray-500 italic">
        ✨ Analyzing...
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
        <span>⚠ {error}</span>
        <button
          type="button"
          onClick={dismiss}
          className="text-gray-500 hover:text-gray-300"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )
  }

  if (!suggestion) return null

  return (
    <div className="mt-2 flex items-start gap-3 rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2">
      <span className="text-orange-400 text-sm mt-0.5">✨</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300">
          Suggested:{' '}
          <span className="font-medium text-white capitalize">
            {suggestion.category.replace('-', ' ')}
          </span>
          {' · '}
          <span className="text-gray-400">{suggestion.tags.join(', ')}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={accept}
        className="text-xs px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="text-xs text-gray-500 hover:text-gray-300"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
