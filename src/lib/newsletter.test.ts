import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  injectSlots,
  expandBlock,
  applyUtm,
  qaGate,
  loadNewsletterTemplate,
  sanitizeModelHtml,
  removeSections,
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

describe('removeSections', () => {
  const template = [
    '<p>core-top</p>',
    '<!-- SECTION: CLINICS -->',
    '<tr><td>{{CLINIC_CONTENT}}</td></tr>',
    '<!-- /SECTION: CLINICS -->',
    '<!-- SECTION: LEAGUES -->',
    '<p>{{LEAGUE_INTRO}}</p>',
    '<!-- SECTION: LEAGUE_REG -->',
    '<p>{{LEAGUE_REG_DATES}}</p>',
    '<!-- /SECTION: LEAGUE_REG -->',
    '<!-- /SECTION: LEAGUES -->',
    '<p>core-bottom</p>',
  ].join('\n')

  it('excises a single OFF section including its tokens', () => {
    const out = removeSections(template, ['CLINICS'])
    expect(out).not.toContain('{{CLINIC_CONTENT}}')
    expect(out).toContain('{{LEAGUE_INTRO}}')
    expect(out).toContain('core-top')
    expect(out).toContain('core-bottom')
  })

  it('excises multiple OFF sections in one call', () => {
    const out = removeSections(template, ['CLINICS', 'LEAGUES'])
    expect(out).not.toContain('{{CLINIC_CONTENT}}')
    expect(out).not.toContain('{{LEAGUE_INTRO}}')
    expect(out).not.toContain('{{LEAGUE_REG_DATES}}')
    expect(out).toContain('core-top')
    expect(out).toContain('core-bottom')
  })

  it('strips ALL section markers from the output, on or off', () => {
    const out = removeSections(template, ['CLINICS'])
    expect(out).not.toContain('SECTION:')
    const none = removeSections(template, [])
    expect(none).not.toContain('SECTION:')
    expect(none).toContain('{{CLINIC_CONTENT}}')
  })

  it('excises a nested section (LEAGUE_REG) while keeping its parent', () => {
    const out = removeSections(template, ['LEAGUE_REG'])
    expect(out).not.toContain('{{LEAGUE_REG_DATES}}')
    expect(out).toContain('{{LEAGUE_INTRO}}')
  })

  it('removing a parent swallows the nested section without error, in either order', () => {
    for (const order of [['LEAGUES', 'LEAGUE_REG'], ['LEAGUE_REG', 'LEAGUES']]) {
      const out = removeSections(template, order)
      expect(out).not.toContain('{{LEAGUE_INTRO}}')
      expect(out).not.toContain('{{LEAGUE_REG_DATES}}')
      expect(out).toContain('core-top')
    }
  })

  it('throws on a section name that does not exist in the template', () => {
    expect(() => removeSections(template, ['NOT_A_SECTION'])).toThrow(/NOT_A_SECTION/)
  })

  it('throws on a malformed section name rather than building a bad regex', () => {
    expect(() => removeSections(template, ['a.*b'])).toThrow()
  })

  it('works against the real frozen template for every toggleable section', () => {
    const real = loadNewsletterTemplate()
    const all = [
      'LEAGUES', 'EVENTS', 'CLINICS', 'ANNOUNCEMENTS', 'COMMUNITY_IMAGE',
      'COMMUNITY_CARDS', 'SPOTLIGHT', 'STAFF', 'COACH_QUOTE', 'AHEAD',
    ]
    const out = removeSections(real, all)
    // Core sections always survive:
    expect(out).toContain('{{HERO_HEADLINE}}')
    expect(out).toContain('{{GLANCE_ITEMS}}')
    expect(out).toContain('{{SIGNOFF_TEXT}}')
    expect(out).toContain('Where Fun Meets Fierce Competition')
    // Toggleable content is gone:
    expect(out).not.toContain('League Lineup')
    expect(out).not.toContain('Upcoming Events')
    expect(out).not.toContain('Classes &amp; Clinics')
    expect(out).not.toContain('Club Announcements')
    expect(out).not.toContain('Member Spotlight')
    expect(out).not.toContain('Staff Shout-Out')
    expect(out).not.toContain("Coach's Corner")
    expect(out).not.toContain('Looking Ahead')
    expect(out).not.toContain('{{COMMUNITY_IMAGE_SUGGESTION}}')
    expect(out).not.toContain('SECTION:')
  })

  it('keeps every section when nothing is off, with markers stripped (real template)', () => {
    const out = removeSections(loadNewsletterTemplate(), [])
    expect(out).toContain('League Lineup')
    expect(out).toContain('Upcoming Events')
    expect(out).toContain('{{LEAGUE_REG_DATES}}')
    expect(out).not.toContain('SECTION:')
  })
})

describe('sanitizeModelHtml', () => {
  it('strips <script>...</script> blocks entirely', () => {
    const html = '<p>Hi</p><script>alert("pwned")</script><p>Bye</p>'
    const out = sanitizeModelHtml(html)
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert')
    expect(out).toBe('<p>Hi</p><p>Bye</p>')
  })

  it('strips stray/unclosed script tags', () => {
    const html = '<p>Hi</p><script src="https://evil.example/x.js">'
    const out = sanitizeModelHtml(html)
    expect(out).not.toContain('<script')
  })

  it('strips onclick and other event-handler attributes (double, single, unquoted)', () => {
    const html =
      '<div onclick="alert(1)">A</div><div onmouseover=\'alert(2)\'>B</div><div onload=alert(3)>C</div>'
    const out = sanitizeModelHtml(html)
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onmouseover')
    expect(out).not.toContain('onload')
    expect(out).not.toContain('alert')
  })

  it('neutralizes javascript: hrefs', () => {
    const html = '<a href="javascript:alert(1)">Click</a>'
    const out = sanitizeModelHtml(html)
    expect(out).not.toContain('javascript:')
  })

  it('neutralizes data:text/html sources', () => {
    const html = '<img src="data:text/html;base64,PHNjcmlwdD4=">'
    const out = sanitizeModelHtml(html)
    expect(out).not.toContain('data:text/html')
  })

  it('leaves benign inline-style HTML completely unchanged', () => {
    const html =
      '<p style="color:#26256e;font-weight:600;">Open Play <strong>this Saturday</strong> at 9am.</p><br><h3 style="margin:0;">Announcement</h3>'
    expect(sanitizeModelHtml(html)).toBe(html)
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

  it('appends utm params to a single-quoted href, preserving single quotes', () => {
    const html = "<a href='https://thepbjar.com/register'>Go</a>"
    const out = applyUtm(html, '2026-08')
    expect(out).toBe(
      "<a href='https://thepbjar.com/register?utm_source=newsletter&utm_medium=email&utm_campaign=2026-08'>Go</a>"
    )
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

  it('checks single-quoted hrefs the same as double-quoted', () => {
    const clean = qaGate("<a href='https://thepbjar.com'>Go</a>")
    expect(clean.errors).toHaveLength(0)

    const bad = qaGate("<a href='http://thepbjar.com'>Go</a>")
    expect(bad.errors.some((e) => e.includes('Insecure or malformed link'))).toBe(true)
  })

  it('errors on an unquoted href attribute', () => {
    const result = qaGate('<a href=https://thepbjar.com>Go</a>')
    expect(result.errors.some((e) => /unquoted/i.test(e))).toBe(true)
  })

  it('errors on any remaining literal "{{" even when not shaped like a {{TOKEN}}', () => {
    const result = qaGate('<p>oops {{ leftover mustache</p>')
    expect(result.errors.some((e) => e.includes("{{"))).toBe(true)
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
