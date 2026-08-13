import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Service-role client. Bypasses every RLS policy.
 *
 * Legitimate uses, and nothing else:
 *   1. Streaming a published PDF out of the private storage bucket after the
 *      request has already been authorised in application code.
 *   2. Creating auth users when an administrator invites a colleague.
 *   3. Tenant bootstrap scripts.
 *
 * Never import this module from a Client Component, and never pass its
 * results to the browser without filtering them first.
 */
export function createAdminSupabase() {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv()
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
