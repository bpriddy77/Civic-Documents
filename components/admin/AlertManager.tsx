'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StatusMessage } from '@/components/accessibility/StatusMessage'
import type { Alert, AlertSeverity } from '@/lib/supabase/database.types'

const SEVERITIES: { value: AlertSeverity; label: string; help: string }[] = [
  {
    value: 'emergency',
    label: 'Emergency',
    help: 'Immediate danger or action required — severe weather, evacuation, unsafe water.',
  },
  {
    value: 'advisory',
    label: 'Advisory',
    help: 'Important but not dangerous — road closure, office closed, service interruption.',
  },
  {
    value: 'information',
    label: 'Information',
    help: 'Worth knowing — a deadline, a scheduled outage, a public meeting change.',
  },
]

const DURATIONS = [
  { hours: 6, label: '6 hours' },
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
]

const TONE: Record<AlertSeverity, { bg: string; text: string }> = {
  emergency: { bg: '#B91C1C', text: '#FFFFFF' },
  advisory: { bg: '#B45309', text: '#FFFFFF' },
  information: { bg: '#1B3A5C', text: '#FFFFFF' },
}

function whenExpires(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const hours = Math.round(ms / 3_600_000)
  if (hours < 1) return `in ${Math.max(1, Math.round(ms / 60_000))} minutes`
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  return `in ${Math.round(hours / 24)} days`
}

export function AlertManager({ live, history }: { live: Alert | null; history: Alert[] }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState<AlertSeverity>('emergency')
  const [hours, setHours] = useState(24)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function publish(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setDone(null)

    const expires = new Date(Date.now() + hours * 3_600_000).toISOString()
    const response = await fetch('/api/admin/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, severity, expires_at: expires }),
    })
    setBusy(false)

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error?.message ?? 'The alert could not be published.')
      return
    }
    setMessage('')
    setDone('Alert published. It is showing on the website now.')
    router.refresh()
  }

  async function clear() {
    if (!confirm('Remove this alert from the website now?')) return
    setBusy(true)
    setError(null)

    const response = await fetch('/api/admin/alerts', { method: 'DELETE' })
    setBusy(false)

    if (!response.ok) {
      setError('The alert could not be cleared.')
      return
    }
    setDone('Alert cleared. Nothing is showing on the website.')
    router.refresh()
  }

  const tone = TONE[severity]

  return (
    <div className="mt-6 space-y-8">
      {error && <StatusMessage tone="error" urgency="assertive">{error}</StatusMessage>}
      {done && <StatusMessage tone="success">{done}</StatusMessage>}

      {live ? (
        <section aria-labelledby="live-heading" className="rounded border border-rule bg-paper p-4">
          <h2 id="live-heading" className="font-display text-lg font-semibold">
            Showing on the website now
          </h2>

          <div
            className="mt-3 rounded px-4 py-3 font-semibold"
            style={{ background: TONE[live.severity].bg, color: TONE[live.severity].text }}
          >
            {live.message}
          </div>

          <p className="mt-3 text-sm text-ink-muted">
            Posted {new Date(live.published_at).toLocaleString()} · removes itself{' '}
            {whenExpires(live.expires_at)}
          </p>

          <button type="button" onClick={clear} disabled={busy} className="btn-danger mt-4">
            {busy ? 'Clearing…' : 'Clear alert now'}
          </button>
        </section>
      ) : (
        <section className="rounded border border-rule bg-paper px-4 py-6">
          <p className="font-semibold">No alert is showing.</p>
          <p className="mt-1 text-sm text-ink-muted">
            The website looks completely normal to residents right now.
          </p>
        </section>
      )}

      {!live && (
        <form onSubmit={publish} className="rounded border border-rule bg-paper p-4">
          <h2 className="font-display text-lg font-semibold">Post an alert</h2>

          <div className="mt-4">
            <label htmlFor="message" className="field-label">
              Message <span className="font-normal text-ink-muted">(required)</span>
            </label>
            <textarea
              id="message"
              rows={3}
              maxLength={500}
              className="field"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Boil water notice in effect for all residents until further notice."
              aria-describedby="message-help"
              required
            />
            <p id="message-help" className="mt-1 text-sm text-ink-muted">
              One or two sentences. Say what is happening and what residents should do.
              {' '}{500 - message.length} characters left.
            </p>
          </div>

          <fieldset className="mt-5">
            <legend className="field-label">How serious is it?</legend>
            <div className="space-y-2">
              {SEVERITIES.map((s) => (
                <label key={s.value} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="severity"
                    className="mt-1"
                    checked={severity === s.value}
                    onChange={() => setSeverity(s.value)}
                  />
                  <span>
                    <span className="font-semibold">{s.label}</span>
                    <span className="block text-sm text-ink-muted">{s.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="hours" className="field-label">
              Remove it automatically after
            </label>
            <select
              id="hours"
              className="field sm:max-w-xs"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              aria-describedby="hours-help"
            >
              {DURATIONS.map((d) => (
                <option key={d.hours} value={d.hours}>{d.label}</option>
              ))}
            </select>
            <p id="hours-help" className="mt-1 text-sm text-ink-muted">
              You can clear it sooner at any time. An alert that stays up after the problem has
              passed teaches people to ignore the next one, so this is required.
            </p>
          </div>

          <div className="mt-6">
            <p className="field-label">What residents will see</p>
            <div
              className="rounded px-4 py-3 font-semibold"
              style={{ background: tone.bg, color: tone.text }}
            >
              {message.trim() || 'Your message will appear here.'}
            </div>
          </div>

          <button type="submit" className="btn-primary mt-6" disabled={busy || !message.trim()}>
            {busy ? 'Publishing…' : 'Publish alert'}
          </button>
        </form>
      )}

      {history.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="font-display text-lg font-semibold">
            Past alerts
          </h2>
          <div className="mt-3 overflow-x-auto rounded border border-rule bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-paper-sunk text-left">
                <tr>
                  <th className="px-3 py-2">Posted</th>
                  <th className="px-3 py-2">Message</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Ended</th>
                </tr>
              </thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id} className="border-t border-rule align-top">
                    <td className="whitespace-nowrap px-3 py-2">
                      {new Date(a.published_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">{a.message}</td>
                    <td className="px-3 py-2 capitalize">{a.severity}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                      {a.cleared_at
                        ? `Cleared ${new Date(a.cleared_at).toLocaleDateString()}`
                        : `Expired ${new Date(a.expires_at).toLocaleDateString()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
