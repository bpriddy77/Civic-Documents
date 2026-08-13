import 'server-only'
import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import { forbidden, unauthenticated } from '@/lib/errors'
import { can, type Permission } from '@/lib/permissions/permissions'
import type { Municipality, Profile } from '@/lib/supabase/database.types'

export interface Session {
  profile: Profile
  municipality: Municipality | null
}

/**
 * The signed-in staff member and their municipality, or null.
 *
 * A disabled account resolves to null even while its JWT is still valid,
 * because the profiles row carries `active` and RLS filters on it - so
 * revoking access takes effect on the next request, not at token expiry.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!profile) return null

  let municipality: Municipality | null = null
  if (profile.municipality_id) {
    const { data } = await supabase
      .from('municipalities')
      .select('*')
      .eq('id', profile.municipality_id)
      .maybeSingle()
    municipality = data ?? null
  }

  return { profile, municipality }
})

/** Session or 401. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw unauthenticated()
  return session
}

/**
 * Session holding `permission`, or 401/403.
 *
 * This is the server-side gate. It is not the only gate: the same rule is
 * enforced again by RLS when the query reaches PostgreSQL.
 */
export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession()
  if (!can(session.profile.role, permission)) {
    throw forbidden(permissionMessage(permission))
  }
  return session
}

/** Confirms a record belongs to the caller's municipality. */
export function assertTenant(session: Session, municipalityId: string) {
  if (session.profile.role === 'super_admin') return
  if (session.profile.municipality_id !== municipalityId) throw forbidden()
}

function permissionMessage(permission: Permission): string {
  switch (permission) {
    case 'meeting.publish': return 'You do not have permission to publish meetings.'
    case 'meeting.archive': return 'You do not have permission to archive meetings.'
    case 'meeting.delete': return 'You do not have permission to permanently delete meetings.'
    case 'document.manage': return 'You do not have permission to upload or replace documents.'
    case 'category.manage': return 'You do not have permission to manage meeting categories.'
    case 'user.manage': return 'You do not have permission to manage user accounts.'
    case 'audit.read': return 'You do not have permission to view the audit history.'
    default: return 'You do not have permission to do that.'
  }
}
