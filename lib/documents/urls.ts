import { siteUrl } from '@/lib/env'
import type { DocumentType, Meeting, MeetingDocument } from '@/lib/supabase/database.types'

/**
 * Permanent public URLs.
 *
 * Nothing published here ever points at a signed storage URL, because those
 * expire and a link in a newsletter or on a QR code has to keep working.
 * A document's public_slug is carried forward to every later version, so
 * replacing an agenda does not break links already in circulation.
 */

export function documentPath(municipalitySlug: string, publicSlug: string): string {
  return `/documents/${municipalitySlug}/${publicSlug}.pdf`
}

export function documentUrl(municipalitySlug: string, publicSlug: string): string {
  return `${siteUrl}${documentPath(municipalitySlug, publicSlug)}`
}

export function meetingPath(meeting: Pick<Meeting, 'meeting_date' | 'slug'>): string {
  const [year, month, day] = meeting.meeting_date.split('-')
  return `/meetings/${year}/${month}/${day}/${meeting.slug}`
}

export function meetingUrl(meeting: Pick<Meeting, 'meeting_date' | 'slug'>): string {
  return `${siteUrl}${meetingPath(meeting)}`
}

/** e.g. "2026-08-18-city-council-agenda" */
export function buildPublicSlug(
  meetingDate: string,
  meetingSlug: string,
  documentType: DocumentType,
): string {
  return `${meetingDate}-${meetingSlug}-${documentType}`
}

/**
 * Internal storage key. Randomised per version so the object name reveals
 * nothing and a replaced version never collides with its predecessor.
 */
export function buildStoragePath(
  municipalityId: string,
  meetingId: string,
  documentType: DocumentType,
  version: number,
): string {
  const folder = documentType === 'minutes' ? 'minutes' : `${documentType}s`
  const token = crypto.randomUUID()
  return `municipalities/${municipalityId}/meetings/${meetingId}/${folder}/v${version}-${token}.pdf`
}

/** Screen-reader friendly link text: never "click here". */
export function documentLinkLabel(
  meeting: Pick<Meeting, 'title' | 'meeting_date' | 'minutes_status'>,
  documentType: DocumentType,
  formattedDate: string,
): string {
  if (documentType === 'minutes') {
    const qualifier = meeting.minutes_status === 'approved' ? 'Approved ' : ''
    return `View ${formattedDate} ${qualifier}${meeting.title} Minutes — PDF`
  }
  return `View ${formattedDate} ${meeting.title} Agenda — PDF`
}

export function activeDocument(
  documents: MeetingDocument[] | undefined,
  type: DocumentType,
): MeetingDocument | undefined {
  return documents?.find((d) => d.document_type === type && d.active_version && !d.removed_at)
}
