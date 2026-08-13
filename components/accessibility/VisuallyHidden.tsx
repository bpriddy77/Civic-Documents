import type { ReactNode } from 'react'

/** Text for screen readers only. Not display:none, which would hide it from them too. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
