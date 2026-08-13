'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StatusMessage } from '@/components/accessibility/StatusMessage'

export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(errorMessage(initialError))
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Deliberately identical for a wrong password and an unknown address:
      // the form should not confirm which municipal staff accounts exist.
      setMessage('That email address and password do not match an active account.')
      setBusy(false)
      return
    }

    router.push(next.startsWith('/') ? next : '/admin')
    router.refresh()
  }

  async function signInWithGoogle() {
    setBusy(true)
    setMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setMessage('Google sign-in is unavailable right now. Use your email address and password.')
      setBusy(false)
    }
  }

  async function resetPassword() {
    if (!email) {
      setMessage('Enter your email address first, then choose Send a reset link.')
      return
    }
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/admin`,
    })
    setNotice('If that address has an active account, a reset link is on its way.')
  }

  return (
    <form onSubmit={signIn} className="mt-8 space-y-4" noValidate>
      {message && (
        <StatusMessage tone="error" urgency="assertive">
          {message}
        </StatusMessage>
      )}
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}

      <div>
        <label htmlFor="email" className="field-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </div>

      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <button type="button" onClick={resetPassword} className="btn-secondary w-full">
        Send a reset link
      </button>

      <div className="flex items-center gap-3 pt-2" aria-hidden="true">
        <span className="h-px flex-1 bg-rule" />
        <span className="text-sm text-ink-muted">or</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="btn-secondary flex w-full items-center justify-center gap-2"
      >
        <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true" focusable="false">
          <path fill="#4285F4" d="M17.6 9.2c0-.6-.05-1.2-.16-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
          <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
          <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
        </svg>
        Continue with Google
      </button>

      <p className="pt-1 text-sm text-ink-muted">
        Use Google only if your city administrator has already created an account for that
        address. Signing in with Google does not create one.
      </p>
    </form>
  )
}

function errorMessage(code?: string): string | null {
  switch (code) {
    case 'no_access':
      return 'That account is not set up for records administration. Ask your city administrator to add it, then sign in again.'
    case 'link':
      return 'That sign-in link has expired or was already used. Request a new one.'
    default:
      return null
  }
}
