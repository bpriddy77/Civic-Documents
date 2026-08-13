import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/permissions/permissions'
import type { AppRole } from '@/lib/supabase/database.types'

/**
 * The database is the authority on what a role may do; the TypeScript matrix
 * only decides which buttons to draw. If the two ever disagree, the interface
 * starts lying to people - offering an action that will fail, or hiding one
 * that would have worked. This test reads the migration and compares.
 */
const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260101000600_reference_data.sql'),
  'utf8',
)

function permissionsFromMigration(): Record<string, Set<string>> {
  const matrix: Record<string, Set<string>> = {}
  const pattern = /\('(admin|editor|read_only)',\s*'([a-z_]+\.[a-z_]+)'\)/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(MIGRATION)) !== null) {
    const [, role, permission] = match
    matrix[role!] ??= new Set()
    matrix[role!]!.add(permission!)
  }
  return matrix
}

describe('permission matrix parity', () => {
  const fromSql = permissionsFromMigration()

  it.each(['admin', 'editor', 'read_only'] as AppRole[])(
    'the %s role grants the same permissions in SQL and TypeScript',
    (role) => {
      const sql = [...(fromSql[role] ?? [])].sort()
      const ts = [...ROLE_PERMISSIONS[role]].sort()
      expect(ts).toEqual(sql)
    },
  )

  it('grants a super administrator everything', () => {
    expect(ROLE_PERMISSIONS.super_admin).toEqual(PERMISSIONS)
  })

  it('never lets a read-only account write anything', () => {
    const writes = ROLE_PERMISSIONS.read_only.filter(
      (permission) => !permission.endsWith('.read'),
    )
    expect(writes).toEqual([])
  })

  it('does not let an editor manage users or delete records', () => {
    expect(ROLE_PERMISSIONS.editor).not.toContain('user.manage')
    expect(ROLE_PERMISSIONS.editor).not.toContain('meeting.delete')
    expect(ROLE_PERMISSIONS.editor).not.toContain('document.delete')
  })
})
