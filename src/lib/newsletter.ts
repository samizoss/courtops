import fs from 'node:fs'
import path from 'node:path'

export function loadNewsletterTemplate(): string {
  return fs.readFileSync(path.join(process.cwd(), 'templates', 'newsletter-skeleton.html'), 'utf8')
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type SlotValue = string | { value: string; html: true }

/** Replace {{TOKEN}} slots. Plain strings are HTML-escaped; {html:true} values injected raw. */
export function injectSlots(template: string, slots: Record<string, SlotValue>): string {
  let out = template
  for (const [token, v] of Object.entries(slots)) {
    const raw = typeof v === 'string' ? escapeHtml(v) : v.value
    out = out.replaceAll(`{{${token}}}`, raw)
  }
  return out
}

/** Expand a repeatable block delimited by <!-- SLOT: NAME ... --> ... <!-- /NAME -->. */
export function expandBlock(template: string, blockName: string, rows: Array<Record<string, SlotValue>>): string {
  const re = new RegExp(`<!-- SLOT: ${blockName}[\\s\\S]*?-->([\\s\\S]*?)<!-- /${blockName} -->`)
  const m = template.match(re)
  if (!m) throw new Error(`Block ${blockName} not found in template`)
  const expanded = rows.map((row) => injectSlots(m[1], row)).join('\n')
  return template.replace(re, expanded)
}

/** QA rule 4: UTM-tag club + Court Reserve links. campaign = "YYYY-MM". */
export function applyUtm(html: string, campaign: string): string {
  return html.replace(/href="(https:\/\/[^"]+)"/g, (full, url: string) => {
    if (!/(thepbjar\.com|courtreserve\.com)/i.test(url)) return full
    if (/[?&]utm_source=/.test(url)) return full
    const sep = url.includes('?') ? '&' : '?'
    return `href="${url}${sep}utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}"`
  })
}

export interface QaResult { errors: string[]; warnings: string[] }

/** Pure-code QA gate. Any error blocks the Copy button. */
export function qaGate(html: string): QaResult {
  const errors: string[] = []
  const warnings: string[] = []
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g)
  if (leftover) errors.push(`Unfilled slots: ${[...new Set(leftover)].join(', ')}`)
  if (/xx\/xx/i.test(html)) errors.push('Placeholder date "xx/xx" found')
  const missing = html.match(/MISSING:[^<\n]*/g)
  if (missing) errors.push(...missing.map((m) => `Model flagged a missing fact — ${m.trim()}`))
  for (const m of html.matchAll(/href="([^"]*)"/g)) {
    if (!/^(https:\/\/|mailto:)/.test(m[1])) errors.push(`Insecure or malformed link: ${m[1] || '(empty)'}`)
  }
  const ph = (html.match(/placehold\.co/g) ?? []).length
  if (ph > 0) warnings.push(`${ph} photo placeholder(s) to replace in Court Reserve`)
  return { errors, warnings }
}
