import { handler, ok } from '@/lib/api/response'
import { invalid } from '@/lib/errors'
import { changeMeetingStatus } from '@/lib/services/meetings'
import { meetingStatusSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/** POST /api/admin/meetings/{id}/status - publish, unpublish, archive, restore. */
export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const parsed = meetingStatusSchema.safeParse(body.status)
  if (!parsed.success) throw invalid('Choose Draft, Published, or Archived.')

  const meeting = await changeMeetingStatus(id, parsed.data)
  return ok({ meeting })
})
