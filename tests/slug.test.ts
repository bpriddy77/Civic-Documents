import { describe, expect, it } from 'vitest'
import { assertSafeStoragePath, sanitizeFilename, slugify } from '@/lib/validation/slug'

describe('slugify', () => {
  it('builds a URL-safe slug from a meeting title', () => {
    expect(slugify('City Council Regular Meeting')).toBe('city-council-regular-meeting')
  })

  it('strips accents and punctuation', () => {
    expect(slugify('Planning & Zoning — Séptembre')).toBe('planning-zoning-septembre')
  })

  it('falls back when nothing usable remains', () => {
    expect(slugify('!!!', 'meeting')).toBe('meeting')
  })
})

describe('sanitizeFilename', () => {
  it('strips directory traversal', () => {
    expect(sanitizeFilename('../../etc/passwd.pdf')).toBe('passwd.pdf')
  })

  it('removes a second extension', () => {
    expect(sanitizeFilename('agenda.pdf.exe')).toBe('agenda.pdf.pdf')
  })

  it('removes leading dots so no hidden file is created', () => {
    expect(sanitizeFilename('.htaccess.pdf')).toBe('htaccess.pdf')
  })

  it('always ends in .pdf', () => {
    expect(sanitizeFilename('minutes')).toMatch(/\.pdf$/)
  })
})

describe('assertSafeStoragePath', () => {
  const tenant = '11111111-1111-4111-8111-111111111111'

  it('accepts a path inside the tenant folder', () => {
    expect(() =>
      assertSafeStoragePath(`municipalities/${tenant}/meetings/abc/agendas/v1.pdf`, tenant),
    ).not.toThrow()
  })

  it('refuses another tenant folder', () => {
    expect(() =>
      assertSafeStoragePath('municipalities/22222222-2222-4222-8222-222222222222/x.pdf', tenant),
    ).toThrow()
  })

  it('refuses traversal', () => {
    expect(() =>
      assertSafeStoragePath(`municipalities/${tenant}/../other/x.pdf`, tenant),
    ).toThrow()
  })
})
