import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission, assertTenant } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { can } from '@/lib/permissions/permissions'
import { tenantConfig } from '@/lib/data/tenant'
import { MeetingForm } from '@/components/admin/MeetingForm'
import { DocumentPanel } from '@/components/admin/DocumentPanel'
import { DangerZone } from '@/components/admin/DangerZone'
import { meetingPath } from '@/lib/documents/urls'
import { auditLabel } from '@/lib/audit/log'
import type { MeetingDocument } from '@/lib/supabase/database.types'

export const dynamic = 'force-dynamic'

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('meeting.read')
  const supabase = await createServerSupabase()

  const { data: meeting } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle()
  if (!meeting) notFound()
  assertTenant(session, meeting.municipality_id)

  const [{ data: categories }, { data: documents }, { data: history }] = await Promise.all([
    supabase
      .from('meeting_categories')
      .select('id, name')
      .eq('municipality_id', meeting.municipality_id)
      .eq('active', true)
      .order('display_order'),
    supabase
      .from('meeting_documents')
      .select('*')
      .eq('meeting_id', id)
      .order('version', { ascending: false }),
    can(session.profile.role, 'audit.read')
      ? supabase
          .from('audit_log')
          .select('id, action, user_name, created_at')
          .eq('entity_id', id)
          .order('created_at', { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] as { id: number; action: string; user_name: string | null; created_at: string }[] }),
  ])

  const config = session.municipality ? tenantConfig(session.municipality) : null
  const all = (documents ?? []) as MeetingDocument[]
  const canManageDocuments = can(session.profile.role, 'document.manage')

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/admin/meetings">Meetings</Link>
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{meeting.title}</h1>
          <p className="mt-1 text-ink-muted">
            {meeting.meeting_date} · <span className="capitalize">{meeting.status}</span>
          </p>
        </div>
        {meeting.status !== 'draft' && (
          <Link href={meetingPath(meeting)} className="btn-secondary">
            View public page
          </Link>
        )}
      </div>

      {can(session.profile.role, 'meeting.update') ? (
        <MeetingForm
          meeting={meeting}
          categories={categories ?? []}
          canPublish={can(session.profile.role, 'meeting.publish')}
          canArchive={can(session.profile.role, 'meeting.archive')}
          showTime={config?.show_meeting_time !== false}
          showLocation={config?.show_location !== false}
        />
      ) : (
        <p className="mt-6 rounded border border-rule bg-paper px-4 py-4 text-ink-muted">
          You have read-only access to this meeting.
        </p>
      )}

      <section aria-labelledby="documents-heading" className="mt-10">
        <h2 id="documents-heading" className="text-xl font-semibold">
          Documents
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Replacing a document keeps this meeting, keeps the public link, and keeps every earlier
          version.
        </p>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <DocumentPanel
            meetingId={meeting.id}
            municipalitySlug={session.municipality?.slug ?? ''}
            documentType="agenda"
            label="Agenda"
            versions={all.filter((d) => d.document_type === 'agenda')}
            canManage={canManageDocuments}
            maxUploadMb={config?.max_upload_mb ?? 25}
          />
          <DocumentPanel
            meetingId={meeting.id}
            municipalitySlug={session.municipality?.slug ?? ''}
            documentType="minutes"
            label="Minutes"
            versions={all.filter((d) => d.document_type === 'minutes')}
            canManage={canManageDocuments}
            maxUploadMb={config?.max_upload_mb ?? 25}
          />
        </div>
      </section>

      {(history?.length ?? 0) > 0 && (
        <section aria-labelledby="history-heading" className="mt-10">
          <h2 id="history-heading" className="text-xl font-semibold">
            History for this meeting
          </h2>
          <ul className="mt-3 divide-y divide-rule rounded border border-rule bg-paper text-sm">
            {(history ?? []).map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-semibold">{auditLabel(entry.action)}</span>
                <span className="text-ink-muted">
                  {entry.user_name ?? 'System'} · {new Date(entry.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            <Link href={`/admin/audit?entity_id=${meeting.id}`}>View full audit history</Link>
          </p>
        </section>
      )}

      {can(session.profile.role, 'meeting.delete') && (
        <DangerZone meetingId={meeting.id} meetingTitle={meeting.title} isPublic={meeting.status !== 'draft'} />
      )}
    </>
  )
}
