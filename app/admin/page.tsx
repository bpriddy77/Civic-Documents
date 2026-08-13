import Link from 'next/link'
import { requireSession } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { can } from '@/lib/permissions/permissions'
import { StatCard } from '@/components/admin/StatCard'
import { formatMeetingWhen } from '@/lib/time/tenant-time'
import { auditLabel } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await requireSession()
  const municipalityId = session.profile.municipality_id
  const timezone = session.municipality?.timezone ?? 'America/Chicago'
  const supabase = await createServerSupabase()

  const [counts, recentMeetings, recentDocuments] = await Promise.all([
    supabase
      .from('meeting_dashboard_counts')
      .select('*')
      .eq('municipality_id', municipalityId!)
      .maybeSingle(),
    supabase
      .from('meetings')
      .select('id, title, meeting_date, meeting_time, status, minutes_status, updated_at')
      .eq('municipality_id', municipalityId!)
      .order('updated_at', { ascending: false })
      .limit(6),
    supabase
      .from('meeting_documents')
      .select('id, document_type, posted_date, created_at, version, meeting_id, original_filename')
      .eq('municipality_id', municipalityId!)
      .eq('active_version', true)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const c = counts.data ?? {
    upcoming: 0, drafts: 0, published: 0, archived: 0,
    awaiting_minutes: 0, minutes_pending_approval: 0, published_this_year: 0,
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-ink-muted">
        Where things stand for {session.municipality?.name ?? 'your municipality'} today.
      </p>

      <section aria-labelledby="counts-heading" className="mt-6">
        <h2 id="counts-heading" className="sr-only">
          Current counts
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Upcoming meetings" value={c.upcoming} href="/admin/meetings?scope=upcoming" />
          <StatCard label="Draft meetings" value={c.drafts} href="/admin/meetings?status=draft" />
          <StatCard
            label="Awaiting minutes"
            value={c.awaiting_minutes}
            href="/admin/meetings?minutes_status=not_available&scope=past"
            tone="attention"
          />
          <StatCard
            label="Minutes pending approval"
            value={c.minutes_pending_approval}
            href="/admin/meetings?minutes_status=pending_approval"
            tone="attention"
          />
          <StatCard label="Published meetings" value={c.published} href="/admin/meetings?status=published" />
          <StatCard label="Published this year" value={c.published_this_year} />
          <StatCard label="Archived" value={c.archived} href="/admin/meetings?status=archived" />
        </div>
      </section>

      {can(session.profile.role, 'meeting.create') && (
        <section aria-labelledby="actions-heading" className="mt-8">
          <h2 id="actions-heading" className="text-lg font-semibold">
            Quick actions
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/admin/meetings/new" className="btn-primary">
              Create meeting
            </Link>
            <Link href="/admin/meetings?minutes_status=not_available&scope=past" className="btn-secondary">
              Upload outstanding minutes
            </Link>
            <Link href="/admin/categories" className="btn-secondary">
              Manage categories
            </Link>
            <Link href="/admin/meetings" className="btn-secondary">
              Search meetings
            </Link>
          </div>
        </section>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="recent-meetings-heading">
          <h2 id="recent-meetings-heading" className="text-lg font-semibold">
            Recently modified meetings
          </h2>
          {recentMeetings.data?.length ? (
            <ul className="mt-3 divide-y divide-rule rounded border border-rule bg-paper">
              {recentMeetings.data.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <Link href={`/admin/meetings/${m.id}`} className="font-semibold text-ink">
                    {m.title}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {formatMeetingWhen(m.meeting_date, m.meeting_time, timezone)} · {m.status}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded border border-dashed border-rule-strong bg-paper px-4 py-6 text-ink-muted">
              No meetings yet. Create the first one to get started.
            </p>
          )}
        </section>

        <section aria-labelledby="recent-documents-heading">
          <h2 id="recent-documents-heading" className="text-lg font-semibold">
            Recently uploaded documents
          </h2>
          {recentDocuments.data?.length ? (
            <ul className="mt-3 divide-y divide-rule rounded border border-rule bg-paper">
              {recentDocuments.data.map((d) => (
                <li key={d.id} className="px-4 py-3 text-sm">
                  <Link href={`/admin/meetings/${d.meeting_id}`} className="font-semibold text-ink">
                    {auditLabel(`document.${d.version > 1 ? 'replaced' : 'uploaded'}`)}: {d.document_type}
                  </Link>
                  <p className="text-ink-muted">
                    {d.original_filename} · posted {d.posted_date} · version {d.version}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded border border-dashed border-rule-strong bg-paper px-4 py-6 text-ink-muted">
              No documents have been uploaded yet.
            </p>
          )}
        </section>
      </div>
    </>
  )
}
