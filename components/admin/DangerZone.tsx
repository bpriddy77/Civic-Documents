'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StatusMessage } from '@/components/accessibility/StatusMessage'

/**
 * Permanent deletion.
 *
 * Archiving is the normal way to retire a record, so this is deliberately
 * slower than the action next to it: it names exactly what disappears, warns
 * when the record is already public, and requires the word DELETE to be typed.
 * The deletion itself is still recorded in the audit log.
 */
export function DangerZone({
  meetingId,
  meetingTitle,
  isPublic,
}: {
  meetingId: string
  meetingTitle: string
  isPublic: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function remove(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const response = await fetch(`/api/admin/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    })
    setBusy(false)

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error?.message ?? 'The meeting could not be deleted.')
      return
    }
    router.push('/admin/meetings')
  }

  return (
    <section aria-labelledby="danger-heading" className="mt-12 rounded border border-red-800 bg-red-50 p-4">
      <h2 id="danger-heading" className="font-display text-lg font-semibold text-red-900">
        Permanent deletion
      </h2>
      <p className="mt-2 max-w-prose text-sm text-red-900">
        Archiving keeps the record and its documents available to the public while removing it from
        the active list. Use that unless a record must be destroyed.
      </p>

      {!open ? (
        <button type="button" className="btn-secondary mt-3" onClick={() => setOpen(true)}>
          Show permanent deletion options
        </button>
      ) : (
        <form onSubmit={remove} className="mt-4 space-y-3">
          {error && (
            <StatusMessage tone="error" urgency="assertive">
              {error}
            </StatusMessage>
          )}

          <p className="text-sm font-semibold text-red-900">
            This will permanently delete the meeting &ldquo;{meetingTitle}&rdquo;, its agenda, its
            minutes, and every stored version of both.
            {isPublic && ' This meeting is currently public, so citizens will lose access to links they already have.'}
            {' '}Permanently deleting this record may remove a public government record and cannot be
            undone.
          </p>

          <div>
            <label htmlFor="confirm-delete" className="field-label text-red-900">
              Type DELETE to continue
            </label>
            <input
              id="confirm-delete"
              className="field sm:max-w-xs"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-danger" disabled={busy || confirmation !== 'DELETE'}>
              {busy ? 'Deleting…' : 'Permanently delete this meeting'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
