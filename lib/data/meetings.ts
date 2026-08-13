import 'server-only'
import { createAnonSupabase } from '@/lib/supabase/server'
import type { PublicQuery } from '@/lib/validation/schemas'
import type { MeetingWithRelations, Municipality } from '@/lib/supabase/database.types'
import { tenantConfig } from './tenant'

const MEETING_SELECT = `
  id, municipality_id, category_id, title, slug, description, meeting_date,
  meeting_time, location, status, minutes_status, starts_at, published_at,
  archived_at, created_by, updated_by, created_at, updated_at,
  category:meeting_categories ( id, name, slug ),
  documents:meeting_documents (
    id, document_type, posted_date, public_slug, original_filename,
    file_size, version, active_version, created_at, removed_at,
    municipality_id, meeting_id, storage_path, stored_filename, mime_type,
    sha256, uploaded_by, replaced_at
  )
`

export interface MeetingPage {
  meetings: MeetingWithRelations[]
  total: number
  page: number
  perPage: number
  pageCount: number
}

/**
 * Public meeting query.
 *
 * Runs through the anon client, so Row-Level Security - not this function -
 * is what keeps drafts out of the results. The filters here shape the page;
 * the database decides what may be seen at all.
 */
export async function listPublicMeetings(
  municipality: Municipality,
  query: PublicQuery,
): Promise<MeetingPage> {
  const supabase = createAnonSupabase()
  const config = tenantConfig(municipality)
  const perPage = query.perPage ?? config.meetings_per_page
  const page = query.page ?? 1
  const nowIso = new Date().toISOString()

  let request = supabase
    .from('meetings')
    .select(MEETING_SELECT, { count: 'exact' })
    .eq('municipality_id', municipality.id)
    .in('status', ['published', 'archived'])

  if (query.scope === 'upcoming') request = request.gte('starts_at', nowIso)
  if (query.scope === 'past') request = request.lt('starts_at', nowIso)

  if (query.q) {
    const escaped = query.q.replace(/[%,()]/g, ' ').trim()
    if (escaped) {
      request = request.or(
        `title.ilike.%${escaped}%,description.ilike.%${escaped}%,location.ilike.%${escaped}%`,
      )
    }
  }

  if (query.category) {
    const { data: category } = await supabase
      .from('meeting_categories')
      .select('id')
      .eq('municipality_id', municipality.id)
      .eq('slug', query.category)
      .maybeSingle()
    // An unknown category returns nothing rather than silently ignoring the filter.
    request = request.eq('category_id', category?.id ?? '00000000-0000-0000-0000-000000000000')
  }

  if (query.year) {
    request = request
      .gte('meeting_date', `${query.year}-01-01`)
      .lte('meeting_date', `${query.year}-12-31`)
  }
  if (query.from) request = request.gte('meeting_date', query.from)
  if (query.to) request = request.lte('meeting_date', query.to)

  const ascending =
    query.sort === 'oldest' ? true
    : query.sort === 'soonest' ? true
    : query.scope === 'upcoming' ? true
    : false

  const from = (page - 1) * perPage
  const { data, error, count } = await request
    .order('starts_at', { ascending })
    .order('title', { ascending: true })
    .range(from, from + perPage - 1)

  if (error) throw error

  const meetings = (data ?? []).map(normalizeMeeting)
  const total = count ?? meetings.length

  return { meetings, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) }
}

export async function getPublicMeeting(
  municipality: Municipality,
  meetingDate: string,
  slug: string,
): Promise<MeetingWithRelations | null> {
  const supabase = createAnonSupabase()
  const { data } = await supabase
    .from('meetings')
    .select(MEETING_SELECT)
    .eq('municipality_id', municipality.id)
    .eq('meeting_date', meetingDate)
    .eq('slug', slug)
    .in('status', ['published', 'archived'])
    .maybeSingle()

  return data ? normalizeMeeting(data) : null
}

export async function listPublicCategories(municipality: Municipality) {
  const supabase = createAnonSupabase()
  const { data } = await supabase
    .from('meeting_categories')
    .select('id, name, slug, description, display_order')
    .eq('municipality_id', municipality.id)
    .eq('active', true)
    .is('archived_at', null)
    .order('display_order')
    .order('name')
  return data ?? []
}

/** Years that actually contain published meetings, for the quick year links. */
export async function listPublicYears(municipality: Municipality): Promise<number[]> {
  const supabase = createAnonSupabase()
  const { data } = await supabase
    .from('meetings')
    .select('meeting_date')
    .eq('municipality_id', municipality.id)
    .in('status', ['published', 'archived'])
    .order('meeting_date', { ascending: false })
    .limit(5000)

  const years = new Set<number>()
  for (const row of data ?? []) years.add(Number(row.meeting_date.slice(0, 4)))
  return [...years].sort((a, b) => b - a)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeMeeting(row: any): MeetingWithRelations {
  return {
    ...row,
    category: Array.isArray(row.category) ? row.category[0] ?? null : row.category ?? null,
    documents: (row.documents ?? []).filter((d: any) => d.active_version && !d.removed_at),
  }
}
