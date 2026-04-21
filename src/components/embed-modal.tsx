'use client'

import { useState } from 'react'

/**
 * Parses what the user pastes and returns a clean iframe snippet or null.
 *
 * Accepts:
 * - A full <iframe ...></iframe> HTML snippet (most common — Tango, Scribe,
 *   Loom, YouTube "Embed" buttons all give you this)
 * - A bare URL (we wrap it in a default iframe)
 *
 * Strips any HTML attributes we don't allow (e.g. event handlers), keeping
 * only a safe set. Only allows https:// src.
 */
function buildIframe(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Case 1: full iframe tag
  const iframeMatch = trimmed.match(/<iframe\b([^>]*?)>/i)
  if (iframeMatch) {
    const attrs = iframeMatch[1]
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)
    if (!srcMatch) return null
    const src = srcMatch[1]
    if (!src.startsWith('https://')) return null

    // Pull through a safe subset of attributes if present
    const pick = (name: string) => {
      const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
      return m ? m[1] : null
    }
    const title = pick('title')
    const sandbox = pick('sandbox')
    const allow = pick('allow')
    const width = pick('width') ?? '100%'
    const height = pick('height')
    const referrerpolicy = pick('referrerpolicy')
    const styleAttr = pick('style')

    const parts = [`<iframe src="${src}"`]
    if (title) parts.push(`title="${title.replace(/"/g, '&quot;')}"`)
    parts.push(`width="${width}"`)
    if (height) parts.push(`height="${height}"`)
    if (sandbox) parts.push(`sandbox="${sandbox.replace(/"/g, '&quot;')}"`)
    if (allow) parts.push(`allow="${allow.replace(/"/g, '&quot;')}"`)
    if (referrerpolicy) parts.push(`referrerpolicy="${referrerpolicy}"`)
    if (styleAttr) parts.push(`style="${styleAttr.replace(/"/g, '&quot;')}"`)
    parts.push('allowfullscreen loading="lazy" frameborder="0"')
    return parts.join(' ') + '></iframe>'
  }

  // Case 2: bare URL
  if (/^https?:\/\//i.test(trimmed)) {
    const url = trimmed.startsWith('https://') ? trimmed : trimmed.replace(/^http:\/\//i, 'https://')
    return `<iframe src="${url}" width="100%" height="640" allowfullscreen loading="lazy" frameborder="0"></iframe>`
  }

  return null
}

export function EmbedModal({
  onInsert,
  onClose,
}: {
  onInsert: (snippet: string) => void
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  function handleInsert() {
    const snippet = buildIframe(input)
    if (!snippet) {
      setError('Paste an embed code (<iframe ...>) or a URL (https://...)')
      return
    }
    onInsert('\n\n' + snippet + '\n\n')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 rounded-xl max-w-lg w-full p-6 space-y-4 border border-gray-800"
      >
        <div>
          <h3 className="text-lg font-semibold text-white">Embed Content</h3>
          <p className="text-sm text-gray-400 mt-1">
            Paste an embed code or URL from Tango, Scribe, Loom, YouTube, Google Docs,
            or any other site that supports iframe embeds.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Embed code or URL
          </label>
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setError('') }}
            rows={6}
            placeholder={'<iframe src="https://app.tango.us/app/embed/..." ...></iframe>\n\nor\n\nhttps://app.tango.us/app/embed/...'}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-400">
          <p className="font-medium text-gray-300 mb-1">How to get an embed code</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><span className="text-gray-300">Tango:</span> click Share → Embed → copy the code</li>
            <li><span className="text-gray-300">Scribe:</span> click Share → Embed → copy the code</li>
            <li><span className="text-gray-300">Loom / YouTube:</span> click Share → Embed → copy</li>
            <li><span className="text-gray-300">Google Docs / Slides:</span> File → Share → Publish → Embed</li>
          </ul>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInsert}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Insert Embed
          </button>
        </div>
      </div>
    </div>
  )
}
