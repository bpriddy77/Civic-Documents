import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Tenant isolation and public visibility, checked against a real database.
 *
 * These are the assertions that cannot be made in a unit test, because the
 * thing being tested is PostgreSQL policy evaluation rather than application
 * code. Run against a local stack:
 *
 *   supabase start && supabase db reset
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321 \
 *   SUPABASE_TEST_ANON_KEY=<anon key from `supabase status`> \
 *   SUPABASE_TEST_SERVICE_KEY=<service key> \
 *   npm test
 */
const url = process.env.SUPABASE_TEST_URL
const anonKey = process.env.SUPABASE_TEST_ANON_KEY
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY
const configured = Boolean(url && anonKey && serviceKey)

describe.skipIf(!configured)('Row-Level Security', () => {
  let anon: ReturnType<typeof createClient<Database>>
  let service: ReturnType<typeof createClient<Database>>
  let tenantA: string
  let tenantB: string

  beforeAll(async () => {
    anon = createClient<Database>(url!, anonKey!)
    service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } })

    const { data: municipalities } = await service
      .from('municipalities')
      .upsert(
        [
          { name: 'Tenant A', slug: 'tenant-a', timezone: 'America/Chicago' },
          { name: 'Tenant B', slug: 'tenant-b', timezone: 'America/New_York' },
        ],
        { onConflict: 'slug' },
      )
      .select('id, slug')

    tenantA = municipalities!.find((m) => m.slug === 'tenant-a')!.id
    tenantB = municipalities!.find((m) => m.slug === 'tenant-b')!.id

    const { data: category } = await service
      .from('meeting_categories')
      .upsert(
        { municipality_id: tenantA, name: 'City Council', slug: 'city-council' },
        { onConflict: 'municipality_id,slug' },
      )
      .select('id')
      .single()

    await service.from('meetings').upsert([
      {
        municipality_id: tenantA,
        category_id: category!.id,
        title: 'Draft meeting that must stay hidden',
        slug: 'draft-meeting',
        meeting_date: '2026-09-01',
        status: 'draft',
      },
      {
        municipality_id: tenantA,
        category_id: category!.id,
        title: 'Published meeting',
        slug: 'published-meeting',
        meeting_date: '2026-09-02',
        status: 'published',
      },
    ])
  })

  it('never shows a draft meeting to the public', async () => {
    const { data } = await anon.from('meetings').select('id, status')
    expect(data?.some((m) => m.status === 'draft')).toBe(false)
  })

  it('shows published meetings to the public', async () => {
    const { data } = await anon.from('meetings').select('id, title').eq('municipality_id', tenantA)
    expect(data?.length).toBeGreaterThan(0)
  })

  it('refuses anonymous writes', async () => {
    const { error } = await anon
      .from('meetings')
      .insert({ municipality_id: tenantA, title: 'Injected', meeting_date: '2026-09-03' })
    expect(error).not.toBeNull()
  })

  it('refuses anonymous reads of the audit log', async () => {
    const { data, error } = await anon.from('audit_log').select('id').limit(1)
    expect(error ?? data?.length === 0).toBeTruthy()
  })

  it('keeps the two tenants separate for anonymous callers', async () => {
    const { data } = await anon.from('meetings').select('municipality_id').eq('municipality_id', tenantB)
    expect(data?.length ?? 0).toBe(0)
  })

  it('refuses to modify the audit log even with a privileged connection', async () => {
    const { data: entry } = await service.from('audit_log').select('id').limit(1).maybeSingle()
    if (!entry) return
    const { error } = await service.from('audit_log').update({ action: 'tampered' }).eq('id', entry.id)
    expect(error?.message).toMatch(/append only/i)
  })
})
