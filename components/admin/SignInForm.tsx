'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StatusMessage } from '@/components/accessibility/StatusMessage'

export function SignInForm({ next }: { next: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
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
    </form>
  )
}
