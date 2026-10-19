import { handler, ok } from '@/lib/api/response'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { createAnonSupabase } from '@/lib/supabase/server'
import { searchQuerySchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/search
 *
 * Searches one municipality's public website: the pages built in its site
 * builder, the PDFs posted on them, and the meetings and documents this
 * system publishes.
 *
 * Query: municipality, q, page, perPage
 *
 * Two things are deliberately not done here.
 *
 * The gate is not checked in this file. A municipality that has not enabled
 * search gets no results because `search_site` and the row-level security
 * policy both require the setting, so the boundary holds even if this route
 * is bypassed — and it is a public endpoint, so it will be.
 *
 * Result titles are returned exactly as indexed, including any angle
 * brackets that were in the page's own title. Escaping happens where the
 * text is rendered. Sanitising here would leave the widget looking safe
 * while quietly depending on a server it does not control.
 */
export const GET = handler(async (request: Request) => {
  enforceRateLimit(request)

  const url = new URL(request.url)
  const query = searchQuerySchema.parse(Object.fromEntries(url.searchParams))
  const supabase = createAnonSupabase()

  const offset = (query.page - 1) * query.perPage

  const { data, error } = await supabase.rpc('search_site', {
    p_municipality_slug: query.municipality,
    p_query: query.q,
    p_limit: query.perPage,
    p_offset: offset,
  })

  if (error) throw error

  const rows = (data ?? []) as {
    url: string
    title: string
    source: string
    snippet: string
    rank: number
    total: number
  }[]

  const total = Number(rows[0]?.total ?? 0)

  return ok(
    {
      query: query.q,
      results: rows.map((row) => ({
        url: row.url,
        title: row.title,
        source: row.source,
        snippet: row.snippet,
      })),
      pagination: {
        page: query.page,
        per_page: query.perPage,
        total,
        page_count: Math.max(1, Math.ceil(total / query.perPage)),
      },
    },
    {
      // A search result page is not a public notice. A minute of caching
      // costs nothing in freshness and absorbs someone holding down a key
      // in the search box.
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120' },
    },
  )
})
