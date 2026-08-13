'use client'

import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Browser client. Carries the signed-in user's JWT, so every query it makes
 * is still filtered by Row-Level Security. Only the publishable anon key is
 * ever reachable from here.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
