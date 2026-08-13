import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'
import { assertTenant, requirePermission } from '@/lib/auth/session'
import { invalid, notFound } from '@/lib/errors'
import { serverEnv } from '@/lib/env'
import { validatePdfUpload } from '@/lib/validation/pdf'
import { assertSafeStoragePath, sanitizeFilename } from '@/lib/validation/slug'
import { buildStoragePath } from '@/lib/documents/urls'
import { tenantConfig } from '@/lib/data/tenant'
import { documentUploadMessages } from '@/lib/validation/schemas'
import type { DocumentType, MeetingDocument } from '@/lib/supabase/database.types'

const BUCKET = 'meeting-documents'

/**
 * Upload or replace an agenda or minutes PDF.
 *
 * Order matters. The bytes are validated before anything is stored, the
 * object is written under a randomised name inside the tenant's own folder,
 * and only then does a single transactional RPC supersede the old version
 * and record the new one. If the database step fails, the orphaned object is
 * removed, so a failed upload never leaves a file nobody can account for.
 */
export async function uploadDocument(input: {
  meetingId: string
  documentType: DocumentType
  postedDate: string | null
  file: File
}): Promise<{ document: MeetingDocument; accessibilityWarning: string | null }> {
  const session = await requirePermission('document.manage')
  const supabase = await createServerSupabase()

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, municipality_id')
    .eq('id', input.meetingId)
    .maybeSingle()

  if (!meeting) throw notFound('That meeting could not be found.')
  assertTenant(session, meeting.municipality_id)

  if (!input.postedDate) {
    throw invalid(
      documentUploadMessages[input.documentType as 'agenda' | 'minutes'] ??
        'A Posted Date is required when a document is uploaded.',
      { posted_date: 'This date is required.' },
    )
  }

  const maxMb = await maxUploadMb(meeting.municipality_id)
  const check = await validatePdfUpload(input.file, maxMb)

  const { data: current } = await supabase
    .from('meeting_documents')
    .select('version')
    .eq('meeting_id', input.meetingId)
    .eq('document_type', input.documentType)
    .eq('active_version', true)
    .maybeSingle()

  const nextVersion = (current?.version ?? 0) + 1
  const storagePath = buildStoragePath(
    meeting.municipality_id,
    meeting.id,
    input.documentType,
    nextVersion,
  )
  assertSafeStoragePath(storagePath, meeting.municipality_id)

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    console.error('[documents] upload failed', uploadError.message)
    throw invalid('The file could not be stored. Try uploading it again.')
  }

  const { data: document, error } = await supabase.rpc('upsert_meeting_document', {
    p_meeting_id: input.meetingId,
    p_document_type: input.documentType,
    p_posted_date: input.postedDate,
    p_storage_path: storagePath,
    p_original_filename: input.file.name.slice(0, 255),
    p_stored_filename: sanitizeFilename(input.file.name),
    p_file_size: check.size,
    p_sha256: check.sha256,
  } as never)

  if (error || !document) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    console.error('[documents] record failed', error?.message)
    throw invalid('The document could not be recorded against this meeting. Nothing was saved.')
  }

  return {
    document: document as unknown as MeetingDocument,
    accessibilityWarning: check.likelyImageOnly
      ? 'This PDF appears to contain no selectable text, which usually means it is a scan. ' +
        'Screen readers cannot read it. Post a searchable, tagged version when one is available.'
      : null,
  }
}

/** Takes a document out of public view. The file and its history are retained. */
export async function retireDocument(documentId: string): Promise<MeetingDocument> {
  const session = await requirePermission('document.manage')
  const supabase = await createServerSupabase()

  const { data: existing } = await supabase
    .from('meeting_documents')
    .select('id, municipality_id')
    .eq('id', documentId)
    .maybeSingle()

  if (!existing) throw notFound('That document could not be found.')
  assertTenant(session, existing.municipality_id)

  const { data, error } = await supabase.rpc('retire_meeting_document', {
    p_document_id: documentId,
  } as never)

  if (error) throw error
  return data as unknown as MeetingDocument
}

/** Every version of one document, newest first, for the history panel. */
export async function documentHistory(
  meetingId: string,
  documentType: DocumentType,
): Promise<MeetingDocument[]> {
  await requirePermission('document.read')
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('meeting_documents')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('document_type', documentType)
    .order('version', { ascending: false })
  return data ?? []
}

async function maxUploadMb(municipalityId: string): Promise<number> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('municipalities')
    .select('*')
    .eq('id', municipalityId)
    .maybeSingle()

  const configured = data ? tenantConfig(data).max_upload_mb : undefined
  return Math.min(configured ?? serverEnv().MAX_UPLOAD_MB, serverEnv().MAX_UPLOAD_MB)
}
