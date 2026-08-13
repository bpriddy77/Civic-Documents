import { describe, expect, it } from 'vitest'
import {
  formatMeetingDate,
  formatMeetingTime,
  formatMeetingWhen,
  meetingInstant,
} from '@/lib/time/tenant-time'

/**
 * A meeting at 6:00 PM in Galveston is 6:00 PM to every visitor, wherever
 * they are reading from. These tests pin that down, including across a
 * daylight saving boundary where a naive implementation drifts by an hour.
 */
describe('municipal time zone handling', () => {
  it('renders the date in the municipality time zone, not the visitor time zone', () => {
    expect(formatMeetingDate('2026-08-18', 'America/Chicago')).toBe('August 18, 2026')
    expect(formatMeetingDate('2026-08-18', 'Pacific/Honolulu')).toBe('August 18, 2026')
  })

  it('formats a 12-hour time by default', () => {
    expect(formatMeetingTime('18:00')).toBe('6:00 PM')
    expect(formatMeetingTime('18:00', 'HH:mm')).toBe('18:00')
  })

  it('omits the time when a meeting has none', () => {
    expect(formatMeetingWhen('2026-08-18', null, 'America/Chicago')).toBe('August 18, 2026')
  })

  it('combines date and time for display', () => {
    expect(formatMeetingWhen('2026-08-18', '18:00', 'America/Chicago')).toBe(
      'August 18, 2026 at 6:00 PM',
    )
  })

  it('resolves the correct instant on either side of a daylight saving change', () => {
    const summer = meetingInstant('2026-08-18', '18:00', 'America/Chicago')
    const winter = meetingInstant('2026-01-18', '18:00', 'America/Chicago')
    expect(summer.toISOString()).toBe('2026-08-18T23:00:00.000Z')
    expect(winter.toISOString()).toBe('2026-01-19T00:00:00.000Z')
  })

  it('treats a meeting with no time as starting at midnight locally', () => {
    const instant = meetingInstant('2026-08-18', null, 'America/Chicago')
    expect(instant.toISOString()).toBe('2026-08-18T05:00:00.000Z')
  })
})
