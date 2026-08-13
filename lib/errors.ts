/**
 * Application errors. Every message here is written to be shown to a city
 * clerk. Nothing that reaches a user ever contains SQL, stack traces, storage
 * paths, or key material.
 */
export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly fields?: Record<string, string>

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS[code]
    this.fields = fields
  }
}

export const unauthenticated = (m = 'Sign in to continue.') => new AppError('unauthenticated', m)
export const forbidden = (m = 'You do not have permission to do that.') => new AppError('forbidden', m)
export const notFound = (m = 'That record could not be found.') => new AppError('not_found', m)
export const invalid = (m: string, fields?: Record<string, string>) => new AppError('validation', m, fields)
export const conflict = (m: string) => new AppError('conflict', m)

/**
 * Turns anything thrown into something safe to display. Unexpected errors are
 * logged server side with their detail and reduced to a generic message.
 */
export function toSafeError(error: unknown): AppError {
  if (error instanceof AppError) return error

  const pg = error as { code?: string; message?: string }
  if (pg?.code === '23505') return conflict('A record with these details already exists.')
  if (pg?.code === '23503') return invalid('That reference points at a record that no longer exists.')
  if (pg?.code === '42501') return forbidden()

  console.error('[unhandled]', error)
  return new AppError('unavailable', 'Something went wrong on our side. Try again in a moment.')
}
