import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { can } from '@/lib/permissions/permissions'
import { tenantConfig } from '@/lib/data/tenant'
import { nextWeekdayInZone } from '@/lib/time/tenant-time'
import { MeetingForm } from '@/components/admin/MeetingForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Create meeting' }

export default async function NewMeetingPage() {
  const session = await requirePermission('meeting.create')
  const supabase = await createServerSupabase()

  const { data: categories } = await supabase
    .from('meeting_categories')
    .select('id, name, slug')
    .eq('municipality_id', session.profile.municipality_id!)
    .eq('active', true)
    .is('archived_at', null)
    .order('display_order')
    .order('name')

  const config = tenantConfig(session.municipality)

  // The defaults a city sets in Settings. Each one is independent: a city that
  // only ever wants a default time leaves the rest blank and gets an otherwise
  // empty form.
  const timezone = session.municipality?.timezone ?? 'America/Chicago'
  const weekday = config.default_meeting_weekday
  const defaultCategory = config.default_category_slug
    ? (categories ?? []).find((category) => category.slug === config.default_category_slug)
    : undefined

  const defaults = {
    title: config.default_meeting_title,
    categoryId: defaultCategory?.id ?? '',
    date: weekday >= 0 ? nextWeekdayInZone(weekday, timezone) : '',
    time: config.default_meeting_time,
    location: config.default_meeting_location,
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/admin/meetings">Meetings</Link>
      </nav>
      <h1 className="mt-2 text-2xl font-semibold">Create meeting</h1>
      <p className="mt-1 text-ink-muted">
        Enter the meeting details now. The agenda can be uploaded as soon as the meeting is saved.
      </p>

      {(categories ?? []).length === 0 ? (
        <p className="mt-6 rounded border-l-4 border-status-pending bg-paper px-4 py-4">
          There are no active meeting categories yet.{' '}
          <Link href="/admin/categories">Add a category</Link> before creating a meeting.
        </p>
      ) : (
        <MeetingForm
          categories={categories ?? []}
          canPublish={can(session.profile.role, 'meeting.publish')}
          canArchive={can(session.profile.role, 'meeting.archive')}
          showTime={config.show_meeting_time !== false}
          showLocation={config.show_location !== false}
          defaults={defaults}
        />
      )}
    </>
  )
}
