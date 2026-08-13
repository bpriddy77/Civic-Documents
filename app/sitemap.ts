import type { MetadataRoute } from 'next'
import { createAnonSupabase } from '@/lib/supabase/server'
import { getMunicipalityBySlug } from '@/lib/data/tenant'
import { meetingPath } from '@/lib/documents/urls'
import { siteUrl } from '@/lib/env'

export const revalidate = 3600

/** Only published meetings reach the sitemap - RLS guarantees it. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const municipality = await getMunicipalityBySlug().catch(() => null)
  if (!municipality) return [{ url: `${siteUrl}/meetings`, changeFrequency: 'daily', priority: 1 }]

  const supabase = createAnonSupabase()
  const { data } = await supabase
    .from('meetings')
    .select('meeting_date, slug, updated_at')
    .eq('municipality_id', municipality.id)
    .in('status', ['published', 'archived'])
    .order('meeting_date', { ascending: false })
    .limit(5000)

  return [
    { url: `${siteUrl}/meetings`, changeFrequency: 'daily', priority: 1 },
    ...(data ?? []).map((m) => ({
      url: `${siteUrl}${meetingPath(m)}`,
      lastModified: new Date(m.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
