import fs from 'node:fs'
import path from 'node:path'

// Shared {{TOKEN}} template primitives live in template-engine.ts (also used by
// the weekly digest renderer); re-exported here so existing imports keep working.
export { escapeHtml, injectSlots, expandBlock, type SlotValue } from '@/lib/template-engine'

export function loadNewsletterTemplate(): string {
  return fs.readFileSync(path.join(process.cwd(), 'templates', 'newsletter-skeleton.html'), 'utf8')
}

/**
 * Defense-in-depth defanging for model-returned HTML slots (GLANCE_ITEMS, CLINIC_CONTENT,
 * ANNOUNCEMENT_BLOCKS, AHEAD_ITEMS) before they're injected raw into the newsletter template.
 * This is NOT a general-purpose HTML sanitizer — it's a small, readable set of regex passes
 * aimed at the highest-risk vectors a misbehaving/compromised model response could produce:
 * <script> tags, inline event-handler attributes, and javascript:/data:text/html URIs.
 * <style> blocks are intentionally left alone (legitimate in email HTML).
 */
export function sanitizeModelHtml(html: string): string {
  let out = html
  // Remove complete <script>...</script> blocks.
  out = out.replace(/<script[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  // Remove any stray/unclosed <script> or </script> tags left behind.
  out = out.replace(/<\/?script[^>]*>/gi, '')
  // Strip on*="...", on*='...', and on*=unquoted event-handler attributes.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  // Neutralize javascript:/data:text/html URIs used in href or src attributes.
  out = out.replace(/(href|src)(\s*=\s*)"[^"]*"/gi, (full, attr, eq) =>
    /javascript:|data:text\/html/i.test(full) ? `${attr}${eq}"#"` : full
  )
  out = out.replace(/(href|src)(\s*=\s*)'[^']*'/gi, (full, attr, eq) =>
    /javascript:|data:text\/html/i.test(full) ? `${attr}${eq}'#'` : full
  )
  return out
}

/** QA rule 4: UTM-tag club + Court Reserve links. campaign = "YYYY-MM". Matches href="..." and href='...'. */
export function applyUtm(html: string, campaign: string): string {
  return html.replace(/href=("([^"]*)"|'([^']*)')/g, (full, _quoted, dq, sq) => {
    const quote = dq !== undefined ? '"' : "'"
    const url: string = dq !== undefined ? dq : sq
    if (!/^https:\/\//.test(url)) return full
    if (!/(thepbjar\.com|courtreserve\.com)/i.test(url)) return full
    if (/[?&]utm_source=/.test(url)) return full
    const sep = url.includes('?') ? '&' : '?'
    return `href=${quote}${url}${sep}utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}${quote}`
  })
}

export interface QaResult { errors: string[]; warnings: string[] }

/** Pure-code QA gate. Any error blocks the Copy button. */
export function qaGate(html: string): QaResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Rule: zero unresolved "{{" of any shape. List token names when they're {{TOKEN}}-shaped;
  // otherwise fall back to a generic message so malformed/partial mustaches still block Copy.
  if (html.includes('{{')) {
    const tokenShaped = html.match(/\{\{[A-Z_]+\}\}/g)
    if (tokenShaped) {
      errors.push(`Unfilled slots: ${[...new Set(tokenShaped)].join(', ')}`)
    } else {
      errors.push(`Unresolved '{{' found`)
    }
  }

  if (/xx\/xx/i.test(html)) errors.push('Placeholder date "xx/xx" found')
  const missing = html.match(/MISSING:[^<\n]*/g)
  if (missing) errors.push(...missing.map((m) => `Model flagged a missing fact — ${m.trim()}`))

  // href scan — matches both href="..." and href='...'.
  for (const m of html.matchAll(/href=("([^"]*)"|'([^']*)')/g)) {
    const url: string = m[2] !== undefined ? m[2] : m[3]
    if (!/^(https:\/\/|mailto:)/.test(url)) errors.push(`Insecure or malformed link: ${url || '(empty)'}`)
  }
  // Unquoted href="..." is invisible to the scan above — flag it explicitly as malformed.
  if (/href=(?!["'])/.test(html)) errors.push('Unquoted href attribute found — wrap the URL in quotes')

  const ph = (html.match(/placehold\.co/g) ?? []).length
  if (ph > 0) warnings.push(`${ph} photo placeholder(s) to replace in Court Reserve`)
  return { errors, warnings }
}
