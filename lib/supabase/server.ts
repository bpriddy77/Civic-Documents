import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Server client bound to the request's auth cookies. Use this for every
 * read and write performed on behalf of a signed-in user: RLS applies.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, httpOnly: true, sameSite: 'lax', secure: true }),
            )
          } catch {
            // Called from a Server Component: middleware refreshes the session.
          }
        },
      },
    },
  )
}

/**
 * Anonymous server client. Used by public pages and the public API so the
 * exact same RLS policies that protect a citizen's browser also protect
 * server-rendered output.
 */
export function createAnonSupabase() {
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}
