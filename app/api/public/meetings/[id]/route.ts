import { handler, ok } from '@/lib/api/response'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { notFound } from '@/lib/errors'
import { createAnonSupabase } from '@/lib/supabase/server'
import { getMunicipalityBySlug } from '@/lib/data/tenant'
import { getPublicMeeting } from '@/lib/data/meetings'
import { serializeMeeting } from '@/lib/api/public-serializers'

export const dynamic = 'force-dynamic'

/** GET /api/public/meetings/{id} - details for one published meeting. */
export const GET = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  enforceRateLimit(request)

  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('That meeting could not be found.')

  const url = new URL(request.url)
  const municipality = await getMunicipalityBySlug(url.searchParams.get('municipality'))

  const anon = createAnonSupabase()
  const { data: stub } = await anon
    .from('meetings')
    .select('meeting_date, slug')
    .eq('id', id)
    .eq('municipality_id', municipality.id)
    .maybeSingle()

  if (!stub) throw notFound('That meeting could not be found.')

  const meeting = await getPublicMeeting(municipality, stub.meeting_date, stub.slug)
  if (!meeting) throw notFound('That meeting could not be found.')

  return ok({ meeting: serializeMeeting(meeting, municipality) })
})
