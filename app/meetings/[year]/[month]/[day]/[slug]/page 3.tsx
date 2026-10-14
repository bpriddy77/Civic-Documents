import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SkipLink } from '@/components/accessibility/SkipLink'
import { MinutesStatusBadge, minutesStatusText } from '@/components/public/MinutesStatusBadge'
import { getMunicipalityBySlug, tenantConfig } from '@/lib/data/tenant'
import { getPublicMeeting } from '@/lib/data/meetings'
import { activeDocument, documentLinkLabel, documentPath, meetingUrl } from '@/lib/documents/urls'
import { formatMeetingWhen, isoDateTime } from '@/lib/time/tenant-time'
import { VendorFooter } from '@/components/VendorFooter'

export const revalidate = 60

type Params = Promise<{ year: string; month: string; day: string; slug: string }>

async function load(params: Params) {
  const { year, month, day, slug } = await params
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return null
  const municipality = await getMunicipalityBySlug()
  const meeting = await getPublicMeeting(municipality, `${year}-${month}-${day}`, slug)
  return meeting ? { municipality, meeting } : null
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const loaded = await load(params)
  if (!loaded) return { title: 'Meeting not found', robots: { index: false, follow: false } }

  const { municipality, meeting } = loaded
  const config = tenantConfig(municipality)
  const when = formatMeetingWhen(meeting.meeting_date, meeting.meeting_time, municipality.timezone, {
    datePattern: config.date_format,
    timePattern: config.time_format,
    showTime: config.show_meeting_time,
  })

  return {
    title: `${meeting.title} — ${when}`,
    description:
      meeting.description?.slice(0, 300) ??
      `Agenda and minutes for the ${meeting.title} held ${when} by ${municipality.name}.`,
    alternates: { canonical: meetingUrl(meeting) },
  }
}

export default async function MeetingDetailPage({ params }: { params: Params }) {
  const loaded = await load(params)
  if (!loaded) notFound()

  const { municipality, meeting } = loaded
  const config = tenantConfig(municipality)
  const when = formatMeetingWhen(meeting.meeting_date, meeting.meeting_time, municipality.timezone, {
    datePattern: config.date_format,
    timePattern: config.time_format,
    showTime: config.show_meeting_time,
  })

  const agenda = activeDocument(meeting.documents, 'agenda')
  const minutes = activeDocument(meeting.documents, 'minutes')

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: meeting.title,
    startDate: isoDateTime(meeting.starts_at),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: meeting.location
      ? { '@type': 'Place', name: meeting.location, address: municipality.contact_address ?? undefined }
      : undefined,
    organizer: { '@type': 'GovernmentOrganization', name: municipality.name, url: municipality.website_url ?? undefined },
    description: meeting.description ?? undefined,
    url: meetingUrl(meeting),
  }

  return (
    <>
      <SkipLink />

      <div className="mx-auto max-w-3xl px-4 py-8">
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex flex-wrap items-center gap-2 text-ink-muted">
            <li>
              <Link href="/meetings">Meeting archive</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>{meeting.category?.name ?? 'Meeting'}</li>
          </ol>
        </nav>

        <main id="main" className="mt-6">
          <p className="eyebrow">{meeting.category?.name ?? 'Meeting'}</p>
          <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{meeting.title}</h1>

          <p className="mt-3 text-lg">
            <time dateTime={isoDateTime(meeting.starts_at)}>{when}</time>
          </p>

          {config.show_location && meeting.location && (
            <p className="mt-1 text-ink-muted">{meeting.location}</p>
          )}

          {meeting.status === 'archived' && (
            <p className="mt-4 rounded border-l-4 border-rule-strong bg-paper-sunk px-4 py-3 text-sm">
              This meeting has been archived. It remains part of the public record and its documents
              stay available at these links.
            </p>
          )}

          {meeting.description && (
            <div className="mt-6 max-w-prose">
              <h2 className="text-xl font-semibold">About this meeting</h2>
              <p className="mt-2 whitespace-pre-line">{meeting.description}</p>
            </div>
          )}

          <section aria-labelledby="documents-heading" className="mt-10">
            <h2 id="documents-heading" className="text-xl font-semibold">
              Meeting documents
            </h2>

            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              <li className="py-4">
                <h3 className="font-semibold">Agenda</h3>
                {agenda ? (
                  <p className="mt-1">
                    <a
                      href={documentPath(municipality.slug, agenda.public_slug)}
                      aria-label={documentLinkLabel(meeting, 'agenda', when)}
                    >
                      View agenda (PDF, {formatSize(agenda.file_size)})
                    </a>
                    <span className="block text-sm text-ink-muted">
                      Posted {agenda.posted_date}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-ink-muted">Not yet posted.</p>
                )}
              </li>

              <li className="py-4">
                <h3 className="font-semibold">Minutes</h3>
                {minutes ? (
                  <p className="mt-1">
                    <a
                      href={documentPath(municipality.slug, minutes.public_slug)}
                      aria-label={documentLinkLabel(meeting, 'minutes', when)}
                    >
                      View {meeting.minutes_status === 'approved' ? 'approved ' : ''}minutes (PDF,{' '}
                      {formatSize(minutes.file_size)})
                    </a>
                    <span className="block text-sm text-ink-muted">
                      Posted {minutes.posted_date}
                    </span>
                    {meeting.minutes_status !== 'approved' && (
                      <span className="mt-2 block">
                        <MinutesStatusBadge status={meeting.minutes_status} />
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-ink-muted">
                    Minutes: {minutesStatusText(meeting.minutes_status)}.
                    {meeting.minutes_status !== 'approved' &&
                      ' They will be posted here once the governing body approves them.'}
                  </p>
                )}
              </li>
            </ul>
          </section>

          <p className="mt-8 text-sm text-ink-muted">
            Permanent link to this meeting:{' '}
            <a href={meetingUrl(meeting)}>{meetingUrl(meeting)}</a>
          </p>
        </main>

        <footer className="mt-12 border-t border-rule pt-6">
          <VendorFooter />
        </footer>
      </div>

      <script
        type="application/ld+json"
        // Structured data only ever describes a meeting that is already public.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </>
  )
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
