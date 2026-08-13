/**
 * Creates a municipality, its starter categories, and its first administrator.
 *
 *   npm run bootstrap:tenant -- \
 *     --name "City of Example" \
 *     --slug city-of-example \
 *     --timezone America/Chicago \
 *     --admin-email clerk@example-city.gov \
 *     --admin-name "Jane Clerk" \
 *     --role super_admin
 *
 * Run it once per municipality, from a machine that has SUPABASE_SERVICE_ROLE_KEY
 * in its environment. The service role key is never deployed to the browser and
 * should not be stored in the repository.
 */
import { createClient } from '@supabase/supabase-js'

const STARTER_CATEGORIES = [
  'City Council',
  'Planning & Zoning',
  'Economic Development',
  'Board of Adjustments',
  'Special Meeting',
  'Public Hearing',
  'Workshop',
  'Emergency Meeting',
]

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) {
    if (fallback !== undefined) return fallback
    console.error(`Missing required argument: --${name}`)
    process.exit(1)
  }
  return value
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  if (!url || !serviceKey) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this.')
    process.exit(1)
  }

  const name = arg('name')
  const slug = slugify(arg('slug', slugify(name)))
  const timezone = arg('timezone', 'America/Chicago')
  const adminEmail = arg('admin-email')
  const adminName = arg('admin-name')
  const role = arg('role', 'super_admin')

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: municipality, error: municipalityError } = await supabase
    .from('municipalities')
    .upsert(
      {
        name,
        slug,
        timezone,
        configuration: {
          date_format: 'MMMM d, yyyy',
          time_format: 'h:mm a',
          meetings_per_page: 20,
          default_sort: 'newest',
          archive_heading: 'Meeting Agendas & Minutes',
          show_meeting_time: true,
          show_location: true,
          publish_pending_minutes: false,
          max_upload_mb: 25,
        },
      },
      { onConflict: 'slug' },
    )
    .select('*')
    .single()

  if (municipalityError) {
    console.error('Could not create the municipality:', municipalityError.message)
    process.exit(1)
  }
  console.log(`Municipality ready: ${municipality.name} (${municipality.id})`)

  const { error: categoryError } = await supabase.from('meeting_categories').upsert(
    STARTER_CATEGORIES.map((categoryName, index) => ({
      municipality_id: municipality.id,
      name: categoryName,
      slug: slugify(categoryName),
      display_order: (index + 1) * 10,
    })),
    { onConflict: 'municipality_id,slug' },
  )
  if (categoryError) console.warn('Some categories were not created:', categoryError.message)
  else console.log(`Starter categories ready (${STARTER_CATEGORIES.length}).`)

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    adminEmail,
    { redirectTo: `${siteUrl}/auth/callback?next=/admin`, data: { display_name: adminName } },
  )

  if (inviteError || !invited?.user) {
    console.error('Could not invite the administrator:', inviteError?.message)
    process.exit(1)
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      auth_user_id: invited.user.id,
      municipality_id: municipality.id,
      display_name: adminName,
      email: adminEmail,
      role,
      active: true,
    },
    { onConflict: 'auth_user_id' },
  )

  if (profileError) {
    console.error('Could not create the administrator profile:', profileError.message)
    process.exit(1)
  }

  console.log(`\nInvitation sent to ${adminEmail}. They set their own password from the link.`)
  console.log(`Public archive: ${siteUrl}/meetings`)
  console.log(`Administration: ${siteUrl}/admin`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
