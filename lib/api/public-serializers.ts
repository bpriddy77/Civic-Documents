import type { MeetingWithRelations, Municipality } from '@/lib/supabase/database.types'
import { documentUrl, meetingUrl } from '@/lib/documents/urls'
import { tenantConfig } from '@/lib/data/tenant'
import { formatMeetingWhen } from '@/lib/time/tenant-time'

/**
 * Public API shapes.
 *
 * Built by naming every field that goes out, never by deleting fields from a
 * database row. A column added by a future migration cannot leak through an
 * allow-list. Storage paths, internal identifiers of staff, and audit data
 * have no representation here at all.
 */

export function serializeMeeting(meeting: MeetingWithRelations, municipality: Municipality) {
  const config = tenantConfig(municipality)

  return {
    id: meeting.id,
    title: meeting.title,
    category: meeting.category ? { name: meeting.category.name, slug: meeting.category.slug } : null,
    date: meeting.meeting_date,
    time: config.show_meeting_time ? meeting.meeting_time : null,
    starts_at: meeting.starts_at,
    display_when: formatMeetingWhen(meeting.meeting_date, meeting.meeting_time, municipality.timezone, {
      datePattern: config.date_format,
      timePattern: config.time_format,
      showTime: config.show_meeting_time,
    }),
    location: config.show_location ? meeting.location : null,
    description: meeting.description,
    status: meeting.status,
    minutes_status: meeting.minutes_status,
    url: meetingUrl(meeting),
    is_upcoming: new Date(meeting.starts_at).getTime() >= Date.now(),
    documents: meeting.documents
      .filter((d) => d.active_version && !d.removed_at)
      .map((d) => ({
        type: d.document_type,
        posted_date: d.posted_date,
        url: documentUrl(municipality.slug, d.public_slug),
        file_size: d.file_size,
        version: d.version,
      })),
  }
}

export function serializeMunicipality(municipality: Municipality) {
  const config = tenantConfig(municipality)
  return {
    name: municipality.name,
    slug: municipality.slug,
    timezone: municipality.timezone,
    logo_url: municipality.logo_url,
    website_url: municipality.website_url,
    archive_heading: config.archive_heading,
    meetings_per_page: config.meetings_per_page,
    default_sort: config.default_sort,
    show_meeting_time: config.show_meeting_time,
    show_location: config.show_location,
    primary_color: config.primary_color,
  }
}
