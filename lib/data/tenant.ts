import 'server-only'
import { cache } from 'react'
import { createAnonSupabase } from '@/lib/supabase/server'
import { publicEnv } from '@/lib/env'
import { notFound } from '@/lib/errors'
import { municipalityConfigurationSchema } from '@/lib/validation/schemas'
import type { Municipality } from '@/lib/supabase/database.types'

/**
 * Tenant resolution for public surfaces.
 *
 * Single-city deployments fall back to NEXT_PUBLIC_DEFAULT_MUNICIPALITY.
 * Multi-city deployments pass ?municipality=slug (widget and API) or use a
 * host mapping - see docs/GHL-INTEGRATION.md.
 */
export const getMunicipalityBySlug = cache(async (slug?: string | null): Promise<Municipality> => {
  const supabase = createAnonSupabase()
  const target = slug?.trim() || publicEnv.NEXT_PUBLIC_DEFAULT_MUNICIPALITY

  const { data } = await supabase
    .from('municipalities')
    .select('*')
    .eq('slug', target)
    .eq('active', true)
    .maybeSingle()

  if (!data) throw notFound('That municipality could not be found.')
  return data
})

/** Configuration with every default filled in, so callers never branch on undefined. */
export function tenantConfig(municipality: Municipality) {
  return municipalityConfigurationSchema.parse(municipality.configuration ?? {})
}
