import { describe, expect, it } from 'vitest'
import { meetingInputSchema, publicQuerySchema, fieldErrors } from '@/lib/validation/schemas'

const valid = {
  title: 'City Council Regular Meeting',
  category_id: '11111111-1111-4111-8111-111111111111',
  meeting_date: '2026-08-18',
  meeting_time: '18:00',
  status: 'draft' as const,
}

describe('meeting input', () => {
  it('accepts a complete meeting', () => {
    expect(meetingInputSchema.safeParse(valid).success).toBe(true)
  })

  it('requires a meeting date', () => {
    const result = meetingInputSchema.safeParse({ ...valid, meeting_date: undefined })
    expect(result.success).toBe(false)
    expect(Object.keys(fieldErrors(result.error!))).toContain('meeting_date')
  })

  it('requires a title', () => {
    const result = meetingInputSchema.safeParse({ ...valid, title: '   ' })
    expect(result.success).toBe(false)
    expect(fieldErrors(result.error!).title).toMatch(/required/i)
  })

  it('requires a category', () => {
    const result = meetingInputSchema.safeParse({ ...valid, category_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
    expect(fieldErrors(result.error!).category_id).toMatch(/required/i)
  })

  it('treats meeting time as optional', () => {
    expect(meetingInputSchema.safeParse({ ...valid, meeting_time: null }).success).toBe(true)
  })

  it('rejects an impossible date', () => {
    expect(meetingInputSchema.safeParse({ ...valid, meeting_date: '2026-13-45' }).success).toBe(false)
  })

  it('rejects a status outside the allowed set', () => {
    expect(meetingInputSchema.safeParse({ ...valid, status: 'live' }).success).toBe(false)
  })
})

describe('public query', () => {
  it('defaults to showing everything, newest page first', () => {
    const query = publicQuerySchema.parse({})
    expect(query.scope).toBe('all')
    expect(query.page).toBe(1)
  })

  it('caps the page size so no request can pull the whole archive', () => {
    expect(publicQuerySchema.safeParse({ perPage: 5000 }).success).toBe(false)
  })

  it('coerces numeric query strings', () => {
    expect(publicQuerySchema.parse({ year: '2025', page: '3' })).toMatchObject({ year: 2025, page: 3 })
  })
})
