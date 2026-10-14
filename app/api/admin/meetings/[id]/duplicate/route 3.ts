import { created, handler } from '@/lib/api/response'
import { invalid } from '@/lib/errors'
import { duplicateMeeting } from '@/lib/services/meetings'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/meetings/{id}/duplicate
 * Copies the recurring details onto a new draft. Documents, posted dates,
 * approval status, and history are never carried over.
 */
export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const { meeting_date: meetingDate, copy_description: copyDescription = true } =
    await request.json().catch(() => ({}))

  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate ?? '')) {
    throw invalid('Meeting Date is required for the duplicated meeting.', {
      meeting_date: 'Choose the date of the new meeting.',
    })
  }

  const meeting = await duplicateMeeting(id, meetingDate, Boolean(copyDescription))
  return created({ meeting })
})
