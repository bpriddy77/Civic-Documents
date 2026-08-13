import Link from 'next/link'

export function StatCard({
  label,
  value,
  href,
  tone = 'neutral',
}: {
  label: string
  value: number
  href?: string
  tone?: 'neutral' | 'attention'
}) {
  const body = (
    <>
      <span className="eyebrow block">{label}</span>
      <span
        className={`mt-1 block font-display text-3xl font-semibold ${
          tone === 'attention' && value > 0 ? 'text-status-pending' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </>
  )

  const className =
    'block rounded border border-rule bg-paper px-4 py-4 shadow-card no-underline hover:border-civic'

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
