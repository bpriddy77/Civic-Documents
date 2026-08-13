import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Refreshes the Supabase session cookie and gates /admin.
 *
 * This is a convenience redirect, not the security boundary: every admin
 * page and route handler re-checks the session and the permission, and
 * PostgreSQL re-checks it again through RLS.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (path.startsWith('/admin') && !user) {
    const signIn = request.nextUrl.clone()
    signIn.pathname = '/sign-in'
    signIn.searchParams.set('next', path)
    return NextResponse.redirect(signIn)
  }

  if (path === '/sign-in' && user) {
    const admin = request.nextUrl.clone()
    admin.pathname = '/admin'
    admin.search = ''
    return NextResponse.redirect(admin)
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/sign-in', '/api/admin/:path*'],
}
