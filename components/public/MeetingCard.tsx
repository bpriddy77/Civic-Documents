import Link from 'next/link'
import type { MeetingWithRelations, Municipality } from '@/lib/supabase/database.types'
import { tenantConfig } from '@/lib/data/tenant'
import { formatMeetingDate, formatMeetingTime, isoDateTime } from '@/lib/time/tenant-time'
import { activeDocument, documentLinkLabel, documentPath, meetingPath } from '@/lib/documents/urls'
import { MinutesStatusBadge, minutesStatusText } from './MinutesStatusBadge'

/**
 * One meeting, rendered as a docket line: the date sits in its own column
 * against a hairline rule, the way it would in a minute book, and the two
 * document links sit where a reader's eye already is.
 */
export function MeetingCard({
  meeting,
  municipality,
  headingLevel = 3,
}: {
  meeting: MeetingWithRelations
  municipality: Municipality
  headingLevel?: 2 | 3 | 4
}) {
  const config = tenantConfig(municipality)
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'

  const dateLabel = formatMeetingDate(meeting.meeting_date, municipality.timezone, config.date_format)
  const timeLabel = config.show_meeting_time
    ? formatMeetingTime(meeting.meeting_time, config.time_format)
    : null

  const agenda = activeDocument(meeting.documents, 'agenda')
  const minutes = activeDocument(meeting.documents, 'minutes')

  return (
    <article className="docket">
      <div className="docket-date">
        <time dateTime={isoDateTime(meeting.starts_at)} className="block text-lg font-semibold">
          {dateLabel}
        </time>
        {timeLabel && <span className="text-sm text-ink-muted">{timeLabel}</span>}
      </div>

      <div className="min-w-0">
        <p className="eyebrow">{meeting.category?.name ?? 'Meeting'}</p>

        <Heading className="mt-1 text-xl font-semibold">
          <Link href={meetingPath(meeting)} className="text-ink no-underline hover:underline">
            {meeting.title}
          </Link>
        </Heading>

        {config.show_location && meeting.location && (
          <p className="mt-1 text-sm text-ink-muted">{meeting.location}</p>
        )}

        {meeting.description && (
          <p className="mt-2 max-w-prose text-sm text-ink-muted">{meeting.description}</p>
        )}

        <dl className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-8">
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="font-semibold">Agenda:</dt>
            <dd>
              {agenda ? (
                <a
                  href={documentPath(municipality.slug, agenda.public_slug)}
                  aria-label={documentLinkLabel(meeting, 'agenda', dateLabel)}
                >
                  View agenda (PDF)
                </a>
              ) : (
                <span className="text-ink-muted">Not yet posted</span>
              )}
            </dd>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="font-semibold">Minutes:</dt>
            <dd>
              {minutes ? (
                <a
                  href={documentPath(municipality.slug, minutes.public_slug)}
                  aria-label={documentLinkLabel(meeting, 'minutes', dateLabel)}
                >
                  View {meeting.minutes_status === 'approved' ? 'approved ' : ''}minutes (PDF)
                </a>
              ) : (
                <span className="text-ink-muted">{minutesStatusText(meeting.minutes_status)}</span>
              )}
            </dd>
          </div>

          {minutes && meeting.minutes_status !== 'approved' && (
            <div>
              <dt className="sr-only">Minutes approval status</dt>
              <dd>
                <MinutesStatusBadge status={meeting.minutes_status} />
              </dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  )
}
