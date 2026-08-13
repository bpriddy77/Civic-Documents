import { created, handler, ok } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { userInputSchema } from '@/lib/validation/schemas'
import { forbidden, invalid } from '@/lib/errors'
import { siteUrl } from '@/lib/env'

export const dynamic = 'force-dynamic'

export const GET = handler(async () => {
  const session = await requirePermission('user.read')
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, email, role, active, created_at')
    .eq('municipality_id', session.profile.municipality_id!)
    .order('display_name')
  return ok({ users: data ?? [] })
})

/**
 * Invites a colleague. Creating the auth user needs the service role, so it
 * happens here on the server and never in the browser. The invited account
 * sets its own password through the emailed link.
 */
export const POST = handler(async (request: Request) => {
  const session = await requirePermission('user.manage')
  const input = userInputSchema.parse(await request.json())

  if (input.role === 'super_admin' && session.profile.role !== 'super_admin') {
    throw forbidden('Only a super administrator can create another super administrator.')
  }

  const admin = createAdminSupabase()
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/admin`,
    data: { display_name: input.display_name },
  })

  if (inviteError || !invited?.user) {
    if (inviteError?.message?.includes('already')) {
      throw invalid('Someone is already using that email address.', { email: 'Already in use.' })
    }
    console.error('[users] invite failed', inviteError?.message)
    throw invalid('The invitation could not be sent. Check the email address and try again.')
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: invited.user.id,
      municipality_id: session.profile.municipality_id,
      display_name: input.display_name,
      email: input.email,
      role: input.role,
      active: input.active,
    })
    .select('id, display_name, email, role, active')
    .single()

  if (error) {
    // Roll the auth user back so a failed invite leaves nothing behind.
    await admin.auth.admin.deleteUser(invited.user.id)
    throw error
  }

  return created({ user: data })
})
