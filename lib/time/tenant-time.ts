import { TZDate } from '@date-fns/tz'
import { format, parseISO } from 'date-fns'

/**
 * Every date shown to a citizen is rendered in the municipality's own time
 * zone, never the visitor's. A council meeting at 6:00 PM in Galveston reads
 * as 6:00 PM to someone browsing from Berlin.
 */

export function nowInZone(timeZone: string): TZDate {
  return TZDate.tz(timeZone)
}

/** Combines the stored date and optional time into an absolute instant. */
export function meetingInstant(
  meetingDate: string,
  meetingTime: string | null,
  timeZone: string,
): Date {
  const [y, m, d] = meetingDate.split('-').map(Number)
  const [hh, mm] = (meetingTime ?? '00:00').split(':').map(Number)
  const zoned = new TZDate(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, timeZone)
  // A plain Date, so callers compare and serialise a true instant rather than
  // a value that still carries the municipality's offset in its string form.
  return new Date(zoned.getTime())
}

export function isUpcoming(startsAt: string): boolean {
  return new Date(startsAt).getTime() >= Date.now()
}

export function formatMeetingDate(
  meetingDate: string,
  timeZone: string,
  pattern = 'MMMM d, yyyy',
): string {
  return format(new TZDate(parseISO(`${meetingDate}T12:00:00Z`), timeZone), pattern)
}

export function formatMeetingTime(meetingTime: string | null, pattern = 'h:mm a'): string | null {
  if (!meetingTime) return null
  const [hh, mm] = meetingTime.split(':').map(Number)
  const d = new Date(2000, 0, 1, hh ?? 0, mm ?? 0)
  return format(d, pattern)
}

/** "August 18, 2026 at 6:00 PM", or just the date when no time is set. */
export function formatMeetingWhen(
  meetingDate: string,
  meetingTime: string | null,
  timeZone: string,
  options: { datePattern?: string; timePattern?: string; showTime?: boolean } = {},
): string {
  const { datePattern = 'MMMM d, yyyy', timePattern = 'h:mm a', showTime = true } = options
  const datePart = formatMeetingDate(meetingDate, timeZone, datePattern)
  const timePart = showTime ? formatMeetingTime(meetingTime, timePattern) : null
  return timePart ? `${datePart} at ${timePart}` : datePart
}

/** Machine-readable value for <time dateTime="..."> */
export function isoDateTime(startsAt: string): string {
  return new Date(startsAt).toISOString()
}

/** The full list offered in municipality settings. */
export const COMMON_TIME_ZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico',
] as const
