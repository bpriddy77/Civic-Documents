'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { MeetingStatus } from '@/lib/supabase/database.types'

/**
 * Per-row actions.
 *
 * Hiding a control the user cannot use is a courtesy, not a control: the
 * route handler re-checks the permission and Row-Level Security checks it
 * again, so a crafted request from a read-only account still fails.
 */
export function MeetingRowActions({
  meetingId,
  status,
  canEdit,
  canPublish,
  canArchive,
  canDuplicate,
}: {
  meetingId: string
  status: MeetingStatus
  canEdit: boolean
  canPublish: boolean
  canArchive: boolean
  canDuplicate: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(next: MeetingStatus, label: string) {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/admin/meetings/${meetingId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setBusy(false)

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? `The meeting could not be ${label}.`)
      return
    }
    router.refresh()
  }

  async function duplicate() {
    const meetingDate = window.prompt('Date of the new meeting (YYYY-MM-DD)')
    if (!meetingDate) return

    setBusy(true)
    setError(null)
    const response = await fetch(`/api/admin/meetings/${meetingId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_date: meetingDate, copy_description: true }),
    })
    const payload = await response.json().catch(() => null)
    setBusy(false)

    if (!response.ok) {
      setError(payload?.error?.message ?? 'The meeting could not be duplicated.')
      return
    }
    router.push(`/admin/meetings/${payload.data.meeting.id}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/admin/meetings/${meetingId}`} className="text-civic">
        {canEdit ? 'Edit' : 'View'}
      </Link>

      {canPublish && status !== 'published' && (
        <button type="button" onClick={() => setStatus('published', 'published')} disabled={busy} className="text-civic underline">
          Publish
        </button>
      )}
      {canPublish && status === 'published' && (
        <button type="button" onClick={() => setStatus('draft', 'unpublished')} disabled={busy} className="text-civic underline">
          Unpublish
        </button>
      )}
      {canArchive && status !== 'archived' && (
        <button type="button" onClick={() => setStatus('archived', 'archived')} disabled={busy} className="text-civic underline">
          Archive
        </button>
      )}
      {canArchive && status === 'archived' && (
        <button type="button" onClick={() => setStatus('published', 'restored')} disabled={busy} className="text-civic underline">
          Restore
        </button>
      )}
      {canDuplicate && (
        <button type="button" onClick={duplicate} disabled={busy} className="text-civic underline">
          Duplicate
        </button>
      )}

      {error && (
        <p role="alert" className="w-full text-xs font-medium text-red-800">
          {error}
        </p>
      )}
    </div>
  )
}
