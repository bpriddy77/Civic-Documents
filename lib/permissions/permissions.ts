import type { AppRole } from '@/lib/supabase/database.types'

/**
 * The permission matrix, mirroring public.role_permissions.
 *
 * The database copy is authoritative - it is what actually stops a crafted
 * API call. This copy exists so the interface can hide controls a user
 * cannot use. tests/permissions.parity.test.ts fails if the two drift.
 */
export const PERMISSIONS = [
  'meeting.read',
  'meeting.create',
  'meeting.update',
  'meeting.publish',
  'meeting.archive',
  'meeting.delete',
  'document.read',
  'document.manage',
  'document.delete',
  'category.read',
  'category.manage',
  'category.delete',
  'user.read',
  'user.manage',
  'audit.read',
  'municipality.update',
  'tenant.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ADMIN: Permission[] = [
  'meeting.read', 'meeting.create', 'meeting.update', 'meeting.publish',
  'meeting.archive', 'meeting.delete',
  'document.read', 'document.manage', 'document.delete',
  'category.read', 'category.manage', 'category.delete',
  'user.read', 'user.manage', 'audit.read', 'municipality.update',
]

const EDITOR: Permission[] = [
  'meeting.read', 'meeting.create', 'meeting.update', 'meeting.publish',
  'document.read', 'document.manage',
  'category.read', 'audit.read',
]

const READ_ONLY: Permission[] = ['meeting.read', 'document.read', 'category.read', 'audit.read']

export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: ADMIN,
  editor: EDITOR,
  read_only: READ_ONLY,
}

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super administrator',
  admin: 'Administrator',
  editor: 'Editor / City Secretary',
  read_only: 'Read only',
}

/** Does this role hold this permission? */
export function can(role: AppRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** Does this role hold every listed permission? */
export function canAll(role: AppRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p))
}
