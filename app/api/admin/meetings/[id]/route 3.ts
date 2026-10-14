import { handler, ok } from '@/lib/api/response'
import { deleteMeetingPermanently, updateMeeting } from '@/lib/services/meetings'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /api/admin/meetings/{id} */
export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  const meeting = await updateMeeting(id, await request.json())
  return ok({ meeting })
})

/**
 * DELETE /api/admin/meetings/{id}
 * Requires meeting.delete and an explicit typed confirmation. Archiving is
 * the normal way to retire a record.
 */
export const DELETE = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  const { confirmation } = await request.json().catch(() => ({ confirmation: '' }))
  await deleteMeetingPermanently(id, confirmation)
  return ok({ deleted: true })
})
