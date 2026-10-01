import { handler, ok } from '@/lib/api/response'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { getMunicipalityBySlug } from '@/lib/data/tenant'
import { createAnonSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/alert - the live emergency alert, or none.
 *
 * Read with the anonymous client so Row-Level Security decides what is
 * visible: expired and cleared alerts are filtered by the database, not by
 * this code. A bug here cannot leak a cleared notice.
 */
export const GET = handler(async (request: Request) => {
  enforceRateLimit(request)

  const url = new URL(request.url)
  const municipality = await getMunicipalityBySlug(url.searchParams.get('municipality'))
  const supabase = createAnonSupabase()

  const { data, error } = await supabase
    .from('alerts')
    .select('message, severity, link_url, link_label, expires_at, published_at')
    .eq('municipality_id', municipality.id)
    .is('cleared_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  // Emergencies cannot wait on a 60-second cache. Ten seconds still absorbs
  // any real traffic while keeping a boil-water notice close to immediate.
  return ok(
    { alert: data ?? null },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=20' } },
  )
})
