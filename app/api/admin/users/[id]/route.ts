import { handler, ok } from '@/lib/api/response'
import { assertTenant, requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { userInputSchema } from '@/lib/validation/schemas'
import { forbidden, invalid, notFound } from '@/lib/errors'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/users/{id} - change a role, or disable an account.
 *
 * Disabling takes effect on the next request rather than at token expiry,
 * because every request re-reads the profile and RLS filters on `active`.
 */
export const PATCH = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const session = await requirePermission('user.manage')
  const input = userInputSchema.partial().parse(await request.json())

  const supabase = await createServerSupabase()
  const { data: target } = await supabase
    .from('profiles')
    .select('id, municipality_id, role, auth_user_id')
    .eq('id', id)
    .maybeSingle()

  if (!target) throw notFound('That user could not be found.')
  assertTenant(session, target.municipality_id!)

  if (target.id === session.profile.id && input.active === false) {
    throw invalid('You cannot disable your own account.')
  }
  if (
    (input.role === 'super_admin' || target.role === 'super_admin') &&
    session.profile.role !== 'super_admin'
  ) {
    throw forbidden('Only a super administrator can change a super administrator account.')
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...(input.display_name !== undefined && { display_name: input.display_name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.active !== undefined && {
        active: input.active,
        disabled_at: input.active ? null : new Date().toISOString(),
      }),
    })
    .eq('id', id)
    .select('id, display_name, email, role, active')
    .single()

  if (error) throw error

  // Ending live sessions immediately is a privileged operation.
  if (input.active === false) {
    await createAdminSupabase().auth.admin.signOut(target.auth_user_id, 'global').catch(() => {})
  }

  return ok({ user: data })
})
