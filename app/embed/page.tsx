import type { Metadata } from 'next'
import { MeetingList } from '@/components/public/MeetingList'
import { getMunicipalityBySlug, tenantConfig } from '@/lib/data/tenant'
import { listPublicMeetings } from '@/lib/data/meetings'
import { publicQuerySchema } from '@/lib/validation/schemas'

export const revalidate = 60

export const metadata: Metadata = {
  // The iframe fallback duplicates /meetings, so it must not compete with it
  // in search results.
  robots: { index: false, follow: true },
  title: 'Meeting archive',
}

/**
 * Iframe fallback for hosts that will not run the widget script.
 *
 *   <iframe src="https://records.example-city.gov/embed?municipality=city-of-example"
 *           title="Meeting agendas and minutes" style="width:100%;border:0" height="900"></iframe>
 */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const query = publicQuerySchema.parse(params)
  const municipality = await getMunicipalityBySlug(query.municipality)
  const config = tenantConfig(municipality)

  const [upcoming, past] = await Promise.all([
    listPublicMeetings(municipality, { ...query, scope: 'upcoming', sort: 'soonest', perPage: 25 }),
    listPublicMeetings(municipality, { ...query, scope: 'past', sort: config.default_sort }),
  ])

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold">{config.archive_heading}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Agendas are posted before each meeting. Minutes are posted once approved.
      </p>

      <MeetingList
        id="embed-upcoming"
        heading="Upcoming meetings"
        meetings={upcoming.meetings}
        municipality={municipality}
        emptyMessage="No upcoming meetings are scheduled right now."
      />
      <MeetingList
        id="embed-past"
        heading="Past meetings"
        meetings={past.meetings}
        municipality={municipality}
        emptyMessage="No past meetings have been posted yet."
      />

      <p className="mt-8 text-sm">
        {/*
          A plain anchor with target="_top", not next/link, and deliberately so:
          this page is rendered inside an iframe on the municipality's site, and
          a client-side navigation would load the full archive *within* that
          frame at its fixed height. This has to break out to the top window.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/meetings" target="_top">
          Open the full searchable archive
        </a>
      </p>
    </div>
  )
}
