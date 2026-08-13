import { handler, ok } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { municipalityInputSchema } from '@/lib/validation/schemas'
import { invalid } from '@/lib/errors'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/settings - branding, display, and time zone.
 * Changing the time zone recomputes every stored meeting instant through a
 * database trigger, so upcoming/past never drifts after a change.
 */
export const PATCH = handler(async (request: Request) => {
  const session = await requirePermission('municipality.update')
  const input = municipalityInputSchema.partial().parse(await request.json())
  const supabase = await createServerSupabase()

  const { data: current } = await supabase
    .from('municipalities')
    .select('configuration')
    .eq('id', session.profile.municipality_id!)
    .single()

  const { data, error } = await supabase
    .from('municipalities')
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.logo_url !== undefined && { logo_url: input.logo_url || null }),
      ...(input.website_url !== undefined && { website_url: input.website_url || null }),
      ...(input.contact_email !== undefined && { contact_email: input.contact_email || null }),
      ...(input.contact_phone !== undefined && { contact_phone: input.contact_phone || null }),
      ...(input.contact_address !== undefined && { contact_address: input.contact_address || null }),
      ...(input.configuration !== undefined && {
        configuration: { ...(current?.configuration ?? {}), ...input.configuration },
      }),
    })
    .eq('id', session.profile.municipality_id!)
    .select('*')
    .single()

  if (error?.code === '22023') {
    throw invalid('That is not a recognised time zone. Choose one from the list.', {
      timezone: 'Unknown time zone.',
    })
  }
  if (error) throw error

  return ok({ municipality: data })
})
