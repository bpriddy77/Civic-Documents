/**
 * Fetching, robots.txt and sitemap discovery.
 *
 * Separated from the crawler so a test can point it at a local server.
 * Both of these fail silently when wrong -- a mis-parsed sitemap index
 * yields an empty index and no error, and a mis-parsed robots.txt means
 * crawling pages the site asked you not to.
 */
export const UA = 'Shift1Systems-SiteSearch/1.0 (+https://shift1systems.com/bot)'
export const MAX_PAGES = 1500
const MAX_BYTES = 25 * 1024 * 1024
const TIMEOUT_MS = 20000

export async function get(target, asBuffer = false) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: '*/*' },
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }

    const length = Number(res.headers.get('content-length') || 0)
    if (length > MAX_BYTES) return { error: `too large (${length} bytes)` }

    const type = (res.headers.get('content-type') || '').toLowerCase()
    const body = asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text()
    if (!asBuffer && body.length > MAX_BYTES) return { error: 'too large' }
    return { type, body, finalUrl: res.url }
  } catch (error) {
    return { error: error.name === 'AbortError' ? 'timed out' : error.message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Paths robots.txt disallows for everyone.
 *
 * A city's own site crawled by its own vendor at the city's request is
 * not a case robots.txt is written to stop, but honouring it is how a
 * crawler earns the right to be on the open web, and a city that puts
 * a staging page behind Disallow means it.
 */
export async function disallowedPaths(origin) {
  const res = await get(`${origin}/robots.txt`)
  if (res.error || typeof res.body !== 'string') return []
  const rules = []
  let applies = false
  for (const raw of res.body.split('\n')) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    const [field, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    const name = field.trim().toLowerCase()
    if (name === 'user-agent') applies = value === '*'
    else if (applies && name === 'disallow' && value) rules.push(value)
  }
  return rules
}

// ---------------------------------------------------------------------
// Sitemap discovery, including sitemap indexes
// ---------------------------------------------------------------------
export async function sitemapUrls(origin, seen = new Set()) {
  const found = new Set()
  const queue = [`${origin}/sitemap.xml`]

  while (queue.length && found.size < MAX_PAGES) {
    const next = queue.shift()
    if (seen.has(next)) continue
    seen.add(next)

    const res = await get(next)
    if (res.error || typeof res.body !== 'string') continue

    const isIndex = /<sitemapindex[\s>]/i.test(res.body)
    const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
    for (const loc of locs) {
      if (isIndex) queue.push(loc)
      else if (found.size < MAX_PAGES) found.add(loc)
    }
  }
  return [...found]
}

// ---------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------
