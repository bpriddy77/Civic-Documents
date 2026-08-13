import { z } from 'zod'

/**
 * Environment access. Server-only values are read through `serverEnv()`,
 * which throws if called from a bundle that reaches the browser.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_DEFAULT_MUNICIPALITY: z.string().min(1),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(50).default(25),
  PUBLIC_API_RATE_LIMIT: z.coerce.number().int().positive().default(120),
})

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_DEFAULT_MUNICIPALITY: process.env.NEXT_PUBLIC_DEFAULT_MUNICIPALITY,
})

let cachedServerEnv: z.infer<typeof serverSchema> | null = null

export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('Server environment variables are not available in the browser.')
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      MAX_UPLOAD_MB: process.env.MAX_UPLOAD_MB,
      PUBLIC_API_RATE_LIMIT: process.env.PUBLIC_API_RATE_LIMIT,
    })
  }
  return cachedServerEnv
}

export const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
