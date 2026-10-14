import { handler, ok } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET /api/admin/audit - paged audit history for the caller's municipality. */
export const GET = handler(async (request: Request) => {
  const session = await requirePermission('audit.read')
  const url = new URL(request.url)

  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('perPage') ?? 50)))
  const entityId = url.searchParams.get('entity_id')
  const action = url.searchParams.get('action')

  const supabase = await createServerSupabase()
  let request_ = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('municipality_id', session.profile.municipality_id!)

  if (entityId) request_ = request_.eq('entity_id', entityId)
  if (action) request_ = request_.eq('action', action)

  const from = (page - 1) * perPage
  const { data, count, error } = await request_
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1)

  if (error) throw error
  return ok({ entries: data ?? [], total: count ?? 0, page, per_page: perPage })
})
