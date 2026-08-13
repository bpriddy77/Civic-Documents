'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StatusMessage } from '@/components/accessibility/StatusMessage'
import { ROLE_LABELS } from '@/lib/permissions/permissions'
import type { AppRole } from '@/lib/supabase/database.types'

interface UserRow {
  id: string
  display_name: string
  email: string
  role: AppRole
  active: boolean
}

export function UserManager({
  users,
  canManage,
  isSuperAdmin,
  currentProfileId,
}: {
  users: UserRow[]
  canManage: boolean
  isSuperAdmin: boolean
  currentProfileId: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<AppRole>('editor')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const assignableRoles: AppRole[] = isSuperAdmin
    ? ['super_admin', 'admin', 'editor', 'read_only']
    : ['admin', 'editor', 'read_only']

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, display_name: displayName, role, active: true }),
    })
    const payload = await response.json().catch(() => null)
    setBusy(false)

    if (!response.ok) {
      setError(payload?.error?.message ?? 'The invitation could not be sent.')
      return
    }
    setEmail('')
    setDisplayName('')
    setNotice(`Invitation sent. ${displayName} sets their own password from the emailed link.`)
    router.refresh()
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? 'That change could not be saved.')
      return
    }
    router.refresh()
  }

  return (
    <>
      {error && <div className="mt-4"><StatusMessage tone="error" urgency="assertive">{error}</StatusMessage></div>}
      {notice && <div className="mt-4"><StatusMessage tone="success">{notice}</StatusMessage></div>}

      {canManage && (
        <form onSubmit={invite} className="mt-6 rounded border border-rule bg-paper p-4">
          <h2 className="font-display text-lg font-semibold">Invite a colleague</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div>
              <label htmlFor="invite-name" className="field-label">Name</label>
              <input id="invite-name" className="field" value={displayName}
                     onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="invite-email" className="field-label">Email address</label>
              <input id="invite-email" type="email" className="field" value={email}
                     onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="invite-role" className="field-label">Role</label>
              <select id="invite-role" className="field" value={role}
                      onChange={(e) => setRole(e.target.value as AppRole)}>
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>Send invitation</button>
          </div>
        </form>
      )}

      <div className="table-wrap mt-6">
        <table className="w-full min-w-[40rem] border-collapse bg-paper text-sm">
          <caption className="sr-only">User accounts for this municipality</caption>
          <thead>
            <tr className="border-y border-rule text-left">
              <th scope="col" className="px-3 py-2">Name</th>
              <th scope="col" className="px-3 py-2">Email</th>
              <th scope="col" className="px-3 py-2">Role</th>
              <th scope="col" className="px-3 py-2">Status</th>
              {canManage && <th scope="col" className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-rule">
                <td className="px-3 py-3 font-semibold">{u.display_name}</td>
                <td className="px-3 py-3">{u.email}</td>
                <td className="px-3 py-3">
                  {canManage && (u.role !== 'super_admin' || isSuperAdmin) ? (
                    <>
                      <label htmlFor={`role-${u.id}`} className="sr-only">
                        Role for {u.display_name}
                      </label>
                      <select
                        id={`role-${u.id}`}
                        className="field py-1"
                        value={u.role}
                        disabled={busy}
                        onChange={(e) => patch(u.id, { role: e.target.value })}
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </>
                  ) : (
                    ROLE_LABELS[u.role]
                  )}
                </td>
                <td className="px-3 py-3">{u.active ? 'Active' : 'Disabled'}</td>
                {canManage && (
                  <td className="px-3 py-3">
                    {u.id === currentProfileId ? (
                      <span className="text-ink-muted">This is you</span>
                    ) : (
                      <button
                        type="button"
                        className="text-civic underline"
                        disabled={busy}
                        onClick={() => patch(u.id, { active: !u.active })}
                      >
                        {u.active ? 'Disable account' : 'Re-enable account'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-prose text-sm text-ink-muted">
        Disabling an account takes effect on the next request and ends any session already open.
        Accounts are disabled rather than deleted so past records keep the name of the person who
        made each change.
      </p>
    </>
  )
}
