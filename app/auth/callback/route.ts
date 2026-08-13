import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Completes an invite, a password reset, or a Google sign-in.
 *
 * Authenticating is not the same as having access. Google will happily
 * verify any Google account in the world, so this route confirms the person
 * also has an active `profiles` row before letting them through. Without
 * that check, a stranger who signed in with Google would be bounced from
 * /admin with no explanation and would simply try again, forever.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/admin'
  const safeNext = next.startsWith('/') ? next : '/admin'

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=link', url.origin))
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=link', url.origin))
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/sign-in?error=link', url.origin))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, active')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!profile) {
    // End the session rather than leaving a signed-in identity with no
    // access sitting in the browser.
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/sign-in?error=no_access', url.origin))
  }

  return NextResponse.redirect(new URL(safeNext, url.origin))
}
