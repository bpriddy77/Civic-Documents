import { created, handler } from '@/lib/api/response'
import { createMeeting } from '@/lib/services/meetings'

export const dynamic = 'force-dynamic'

/** POST /api/admin/meetings - create a meeting. */
export const POST = handler(async (request: Request) => {
  const body = await request.json()
  const meeting = await createMeeting(body)
  return created({ meeting })
})
