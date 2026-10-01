import { handler, ok } from '@/lib/api/response'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { getMunicipalityBySlug } from '@/lib/data/tenant'
import { listPublicCategories, listPublicYears } from '@/lib/data/meetings'

export const dynamic = 'force-dynamic'

/** GET /api/public/categories - active categories and the years with records. */
export const GET = handler(async (request: Request) => {
  enforceRateLimit(request)

  const url = new URL(request.url)
  const municipality = await getMunicipalityBySlug(url.searchParams.get('municipality'))
  const [categories, years] = await Promise.all([
    listPublicCategories(municipality),
    listPublicYears(municipality),
  ])

  return ok({
    categories: categories.map((c) => ({ name: c.name, slug: c.slug, description: c.description })),
    years,
  })
})
