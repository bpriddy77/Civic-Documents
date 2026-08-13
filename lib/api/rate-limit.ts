import { AppError } from '@/lib/errors'
import { serverEnv } from '@/lib/env'

/**
 * Fixed-window limiter for the anonymous public API.
 *
 * In-process by design: it protects a single instance from a scraper without
 * adding infrastructure. Put a CDN or WAF rule in front for anything larger,
 * and swap the store for Redis if the deployment scales horizontally
 * (see docs/DEPLOYMENT.md).
 */
const windows = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? ''
  return forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous'
}

export function enforceRateLimit(request: Request, limit = serverEnv().PUBLIC_API_RATE_LIMIT) {
  const key = clientKey(request)
  const now = Date.now()
  const entry = windows.get(key)

  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS })
    if (windows.size > 10_000) sweep(now)
    return
  }

  entry.count += 1
  if (entry.count > limit) {
    throw new AppError('rate_limited', 'Too many requests. Wait a moment and try again.')
  }
}

function sweep(now: number) {
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key)
}
