import { handler, ok } from '@/lib/api/response'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { getMunicipalityBySlug } from '@/lib/data/tenant'
import { serializeMunicipality } from '@/lib/api/public-serializers'

export const dynamic = 'force-dynamic'

/** GET /api/public/config - public branding and display settings for a tenant. */
export const GET = handler(async (request: Request) => {
  enforceRateLimit(request)
  const url = new URL(request.url)
  const municipality = await getMunicipalityBySlug(url.searchParams.get('municipality'))
  return ok({ municipality: serializeMunicipality(municipality) })
})
