import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
// @ts-expect-error - plain ESM module shared with the crawler script
import { disallowedPaths, sitemapUrls } from '../scripts/lib/fetch.mjs'

/**
 * Sitemap discovery and robots.txt, against a real HTTP server.
 *
 * Both of these fail quietly. A sitemap index parsed as a sitemap yields
 * an index containing the URLs of other sitemaps and no pages, which looks
 * like "search finds nothing" rather than like an error. And robots.txt
 * parsed loosely means crawling pages a city asked nobody to crawl, which
 * nobody notices until it matters.
 */

const routes: Record<string, { type: string; body: string }> = {
  '/robots.txt': {
    type: 'text/plain',
    body: [
      '# City of Forsan',
      'User-agent: BadBot',
      'Disallow: /',
      '',
      'User-agent: *',
      'Disallow: /staging',
      'Disallow: /admin   # trailing comment',
      'Allow: /',
      'Sitemap: http://localhost/sitemap.xml',
    ].join('\n'),
  },
  '/sitemap.xml': {
    type: 'application/xml',
    body: `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>__BASE__/sitemap-pages.xml</loc></sitemap>
        <sitemap><loc>__BASE__/sitemap-docs.xml</loc></sitemap>
      </sitemapindex>`,
  },
  '/sitemap-pages.xml': {
    type: 'application/xml',
    body: `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>__BASE__/water-rates</loc><lastmod>2026-01-01</lastmod></url>
        <url><loc> __BASE__/new-service </loc></url>
        <url><loc>__BASE__/staging/draft-page</loc></url>
        <url><loc>__BASE__/admin/login</loc></url>
      </urlset>`,
  },
  '/sitemap-docs.xml': {
    type: 'application/xml',
    body: `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>__BASE__/docs/ordinance-2024-02.pdf</loc></url>
      </urlset>`,
  },
}

let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const route = routes[(req.url || '').split('?')[0] ?? '']
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': route.type })
    res.end(route.body.replaceAll('__BASE__', base))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address && typeof address !== 'string') base = `http://127.0.0.1:${address.port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('sitemapUrls', () => {
  it('follows a sitemap index to the sitemaps it lists', async () => {
    const urls: string[] = await sitemapUrls(base)
    expect(urls).toContain(`${base}/water-rates`)
    expect(urls).toContain(`${base}/docs/ordinance-2024-02.pdf`)
  })

  it('returns pages, never the sitemap files themselves', async () => {
    const urls: string[] = await sitemapUrls(base)
    expect(urls.some((u) => u.endsWith('.xml'))).toBe(false)
  })

  it('tolerates whitespace inside a loc element', async () => {
    const urls: string[] = await sitemapUrls(base)
    expect(urls).toContain(`${base}/new-service`)
  })

  it('returns nothing rather than throwing when there is no sitemap', async () => {
    const urls: string[] = await sitemapUrls('http://127.0.0.1:1')
    expect(urls).toEqual([])
  })
})

describe('disallowedPaths', () => {
  it('reads the rules meant for everyone', async () => {
    const rules: string[] = await disallowedPaths(base)
    expect(rules).toContain('/staging')
  })

  it('ignores rules addressed to a different crawler', async () => {
    // "User-agent: BadBot / Disallow: /" must not be applied to us, or
    // a single blocked bot would stop the whole crawl.
    const rules: string[] = await disallowedPaths(base)
    expect(rules).not.toContain('/')
  })

  it('strips trailing comments from a rule', async () => {
    const rules: string[] = await disallowedPaths(base)
    expect(rules).toContain('/admin')
  })

  it('treats a missing robots.txt as no restrictions', async () => {
    const rules: string[] = await disallowedPaths('http://127.0.0.1:1')
    expect(rules).toEqual([])
  })

  it('together, excludes the disallowed pages from the crawl', async () => {
    const blocked: string[] = await disallowedPaths(base)
    const urls: string[] = await sitemapUrls(base)
    const kept = urls.filter((u) => {
      const path = new URL(u).pathname
      return !blocked.some((rule) => path.startsWith(rule))
    })
    expect(kept).toContain(`${base}/water-rates`)
    expect(kept).not.toContain(`${base}/staging/draft-page`)
    expect(kept).not.toContain(`${base}/admin/login`)
  })
})
