/**
 * Nightly crawl of a municipality's public website into the search index.
 *
 *   node scripts/crawl-site.mjs                 # every city with search on
 *   node scripts/crawl-site.mjs city-of-forsan  # one city
 *   node scripts/crawl-site.mjs --dry-run       # report, write nothing
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * THE PART THAT DECIDES WHETHER SEARCH IS ANY GOOD
 *
 * Every page on a GoHighLevel site carries the same header, navigation
 * and footer. Index the raw text and every page contains the words
 * "Water", "Agendas" and "Contact", so a search for "water" returns all
 * thirty pages and the feature is worthless.
 *
 * Rather than guess at CSS selectors -- which differ per site and break
 * on redesign -- this crawls everything first, then removes the blocks
 * of text that appear on most pages. Repetition is what chrome *is*, so
 * detecting it that way works on any site and survives a redesign.
 *
 * Documents from this system's own database are already in the index,
 * put there by trigger at publish time. The crawler does not discover
 * them; it only fills in the text of the PDF so the contents are
 * searchable and not just the title.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { extractHtml, extractPdf, dropBoilerplate } from './lib/extract.mjs'
import { get, disallowedPaths, sitemapUrls, MAX_PAGES } from './lib/fetch.mjs'

const CONCURRENCY = 4

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const onlySlug = args.find((a) => !a.startsWith('--'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// ---------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Crawl one municipality
// ---------------------------------------------------------------------
async function crawl(municipality) {
  const config = municipality.configuration || {}
  const warnings = []
  const started = new Date().toISOString()

  let crawlId = null
  if (!dryRun) {
    const { data } = await db.from('search_crawls')
      .insert({ municipality_id: municipality.id, started_at: started })
      .select('id').single()
    crawlId = data?.id
  }

  const origins = (Array.isArray(config.search_domains) && config.search_domains.length
    ? config.search_domains
    : [municipality.website_url])
    .filter(Boolean)
    .map((value) => {
      try { return new URL(value).origin } catch { return null }
    })
    .filter(Boolean)

  if (!origins.length) {
    const message = 'No website address is set for this city, so there is nothing to crawl.'
    console.log(`  ${message}`)
    if (crawlId) {
      await db.from('search_crawls').update({
        status: 'failed', finished_at: new Date().toISOString(), error_message: message,
      }).eq('id', crawlId)
    }
    return
  }

  // ---- discover -----------------------------------------------------
  const targets = []
  for (const origin of origins) {
    const blocked = await disallowedPaths(origin)
    const urls = await sitemapUrls(origin)
    if (!urls.length) {
      warnings.push({ url: `${origin}/sitemap.xml`, reason: 'No sitemap found, or it was empty.' })
      continue
    }
    for (const found of urls) {
      let path
      try { path = new URL(found).pathname } catch { continue }
      if (blocked.some((rule) => path.startsWith(rule))) continue
      targets.push(found)
    }
  }
  console.log(`  ${targets.length} URLs from sitemap`)

  // ---- fetch --------------------------------------------------------
  const htmlPages = []
  const pdfPages = []
  let queue = [...targets]

  async function worker() {
    while (queue.length) {
      const target = queue.shift()
      if (!target) return
      const isPdf = target.toLowerCase().split('?')[0].endsWith('.pdf')
      const res = await get(target, isPdf)

      if (res.error) {
        warnings.push({ url: target, reason: res.error })
        continue
      }

      if (isPdf || res.type?.includes('application/pdf')) {
        const pdf = await extractPdf(Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body))
        if (pdf.error) {
          warnings.push({ url: target, reason: `PDF could not be read: ${pdf.error}` })
          continue
        }
        if (!pdf.hasTextLayer) {
          warnings.push({
            url: target,
            reason: 'This PDF has no text layer, so it is a scan. It cannot be searched, and a screen reader cannot read it either.',
          })
        }
        pdfPages.push({
          url: target,
          title: decodeURIComponent(target.split('/').pop().replace(/\.pdf$/i, '')).replace(/[-_]+/g, ' '),
          source: 'pdf',
          body: pdf.text,
          hasTextLayer: pdf.hasTextLayer,
        })
        continue
      }

      if (!res.type?.includes('text/html')) continue
      const { title, blocks } = extractHtml(res.body)
      htmlPages.push({ url: target, title: title || target, source: 'page', blocks })
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const { pages: cleaned, dropped } = dropBoilerplate(htmlPages)
  console.log(`  ${cleaned.length} pages, ${pdfPages.length} PDFs, ${dropped} repeated blocks removed`)

  // ---- fill in the text of our own documents ------------------------
  //
  // These rows were written by trigger when the clerk published them,
  // so they are already findable by title. This adds the contents.
  const { data: ownDocs } = await db
    .from('search_documents')
    .select('id, url, body')
    .eq('municipality_id', municipality.id)
    .eq('source', 'document')
    .is('removed_at', null)

  let documentsRead = 0
  for (const row of ownDocs || []) {
    if (row.body && row.body.length > 0) continue
    const res = await get(row.url, true)
    if (res.error) {
      warnings.push({ url: row.url, reason: `Document could not be read: ${res.error}` })
      continue
    }
    const pdf = await extractPdf(res.body)
    if (pdf.error || !pdf.hasTextLayer) {
      warnings.push({
        url: row.url,
        reason: pdf.error
          ? `Document could not be read: ${pdf.error}`
          : 'This document has no text layer, so it is a scan. Its contents cannot be searched, and a screen reader cannot read it.',
      })
      if (!dryRun) {
        await db.from('search_documents')
          .update({ text_layer: false, indexed_at: new Date().toISOString() })
          .eq('id', row.id)
      }
      continue
    }
    if (!dryRun) {
      await db.from('search_documents').update({
        body: pdf.text,
        text_layer: true,
        content_hash: createHash('sha256').update(pdf.text).digest('hex'),
        indexed_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }).eq('id', row.id)
    }
    documentsRead += 1
  }

  // ---- write --------------------------------------------------------
  const all = [...cleaned, ...pdfPages]
  const { data: existing } = await db
    .from('search_documents')
    .select('url, content_hash')
    .eq('municipality_id', municipality.id)
    .in('source', ['page', 'pdf'])
  const hashes = new Map((existing || []).map((row) => [row.url, row.content_hash]))

  let indexed = 0
  let unchanged = 0
  const now = new Date().toISOString()

  for (const page of all) {
    const hash = createHash('sha256').update(`${page.title}\u0000${page.body}`).digest('hex')
    if (hashes.get(page.url) === hash) {
      unchanged += 1
      if (!dryRun) {
        await db.from('search_documents')
          .update({ last_seen_at: now, removed_at: null })
          .eq('municipality_id', municipality.id).eq('url', page.url)
      }
      continue
    }
    indexed += 1
    if (dryRun) continue
    await db.from('search_documents').upsert({
      municipality_id: municipality.id,
      url: page.url,
      title: (page.title || page.url).slice(0, 500),
      source: page.source,
      body: page.body || '',
      content_hash: hash,
      text_layer: page.hasTextLayer !== false,
      indexed_at: now,
      last_seen_at: now,
      removed_at: null,
      updated_at: now,
    }, { onConflict: 'municipality_id,url' })
  }

  // Pages that have left the site. Marked rather than deleted, so one
  // bad sitemap does not silently empty the index -- and so a page that
  // comes back keeps its row.
  let removed = 0
  if (!dryRun && all.length) {
    const { data: gone } = await db
      .from('search_documents')
      .update({ removed_at: now })
      .eq('municipality_id', municipality.id)
      .in('source', ['page', 'pdf'])
      .is('removed_at', null)
      .lt('last_seen_at', now)
      .select('url')
    removed = gone?.length || 0
  }

  console.log(`  indexed ${indexed}, unchanged ${unchanged}, removed ${removed}, documents read ${documentsRead}`)
  if (warnings.length) console.log(`  ${warnings.length} warnings`)

  if (!dryRun && crawlId) {
    await db.from('search_crawls').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      urls_found: targets.length,
      pages_indexed: cleaned.length,
      pdfs_indexed: pdfPages.length,
      unchanged,
      removed,
      warnings,
    }).eq('id', crawlId)
  }
}

// ---------------------------------------------------------------------
let query = db.from('municipalities').select('id, name, slug, website_url, configuration').eq('active', true)
if (onlySlug) query = query.eq('slug', onlySlug)
const { data: municipalities, error } = await query

if (error) {
  console.error(`Could not read municipalities: ${error.message}`)
  process.exit(1)
}

const enabled = (municipalities || []).filter(
  (m) => onlySlug || m.configuration?.search_enabled === true)

if (!enabled.length) {
  console.log('No municipalities have site search enabled. Nothing to do.')
  process.exit(0)
}

console.log(`${dryRun ? 'Dry run. ' : ''}Crawling ${enabled.length} site(s).\n`)
for (const municipality of enabled) {
  console.log(`${municipality.name} (${municipality.slug})`)
  try {
    await crawl(municipality)
  } catch (err) {
    console.error(`  failed: ${err.message}`)
    process.exitCode = 1
  }
  console.log('')
}
