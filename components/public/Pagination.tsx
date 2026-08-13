import Link from 'next/link'

/** Page links with a live description, so the current page is announced. */
export function Pagination({
  page,
  pageCount,
  buildHref,
  label = 'Meeting archive pages',
}: {
  page: number
  pageCount: number
  buildHref: (page: number) => string
  label?: string
}) {
  if (pageCount <= 1) return null

  const windowStart = Math.max(1, Math.min(page - 2, pageCount - 4))
  const windowEnd = Math.min(pageCount, windowStart + 4)
  const pages = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i)

  return (
    <nav aria-label={label} className="mt-8 border-t border-rule pt-5">
      <p className="sr-only" aria-live="polite">
        Page {page} of {pageCount}
      </p>
      <ul className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <li>
          {page > 1 ? (
            <Link href={buildHref(page - 1)} rel="prev" className="btn-secondary">
              Previous page
            </Link>
          ) : (
            <span className="btn-secondary opacity-50" aria-disabled="true">
              Previous page
            </span>
          )}
        </li>

        {pages.map((p) => (
          <li key={p}>
            <Link
              href={buildHref(p)}
              aria-current={p === page ? 'page' : undefined}
              aria-label={`Page ${p}${p === page ? ', current page' : ''}`}
              className={p === page ? 'btn-primary' : 'btn-secondary'}
            >
              {p}
            </Link>
          </li>
        ))}

        <li>
          {page < pageCount ? (
            <Link href={buildHref(page + 1)} rel="next" className="btn-secondary">
              Next page
            </Link>
          ) : (
            <span className="btn-secondary opacity-50" aria-disabled="true">
              Next page
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
