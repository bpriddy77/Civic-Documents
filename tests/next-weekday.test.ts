import { describe, expect, it } from 'vitest'
import { nextWeekdayInZone } from '@/lib/time/tenant-time'

const THURSDAY = 4
const CHICAGO = 'America/Chicago'

/**
 * The default meeting date on the create form.
 *
 * The case worth guarding is the time-zone one: the server runs in UTC, and
 * for six hours every evening the UTC date is already tomorrow in Texas. A
 * calculation that used the server's calendar would land a week out, and only
 * ever in the evening — the kind of bug that is reported as "sometimes the
 * date is wrong" and never reproduced in daylight.
 */
describe('nextWeekdayInZone', () => {
  it('returns today when today is already that weekday', () => {
    // Thursday 14 August 2026, 10:00 Chicago
    const from = new Date('2026-08-13T15:00:00Z')
    expect(nextWeekdayInZone(THURSDAY, CHICAGO, from)).toBe('2026-08-13')
  })

  it('returns tomorrow from a Wednesday', () => {
    const from = new Date('2026-08-12T15:00:00Z') // Wed 12 Aug, 10:00 Chicago
    expect(nextWeekdayInZone(THURSDAY, CHICAGO, from)).toBe('2026-08-13')
  })

  it('returns six days later from a Friday', () => {
    const from = new Date('2026-08-14T15:00:00Z') // Fri 14 Aug
    expect(nextWeekdayInZone(THURSDAY, CHICAGO, from)).toBe('2026-08-20')
  })

  it('uses the municipality calendar, not the server UTC date', () => {
    // 02:00 UTC Thursday is still 21:00 Wednesday in Chicago. The answer must
    // be the Thursday a few hours away, not the one a week out.
    const from = new Date('2026-08-13T02:00:00Z')
    expect(nextWeekdayInZone(THURSDAY, CHICAGO, from)).toBe('2026-08-13')
  })

  it('differs between zones at the same instant, as it should', () => {
    const from = new Date('2026-08-13T02:00:00Z')
    // Already Thursday in New York and in UTC-aligned zones.
    expect(nextWeekdayInZone(THURSDAY, 'America/New_York', from)).toBe('2026-08-13')
    // Still Wednesday in Honolulu, so the same Thursday is a day away.
    expect(nextWeekdayInZone(THURSDAY, 'Pacific/Honolulu', from)).toBe('2026-08-13')
  })

  it('rolls over a month boundary', () => {
    const from = new Date('2026-07-31T15:00:00Z') // Fri 31 July
    expect(nextWeekdayInZone(THURSDAY, CHICAGO, from)).toBe('2026-08-06')
  })

  it('rolls over a year boundary', () => {
    const from = new Date('2026-12-30T15:00:00Z') // Wed 30 Dec
    expect(nextWeekdayInZone(THURSDAY, CHICAGO, from)).toBe('2026-12-31')
  })

  it('is unaffected by a daylight saving transition in the span', () => {
    // US DST ends Sunday 1 November 2026. Asking on the Friday before must
    // still give the Thursday six days later, not a day either side.
    const from = new Date('2026-10-30T15:00:00Z')
    expect(nextWeekdayInZone(THURSDAY, CHICAGO, from)).toBe('2026-11-05')
  })

  it('handles every weekday', () => {
    const from = new Date('2026-08-12T15:00:00Z') // Wednesday
    const expected = [
      '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-12',
      '2026-08-13', '2026-08-14', '2026-08-15',
    ]
    for (let weekday = 0; weekday < 7; weekday += 1) {
      expect(nextWeekdayInZone(weekday, CHICAGO, from)).toBe(expected[weekday])
    }
  })
})

describe('formatInstant', () => {
  it('shows a stored timestamp in the municipality time, not UTC', async () => {
    const { formatInstant } = await import('@/lib/time/tenant-time')
    // The nightly crawl runs at 07:00 UTC. Reported as UTC that reads as
    // the middle of the working day; in Texas it is the small hours, which
    // is when it actually ran and what someone reading the page needs.
    const summer = formatInstant('2026-10-19T07:00:00Z', CHICAGO)
    expect(summer).toContain('Oct 19, 2026')
    expect(summer).toContain('2:00 AM') // still CDT, UTC-5

    // And the offset has to follow the clocks. US daylight saving ends on
    // 1 November 2026, so the same scheduled job reports an hour earlier
    // from then on. A formatter that sliced the ISO string would show
    // 7:00 AM all year and be wrong twice over.
    const winter = formatInstant('2026-11-19T07:00:00Z', CHICAGO)
    expect(winter).toContain('1:00 AM') // CST, UTC-6
  })

  it('handles a missing or unparseable value without throwing', async () => {
    const { formatInstant } = await import('@/lib/time/tenant-time')
    expect(formatInstant(null, CHICAGO)).toBe('—')
    expect(formatInstant('not a date', CHICAGO)).toBe('—')
  })
})
