import type { MinutesStatus } from '@/lib/supabase/database.types'

/**
 * Minutes status, always carried by words as well as colour, because colour
 * alone cannot convey meaning (WCAG 1.4.1).
 */
const PRESENTATION: Record<MinutesStatus, { label: string; className: string }> = {
  not_available:    { label: 'Not yet available', className: 'border-rule-strong text-status-none' },
  draft:            { label: 'In preparation',    className: 'border-rule-strong text-status-none' },
  pending_approval: { label: 'Pending approval',  className: 'border-status-pending text-status-pending' },
  approved:         { label: 'Approved',          className: 'border-status-approved text-status-approved' },
}

export function MinutesStatusBadge({ status }: { status: MinutesStatus }) {
  const { label, className } = PRESENTATION[status]
  return (
    <span className={`badge ${className}`}>
      <span className="sr-only">Minutes status: </span>
      {label}
    </span>
  )
}

export function minutesStatusText(status: MinutesStatus): string {
  return PRESENTATION[status].label
}
