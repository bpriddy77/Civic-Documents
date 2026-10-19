import { describe, expect, it } from 'vitest'
// @ts-expect-error - plain ESM module shared with the crawler script
import { extractHtml, dropBoilerplate } from '../scripts/lib/extract.mjs'

/**
 * Search quality lives or dies here.
 *
 * Every page of a GoHighLevel site carries the same header, navigation and
 * footer. If that text is indexed, a search for "water" matches the nav link
 * on all thirty pages and the feature is worse than useless -- it is a search
 * box that confidently returns everything.
 *
 * The crawler removes blocks that appear on most pages rather than matching
 * CSS selectors, so these tests use pages shaped like a real GHL site: the
 * same chrome repeated, with a little unique content each.
 */

const chrome = `
  <header><nav>
    <a href="/">Home</a><a href="/residents">Residents</a>
    <a href="/agendas">Agendas &amp; Minutes</a><a href="/water">Water</a>
    <a href="/contact">Contact</a>
  </nav></header>
`
const footer = `
  <footer>
    <p>City of Forsan, 409 Ave D, Forsan, TX 79733</p>
    <p>Phone: 432-555-0100</p>
    <p>Privacy Policy | Terms of Use | Accessibility</p>
  </footer>
`
const page = (h1: string, body: string) =>
  `<!doctype html><html><head><title>${h1} | City of Forsan</title></head><body>
     ${chrome}
     <main><h1>${h1}</h1>${body}</main>
     ${footer}
   </body></html>`

const site = [
  page('Water Rates', '<p>The base rate is $35.00 for the first 2,000 gallons.</p>'),
  page('Start New Water Service', '<p>Pay a deposit of $150 at City Hall.</p>'),
  page('Trash and Brush Pickup', '<p>Household trash is collected on Tuesdays.</p>'),
  page('City Council', '<p>The council meets the third Tuesday of each month.</p>'),
  page('Contact Us', '<p>City Hall is open Monday through Friday.</p>'),
]

describe('extractHtml', () => {
  it('prefers the h1 over the title tag', () => {
    const { title } = extractHtml(site[0])
    expect(title).toBe('Water Rates')
  })

  it('falls back to the title tag when there is no h1', () => {
    const { title } = extractHtml('<html><head><title>Fallback</title></head><body><p>x</p></body></html>')
    expect(title).toBe('Fallback')
  })

  it('never includes script or style content', () => {
    const html = `<html><body><main>
      <script>var apiKey = "SECRET-TOKEN-SHOULD-NOT-BE-INDEXED"</script>
      <style>.x { color: papayawhip }</style>
      <p>Real content.</p></main></body></html>`
    const text = extractHtml(html).blocks.join(' ')
    expect(text).not.toContain('SECRET-TOKEN')
    expect(text).not.toContain('papayawhip')
    expect(text).toContain('Real content.')
  })

  it('drops content hidden from assistive technology', () => {
    const html = `<html><body><main>
      <p aria-hidden="true">Decorative chevron</p>
      <p hidden>Hidden panel text</p>
      <p>Visible text</p></main></body></html>`
    const text = extractHtml(html).blocks.join(' ')
    expect(text).toContain('Visible text')
    expect(text).not.toContain('Decorative chevron')
    expect(text).not.toContain('Hidden panel text')
  })

  it('still returns text from a page built entirely from divs', () => {
    const html = '<html><body><main><div><div>Only divs here, no paragraphs.</div></div></main></body></html>'
    expect(extractHtml(html).blocks.join(' ')).toContain('Only divs here')
  })
})

describe('dropBoilerplate', () => {
  const extracted = site.map((html, i) => ({ url: `/p${i}`, ...extractHtml(html) }))

  it('removes the navigation and footer that repeat on every page', () => {
    const { pages } = dropBoilerplate(extracted)
    for (const p of pages) {
      expect(p.body).not.toContain('409 Ave D')
      expect(p.body).not.toContain('Privacy Policy')
      expect(p.body).not.toContain('432-555-0100')
    }
  })

  it('keeps what is unique to each page', () => {
    const { pages } = dropBoilerplate(extracted)
    expect(pages[0].body).toContain('2,000 gallons')
    expect(pages[1].body).toContain('deposit of $150')
    expect(pages[2].body).toContain('Tuesdays')
  })

  it('makes a common word discriminating again', () => {
    // The case this pass exists for. GoHighLevel emits navigation as
    // plain divs and links, not <nav>, so the tag-based removal above
    // does not see it and "Water" ends up on every page. Before
    // stripping, a search for it matches all five and ranks none.
    // A list-based menu outside <nav>, which is what the page builder
    // emits. These become blocks like any other list item, so only
    // their repetition across pages identifies them as furniture.
    const navLinks = '<ul><li><a href="/">Home</a></li><li><a href="/water">Water</a></li>' +
      '<li><a href="/agendas">Agendas</a></li><li><a href="/contact">Contact</a></li></ul>'
    const divSite = [
      ['Water Rates', 'The base rate is $35.00 for the first 2,000 gallons.'],
      ['Start New Water Service', 'Pay a deposit of $150 at City Hall.'],
      ['Trash and Brush Pickup', 'Household trash is collected on Tuesdays.'],
      ['City Council', 'The council meets the third Tuesday of each month.'],
      ['Contact Us', 'City Hall is open Monday through Friday.'],
    ].map(([h1, body], i) => ({
      url: `/d${i}`,
      ...extractHtml(
        // No <main>, no <nav>, no <footer> -- just divs, which is what
        // the page builder produces and why the frequency pass exists.
        // Given a <main>, extraction scopes to it and never sees the
        // chrome at all; without one, repetition is the only signal.
        `<html><body><div>${navLinks}</div><div><h1>${h1}</h1><p>${body}</p></div>` +
        '<div><p>City of Forsan, 409 Ave D</p><p>Privacy Policy | Accessibility</p></div></body></html>'),
    }))

    const before = divSite.filter((p: { blocks: string[] }) =>
      p.blocks.join(' ').toLowerCase().includes('water'))
    expect(before.length).toBe(5)

    const { pages } = dropBoilerplate(divSite)
    const after = pages.filter((p: { body: string }) => p.body.toLowerCase().includes('water'))
    expect(after.length).toBe(2)
    expect(pages.every((p: { body: string }) => !p.body.includes('409 Ave D'))).toBe(true)
  })

  it('leaves a small site alone rather than emptying it', () => {
    // On three pages everything looks repeated. Stripping there would
    // delete the content instead of the chrome.
    const small = extracted.slice(0, 3)
    const { pages, dropped } = dropBoilerplate(small)
    expect(dropped).toBe(0)
    expect(pages[0].body).toContain('2,000 gallons')
    expect(pages.every((p: { body: string }) => p.body.length > 0)).toBe(true)
  })

  it('does not strip a heading two pages happen to share', () => {
    const pagesWithShared = [
      ...extracted,
      { url: '/a', title: 'A', blocks: ['Shared subheading', 'Unique A'] },
      { url: '/b', title: 'B', blocks: ['Shared subheading', 'Unique B'] },
    ]
    const { pages } = dropBoilerplate(pagesWithShared)
    const a = pages.find((p: { url: string }) => p.url === '/a') as { body: string }
    expect(a.body).toContain('Shared subheading')
    expect(a.body).toContain('Unique A')
  })
})
