import type { PublicQuery } from '@/lib/validation/schemas'

interface Category {
  id: string
  name: string
  slug: string
}

/**
 * Search and filtering as a plain GET form.
 *
 * No JavaScript is required to search this archive: the form submits to the
 * same page, filters compose, and every control has a real label. That also
 * makes each filtered view linkable and bookmarkable.
 */
export function ArchiveFilters({
  action,
  query,
  categories,
  years,
  resultCount,
}: {
  action: string
  query: PublicQuery
  categories: Category[]
  years: number[]
  resultCount: number
}) {
  const hasFilters = Boolean(
    query.q || query.category || query.year || query.from || query.to || query.scope !== 'all',
  )

  return (
    <section aria-labelledby="filters-heading" className="border-y border-rule bg-paper-sunk">
      <h2 id="filters-heading" className="sr-only">
        Search and filter meetings
      </h2>

      <form method="get" action={action} className="mx-auto max-w-5xl px-4 py-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="field-label">
              Search meetings
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query.q ?? ''}
              className="field"
              placeholder="Title, description, or location"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="category" className="field-label">
              Category
            </label>
            <select id="category" name="category" defaultValue={query.category ?? ''} className="field">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="scope" className="field-label">
              Show
            </label>
            <select id="scope" name="scope" defaultValue={query.scope} className="field">
              <option value="all">Upcoming and past</option>
              <option value="upcoming">Upcoming only</option>
              <option value="past">Past only</option>
            </select>
          </div>

          <div>
            <label htmlFor="from" className="field-label">
              On or after
            </label>
            <input id="from" name="from" type="date" defaultValue={query.from ?? ''} className="field" />
          </div>

          <div>
            <label htmlFor="to" className="field-label">
              On or before
            </label>
            <input id="to" name="to" type="date" defaultValue={query.to ?? ''} className="field" />
          </div>

          <div>
            <label htmlFor="sort" className="field-label">
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={query.sort ?? ''} className="field">
              <option value="">Default for this view</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          <div className="flex items-end gap-3">
            <button type="submit" className="btn-primary">
              Apply filters
            </button>
            {hasFilters && (
              <a href={action} className="btn-secondary">
                Clear filters
              </a>
            )}
          </div>
        </div>

        {years.length > 0 && (
          <nav aria-label="Jump to year" className="mt-5 border-t border-rule pt-4">
            <ul className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              <li className="eyebrow mr-1">Year</li>
              {years.slice(0, 4).map((year) => {
                const current = query.year === year
                return (
                  <li key={year}>
                    <a
                      href={buildYearHref(action, query, year)}
                      aria-current={current ? 'true' : undefined}
                      className={`inline-block rounded border px-3 py-1.5 no-underline ${
                        current
                          ? 'border-civic bg-civic text-white'
                          : 'border-rule-strong bg-paper text-civic'
                      }`}
                    >
                      {year}
                    </a>
                  </li>
                )
              })}
              {years.length > 4 && (
                <li>
                  <a
                    href={buildYearHref(action, query, undefined, years[4])}
                    className="inline-block rounded border border-rule-strong bg-paper px-3 py-1.5 no-underline"
                  >
                    Older
                  </a>
                </li>
              )}
            </ul>
          </nav>
        )}

        <p aria-live="polite" className="mt-4 text-sm text-ink-muted">
          {resultCount === 0
            ? 'No meetings match these filters.'
            : `${resultCount} ${resultCount === 1 ? 'meeting' : 'meetings'} found.`}
        </p>
      </form>
    </section>
  )
}

function buildYearHref(action: string, query: PublicQuery, year?: number, before?: number) {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.category) params.set('category', query.category)
  if (query.scope !== 'all') params.set('scope', query.scope)
  if (year) params.set('year', String(year))
  if (before) params.set('to', `${before}-12-31`)
  const qs = params.toString()
  return qs ? `${action}?${qs}` : action
}
