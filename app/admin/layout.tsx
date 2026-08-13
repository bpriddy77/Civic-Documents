import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSession } from '@/lib/auth/session'
import { can } from '@/lib/permissions/permissions'
import { ROLE_LABELS } from '@/lib/permissions/permissions'
import { SkipLink } from '@/components/accessibility/SkipLink'

export const metadata: Metadata = {
  title: { default: 'Administration', template: '%s | Records administration' },
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/sign-in?next=/admin')

  const { profile, municipality } = session
  const links = [
    { href: '/admin', label: 'Dashboard', show: true },
    { href: '/admin/meetings', label: 'Meetings', show: can(profile.role, 'meeting.read') },
    { href: '/admin/categories', label: 'Categories', show: can(profile.role, 'category.read') },
    { href: '/admin/users', label: 'Users', show: can(profile.role, 'user.read') },
    { href: '/admin/audit', label: 'Audit history', show: can(profile.role, 'audit.read') },
    { href: '/admin/settings', label: 'Settings', show: can(profile.role, 'municipality.update') },
  ].filter((link) => link.show)

  return (
    <div className="min-h-screen bg-paper-sunk">
      <SkipLink />

      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="eyebrow">{municipality?.name ?? 'Platform administration'}</p>
            <p className="font-display text-lg font-semibold">Agendas &amp; minutes</p>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-ink-muted sm:inline">
              {profile.display_name} · {ROLE_LABELS[profile.role]}
            </span>
            <Link href="/meetings" className="text-civic">
              View public site
            </Link>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="btn-secondary">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav aria-label="Administration" className="mx-auto max-w-6xl px-4">
          <ul className="flex flex-wrap gap-x-1 gap-y-1 pb-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-block rounded-t border-b-2 border-transparent px-3 py-2 text-sm
                             font-semibold text-ink no-underline hover:border-civic hover:bg-civic-tint"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {profile.role === 'read_only' && (
          <p className="mb-6 rounded border-l-4 border-rule-strong bg-paper px-4 py-3 text-sm">
            Your account has read-only access. You can review meetings, documents, and history, but
            not change them.
          </p>
        )}
        {children}
      </main>
    </div>
  )
}
