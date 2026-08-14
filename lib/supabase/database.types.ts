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

export type MunicipalityConfiguration = {
  date_format?: string
  time_format?: string
  meetings_per_page?: number
  default_sort?: 'newest' | 'oldest'
  archive_heading?: string
  archive_about?: string
  privacy_policy_url?: string
  terms_url?: string
  show_meeting_time?: boolean
  show_location?: boolean
  publish_pending_minutes?: boolean
  max_upload_mb?: number
  primary_color?: string
}

export type Municipality = {
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

export type Profile = {
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

export type MeetingCategory = {
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

export type Meeting = {
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

export type MeetingDocument = {
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

export type AuditLogEntry = {
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

export type DashboardCounts = {
  municipality_id: string
  upcoming: number
  drafts: number
  published: number
  archived: number
  awaiting_minutes: number
  minutes_pending_approval: number
  published_this_year: number
}

/**
 * A foreign key as PostgREST describes it. Declaring these is what lets the
 * client resolve embedded selects like `category:meeting_categories(...)`.
 */
type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

/**
 * postgrest-js only accepts a schema whose every table carries Row, Insert,
 * Update, AND Relationships. Omit Relationships and the schema silently fails
 * to satisfy GenericSchema, at which point every query in the codebase infers
 * its row type as `never` — which surfaces far from here, as
 * "Property 'id' does not exist on type 'never'" in whichever file the type
 * checker happens to reach first.
 */
type Table<Row, Rel extends Relationship[] = []> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: Rel
}

/** Declares one foreign key to `municipalities.id`, the tenant link every table carries. */
type BelongsToMunicipality<FkName extends string> = [
  {
    foreignKeyName: FkName
    columns: ['municipality_id']
    isOneToOne: false
    referencedRelation: 'municipalities'
    referencedColumns: ['id']
  },
]

export type Database = {
  public: {
    Tables: {
      municipalities: Table<Municipality>
      profiles: Table<Profile, BelongsToMunicipality<'profiles_municipality_id_fkey'>>
      meeting_categories: Table<
        MeetingCategory,
        BelongsToMunicipality<'meeting_categories_municipality_id_fkey'>
      >
      meetings: Table<
        Meeting,
        [
          ...BelongsToMunicipality<'meetings_municipality_id_fkey'>,
          {
            foreignKeyName: 'meetings_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'meeting_categories'
            referencedColumns: ['id']
          },
        ]
      >
      meeting_documents: Table<
        MeetingDocument,
        [
          ...BelongsToMunicipality<'meeting_documents_municipality_id_fkey'>,
          {
            foreignKeyName: 'meeting_documents_meeting_id_fkey'
            columns: ['meeting_id']
            isOneToOne: false
            referencedRelation: 'meetings'
            referencedColumns: ['id']
          },
        ]
      >
      audit_log: Table<AuditLogEntry, BelongsToMunicipality<'audit_log_municipality_id_fkey'>>
      role_permissions: Table<{ role: AppRole; permission: string }>
      document_types: Table<{ code: string; label: string; display_order: number; active: boolean }>
    }
    Views: {
      meeting_dashboard_counts: { Row: DashboardCounts; Relationships: [] }
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
      /** Supersedes the live version of a document, preserving its public slug. */
      upsert_meeting_document: {
        Args: {
          p_meeting_id: string
          p_document_type: string
          p_posted_date: string
          p_storage_path: string
          p_original_filename: string
          p_stored_filename: string
          p_file_size: number
          p_sha256: string
        }
        Returns: MeetingDocument
      }
      /** Copies a recurring meeting's details onto a new date. Never copies documents. */
      duplicate_meeting: {
        Args: {
          p_meeting_id: string
          p_meeting_date: string
          p_copy_description?: boolean
        }
        Returns: Meeting
      }
      /** Marks a document removed without deleting the stored object. */
      retire_meeting_document: {
        Args: { p_document_id: string }
        Returns: MeetingDocument
      }
    }
    Enums: {
      app_role: AppRole
      meeting_status: MeetingStatus
      minutes_status: MinutesStatus
    }
  }
}

/**
 * A meeting joined with its category and live documents, as the UI uses it.
 *
 * Declared as a type alias rather than an interface on purpose: postgrest-js
 * constrains every row to `Record<string, unknown>`, and an interface has no
 * implicit index signature, so it silently fails that constraint. Every row
 * type in this file is an alias for the same reason.
 */
export type MeetingWithRelations = Meeting & {
  category: Pick<MeetingCategory, 'id' | 'name' | 'slug'> | null
  documents: MeetingDocument[]
}
