'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StatusMessage } from '@/components/accessibility/StatusMessage'
import { PDF_ACCESSIBILITY_NOTICE } from '@/lib/validation/pdf'
import { documentPath } from '@/lib/documents/urls'
import type { DocumentType, MeetingDocument } from '@/lib/supabase/database.types'

interface Props {
  meetingId: string
  municipalitySlug: string
  documentType: DocumentType
  label: string
  versions: MeetingDocument[]
  canManage: boolean
  maxUploadMb: number
}

/**
 * Upload, replace, retire, and review one document type for a meeting.
 *
 * Replacement keeps the meeting, keeps the permanent public URL, and keeps
 * every earlier version. Nothing here destroys a previous government record.
 */
export function DocumentPanel({
  meetingId,
  municipalitySlug,
  documentType,
  label,
  versions,
  canManage,
  maxUploadMb,
}: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [postedDate, setPostedDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const current = versions.find((v) => v.active_version && !v.removed_at)
  const superseded = versions.filter((v) => v.id !== current?.id)
  const idPrefix = `${documentType}-panel`

  async function upload(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError(`Choose the ${label.toLowerCase()} PDF to upload.`)
      return
    }
    if (!postedDate) {
      setError(`${label} Posted Date is required when a ${label.toLowerCase()} is uploaded.`)
      return
    }

    const form = new FormData()
    form.set('meeting_id', meetingId)
    form.set('document_type', documentType)
    form.set('posted_date', postedDate)
    form.set('file', file)

    setBusy(true)
    const response = await fetch('/api/admin/documents', { method: 'POST', body: form })
    const body = await response.json().catch(() => null)
    setBusy(false)

    if (!response.ok) {
      setError(body?.error?.message ?? `The ${label.toLowerCase()} could not be uploaded.`)
      return
    }

    if (fileRef.current) fileRef.current.value = ''
    setNotice(
      body?.data?.accessibilityWarning ??
        `${label} ${current ? 'replaced' : 'uploaded'}. The public link is unchanged.`,
    )
    router.refresh()
  }

  async function retire() {
    if (!current) return
    const confirmed = window.confirm(
      `Remove the current ${label.toLowerCase()} from public view?\n\n` +
        'The file and its history are kept, and the action is recorded in the audit log.',
    )
    if (!confirmed) return

    setBusy(true)
    const response = await fetch(`/api/admin/documents/${current.id}`, { method: 'DELETE' })
    setBusy(false)

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error?.message ?? 'The document could not be removed.')
      return
    }
    setNotice(`${label} removed from public view.`)
    router.refresh()
  }

  return (
    <section aria-labelledby={`${idPrefix}-heading`} className="rounded border border-rule bg-paper p-4">
      <h3 id={`${idPrefix}-heading`} className="font-display text-lg font-semibold">
        {label}
      </h3>

      {error && (
        <div className="mt-3">
          <StatusMessage tone="error" urgency="assertive">{error}</StatusMessage>
        </div>
      )}
      {notice && (
        <div className="mt-3">
          <StatusMessage tone="success">{notice}</StatusMessage>
        </div>
      )}

      {current ? (
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="font-semibold">Current file:</dt>
            <dd>
              <a href={documentPath(municipalitySlug, current.public_slug)} target="_blank" rel="noreferrer">
                View {label.toLowerCase()} (PDF, version {current.version})
              </a>
            </dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="font-semibold">Posted:</dt>
            <dd>{current.posted_date}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="font-semibold">Permanent link:</dt>
            <dd className="break-all text-ink-muted">
              {documentPath(municipalitySlug, current.public_slug)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">No {label.toLowerCase()} has been posted yet.</p>
      )}

      {canManage && (
        <form onSubmit={upload} className="mt-4 space-y-3 border-t border-rule pt-4">
          <div>
            <label htmlFor={`${idPrefix}-file`} className="field-label">
              {current ? `Replace ${label.toLowerCase()} PDF` : `${label} PDF`}
            </label>
            <input
              id={`${idPrefix}-file`}
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="field"
              aria-describedby={`${idPrefix}-file-help`}
            />
            <p id={`${idPrefix}-file-help`} className="mt-1 text-sm text-ink-muted">
              PDF only, up to {maxUploadMb} MB. {PDF_ACCESSIBILITY_NOTICE}
            </p>
          </div>

          <div>
            <label htmlFor={`${idPrefix}-posted`} className="field-label">
              {label} posted date <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id={`${idPrefix}-posted`}
              type="date"
              className="field sm:max-w-xs"
              value={postedDate}
              onChange={(e) => setPostedDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Uploading…' : current ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
            </button>
            {current && (
              <button type="button" onClick={retire} className="btn-secondary" disabled={busy}>
                Remove from public view
              </button>
            )}
          </div>
        </form>
      )}

      {superseded.length > 0 && (
        <div className="mt-4 border-t border-rule pt-4">
          <button
            type="button"
            className="text-sm font-semibold text-civic underline"
            aria-expanded={showHistory}
            aria-controls={`${idPrefix}-history`}
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? 'Hide' : 'View'} document history ({superseded.length} earlier{' '}
            {superseded.length === 1 ? 'version' : 'versions'})
          </button>

          <ul id={`${idPrefix}-history`} hidden={!showHistory} className="mt-3 space-y-2 text-sm">
            {superseded.map((v) => (
              <li key={v.id} className="border-l-2 border-rule pl-3">
                <span className="font-semibold">
                  {label} version {v.version}
                </span>{' '}
                — uploaded {v.created_at.slice(0, 10)}
                {v.replaced_at && `, replaced ${v.replaced_at.slice(0, 10)}`}
                {v.removed_at && ', removed from public view'}
                <span className="block text-ink-muted">{v.original_filename}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
