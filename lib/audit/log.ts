import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Supplementary audit entries.
 *
 * Data changes are recorded by database triggers, so they cannot be skipped
 * by forgetting to call anything. This helper covers events that have no
 * corresponding row change: sign-ins, denied permission attempts, exports,
 * and deliberate destructive confirmations.
 */
export async function logEvent(input: {
  municipalityId: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}) {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('record_audit_event', {
    p_municipality_id: input.municipalityId,
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? null,
    p_metadata: input.metadata ?? {},
  })
  // An audit failure must never take down the operation that succeeded, but
  // it must be visible in server logs.
  if (error) console.error('[audit] failed to record event', input.action, error.message)
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'meeting.created': 'Meeting created',
  'meeting.updated': 'Meeting edited',
  'meeting.published': 'Meeting published',
  'meeting.unpublished': 'Meeting unpublished',
  'meeting.archived': 'Meeting archived',
  'meeting.restored': 'Meeting restored',
  'meeting.deleted': 'Meeting permanently deleted',
  'meeting.minutes_status_changed': 'Minutes status changed',
  'meeting.category_changed': 'Meeting category changed',
  'meeting.duplicated': 'Meeting duplicated',
  'document.uploaded': 'Document uploaded',
  'document.replaced': 'Document replaced',
  'document.superseded': 'Document version superseded',
  'document.removed': 'Document removed from public view',
  'document.deleted': 'Document permanently deleted',
  'category.created': 'Category created',
  'category.updated': 'Category edited',
  'category.deleted': 'Category deleted',
  'user.created': 'User created',
  'user.updated': 'User updated',
  'user.role_changed': 'User role changed',
  'user.disabled': 'User disabled',
  'user.enabled': 'User enabled',
  'municipality.updated': 'Municipality settings changed',
  'auth.signed_in': 'Signed in',
  'auth.permission_denied': 'Permission denied',
}

export function auditLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ')
}
