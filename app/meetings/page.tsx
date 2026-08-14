import type { Metadata } from 'next'
import { SkipLink } from '@/components/accessibility/SkipLink'
import { ArchiveFilters } from '@/components/public/ArchiveFilters'
import Link from 'next/link'
import { MeetingList } from '@/components/public/MeetingList'
import { VendorFooter } from '@/components/VendorFooter'
import { Pagination } from '@/components/public/Pagination'
import { getMunicipalityBySlug, tenantConfig } from '@/lib/data/tenant'
import { listPublicCategories, listPublicMeetings, listPublicYears } from '@/lib/data/meetings'
import { publicQuerySchema } from '@/lib/validation/schemas'

export const revalidate = 60

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams
  const municipality = await getMunicipalityBySlug(asString(params.municipality))
  const config = tenantConfig(municipality)
  return {
    // `absolute` suppresses the site-wide "| <city>" suffix on this one page.
    //
    // This page is the application home page declared to Google's OAuth
    // consent screen, and Google's branding review compares the configured
    // app name against the name the page declares. When the title, the
    // og:site_name, and the H1 disagree, that check fails — so all three are
    // pinned to the same string here. The city name is still on the page, in
    // the eyebrow above the heading and throughout the footer.
    title: { absolute: config.archive_heading },
    description: `Search agendas and minutes for ${municipality.name} public meetings, including upcoming meetings and the historical archive.`,
    alternates: { canonical: '/meetings' },
    applicationName: config.archive_heading,
    openGraph: {
      title: config.archive_heading,
      siteName: config.archive_heading,
      type: 'website',
      url: '/meetings',
    },
  }
}

export default async function MeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const parsed = publicQuerySchema.safeParse(flatten(raw))
  const query = parsed.success ? parsed.data : publicQuerySchema.parse({})

  const municipality = await getMunicipalityBySlug(query.municipality)
  const config = tenantConfig(municipality)

  const [categories, years] = await Promise.all([
    listPublicCategories(municipality),
    listPublicYears(municipality),
  ])

  const filtersApplied = Boolean(query.q || query.category || query.year || query.from || query.to)
  const showSplitView = query.scope === 'all' && !filtersApplied

  // The unfiltered landing view is the one citizens hit most: upcoming
  // meetings first, then the archive. Any filter collapses it to one result
  // list so search results are not split across two headings.
  const [upcoming, past] = showSplitView
    ? await Promise.all([
        listPublicMeetings(municipality, { ...query, scope: 'upcoming', sort: 'soonest', perPage: 25 }),
        listPublicMeetings(municipality, { ...query, scope: 'past', sort: 'newest' }),
      ])
    : [null, await listPublicMeetings(municipality, { ...query, sort: query.sort ?? config.default_sort })]

  const resultCount = showSplitView ? (upcoming!.total + past.total) : past.total

  return (
    <>
      <SkipLink />

      <header className="border-b border-rule">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <p className="eyebrow">{municipality.name}</p>
          <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{config.archive_heading}</h1>
          <p className="mt-3 max-w-prose text-ink-muted">{config.archive_about}</p>
        </div>
      </header>

      <ArchiveFilters
        action="/meetings"
        query={query}
        categories={categories}
        years={years}
        resultCount={resultCount}
      />

      <main id="main" className="mx-auto max-w-5xl px-4 py-10">
        {showSplitView ? (
          <>
            <MeetingList
              id="upcoming"
              heading="Upcoming meetings"
              description="Soonest first. This list updates on its own as meetings take place."
              meetings={upcoming!.meetings}
              municipality={municipality}
              emptyMessage="No upcoming meetings are scheduled right now. Check back soon, or search the archive below."
            />

            <MeetingList
              id="past"
              heading="Past meetings"
              description="Newest first."
              meetings={past.meetings}
              municipality={municipality}
              emptyMessage="No past meetings have been posted yet."
            />

            <Pagination
              page={past.page}
              pageCount={past.pageCount}
              buildHref={(page) => buildHref(raw, page)}
              label="Past meeting pages"
            />
          </>
        ) : (
          <>
            <MeetingList
              id="results"
              heading="Search results"
              meetings={past.meetings}
              municipality={municipality}
              emptyMessage="No meetings match these filters. Try a different year or category, or clear the filters to see the whole archive."
            />
            <Pagination
              page={past.page}
              pageCount={past.pageCount}
              buildHref={(page) => buildHref(raw, page)}
            />
          </>
        )}
      </main>

      <footer className="border-t border-rule bg-paper-sunk">
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-ink-muted">
          <p>
            Records maintained by {municipality.name}
            {municipality.contact_email && (
              <>
                {' · '}
                <a href={`mailto:${municipality.contact_email}`}>{municipality.contact_email}</a>
              </>
            )}
          </p>
          <p className="mt-2">
            Need a document in an alternative format? Contact the city clerk&rsquo;s office and it
            will be provided.
          </p>

          {/*
            Reading these records requires no account and collects nothing. This
            paragraph describes the staff sign-in only, and is stated plainly
            because a citizen should not have to wonder whether visiting a
            public records page is tracked.
          */}
          <p className="mt-2">
            No account is needed to read anything on this site. City staff sign in to publish and
            maintain these records, using either an email address and password or a Google
            account. When Google is used, this site receives only the name and email address on
            that account, and uses them solely to identify which staff member made each change.
          </p>

          <p className="mt-2">
            <Link href="/privacy">Privacy policy</Link>
            {config.privacy_policy_url && (
              <>
                {' · '}
                <a href={config.privacy_policy_url}>City privacy policy</a>
              </>
            )}
            {config.terms_url && (
              <>
                {' · '}
                <a href={config.terms_url}>Terms of use</a>
              </>
            )}
          </p>

          <VendorFooter className="mt-4 border-t border-rule pt-4" />
        </div>
      </footer>
    </>
  )
}

function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function flatten(params: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(params)
      .map(([key, value]) => [key, asString(value)])
      .filter(([, value]) => value !== undefined && value !== ''),
  )
}

function buildHref(params: Record<string, string | string[] | undefined>, page: number) {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(flatten(params))) {
    if (key !== 'page') next.set(key, String(value))
  }
  if (page > 1) next.set('page', String(page))
  const qs = next.toString()
  return qs ? `/meetings?${qs}` : '/meetings'
}
