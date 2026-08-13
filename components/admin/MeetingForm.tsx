'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FieldError } from '@/components/accessibility/FieldError'
import { StatusMessage } from '@/components/accessibility/StatusMessage'
import { fieldErrors, meetingInputSchema } from '@/lib/validation/schemas'
import type { Meeting, MeetingCategory } from '@/lib/supabase/database.types'

interface Props {
  categories: Pick<MeetingCategory, 'id' | 'name'>[]
  meeting?: Meeting
  canPublish: boolean
  canArchive: boolean
  showTime: boolean
  showLocation: boolean
}

/**
 * The meeting form.
 *
 * Validation runs here for a fast, quiet correction, and again on the server
 * and in the database, which is what actually enforces it. Errors are tied to
 * their field with aria-describedby and summarised at the top, so a screen
 * reader user hears what failed without hunting for it.
 */
export function MeetingForm({ categories, meeting, canPublish, canArchive, showTime, showLocation }: Props) {
  const router = useRouter()
  const editing = Boolean(meeting)

  const [values, setValues] = useState({
    title: meeting?.title ?? '',
    category_id: meeting?.category_id ?? '',
    meeting_date: meeting?.meeting_date ?? '',
    meeting_time: meeting?.meeting_time?.slice(0, 5) ?? '',
    location: meeting?.location ?? '',
    description: meeting?.description ?? '',
    status: meeting?.status ?? 'draft',
    minutes_status: meeting?.minutes_status ?? 'not_available',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  function update(field: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    setSaved(false)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setSaved(false)

    const payload = {
      ...values,
      meeting_time: values.meeting_time || null,
      location: values.location || null,
      description: values.description || null,
    }

    const parsed = meetingInputSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      setFormError('Some details still need attention. Check the highlighted fields below.')
      return
    }
    setErrors({})
    setBusy(true)

    const response = await fetch(
      editing ? `/api/admin/meetings/${meeting!.id}` : '/api/admin/meetings',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      },
    )
    const body = await response.json().catch(() => null)
    setBusy(false)

    if (!response.ok) {
      setErrors(body?.error?.fields ?? {})
      setFormError(body?.error?.message ?? 'The meeting could not be saved.')
      return
    }

    if (editing) {
      setSaved(true)
      router.refresh()
    } else {
      router.push(`/admin/meetings/${body.data.meeting.id}`)
    }
  }

  return (
    <form onSubmit={save} noValidate className="mt-6 space-y-8">
      {formError && (
        <StatusMessage tone="error" urgency="assertive">
          {formError}
        </StatusMessage>
      )}
      {saved && <StatusMessage tone="success">Meeting saved.</StatusMessage>}

      <fieldset className="rounded border border-rule bg-paper p-4">
        <legend className="px-2 font-display text-lg font-semibold">Meeting information</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="field-label">
              Meeting title <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="title"
              className="field"
              value={values.title}
              onChange={(e) => update('title', e.target.value)}
              required
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'title-error' : undefined}
            />
            <FieldError id="title-error" message={errors.title} />
          </div>

          <div>
            <label htmlFor="category_id" className="field-label">
              Category <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <select
              id="category_id"
              className="field"
              value={values.category_id}
              onChange={(e) => update('category_id', e.target.value)}
              required
              aria-invalid={Boolean(errors.category_id)}
              aria-describedby={errors.category_id ? 'category-error' : undefined}
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <FieldError id="category-error" message={errors.category_id} />
          </div>

          <div>
            <label htmlFor="meeting_date" className="field-label">
              Meeting date <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="meeting_date"
              type="date"
              className="field"
              value={values.meeting_date}
              onChange={(e) => update('meeting_date', e.target.value)}
              required
              aria-invalid={Boolean(errors.meeting_date)}
              aria-describedby={errors.meeting_date ? 'date-error' : undefined}
            />
            <FieldError id="date-error" message={errors.meeting_date} />
          </div>

          {showTime && (
            <div>
              <label htmlFor="meeting_time" className="field-label">Meeting time</label>
              <input
                id="meeting_time"
                type="time"
                className="field"
                value={values.meeting_time}
                onChange={(e) => update('meeting_time', e.target.value)}
                aria-describedby="time-help"
              />
              <p id="time-help" className="mt-1 text-sm text-ink-muted">
                Optional. Leave blank if the time has not been set yet.
              </p>
            </div>
          )}

          {showLocation && (
            <div>
              <label htmlFor="location" className="field-label">Meeting location</label>
              <input
                id="location"
                className="field"
                value={values.location}
                onChange={(e) => update('location', e.target.value)}
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label htmlFor="description" className="field-label">Description</label>
            <textarea
              id="description"
              rows={4}
              className="field"
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="status" className="field-label">
              Meeting status <span aria-hidden="true">*</span>
            </label>
            <select
              id="status"
              className="field"
              value={values.status}
              onChange={(e) => update('status', e.target.value)}
              aria-describedby="status-help"
            >
              <option value="draft">Draft — staff only</option>
              {canPublish && <option value="published">Published — visible to the public</option>}
              {canArchive && <option value="archived">Archived — retained, still searchable</option>}
            </select>
            <p id="status-help" className="mt-1 text-sm text-ink-muted">
              Draft meetings never appear on the public site.
            </p>
          </div>

          <div>
            <label htmlFor="minutes_status" className="field-label">Minutes status</label>
            <select
              id="minutes_status"
              className="field"
              value={values.minutes_status}
              onChange={(e) => update('minutes_status', e.target.value)}
              aria-describedby="minutes-help"
            >
              <option value="not_available">Not available</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending approval</option>
              <option value="approved">Approved</option>
            </select>
            <p id="minutes-help" className="mt-1 text-sm text-ink-muted">
              Draft minutes stay out of public view until you move them past Draft.
            </p>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create meeting'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.push('/admin/meetings')}>
          Cancel
        </button>
      </div>

      {!editing && (
        <p className="text-sm text-ink-muted">
          Save the meeting first, then upload its agenda. Minutes can be added any time after the
          meeting takes place.
        </p>
      )}
    </form>
  )
}
