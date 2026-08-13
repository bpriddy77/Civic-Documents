import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/** Completes an invite or password-reset link and lands the user in the admin. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/admin'

  if (code) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next.startsWith('/') ? next : '/admin', url.origin))
    }
  }

  return NextResponse.redirect(new URL('/sign-in?error=link', url.origin))
}
