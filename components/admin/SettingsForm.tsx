'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StatusMessage } from '@/components/accessibility/StatusMessage'
import { COMMON_TIME_ZONES } from '@/lib/time/tenant-time'
import type { Municipality, MunicipalityConfiguration } from '@/lib/supabase/database.types'

export function SettingsForm({
  municipality,
  config,
}: {
  municipality: Municipality
  config: Required<MunicipalityConfiguration>
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: municipality.name,
    timezone: municipality.timezone,
    website_url: municipality.website_url ?? '',
    logo_url: municipality.logo_url ?? '',
    contact_email: municipality.contact_email ?? '',
    contact_phone: municipality.contact_phone ?? '',
    default_meeting_location: config.default_meeting_location,
    archive_heading: config.archive_heading,
    archive_about: config.archive_about,
    privacy_policy_url: config.privacy_policy_url,
    terms_url: config.terms_url,
    meetings_per_page: String(config.meetings_per_page),
    default_sort: config.default_sort,
    time_format: config.time_format,
    show_meeting_time: config.show_meeting_time,
    show_location: config.show_location,
    publish_pending_minutes: config.publish_pending_minutes,
    max_upload_mb: String(config.max_upload_mb),
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const response = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        timezone: form.timezone,
        website_url: form.website_url,
        logo_url: form.logo_url,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        configuration: {
          default_meeting_location: form.default_meeting_location,
          archive_heading: form.archive_heading,
          archive_about: form.archive_about,
          privacy_policy_url: form.privacy_policy_url,
          terms_url: form.terms_url,
          meetings_per_page: Number(form.meetings_per_page),
          default_sort: form.default_sort,
          time_format: form.time_format,
          show_meeting_time: form.show_meeting_time,
          show_location: form.show_location,
          publish_pending_minutes: form.publish_pending_minutes,
          max_upload_mb: Number(form.max_upload_mb),
        },
      }),
    })
    setBusy(false)

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error?.message ?? 'Settings could not be saved.')
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={save} className="mt-6 space-y-8">
      {error && <StatusMessage tone="error" urgency="assertive">{error}</StatusMessage>}
      {saved && <StatusMessage tone="success">Settings saved.</StatusMessage>}

      <fieldset className="rounded border border-rule bg-paper p-4">
        <legend className="px-2 font-display text-lg font-semibold">Municipality</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="field-label">Municipality name</label>
            <input id="name" className="field" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label htmlFor="slug" className="field-label">URL name</label>
            <input id="slug" className="field" value={municipality.slug} readOnly aria-describedby="slug-help" />
            <p id="slug-help" className="mt-1 text-sm text-ink-muted">
              Fixed after setup, because published document links contain it.
            </p>
          </div>
          <div>
            <label htmlFor="timezone" className="field-label">Time zone</label>
            <select id="timezone" className="field" value={form.timezone}
                    onChange={(e) => set('timezone', e.target.value)} aria-describedby="tz-help">
              {[...new Set([municipality.timezone, ...COMMON_TIME_ZONES])].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p id="tz-help" className="mt-1 text-sm text-ink-muted">
              Decides when a meeting moves from Upcoming to Past, regardless of where a visitor is.
            </p>
          </div>
          <div>
            <label htmlFor="website_url" className="field-label">Website</label>
            <input id="website_url" type="url" className="field" value={form.website_url}
                   onChange={(e) => set('website_url', e.target.value)} />
          </div>
          <div>
            <label htmlFor="logo_url" className="field-label">Logo URL</label>
            <input id="logo_url" type="url" className="field" value={form.logo_url}
                   onChange={(e) => set('logo_url', e.target.value)} />
          </div>
          <div>
            <label htmlFor="contact_email" className="field-label">Contact email</label>
            <input id="contact_email" type="email" className="field" value={form.contact_email}
                   onChange={(e) => set('contact_email', e.target.value)} />
          </div>
          <div>
            <label htmlFor="contact_phone" className="field-label">Contact phone</label>
            <input id="contact_phone" className="field" value={form.contact_phone}
                   onChange={(e) => set('contact_phone', e.target.value)} />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="default_meeting_location" className="field-label">
              Default meeting location
            </label>
            <input
              id="default_meeting_location"
              className="field"
              value={form.default_meeting_location}
              onChange={(e) => set('default_meeting_location', e.target.value)}
              aria-describedby="default-location-help"
              placeholder="Forsan City Hall, 409 Ave D"
            />
            <p id="default-location-help" className="mt-1 text-sm text-ink-muted">
              Fills in the location when a new meeting is created. It can be changed on any
              meeting, so a special meeting held elsewhere is still easy to enter. Leave blank
              if meetings do not have a usual place.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded border border-rule bg-paper p-4">
        <legend className="px-2 font-display text-lg font-semibold">Public archive</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="archive_heading" className="field-label">Archive heading</label>
            <input id="archive_heading" className="field" value={form.archive_heading}
                   onChange={(e) => set('archive_heading', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="archive_about" className="field-label">
              About this archive
            </label>
            <textarea
              id="archive_about"
              rows={4}
              className="field"
              value={form.archive_about}
              onChange={(e) => set('archive_about', e.target.value)}
              aria-describedby="archive-about-help"
            />
            <p id="archive-about-help" className="mt-1 text-sm text-ink-muted">
              Shown under the heading on the public archive. Explain what this site is, so a
              first-time visitor understands it is the city&rsquo;s official record.
            </p>
          </div>

          <div>
            <label htmlFor="privacy_policy_url" className="field-label">Privacy policy URL</label>
            <input id="privacy_policy_url" type="url" className="field"
                   value={form.privacy_policy_url}
                   onChange={(e) => set('privacy_policy_url', e.target.value)}
                   aria-describedby="privacy-help" />
            <p id="privacy-help" className="mt-1 text-sm text-ink-muted">
              The city&rsquo;s own website privacy policy, linked in the footer alongside this
              system&rsquo;s policy at /privacy. Optional.
            </p>
          </div>

          <div>
            <label htmlFor="terms_url" className="field-label">Terms of use URL</label>
            <input id="terms_url" type="url" className="field" value={form.terms_url}
                   onChange={(e) => set('terms_url', e.target.value)} />
          </div>

          <div>
            <label htmlFor="meetings_per_page" className="field-label">Meetings per page</label>
            <input id="meetings_per_page" type="number" min={5} max={100} className="field"
                   value={form.meetings_per_page} onChange={(e) => set('meetings_per_page', e.target.value)} />
          </div>
          <div>
            <label htmlFor="default_sort" className="field-label">Default sort for past meetings</label>
            <select id="default_sort" className="field" value={form.default_sort}
                    onChange={(e) => set('default_sort', e.target.value as 'newest' | 'oldest')}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          <div>
            <label htmlFor="time_format" className="field-label">Time format</label>
            <select id="time_format" className="field" value={form.time_format}
                    onChange={(e) => set('time_format', e.target.value as 'h:mm a' | 'HH:mm')}>
              <option value="h:mm a">6:00 PM</option>
              <option value="HH:mm">18:00</option>
            </select>
          </div>
          <div>
            <label htmlFor="max_upload_mb" className="field-label">Maximum upload size (MB)</label>
            <input id="max_upload_mb" type="number" min={1} max={50} className="field"
                   value={form.max_upload_mb} onChange={(e) => set('max_upload_mb', e.target.value)} />
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="field-label">Display options</legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={form.show_meeting_time} className="mt-1"
                       onChange={(e) => set('show_meeting_time', e.target.checked)} />
                <span>Show meeting times on the public site</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={form.show_location} className="mt-1"
                       onChange={(e) => set('show_location', e.target.checked)} />
                <span>Show meeting locations on the public site</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={form.publish_pending_minutes} className="mt-1"
                       onChange={(e) => set('publish_pending_minutes', e.target.checked)} />
                <span>
                  Publish minutes that are still pending approval, labelled as such
                  <span className="block text-sm text-ink-muted">
                    Some municipalities post unapproved minutes; most wait for approval. Draft
                    minutes are never published either way.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        </div>
      </fieldset>

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
