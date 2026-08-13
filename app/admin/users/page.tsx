import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { can } from '@/lib/permissions/permissions'
import { UserManager } from '@/components/admin/UserManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Users' }

export default async function UsersPage() {
  const session = await requirePermission('user.read')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, email, role, active')
    .eq('municipality_id', session.profile.municipality_id!)
    .order('display_name')

  return (
    <>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 max-w-prose text-ink-muted">
        Everyone who can sign in to the records administration for{' '}
        {session.municipality?.name ?? 'this municipality'}.
      </p>

      <UserManager
        users={data ?? []}
        canManage={can(session.profile.role, 'user.manage')}
        isSuperAdmin={session.profile.role === 'super_admin'}
        currentProfileId={session.profile.id}
      />
    </>
  )
}
