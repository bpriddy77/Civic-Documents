import { handler, ok, created } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { alertInputSchema } from '@/lib/validation/schemas'
import { conflict } from '@/lib/errors'

export const dynamic = 'force-dynamic'

/** GET /api/admin/alerts - the live alert plus recent history. */
export const GET = handler(async () => {
  const session = await requirePermission('alert.read')
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('municipality_id', session.profile.municipality_id!)
    .order('published_at', { ascending: false })
    .limit(20)

  if (error) throw error

  const now = Date.now()
  const live = (data ?? []).find(
    (a) => !a.cleared_at && new Date(a.expires_at).getTime() > now,
  )

  return ok({ live: live ?? null, history: data ?? [] })
})

/** POST /api/admin/alerts - publish an alert. */
export const POST = handler(async (request: Request) => {
  const session = await requirePermission('alert.manage')
  const input = alertInputSchema.parse(await request.json())
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('alerts')
    .insert({
      municipality_id: session.profile.municipality_id!,
      message: input.message.trim(),
      severity: input.severity,
      link_url: input.link_url || null,
      link_label: input.link_label || null,
      expires_at: input.expires_at,
      published_by: session.profile.id,
    })
    .select('*')
    .single()

  // The partial unique index allows only one live alert per municipality.
  if (error?.code === '23505') {
    throw conflict('An alert is already showing. Clear it before posting another.')
  }
  if (error) throw error

  return created({ alert: data })
})

/** DELETE /api/admin/alerts - clear the live alert. */
export const DELETE = handler(async () => {
  const session = await requirePermission('alert.manage')
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('alerts')
    .update({ cleared_at: new Date().toISOString(), cleared_by: session.profile.id })
    .eq('municipality_id', session.profile.municipality_id!)
    .is('cleared_at', null)
    .select('id')

  if (error) throw error

  return ok({ cleared: data?.length ?? 0 })
})
