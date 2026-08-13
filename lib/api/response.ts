import { NextResponse } from 'next/server'
import { toSafeError } from '@/lib/errors'

/** Uniform JSON envelope for every route handler. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, { status: 200, ...init })
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 })
}

export function fail(error: unknown) {
  const safe = toSafeError(error)
  return NextResponse.json(
    { error: { code: safe.code, message: safe.message, fields: safe.fields ?? undefined } },
    { status: safe.status },
  )
}

/** Wraps a handler so no unexpected exception ever leaks internals. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args)
    } catch (error) {
      return fail(error)
    }
  }
}
