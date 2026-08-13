import { created, handler } from '@/lib/api/response'
import { invalid } from '@/lib/errors'
import { uploadDocument } from '@/lib/services/documents'
import { documentTypeSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/documents - multipart upload of an agenda or minutes PDF.
 * The same endpoint handles replacement: an existing live document is
 * superseded and the new version inherits its permanent public URL.
 */
export const POST = handler(async (request: Request) => {
  const form = await request.formData().catch(() => null)
  if (!form) throw invalid('Send the file as a multipart form.')

  const file = form.get('file')
  if (!(file instanceof File)) throw invalid('Choose a PDF file to upload.')

  const documentType = documentTypeSchema.safeParse(form.get('document_type'))
  if (!documentType.success) throw invalid('Choose either Agenda or Minutes.')

  const meetingId = String(form.get('meeting_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) throw invalid('Save the meeting before uploading a document.')

  const postedDate = String(form.get('posted_date') ?? '') || null

  const result = await uploadDocument({
    meetingId,
    documentType: documentType.data,
    postedDate,
    file,
  })

  return created(result)
})
