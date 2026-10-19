/**
 * Turning a fetched page or PDF into text worth indexing.
 *
 * Separated from the crawler so it can be tested without a network or a
 * database, because this is where search quality is actually decided.
 */
import { parse } from 'node-html-parser'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// A block of text on this share of pages or more is site furniture.
export const BOILERPLATE_RATIO = 0.5
export const BOILERPLATE_MIN_PAGES = 4

const NON_CONTENT = [
  'script', 'style', 'noscript', 'svg', 'iframe', 'template',
  'nav', 'header', 'footer', 'form', 'button', 'select',
]

/**
 * A page reduced to its title and a list of text blocks.
 *
 * Blocks rather than one string because the boilerplate pass needs to
 * compare like with like across pages, and a single blob gives it
 * nothing to match on.
 */
export function extractHtml(html) {
  const root = parse(html, { blockTextElements: { script: false, style: false } })

  const title =
    root.querySelector('h1')?.textContent?.trim() ||
    root.querySelector('title')?.textContent?.trim() ||
    ''

  for (const tag of NON_CONTENT) {
    for (const node of root.querySelectorAll(tag)) node.remove()
  }
  // Anything explicitly hidden, including the skip links and the
  // screen-reader-only text a well-built site has on every page.
  for (const node of root.querySelectorAll('[aria-hidden="true"], [hidden]')) node.remove()

  const main = root.querySelector('main') || root.querySelector('body') || root
  const blocks = []
  for (const node of main.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, dd, dt, figcaption, blockquote')) {
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (text.length > 2) blocks.push(text)
  }
  // A page built entirely from divs yields nothing above, so fall back
  // to the whole text rather than indexing an empty body.
  if (!blocks.length) {
    const all = main.textContent.replace(/\s+/g, ' ').trim()
    if (all) blocks.push(all)
  }
  return { title: title.replace(/\s+/g, ' ').slice(0, 400), blocks }
}

export async function extractPdf(buffer) {
  try {
    const doc = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise

    const parts = []
    const pages = Math.min(doc.numPages, 200)
    for (let i = 1; i <= pages; i += 1) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      parts.push(content.items.map((item) => item.str).join(' '))
    }
    const text = parts.join('\n').replace(/\s+/g, ' ').trim()
    return { text, pages: doc.numPages, hasTextLayer: text.length >= 40 }
  } catch (error) {
    return { error: error.message }
  }
}

/**
 * Remove the blocks that appear on most pages.
 *
 * Runs only when there are enough pages to tell repetition from
 * coincidence. On a three-page site every block looks common, and
 * stripping them would leave nothing to search.
 */
export function dropBoilerplate(pages) {
  if (pages.length < BOILERPLATE_MIN_PAGES) {
    return { pages: pages.map((p) => ({ ...p, body: p.blocks.join(' ') })), dropped: 0 }
  }

  const counts = new Map()
  for (const page of pages) {
    for (const block of new Set(page.blocks)) {
      counts.set(block, (counts.get(block) || 0) + 1)
    }
  }

  const threshold = Math.max(2, Math.ceil(pages.length * BOILERPLATE_RATIO))
  const common = new Set(
    [...counts.entries()].filter(([, n]) => n >= threshold).map(([block]) => block))

  return {
    pages: pages.map((page) => ({
      ...page,
      body: page.blocks.filter((b) => !common.has(b)).join(' '),
    })),
    dropped: common.size,
  }
}

