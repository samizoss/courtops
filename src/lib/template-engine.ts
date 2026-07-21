/**
 * Shared `{{TOKEN}}` template engine — used by the weekly digest renderer.
 *
 * NOTE: This branch (feat/weekly-digest) cannot import from `@/lib/newsletter`
 * because that file is owned by the parallel `feat/newsletter-builder` branch.
 * This file duplicates ONLY the template-engine primitives (escapeHtml,
 * injectSlots, expandBlock) — no QA gate, no UTM logic, which stay newsletter-
 * specific. At merge time the orchestrator should consolidate `newsletter.ts`
 * to import these three functions from here instead of keeping its own copies.
 */

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
