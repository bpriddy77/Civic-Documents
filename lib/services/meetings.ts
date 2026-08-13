import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'
import { assertTenant, requirePermission, type Session } from '@/lib/auth/session'
import { conflict, invalid, notFound } from '@/lib/errors'
import { meetingInputSchema, type MeetingInput } from '@/lib/validation/schemas'
import { slugify } from '@/lib/validation/slug'
import type { Meeting, MeetingStatus } from '@/lib/supabase/database.types'

/**
 * Meeting write operations.
 *
 * Each one re-checks permission on the server before touching the database,
 * and PostgreSQL checks it again through RLS. Route handlers stay thin so
 * there is exactly one place where a rule about meetings lives.
 */

export async function createMeeting(input: MeetingInput): Promise<Meeting> {
  const data = meetingInputSchema.parse(input)
  const session = await requirePermission('meeting.create')
  if (data.status === 'published') await requirePermission('meeting.publish')
  if (data.status === 'archived') await requirePermission('meeting.archive')

  const municipalityId = await tenantFor(session)
  await assertCategoryBelongs(data.category_id, municipalityId)

  const supabase = await createServerSupabase()
  const slug = await uniqueSlug(municipalityId, data.meeting_date, slugify(data.title, 'meeting'))

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      municipality_id: municipalityId,
      category_id: data.category_id,
      title: data.title,
      slug,
      description: data.description ?? null,
      meeting_date: data.meeting_date,
      meeting_time: data.meeting_time ?? null,
      location: data.location ?? null,
      status: data.status,
      minutes_status: data.minutes_status,
      created_by: session.profile.id,
      updated_by: session.profile.id,
    })
    .select('*')
    .single()

  if (error) throw error
  return meeting
}

export async function updateMeeting(id: string, input: Partial<MeetingInput>): Promise<Meeting> {
  const session = await requirePermission('meeting.update')
  const current = await loadMeeting(id)
  assertTenant(session, current.municipality_id)

  const data = meetingInputSchema.partial().parse(input)

  if (data.status && data.status !== current.status) {
    if (data.status === 'published') await requirePermission('meeting.publish')
    if (data.status === 'archived') await requirePermission('meeting.archive')
  }
  if (data.category_id) await assertCategoryBelongs(data.category_id, current.municipality_id)

  const supabase = await createServerSupabase()
  const slug =
    data.title && data.title !== current.title
      ? await uniqueSlug(
          current.municipality_id,
          data.meeting_date ?? current.meeting_date,
          slugify(data.title, 'meeting'),
          current.id,
        )
      : current.slug

  const { data: meeting, error } = await supabase
    .from('meetings')
    .update({
      ...(data.title !== undefined && { title: data.title, slug }),
      ...(data.category_id !== undefined && { category_id: data.category_id }),
      ...(data.meeting_date !== undefined && { meeting_date: data.meeting_date }),
      ...(data.meeting_time !== undefined && { meeting_time: data.meeting_time ?? null }),
      ...(data.location !== undefined && { location: data.location ?? null }),
      ...(data.description !== undefined && { description: data.description ?? null }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.minutes_status !== undefined && { minutes_status: data.minutes_status }),
      updated_by: session.profile.id,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return meeting
}

/** Publish, unpublish, archive, or restore. */
export async function changeMeetingStatus(id: string, status: MeetingStatus): Promise<Meeting> {
  const permission =
    status === 'published' ? 'meeting.publish'
    : status === 'archived' ? 'meeting.archive'
    : 'meeting.update'

  const session = await requirePermission(permission)
  const current = await loadMeeting(id)
  assertTenant(session, current.municipality_id)

  if (status === 'published') {
    const supabase = await createServerSupabase()
    const { count } = await supabase
      .from('meeting_documents')
      .select('id', { count: 'exact', head: true })
      .eq('meeting_id', id)
      .eq('document_type', 'agenda')
      .eq('active_version', true)

    // Publishing without an agenda is allowed - a meeting notice often goes up
    // first - but minutes marked Draft must never become public by accident.
    if (current.minutes_status === 'draft' && (count ?? 0) >= 0) {
      const { data: minutes } = await supabase
        .from('meeting_documents')
        .select('id')
        .eq('meeting_id', id)
        .eq('document_type', 'minutes')
        .eq('active_version', true)
        .maybeSingle()

      if (minutes) {
        throw invalid(
          'These minutes are still marked Draft. Set the minutes status to Pending Approval or ' +
            'Approved before publishing, or the draft would become a public record.',
        )
      }
    }
  }

  return updateMeeting(id, { status })
}

export async function duplicateMeeting(
  id: string,
  meetingDate: string,
  copyDescription = true,
): Promise<Meeting> {
  const session = await requirePermission('meeting.create')
  const current = await loadMeeting(id)
  assertTenant(session, current.municipality_id)

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('duplicate_meeting', {
    p_meeting_id: id,
    p_meeting_date: meetingDate,
    p_copy_description: copyDescription,
  })

  if (error) {
    if (error.code === '23505') {
      throw conflict('A meeting with this title already exists on that date.')
    }
    throw error
  }
  return data as unknown as Meeting
}

/**
 * Permanent deletion. Restricted, confirmed, and audited - archiving is the
 * normal way to take a record out of circulation.
 */
export async function deleteMeetingPermanently(id: string, confirmation: string): Promise<void> {
  const session = await requirePermission('meeting.delete')
  const current = await loadMeeting(id)
  assertTenant(session, current.municipality_id)

  if (confirmation !== 'DELETE') {
    throw invalid('Type DELETE to confirm permanent deletion.')
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.from('meetings').delete().eq('id', id)
  if (error) throw error
}

async function loadMeeting(id: string): Promise<Meeting> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle()
  if (!data) throw notFound('That meeting could not be found.')
  return data
}

async function tenantFor(session: Session): Promise<string> {
  if (session.profile.municipality_id) return session.profile.municipality_id
  throw invalid('Choose a municipality before creating meetings.')
}

async function assertCategoryBelongs(categoryId: string, municipalityId: string) {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('meeting_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('municipality_id', municipalityId)
    .maybeSingle()
  if (!data) throw invalid('Choose a category that belongs to this municipality.')
}

/** Two meetings can share a date; their public URLs cannot. */
async function uniqueSlug(
  municipalityId: string,
  meetingDate: string,
  base: string,
  excludeId?: string,
): Promise<string> {
  const supabase = await createServerSupabase()
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    let request = supabase
      .from('meetings')
      .select('id')
      .eq('municipality_id', municipalityId)
      .eq('meeting_date', meetingDate)
      .eq('slug', candidate)
    if (excludeId) request = request.neq('id', excludeId)

    const { data } = await request.maybeSingle()
    if (!data) return candidate
  }
  throw conflict('Too many meetings share this title on this date. Adjust the title.')
}
