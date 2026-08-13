import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { auditLabel } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Audit history' }

const PER_PAGE = 50

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; entity_id?: string; action?: string }>
}) {
  const params = await searchParams
  const session = await requirePermission('audit.read')
  const supabase = await createServerSupabase()

  const page = Math.max(1, Number(params.page ?? 1))
  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('municipality_id', session.profile.municipality_id!)

  if (params.entity_id) query = query.eq('entity_id', params.entity_id)
  if (params.action) query = query.eq('action', params.action)

  const from = (page - 1) * PER_PAGE
  const { data, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  const total = count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <>
      <h1 className="text-2xl font-semibold">Audit history</h1>
      <p className="mt-1 max-w-prose text-ink-muted">
        Every change to a meeting, document, category, or account is recorded here by the database
        itself. These entries cannot be edited or removed by anyone using this application.
      </p>

      {params.entity_id && (
        <p className="mt-4 text-sm">
          Filtered to one record. <Link href="/admin/audit">Show all history</Link>
        </p>
      )}

      <div className="table-wrap mt-6">
        <table className="w-full min-w-[52rem] border-collapse bg-paper text-sm">
          <caption className="sr-only">Audit history, newest first</caption>
          <thead>
            <tr className="border-y border-rule text-left">
              <th scope="col" className="px-3 py-2">When</th>
              <th scope="col" className="px-3 py-2">Who</th>
              <th scope="col" className="px-3 py-2">Action</th>
              <th scope="col" className="px-3 py-2">Record</th>
              <th scope="col" className="px-3 py-2">From</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((entry) => (
              <tr key={entry.id} className="border-b border-rule align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">{entry.user_name ?? 'System'}</td>
                <td className="px-3 py-2 font-semibold">{auditLabel(entry.action)}</td>
                <td className="px-3 py-2">
                  <span className="capitalize">{entry.entity_type}</span>
                  {entry.entity_id && (
                    <span className="block break-all text-xs text-ink-muted">{entry.entity_id}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-muted">{entry.ip_address ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(data ?? []).length === 0 && (
        <p className="mt-6 rounded border border-dashed border-rule-strong bg-paper px-4 py-8 text-center text-ink-muted">
          No audit entries match this view yet.
        </p>
      )}

      {pageCount > 1 && (
        <nav aria-label="Audit history pages" className="mt-6 flex justify-center gap-2">
          {page > 1 && <Link href={`/admin/audit?page=${page - 1}`} className="btn-secondary">Previous page</Link>}
          <span className="btn-secondary" aria-current="page">Page {page} of {pageCount}</span>
          {page < pageCount && <Link href={`/admin/audit?page=${page + 1}`} className="btn-secondary">Next page</Link>}
        </nav>
      )}
    </>
  )
}
