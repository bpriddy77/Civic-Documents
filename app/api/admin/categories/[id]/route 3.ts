import { handler, ok } from '@/lib/api/response'
import { assertTenant, requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { categoryInputSchema } from '@/lib/validation/schemas'
import { conflict, notFound } from '@/lib/errors'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  const session = await requirePermission('category.manage')
  const input = categoryInputSchema.partial().parse(await request.json())
  const supabase = await createServerSupabase()

  const { data: existing } = await supabase
    .from('meeting_categories')
    .select('id, municipality_id')
    .eq('id', id)
    .maybeSingle()
  if (!existing) throw notFound('That category could not be found.')
  assertTenant(session, existing.municipality_id)

  const { data, error } = await supabase
    .from('meeting_categories')
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.display_order !== undefined && { display_order: input.display_order }),
      ...(input.active !== undefined && { active: input.active }),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return ok({ category: data })
})

/**
 * Deletion is refused while any meeting still uses the category, because
 * removing it would orphan part of the public record. Deactivating hides it
 * from new meetings while history stays intact.
 */
export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  const session = await requirePermission('category.delete')
  const supabase = await createServerSupabase()

  const { data: existing } = await supabase
    .from('meeting_categories')
    .select('id, municipality_id, name')
    .eq('id', id)
    .maybeSingle()
  if (!existing) throw notFound('That category could not be found.')
  assertTenant(session, existing.municipality_id)

  const { count } = await supabase
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)

  if ((count ?? 0) > 0) {
    throw conflict(
      `${existing.name} is used by ${count} meeting${count === 1 ? '' : 's'} and cannot be deleted. ` +
        'Deactivate it instead so it stays attached to those records but is no longer offered for new meetings.',
    )
  }

  const { error } = await supabase.from('meeting_categories').delete().eq('id', id)
  if (error) throw error
  return ok({ deleted: true })
})
