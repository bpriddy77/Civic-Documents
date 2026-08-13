'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StatusMessage } from '@/components/accessibility/StatusMessage'
import type { MeetingCategory } from '@/lib/supabase/database.types'

export function CategoryManager({
  categories,
  canManage,
  canDelete,
}: {
  categories: MeetingCategory[]
  canManage: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [displayOrder, setDisplayOrder] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true)
    setError(null)
    setNotice(null)
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const payload = await response.json().catch(() => null)
    setBusy(false)

    if (!response.ok) {
      setError(payload?.error?.message ?? 'That change could not be saved.')
      return false
    }
    router.refresh()
    return true
  }

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Category name is required.')
      return
    }
    const done = await send('/api/admin/categories', 'POST', {
      name: name.trim(),
      display_order: Number(displayOrder) || 0,
      active: true,
    })
    if (done) {
      setName('')
      setNotice('Category added.')
    }
  }

  return (
    <>
      {error && (
        <div className="mt-4">
          <StatusMessage tone="error" urgency="assertive">{error}</StatusMessage>
        </div>
      )}
      {notice && (
        <div className="mt-4">
          <StatusMessage tone="success">{notice}</StatusMessage>
        </div>
      )}

      {canManage && (
        <form onSubmit={add} className="mt-6 rounded border border-rule bg-paper p-4">
          <h2 className="font-display text-lg font-semibold">Add a category</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div>
              <label htmlFor="category-name" className="field-label">Category name</label>
              <input
                id="category-name"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="category-order" className="field-label">Display order</label>
              <input
                id="category-order"
                type="number"
                min={0}
                className="field"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>Add category</button>
          </div>
        </form>
      )}

      <div className="table-wrap mt-6">
        <table className="w-full min-w-[40rem] border-collapse bg-paper text-sm">
          <caption className="sr-only">Meeting categories for this municipality</caption>
          <thead>
            <tr className="border-y border-rule text-left">
              <th scope="col" className="px-3 py-2">Category</th>
              <th scope="col" className="px-3 py-2">URL name</th>
              <th scope="col" className="px-3 py-2">Order</th>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-rule">
                <td className="px-3 py-3 font-semibold">{c.name}</td>
                <td className="px-3 py-3 text-ink-muted">{c.slug}</td>
                <td className="px-3 py-3">{c.display_order}</td>
                <td className="px-3 py-3">{c.active ? 'Active' : 'Inactive'}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-3">
                    {canManage && (
                      <>
                        <button
                          type="button"
                          className="text-civic underline"
                          disabled={busy}
                          onClick={() =>
                            send(`/api/admin/categories/${c.id}`, 'PATCH', { active: !c.active })
                          }
                        >
                          {c.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="text-civic underline"
                          disabled={busy}
                          onClick={() => {
                            const next = window.prompt('New category name', c.name)
                            if (next) send(`/api/admin/categories/${c.id}`, 'PATCH', { name: next })
                          }}
                        >
                          Rename
                        </button>
                      </>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="text-red-800 underline"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Delete ${c.name}? This is only possible if no meeting uses it.`)) {
                            send(`/api/admin/categories/${c.id}`, 'DELETE')
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
