import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { AlertManager } from '@/components/admin/AlertManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Alerts' }

export default async function AlertsPage() {
  const session = await requirePermission('alert.read')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('alerts')
    .select('*')
    .eq('municipality_id', session.profile.municipality_id!)
    .order('published_at', { ascending: false })
    .limit(20)

  const all = data ?? []
  const now = Date.now()
  const live = all.find((a) => !a.cleared_at && new Date(a.expires_at).getTime() > now) ?? null

  return (
    <>
      <h1 className="text-2xl font-semibold">Alerts</h1>
      <p className="mt-1 max-w-prose text-ink-muted">
        An urgent notice shown at the top of every page of the City&rsquo;s website. Use it for
        things residents need to know right now — severe weather, unsafe water, a road closed by
        an accident. When no alert is posted, the website looks completely normal.
      </p>

      <AlertManager live={live} history={all.filter((a) => a.id !== live?.id)} />
    </>
  )
}
