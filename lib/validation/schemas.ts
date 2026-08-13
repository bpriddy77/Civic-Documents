import { z } from 'zod'

/**
 * Centralised validation. The admin form, the route handlers, and the tests
 * all import from here, so a rule can only be written once. Required fields
 * are additionally enforced by NOT NULL and CHECK constraints in PostgreSQL.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD.')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Enter a real calendar date.')

const isoTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Enter a time as HH:MM.')

export const meetingStatusSchema = z.enum(['draft', 'published', 'archived'])
export const minutesStatusSchema = z.enum(['not_available', 'draft', 'pending_approval', 'approved'])
export const documentTypeSchema = z.enum(['agenda', 'minutes'])

export const meetingInputSchema = z.object({
  title: z.string().trim().min(1, 'Meeting Title is required.').max(300),
  category_id: z.string().uuid('Category is required.'),
  meeting_date: isoDate.describe('Meeting Date is required.'),
  meeting_time: isoTime.nullish(),
  location: z.string().trim().max(300).nullish(),
  description: z.string().trim().max(5000).nullish(),
  status: meetingStatusSchema.default('draft'),
  minutes_status: minutesStatusSchema.default('not_available'),
})

export type MeetingInput = z.infer<typeof meetingInputSchema>

/** Uploading a document always requires the date it was posted publicly. */
export const documentUploadSchema = z.object({
  meeting_id: z.string().uuid(),
  document_type: documentTypeSchema,
  posted_date: isoDate,
})

export const documentUploadMessages = {
  agenda: 'Agenda Posted Date is required when an Agenda is uploaded.',
  minutes: 'Minutes Posted Date is required when Minutes are uploaded.',
} as const

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required.').max(120),
  description: z.string().trim().max(1000).nullish(),
  display_order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
})

export const userInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  display_name: z.string().trim().min(1, 'Name is required.').max(200),
  role: z.enum(['super_admin', 'admin', 'editor', 'read_only']),
  active: z.boolean().default(true),
})

export const municipalityConfigurationSchema = z.object({
  date_format: z.string().default('MMMM d, yyyy'),
  time_format: z.enum(['h:mm a', 'HH:mm']).default('h:mm a'),
  meetings_per_page: z.coerce.number().int().min(5).max(100).default(20),
  default_sort: z.enum(['newest', 'oldest']).default('newest'),
  archive_heading: z.string().max(160).default('Meeting Agendas & Minutes'),
  show_meeting_time: z.boolean().default(true),
  show_location: z.boolean().default(true),
  publish_pending_minutes: z.boolean().default(false),
  max_upload_mb: z.coerce.number().int().min(1).max(50).default(25),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1B3A5C'),
})

export const municipalityInputSchema = z.object({
  name: z.string().trim().min(1, 'Municipality name is required.').max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens.'),
  timezone: z.string().min(3, 'A time zone is required.'),
  logo_url: z.string().url().nullish().or(z.literal('')),
  website_url: z.string().url().nullish().or(z.literal('')),
  contact_email: z.string().email().nullish().or(z.literal('')),
  contact_phone: z.string().max(40).nullish(),
  contact_address: z.string().max(300).nullish(),
  configuration: municipalityConfigurationSchema.partial(),
})

/** Query string accepted by the public archive and the public API. */
export const publicQuerySchema = z.object({
  municipality: z.string().trim().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  year: z.coerce.number().int().min(1900).max(2999).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  scope: z.enum(['upcoming', 'past', 'all']).default('all'),
  sort: z.enum(['newest', 'oldest', 'soonest']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
})

export type PublicQuery = z.infer<typeof publicQuerySchema>

/** Flattens a Zod error into `{ field: message }` for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
