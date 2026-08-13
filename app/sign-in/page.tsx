import type { Metadata } from 'next'
import { SignInForm } from '@/components/admin/SignInForm'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-3xl font-semibold">Records administration</h1>
      <p className="mt-2 text-ink-muted">
        Sign in with the account your city administrator created for you.
      </p>
      <SignInForm next={next ?? '/admin'} initialError={error} />
    </main>
  )
}
