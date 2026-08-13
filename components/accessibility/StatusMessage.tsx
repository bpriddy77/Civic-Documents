'use client'

import type { ReactNode } from 'react'

/**
 * Announces results and errors to assistive technology.
 * `polite` for counts and confirmations, `assertive` for errors that block work.
 */
export function StatusMessage({
  children,
  tone = 'info',
  urgency = 'polite',
}: {
  children: ReactNode
  tone?: 'info' | 'error' | 'success'
  urgency?: 'polite' | 'assertive'
}) {
  if (!children) return null

  const styles = {
    info: 'border-rule bg-paper-sunk text-ink',
    error: 'border-red-800 bg-red-50 text-red-900',
    success: 'border-status-approved bg-green-50 text-status-approved',
  }[tone]

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={urgency}
      className={`rounded border-l-4 px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </div>
  )
}
