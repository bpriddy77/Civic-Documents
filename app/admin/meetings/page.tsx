import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { can } from '@/lib/permissions/permissions'
import { formatMeetingWhen } from '@/lib/time/tenant-time'
import { minutesStatusText } from '@/components/public/MinutesStatusBadge'
import { MeetingRowActions } from '@/components/admin/MeetingRowActions'
import type { MeetingStatus, MinutesStatus } from '@/lib/supabase/database.types'

const MEETING_STATUSES = ['draft', 'published', 'archived'] as const
const MINUTES_STATUSES = ['not_available', 'draft', 'pending_approval', 'approved'] as const

/**
 * Query-string values arrive as arbitrary strings. Narrowing them here means a
 * hand-edited `?status=whatever` is ignored rather than sent to the database
 * as a filter that matches nothing and looks like an empty archive.
 */
function asMeetingStatus(value: string | undefined): MeetingStatus | undefined {
  return MEETING_STATUSES.find((status) => status === value)
}

function asMinutesStatus(value: string | undefined): MinutesStatus | undefined {
  return MINUTES_STATUSES.find((status) => status === value)
}

export const dynamic = 'force-dynamic'

const PER_PAGE = 25

type SearchParams = Promise<Record<string, string | undefined>>

export default async function AdminMeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const session = await requirePermission('meeting.read')
  const timezone = session.municipality?.timezone ?? 'America/Chicago'
  const supabase = await createServerSupabase()

  const page = Math.max(1, Number(params.page ?? 1))
  const nowIso = new Date().toISOString()

  let query = supabase
    .from('meetings')
    .select(
      `id, title, meeting_date, meeting_time, status, minutes_status, updated_at,
       category:meeting_categories ( name ),
       documents:meeting_documents ( id, document_type, active_version, removed_at )`,
      { count: 'exact' },
    )
    .eq('municipality_id', session.profile.municipality_id!)

  if (params.q) query = query.ilike('title', `%${params.q.replace(/[%,]/g, ' ')}%`)
  const status = asMeetingStatus(params.status)
  const minutesStatus = asMinutesStatus(params.minutes_status)
  if (status) query = query.eq('status', status)
  if (minutesStatus) query = query.eq('minutes_status', minutesStatus)
  if (params.category) query = query.eq('category_id', params.category)
  if (params.year) {
    query = query.gte('meeting_date', `${params.year}-01-01`).lte('meeting_date', `${params.year}-12-31`)
  }
  if (params.from) query = query.gte('meeting_date', params.from)
  if (params.to) query = query.lte('meeting_date', params.to)
  if (params.scope === 'upcoming') query = query.gte('starts_at', nowIso)
  if (params.scope === 'past') query = query.lt('starts_at', nowIso)

  const from = (page - 1) * PER_PAGE
  const { data, count } = await query
    .order('starts_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  const { data: categories } = await supabase
    .from('meeting_categories')
    .select('id, name')
    .eq('municipality_id', session.profile.municipality_id!)
    .order('display_order')

  const meetings = data ?? []
  const total = count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE))
  const canEdit = can(session.profile.role, 'meeting.update')

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Meetings</h1>
          <p className="mt-1 text-ink-muted">
            {total} {total === 1 ? 'meeting' : 'meetings'} match the current filters.
          </p>
        </div>
        {can(session.profile.role, 'meeting.create') && (
          <Link href="/admin/meetings/new" className="btn-primary">
            Create meeting
          </Link>
        )}
      </div>

      <form method="get" className="mt-6 rounded border border-rule bg-paper p-4">
        <h2 className="sr-only">Filter meetings</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="field-label">Search by title</label>
            <input id="q" name="q" type="search" defaultValue={params.q ?? ''} className="field" />
          </div>
          <div>
            <label htmlFor="category" className="field-label">Category</label>
            <select id="category" name="category" defaultValue={params.category ?? ''} className="field">
              <option value="">All categories</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="field-label">Meeting status</label>
            <select id="status" name="status" defaultValue={params.status ?? ''} className="field">
              <option value="">Any status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label htmlFor="minutes_status" className="field-label">Minutes status</label>
            <select
              id="minutes_status"
              name="minutes_status"
              defaultValue={params.minutes_status ?? ''}
              className="field"
            >
              <option value="">Any minutes status</option>
              <option value="not_available">Not available</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending approval</option>
              <option value="approved">Approved</option>
            </select>
          </div>
          <div>
            <label htmlFor="from" className="field-label">On or after</label>
            <input id="from" name="from" type="date" defaultValue={params.from ?? ''} className="field" />
          </div>
          <div>
            <label htmlFor="to" className="field-label">On or before</label>
            <input id="to" name="to" type="date" defaultValue={params.to ?? ''} className="field" />
          </div>
          <div className="flex items-end gap-3">
            <button type="submit" className="btn-primary">Apply filters</button>
            <Link href="/admin/meetings" className="btn-secondary">Reset</Link>
          </div>
        </div>
      </form>

      {meetings.length === 0 ? (
        <p className="mt-8 rounded border border-dashed border-rule-strong bg-paper px-4 py-10 text-center text-ink-muted">
          No meetings match these filters. Adjust them, or create a meeting.
        </p>
      ) : (
        <div className="table-wrap mt-6">
          <table className="w-full min-w-[52rem] border-collapse bg-paper text-sm">
            <caption className="sr-only">
              Meetings, newest first. Each row links to the meeting record.
            </caption>
            <thead>
              <tr className="border-y border-rule text-left">
                <th scope="col" className="px-3 py-2">Date</th>
                <th scope="col" className="px-3 py-2">Meeting</th>
                <th scope="col" className="px-3 py-2">Category</th>
                <th scope="col" className="px-3 py-2">Agenda</th>
                <th scope="col" className="px-3 py-2">Minutes</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => {
                /* eslint-disable @typescript-eslint/no-explicit-any */
                const docs = ((m as any).documents ?? []).filter(
                  (d: any) => d.active_version && !d.removed_at,
                )
                const hasAgenda = docs.some((d: any) => d.document_type === 'agenda')
                const hasMinutes = docs.some((d: any) => d.document_type === 'minutes')
                const category = Array.isArray((m as any).category)
                  ? (m as any).category[0]
                  : (m as any).category

                return (
                  <tr key={m.id} className="border-b border-rule align-top">
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatMeetingWhen(m.meeting_date, m.meeting_time, timezone)}
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/meetings/${m.id}`} className="font-semibold text-ink">
                        {m.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{category?.name ?? '—'}</td>
                    <td className="px-3 py-3">{hasAgenda ? 'Posted' : 'Not posted'}</td>
                    <td className="px-3 py-3">
                      {hasMinutes ? minutesStatusText(m.minutes_status) : 'Not posted'}
                    </td>
                    <td className="px-3 py-3 capitalize">{m.status}</td>
                    <td className="px-3 py-3">
                      <MeetingRowActions
                        meetingId={m.id}
                        status={m.status}
                        canEdit={canEdit}
                        canPublish={can(session.profile.role, 'meeting.publish')}
                        canArchive={can(session.profile.role, 'meeting.archive')}
                        canDuplicate={can(session.profile.role, 'meeting.create')}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Meeting list pages" className="mt-6 flex justify-center gap-2">
          {page > 1 && (
            <Link href={buildPage(params, page - 1)} className="btn-secondary">Previous page</Link>
          )}
          <span className="btn-secondary" aria-current="page">Page {page} of {pageCount}</span>
          {page < pageCount && (
            <Link href={buildPage(params, page + 1)} className="btn-secondary">Next page</Link>
          )}
        </nav>
      )}
    </>
  )
}

function buildPage(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'page') next.set(key, value)
  }
  next.set('page', String(page))
  return `/admin/meetings?${next.toString()}`
}
