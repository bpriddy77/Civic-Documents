import { handler, ok } from '@/lib/api/response'
import { retireDocument } from '@/lib/services/documents'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/admin/documents/{id}
 * Removes the document from public view. The stored file and its version
 * history are retained; nothing is destroyed here.
 */
export const DELETE = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const document = await retireDocument(id)
  return ok({ document })
})
