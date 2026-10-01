import { handler, ok } from '@/lib/api/response'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { publicQuerySchema } from '@/lib/validation/schemas'
import { getMunicipalityBySlug } from '@/lib/data/tenant'
import { listPublicMeetings } from '@/lib/data/meetings'
import { serializeMeeting } from '@/lib/api/public-serializers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/meetings
 *
 * Read-only, anonymous, and backed by the same RLS policies as the website,
 * so a draft meeting cannot be reached here even by guessing its id.
 *
 * Query: municipality, q, category, year, from, to, scope, sort, page, perPage
 */
export const GET = handler(async (request: Request) => {
  enforceRateLimit(request)

  const url = new URL(request.url)
  const query = publicQuerySchema.parse(Object.fromEntries(url.searchParams))
  const municipality = await getMunicipalityBySlug(query.municipality)
  const page = await listPublicMeetings(municipality, query)

  return ok({
    meetings: page.meetings.map((m) => serializeMeeting(m, municipality)),
    pagination: {
      page: page.page,
      per_page: page.perPage,
      total: page.total,
      page_count: page.pageCount,
    },
  })
})
