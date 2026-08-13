/**
 * Database types.
 *
 * Regenerate after every migration:
 *   npm run db:types          (local)
 *   supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
 *
 * The hand-maintained copy below matches supabase/migrations as of 0600 so
 * the repository type-checks on a clean clone before anyone runs the CLI.
 */

export type AppRole = 'super_admin' | 'admin' | 'editor' | 'read_only'
export type MeetingStatus = 'draft' | 'published' | 'archived'
export type MinutesStatus = 'not_available' | 'draft' | 'pending_approval' | 'approved'
export type DocumentType = 'agenda' | 'minutes' | (string & {})

export interface MunicipalityConfiguration {
  date_format?: string
  time_format?: string
  meetings_per_page?: number
  default_sort?: 'newest' | 'oldest'
  archive_heading?: string
  show_meeting_time?: boolean
  show_location?: boolean
  publish_pending_minutes?: boolean
  max_upload_mb?: number
  primary_color?: string
}

export interface Municipality {
  id: string
  name: string
  slug: string
  timezone: string
  logo_url: string | null
  website_url: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_address: string | null
  configuration: MunicipalityConfiguration
  active: boolean
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  auth_user_id: string
  municipality_id: string | null
  display_name: string
  email: string
  role: AppRole
  active: boolean
  disabled_at: string | null
  created_at: string
  updated_at: string
}

export interface MeetingCategory {
  id: string
  municipality_id: string
  name: string
  slug: string
  description: string | null
  display_order: number
  active: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface Meeting {
  id: string
  municipality_id: string
  category_id: string
  title: string
  slug: string
  description: string | null
  meeting_date: string
  meeting_time: string | null
  location: string | null
  status: MeetingStatus
  minutes_status: MinutesStatus
  starts_at: string
  published_at: string | null
  archived_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface MeetingDocument {
  id: string
  municipality_id: string
  meeting_id: string
  document_type: DocumentType
  posted_date: string
  storage_path: string
  public_slug: string
  original_filename: string
  stored_filename: string
  mime_type: string
  file_size: number
  sha256: string | null
  version: number
  active_version: boolean
  uploaded_by: string | null
  created_at: string
  replaced_at: string | null
  removed_at: string | null
}

export interface AuditLogEntry {
  id: number
  municipality_id: string | null
  user_id: string | null
  user_name: string | null
  user_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  previous_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface DashboardCounts {
  municipality_id: string
  upcoming: number
  drafts: number
  published: number
  archived: number
  awaiting_minutes: number
  minutes_pending_approval: number
  published_this_year: number
}

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row> }

export interface Database {
  public: {
    Tables: {
      municipalities: Table<Municipality>
      profiles: Table<Profile>
      meeting_categories: Table<MeetingCategory>
      meetings: Table<Meeting>
      meeting_documents: Table<MeetingDocument>
      audit_log: Table<AuditLogEntry>
      role_permissions: Table<{ role: AppRole; permission: string }>
      document_types: Table<{ code: string; label: string; display_order: number; active: boolean }>
    }
    Views: {
      meeting_dashboard_counts: { Row: DashboardCounts }
    }
    Functions: {
      record_audit_event: {
        Args: {
          p_municipality_id: string | null
          p_action: string
          p_entity_type: string
          p_entity_id?: string | null
          p_previous_data?: unknown
          p_new_data?: unknown
          p_metadata?: unknown
        }
        Returns: number
      }
    }
    Enums: {
      app_role: AppRole
      meeting_status: MeetingStatus
      minutes_status: MinutesStatus
    }
  }
}

/** A meeting joined with its category and live documents, as the UI uses it. */
export interface MeetingWithRelations extends Meeting {
  category: Pick<MeetingCategory, 'id' | 'name' | 'slug'> | null
  documents: MeetingDocument[]
}
