/**
 * Validates supabase/setup/01-complete-schema.sql against a real PostgreSQL
 * engine (PGlite), with the parts of Supabase the schema depends on stubbed in.
 *
 * This catches syntax errors, bad references, and ordering mistakes before
 * someone pastes 53KB into a production SQL Editor and watches it fail
 * halfway through.
 *
 * It does NOT replace testing against a real Supabase project: the stubs below
 * are shaped like Supabase's, not identical to it.
 *
 *   node scripts/validate-setup-sql.mjs
 */
import { PGlite } from '/tmp/pgtest/node_modules/@electric-sql/pglite/dist/index.js'
import { readFile } from 'node:fs/promises'

const SUPABASE_STUBS = `
create schema if not exists auth;
create schema if not exists storage;

do $$ begin
  create role anon;            exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated;   exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role;    exception when duplicate_object then null; end $$;
do $$ begin
  create role supabase_auth_admin; exception when duplicate_object then null; end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
`

const db = new PGlite()
await db.exec(SUPABASE_STUBS)
console.log('Supabase stubs installed.')

let sql = await readFile('supabase/setup/01-complete-schema.sql', 'utf8')

// PGlite ships without pgcrypto and pg_trgm. Neither is needed to prove the
// schema is well-formed: gen_random_uuid() is core in PostgreSQL 13+, and the
// trigram index is a search optimisation. Both are present on Supabase.
sql = sql
  .replace(/create extension[^;]*;/gi, '')
  .replace(/create index[^;]*gin_trgm_ops[^;]*;/gi, '')
console.log('note: extensions and the trigram index are skipped in this harness')

try {
  await db.exec(sql)
  console.log('\n✓ Schema applied cleanly.')
} catch (error) {
  console.error('\n✗ Schema FAILED to apply:')
  console.error(`  ${error.message}`)
  if (error.query) console.error(`  in: ${String(error.query).slice(0, 300)}`)
  process.exit(1)
}

// Re-running must be safe: a dashboard user who hits an error will paste again.
try {
  await db.exec(sql)
  console.log('✓ Schema is idempotent (applied twice with no error).')
} catch (error) {
  console.error('\n✗ Schema is NOT idempotent. Second run failed:\n')
  console.error(error.message)
  process.exit(1)
}

const checks = [
  ['tables', `select count(*)::int as n from information_schema.tables
              where table_schema='public' and table_name in
              ('municipalities','profiles','meetings','meeting_documents',
               'meeting_categories','audit_log','role_permissions','document_types',
               'schema_version')`, 9],
  ['RLS-enabled tables', `select count(*)::int as n from pg_tables
              where schemaname='public' and rowsecurity=true`, 9],
  ['policies', `select count(*)::int as n from pg_policies where schemaname in ('public','storage')`, 33],
  ['permission rows', `select count(*)::int as n from public.role_permissions`, 1],
  ['document types', `select count(*)::int as n from public.document_types`, 2],
  ['schema version recorded', `select count(*)::int as n from public.schema_version`, 1],
  ['storage bucket', `select count(*)::int as n from storage.buckets where id='meeting-documents' and public=false`, 1],
  ['anon storage policies (must be 0)', `select count(*)::int as n from pg_policies
              where schemaname='storage' and 'anon'=any(roles)`, 0],
]

let failed = false
console.log('')
for (const [label, query, expected] of checks) {
  const { rows } = await db.query(query)
  const actual = rows[0].n
  const ok = label.includes('must be 0') ? actual === 0 : actual >= expected
  if (!ok) failed = true
  console.log(`${ok ? '✓' : '✗'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`)
}

// The bootstrap script must refuse to run before the login exists.
console.log('')
const bootstrap = await readFile('supabase/setup/02-create-municipality.sql', 'utf8')
try {
  await db.exec(bootstrap)
  console.log('✗ Bootstrap ran without an auth user — it should have refused.')
  failed = true
} catch (error) {
  if (/No user found with the email/.test(error.message)) {
    console.log('✓ Bootstrap refuses to run before the login exists, with a clear message.')
  } else {
    console.log(`✗ Bootstrap failed for the wrong reason: ${error.message}`)
    failed = true
  }
}

// Now with a login present, it should succeed.
await db.exec(`insert into auth.users (email) values ('clerk@example-city.gov')`)
try {
  await db.exec(bootstrap)
  const { rows } = await db.query(`
    select m.slug, m.timezone, p.role::text as role,
           (select count(*)::int from public.meeting_categories c where c.municipality_id = m.id) as categories
    from public.municipalities m join public.profiles p on p.municipality_id = m.id`)
  if (rows.length === 1 && rows[0].categories === 8) {
    console.log(`✓ Bootstrap created "${rows[0].slug}" (${rows[0].timezone}), role ${rows[0].role}, ${rows[0].categories} categories.`)
  } else {
    console.log(`✗ Bootstrap produced unexpected results: ${JSON.stringify(rows)}`)
    failed = true
  }
} catch (error) {
  console.log(`✗ Bootstrap failed with a login present: ${error.message}`)
  failed = true
}

// And it must be safe to run twice.
try {
  await db.exec(bootstrap)
  const { rows } = await db.query('select count(*)::int as n from public.municipalities')
  if (rows[0].n === 1) console.log('✓ Bootstrap is idempotent (no duplicate municipality).')
  else { console.log(`✗ Bootstrap duplicated the municipality: ${rows[0].n} rows.`); failed = true }
} catch (error) {
  console.log(`✗ Bootstrap is not re-runnable: ${error.message}`)
  failed = true
}

// 04-add-user must refuse an unknown login, refuse an unknown municipality,
// add a real one, and be safe to run twice.
console.log('')
const addUser = await readFile('supabase/setup/04-add-user.sql', 'utf8')

try {
  await db.exec(addUser)
  console.log('✗ Add-user ran without a login — it should have refused.')
  failed = true
} catch (error) {
  if (/No login found/.test(error.message)) {
    console.log('✓ Add-user refuses an email with no login.')
  } else {
    console.log(`✗ Add-user failed for the wrong reason: ${error.message}`)
    failed = true
  }
}

await db.exec(`insert into auth.users (email) values ('deputy@example-city.gov')`)
try {
  await db.exec(addUser)
  const { rows } = await db.query(
    `select role::text as role, active from public.profiles where email = 'deputy@example-city.gov'`,
  )
  if (rows.length === 1 && rows[0].role === 'editor' && rows[0].active) {
    console.log('✓ Add-user added the deputy as editor.')
  } else {
    console.log(`✗ Add-user produced unexpected results: ${JSON.stringify(rows)}`)
    failed = true
  }
} catch (error) {
  console.log(`✗ Add-user failed with a login present: ${error.message}`)
  failed = true
}

try {
  await db.exec(addUser)
  const { rows } = await db.query(`select count(*)::int as n from public.profiles`)
  if (rows[0].n === 2) console.log('✓ Add-user is idempotent (no duplicate profile).')
  else { console.log(`✗ Add-user duplicated profiles: ${rows[0].n}`); failed = true }
} catch (error) {
  console.log(`✗ Add-user is not re-runnable: ${error.message}`)
  failed = true
}

// It must reject a municipality slug that does not exist, rather than
// creating an orphaned profile.
try {
  await db.exec(addUser.replace("'city-of-example'", "'no-such-city'"))
  console.log('✗ Add-user accepted an unknown municipality slug.')
  failed = true
} catch (error) {
  if (/No municipality with the slug/.test(error.message)) {
    console.log('✓ Add-user refuses an unknown municipality slug.')
  } else {
    console.log(`✗ Add-user failed for the wrong reason: ${error.message}`)
    failed = true
  }
}

// The audit log must reject modification.
try {
  await db.exec(`insert into public.audit_log (action, entity_type) values ('test.event','meeting')`)
  await db.exec(`update public.audit_log set action='tampered'`)
  console.log('✗ Audit log accepted an UPDATE — it must be append-only.')
  failed = true
} catch (error) {
  if (/append only/i.test(error.message)) console.log('✓ Audit log rejects modification.')
  else { console.log(`✗ Audit log failed unexpectedly: ${error.message}`); failed = true }
}

await db.close()
console.log(failed ? '\nFAILED' : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
