import { requirePermission } from '@/lib/auth/session'
import { tenantConfig } from '@/lib/data/tenant'
import { SettingsForm } from '@/components/admin/SettingsForm'
import { siteUrl } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const session = await requirePermission('municipality.update')
  if (!session.municipality) {
    return (
      <p className="rounded border border-rule bg-paper px-4 py-6">
        This account is not attached to a municipality yet.
      </p>
    )
  }

  const config = tenantConfig(session.municipality)

  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 max-w-prose text-ink-muted">
        Branding and display settings for {session.municipality.name}. None of these require a code
        change or a redeployment.
      </p>

      <SettingsForm municipality={session.municipality} config={config} />

      <section aria-labelledby="embed-heading" className="mt-12 rounded border border-rule bg-paper p-4">
        <h2 id="embed-heading" className="font-display text-lg font-semibold">
          Website embed code
        </h2>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          Paste this into a Custom Code or HTML element on the GoHighLevel page where the archive
          should appear. Published meetings show up automatically; the page never needs editing again.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-paper-sunk p-3 text-xs">
{`<div id="government-meetings"></div>
<script src="${siteUrl}/government-meetings.js" defer></script>
<script>
  window.addEventListener('load', function () {
    GovernmentMeetings.init({
      municipality: "${session.municipality.slug}",
      showUpcoming: true,
      showPast: true,
      meetingsPerPage: ${config.meetings_per_page}
    });
  });
</script>`}
        </pre>
      </section>
    </>
  )
}
