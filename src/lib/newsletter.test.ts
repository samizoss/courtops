import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  injectSlots,
  expandBlock,
  applyUtm,
  qaGate,
  loadNewsletterTemplate,
} from './newsletter'

describe('loadNewsletterTemplate', () => {
  it('loads the frozen template file and contains known slot markers', () => {
    const html = loadNewsletterTemplate()
    expect(html).toContain('{{MONTH}}')
    expect(html).toContain('SLOT: LEAGUE_ROWS')
  })
})

describe('escapeHtml', () => {
  it('escapes &, <, >, and "', () => {
    expect(escapeHtml('& < > "')).toBe('&amp; &lt; &gt; &quot;')
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Open Play this Saturday')).toBe('Open Play this Saturday')
  })
})

describe('injectSlots', () => {
  it('replaces all occurrences of a token', () => {
    const template = '<p>{{NAME}}</p><p>{{NAME}}</p>'
    const out = injectSlots(template, { NAME: 'Geneva' })
    expect(out).toBe('<p>Geneva</p><p>Geneva</p>')
  })

  it('HTML-escapes plain string slots', () => {
    const template = '<p>{{TITLE}}</p>'
    const out = injectSlots(template, { TITLE: 'Save 10% & win big <today>' })
    expect(out).toBe('<p>Save 10% &amp; win big &lt;today&gt;</p>')
  })

  it('injects html:true slots raw, without escaping', () => {
    const template = '<div>{{BODY}}</div>'
    const out = injectSlots(template, {
      BODY: { value: '<strong>Bold</strong> & more', html: true },
    })
    expect(out).toBe('<div><strong>Bold</strong> & more</div>')
  })
})

describe('expandBlock', () => {
  const template = [
    '<p>before</p>',
    '<!-- SLOT: LEAGUE_ROWS — repeat this block per league -->',
    '<tr><td>{{LEAGUE_NAME}}</td></tr>',
    '<!-- /LEAGUE_ROWS -->',
    '<p>after</p>',
  ].join('\n')

  it('repeats the marked block once per row and removes the markers', () => {
    const out = expandBlock(template, 'LEAGUE_ROWS', [
      { LEAGUE_NAME: 'Ladder Play' },
      { LEAGUE_NAME: 'Open Play' },
    ])
    expect(out).not.toContain('SLOT: LEAGUE_ROWS')
    expect(out).not.toContain('/LEAGUE_ROWS')
    expect(out).toContain('<tr><td>Ladder Play</td></tr>')
    expect(out).toContain('<tr><td>Open Play</td></tr>')
    expect(out).toContain('<p>before</p>')
    expect(out).toContain('<p>after</p>')
  })

  it('renders an empty region when rows is an empty array', () => {
    const out = expandBlock(template, 'LEAGUE_ROWS', [])
    expect(out).not.toContain('{{LEAGUE_NAME}}')
    expect(out).not.toContain('SLOT: LEAGUE_ROWS')
    expect(out).toContain('<p>before</p>')
    expect(out).toContain('<p>after</p>')
  })

  it('throws when the named block is not found in the template', () => {
    expect(() => expandBlock(template, 'NOT_A_BLOCK', [])).toThrow(
      /NOT_A_BLOCK/
    )
  })
})

describe('applyUtm', () => {
  it('appends utm params to a thepbjar.com link with no existing query string', () => {
    const html = '<a href="https://thepbjar.com/register">Go</a>'
    const out = applyUtm(html, '2026-08')
    expect(out).toBe(
      '<a href="https://thepbjar.com/register?utm_source=newsletter&utm_medium=email&utm_campaign=2026-08">Go</a>'
    )
  })

  it('appends utm params to a courtreserve.com link with an existing query string using &', () => {
    const html = '<a href="https://app.courtreserve.com/Online/Events?id=5">Go</a>'
    const out = applyUtm(html, '2026-08')
    expect(out).toBe(
      '<a href="https://app.courtreserve.com/Online/Events?id=5&utm_source=newsletter&utm_medium=email&utm_campaign=2026-08">Go</a>'
    )
  })

  it('leaves non-club links untouched', () => {
    const html = '<a href="https://placehold.co/640x300">img</a>'
    expect(applyUtm(html, '2026-08')).toBe(html)
  })

  it('skips links that already carry utm_source', () => {
    const html =
      '<a href="https://thepbjar.com/register?utm_source=newsletter&utm_medium=email&utm_campaign=2026-07">Go</a>'
    expect(applyUtm(html, '2026-08')).toBe(html)
  })
})

describe('qaGate', () => {
  it('errors when a {{TOKEN}} slot is left unfilled', () => {
    const result = qaGate('<p>{{HERO_HEADLINE}}</p>')
    expect(result.errors.some((e) => e.includes('HERO_HEADLINE'))).toBe(true)
  })

  it('errors on a MISSING: fact flagged by the model', () => {
    const result = qaGate('<p>MISSING: hero registration URL</p>')
    expect(result.errors.some((e) => e.includes('MISSING'))).toBe(true)
  })

  it('errors on a leftover xx/xx placeholder date', () => {
    const result = qaGate('<p>Registration opens xx/xx at noon</p>')
    expect(result.errors.some((e) => e.includes('xx/xx'))).toBe(true)
  })

  it('errors on a non-https/mailto href', () => {
    const result = qaGate('<a href="http://thepbjar.com">Go</a>')
    expect(result.errors.some((e) => e.includes('Insecure or malformed link'))).toBe(true)
  })

  it('allows mailto and https hrefs without error', () => {
    const result = qaGate(
      '<a href="https://thepbjar.com">Go</a><a href="mailto:contactpbj@thepbjar.com">Email</a>'
    )
    expect(result.errors).toHaveLength(0)
  })

  it('warns (does not error) on placehold.co placeholder images', () => {
    const result = qaGate('<img src="https://placehold.co/640x300/26256e/65bee5?text=hero">')
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.some((w) => w.includes('placeholder'))).toBe(true)
  })

  it('returns no errors or warnings for clean, fully-injected HTML', () => {
    const result = qaGate('<a href="https://thepbjar.com">Go</a><p>All good.</p>')
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})
