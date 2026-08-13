'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-prose px-4 py-16">
      <h1 className="text-3xl font-semibold">This page could not be loaded</h1>
      <p className="mt-3 text-ink-muted">
        The records system had a problem responding. Nothing was changed. Try again, and if it keeps
        happening, contact the city clerk&rsquo;s office.
      </p>
      <p className="mt-6">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
      </p>
    </main>
  )
}
