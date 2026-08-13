import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { can } from '@/lib/permissions/permissions'
import { CategoryManager } from '@/components/admin/CategoryManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Meeting categories' }

export default async function CategoriesPage() {
  const session = await requirePermission('category.read')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('meeting_categories')
    .select('*')
    .eq('municipality_id', session.profile.municipality_id!)
    .order('display_order')
    .order('name')

  return (
    <>
      <h1 className="text-2xl font-semibold">Meeting categories</h1>
      <p className="mt-1 max-w-prose text-ink-muted">
        Categories group meetings on the public archive. A category used by past meetings can be
        deactivated so it stays attached to those records but is no longer offered for new ones.
      </p>

      <CategoryManager
        categories={data ?? []}
        canManage={can(session.profile.role, 'category.manage')}
        canDelete={can(session.profile.role, 'category.delete')}
      />
    </>
  )
}
