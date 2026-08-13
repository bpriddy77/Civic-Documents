/**
 * Exercises the document and audit paths as the `authenticated` role with RLS
 * active, exactly as the application does.
 *
 * Written to catch a real bug: `text[] || 'literal'` is ambiguous in
 * PostgreSQL. It resolves to array || array and fails with "malformed array
 * literal", so every status transition that wrote an audit action broke. The
 * failure only surfaced through a trigger three calls deep, and the message
 * the clerk saw was "The document could not be recorded against this meeting."
 *
 *   npm run validate:audit
 */
import { PGlite } from '/tmp/pgtest/node_modules/@electric-sql/pglite/dist/index.js'
import { readFile } from 'node:fs/promises'

const STUBS = `
create schema if not exists auth;
create schema if not exists storage;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
`

const db = new PGlite()
await db.exec(STUBS)

let sql = await readFile('supabase/setup/01-complete-schema.sql', 'utf8')
sql = sql.replace(/create extension[^;]*;/gi, '').replace(/create index[^;]*gin_trgm_ops[^;]*;/gi, '')
await db.exec(sql)
console.log('Schema applied.')

// Grants the app relies on, which Supabase applies to its roles by default.
await db.exec(`
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant select on auth.users to authenticated;
`)

// A tenant, a category, a super_admin profile, and a PUBLISHED meeting.
const { rows: [muni] } = await db.query(
  `insert into public.municipalities (name, slug, timezone)
   values ('City of Forsan', 'city-of-forsan', 'America/Chicago') returning id`)
const { rows: [cat] } = await db.query(
  `insert into public.meeting_categories (municipality_id, name, slug)
   values ($1, 'City Council', 'city-council') returning id`, [muni.id])
const { rows: [user] } = await db.query(
  `insert into auth.users (email) values ('bpriddy@gmail.com') returning id`)
await db.query(
  `insert into public.profiles (auth_user_id, municipality_id, display_name, email, role, active)
   values ($1, $2, 'Britt Priddy', 'bpriddy@gmail.com', 'super_admin', true)`, [user.id, muni.id])
const { rows: [meeting] } = await db.query(
  `insert into public.meetings (municipality_id, category_id, title, slug, meeting_date, meeting_time, status)
   values ($1, $2, 'City Council Regular Meeting', 'city-council-regular-meeting',
           '2026-08-11', '18:00', 'published') returning id`, [muni.id, cat.id])

const { rows: [deputyUser] } = await db.query(
  `insert into auth.users (email) values ('deputy@example.gov') returning id`)
await db.query(
  `insert into public.profiles (auth_user_id, municipality_id, display_name, email, role, active)
   values ($1, $2, 'Deputy Clerk', 'deputy@example.gov', 'editor', true)`,
  [deputyUser.id, muni.id])

console.log('Fixtures created. Meeting is PUBLISHED.\n')

// Now behave like the application: authenticated role, RLS on.
await db.exec(`set role authenticated;`)
await db.exec(`select set_config('request.jwt.claim.sub', '${user.id}', false);`)
await db.exec(`select set_config('request.jwt.claim.role', 'authenticated', false);`)

let failed = false

async function check(label, fn) {
  try {
    const detail = await fn()
    console.log(`✓ ${label}${detail ? `: ${detail}` : ''}`)
  } catch (error) {
    failed = true
    console.log(`✗ ${label} FAILED`)
    console.log(`  ${error.message}`)
    if (error.where) console.log(`  where: ${error.where.split('\n')[0]}`)
  }
}

async function upload(type, version = 1) {
  const { rows } = await db.query(
    `select (public.upsert_meeting_document($1,$2,$3,$4,$5,$6,$7,$8)).public_slug as slug`,
    [meeting.id, type, '2026-08-13',
     `municipalities/${muni.id}/meetings/${meeting.id}/${type}/v${version}-${Math.random().toString(36).slice(2, 8)}.pdf`,
     `test-${type}.pdf`, `test-${type}.pdf`, 4400, 'a'.repeat(64)])
  return rows[0].slug
}

await check('upload agenda', () => upload('agenda'))

// The minutes path additionally fires sync_minutes_status_on_upload, which
// updates the meeting and therefore the audit trigger. This is the exact
// combination that failed.
await check('upload minutes onto a published meeting', () => upload('minutes'))

await check('replacing a document preserves the public slug', async () => {
  const first = await db.query(
    `select public_slug from public.meeting_documents
     where meeting_id = $1 and document_type = 'agenda' and active_version`, [meeting.id])
  const replaced = await upload('agenda', 2)
  if (replaced !== first.rows[0].public_slug) {
    throw new Error(`slug changed: ${first.rows[0].public_slug} -> ${replaced}`)
  }
  return replaced
})

// Every status transition writes an audit action, and each one used the
// ambiguous concatenation.
for (const [from, to] of [['published', 'archived'], ['archived', 'draft'], ['draft', 'published']]) {
  await check(`meeting status ${from} -> ${to}`, async () => {
    await db.query(`update public.meetings set status = $1 where id = $2`, [to, meeting.id])
  })
}

await check('minutes status change', async () => {
  await db.query(
    `update public.meetings set minutes_status = 'approved' where id = $1`, [meeting.id])
})

// Role changes are exercised on a second account, not the signed-in one.
// Demoting yourself is a one-way door by design: an admin cannot promote
// anyone back to super_admin, so a self-demotion test would fail on a rule
// that is working correctly.
await check('role change on another account', async () => {
  await db.query(
    `update public.profiles set role = 'admin' where email = 'deputy@example.gov'`)
  await db.query(
    `update public.profiles set role = 'editor' where email = 'deputy@example.gov'`)
})

await check('disabling and re-enabling another account', async () => {
  await db.query(`update public.profiles set active = false where email = 'deputy@example.gov'`)
  await db.query(`update public.profiles set active = true where email = 'deputy@example.gov'`)
})

await check('an admin cannot promote anyone to super_admin', async () => {
  await db.query(`update public.profiles set role = 'admin' where email = 'deputy@example.gov'`)
  await db.exec(`select set_config('request.jwt.claim.sub', '${deputyUser.id}', false)`)
  let refused = false
  try {
    await db.query(`update public.profiles set role = 'super_admin' where email = 'deputy@example.gov'`)
  } catch {
    refused = true
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '${user.id}', false)`)
  if (!refused) throw new Error('an admin was able to self-promote to super_admin')
  return 'refused, as intended'
})

await db.exec(`reset role`)
const { rows: audit } = await db.query(
  `select action, count(*)::int as n from public.audit_log group by action order by action`)

console.log('\nAudit actions recorded:')
for (const row of audit) console.log(`  ${row.action} (${row.n})`)

if (audit.length === 0) {
  failed = true
  console.log('✗ No audit entries were written at all.')
}

await db.close()
console.log(failed ? '\nFAILED' : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
