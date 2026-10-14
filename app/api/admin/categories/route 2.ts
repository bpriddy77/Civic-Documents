import { created, handler, ok } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { categoryInputSchema } from '@/lib/validation/schemas'
import { slugify } from '@/lib/validation/slug'
import { invalid } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export const GET = handler(async () => {
  const session = await requirePermission('category.read')
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('meeting_categories')
    .select('*')
    .eq('municipality_id', session.profile.municipality_id!)
    .order('display_order')
    .order('name')
  return ok({ categories: data ?? [] })
})

export const POST = handler(async (request: Request) => {
  const session = await requirePermission('category.manage')
  const input = categoryInputSchema.parse(await request.json())
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('meeting_categories')
    .insert({
      municipality_id: session.profile.municipality_id!,
      name: input.name,
      slug: slugify(input.name, 'category'),
      description: input.description ?? null,
      display_order: input.display_order,
      active: input.active,
    })
    .select('*')
    .single()

  if (error?.code === '23505') {
    throw invalid('A category with that name already exists.', { name: 'Choose a different name.' })
  }
  if (error) throw error
  return created({ category: data })
})
