import Link from 'next/link'

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-prose px-4 py-16">
      <h1 className="text-3xl font-semibold">That page could not be found</h1>
      <p className="mt-3 text-ink-muted">
        The record may have been moved or archived. The full meeting archive is still available.
      </p>
      <p className="mt-6">
        <Link href="/meetings" className="btn-primary">
          Go to the meeting archive
        </Link>
      </p>
    </main>
  )
}
