import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { tenantConfig } from '@/lib/data/tenant'
import { formatInstant } from '@/lib/time/tenant-time'
import { siteUrl } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Website search' }

/**
 * What the search index currently contains, and what the last crawl could
 * not read.
 *
 * The warnings are the point of this page. A scanned PDF is invisible to
 * search and equally invisible to a screen reader, and without somewhere
 * that says so it stays that way until somebody complains — which, for the
 * accessibility problem, means until somebody has already been unable to
 * read a public record.
 */
export default async function SearchAdminPage() {
  const session = await requirePermission('municipality.update')
  if (!session.municipality) {
    return (
      <p className="rounded border border-rule bg-paper px-4 py-6">
        This account is not attached to a municipality yet.
      </p>
    )
  }

  const config = tenantConfig(session.municipality)
  const supabase = await createServerSupabase()
  const tenantId = session.municipality.id
  const zone = session.municipality.timezone

  const [{ data: crawls }, { count: total }, { count: scans }, { data: bySource }] =
    await Promise.all([
      supabase.from('search_crawls').select('*')
        .eq('municipality_id', tenantId)
        .order('started_at', { ascending: false }).limit(5),
      supabase.from('search_documents').select('id', { count: 'exact', head: true })
        .eq('municipality_id', tenantId).is('removed_at', null),
      supabase.from('search_documents').select('id', { count: 'exact', head: true })
        .eq('municipality_id', tenantId).is('removed_at', null).eq('text_layer', false),
      supabase.from('search_documents').select('source')
        .eq('municipality_id', tenantId).is('removed_at', null),
    ])

  const counts = (bySource ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.source] = (acc[row.source] ?? 0) + 1
    return acc
  }, {})

  const last = crawls?.[0] ?? null
  const warnings = (last?.warnings ?? []) as { url: string; reason: string }[]
  const enabled = config.search_enabled === true

  return (
    <>
      <h1 className="text-2xl font-semibold">Website search</h1>
      <p className="mt-1 max-w-prose text-ink-muted">
        What residents can find when they search the City&rsquo;s website.
      </p>

      {!enabled && (
        <p className="mt-6 rounded border-l-4 border-status-pending bg-paper px-4 py-4">
          Website search is switched off, so the search box returns nothing.{' '}
          <Link href="/admin/settings">Turn it on in Settings</Link>.
        </p>
      )}

      <section aria-labelledby="indexed" className="mt-8">
        <h2 id="indexed" className="font-display text-lg font-semibold">
          In the index
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            ['Website pages', counts.page ?? 0],
            ['PDFs on the website', counts.pdf ?? 0],
            ['Meetings', counts.meeting ?? 0],
            ['Agendas and minutes', counts.document ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded border border-rule bg-paper px-4 py-3">
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm text-ink-muted">
          {total ?? 0} entries in total. Agendas and minutes are added the moment they are
          published; website pages are checked once a night.
        </p>
      </section>

      {(scans ?? 0) > 0 && (
        <section aria-labelledby="scans" className="mt-8 rounded border-l-4 border-status-pending bg-paper px-4 py-4">
          <h2 id="scans" className="font-display text-lg font-semibold">
            {scans} {scans === 1 ? 'document is' : 'documents are'} scanned images
          </h2>
          <p className="mt-2 max-w-prose text-sm">
            A scanned PDF is a picture of a page. Nothing inside it can be searched, and a
            resident using a screen reader cannot read it at all. Replacing these with PDFs
            saved directly from Word fixes both problems at once.
          </p>
        </section>
      )}

      <section aria-labelledby="crawl" className="mt-8">
        <h2 id="crawl" className="font-display text-lg font-semibold">Last check of the website</h2>
        {!last ? (
          <p className="mt-2 text-ink-muted">
            The website has not been checked yet. It runs overnight.
          </p>
        ) : (
          <>
            <p className="mt-2">
              {formatInstant(last.finished_at ?? last.started_at, zone)} — {last.status === 'succeeded'
                ? `${last.pages_indexed} pages and ${last.pdfs_indexed} PDFs read, ${last.unchanged} unchanged, ${last.removed} removed.`
                : last.status === 'running'
                  ? 'Running now.'
                  : `Failed: ${last.error_message ?? 'no reason recorded'}`}
            </p>

            {warnings.length > 0 && (
              <>
                <h3 className="mt-5 font-semibold">
                  {warnings.length} {warnings.length === 1 ? 'page' : 'pages'} could not be read
                </h3>
                <ul className="mt-2 space-y-2">
                  {warnings.slice(0, 25).map((warning) => (
                    <li key={warning.url} className="rounded border border-rule bg-paper px-3 py-2 text-sm">
                      <a href={warning.url} className="break-all">{warning.url}</a>
                      <p className="mt-1 text-ink-muted">{warning.reason}</p>
                    </li>
                  ))}
                </ul>
                {warnings.length > 25 && (
                  <p className="mt-2 text-sm text-ink-muted">
                    and {warnings.length - 25} more.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="embed" className="mt-12 rounded border border-rule bg-paper p-4">
        <h2 id="embed" className="font-display text-lg font-semibold">Search box code</h2>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          Paste this into a Custom Code element wherever the search box should appear.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-paper-sunk p-3 text-xs">
{`<div id="city-search"></div>
<script src="${siteUrl}/city-search.js" defer></script>
<script>
  window.addEventListener('load', function () {
    CitySearch.init({ municipality: "${session.municipality.slug}" });
  });
</script>`}
        </pre>
      </section>
    </>
  )
}
