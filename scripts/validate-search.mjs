/**
 * Exercises site search against a real PostgreSQL.
 *
 * Two things here are worth a harness rather than a reading. The first is the
 * gate: search is sold separately, so a municipality that has not enabled it
 * must return nothing — and must do so in the database, not in the widget,
 * because the widget is a file anyone can read and call directly.
 *
 * The second is that search must never error. A resident types an apostrophe,
 * an unclosed quote, a bracket; `to_tsquery` raises a syntax error on all
 * three. `websearch_to_tsquery` does not, and this proves it.
 *
 *   npm run validate:search
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

await db.exec(`
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated, anon;
`)
console.log('Schema applied.')

let failed = false
async function check(label, fn) {
  try {
    const detail = await fn()
    console.log(`✓ ${label}${detail ? `: ${detail}` : ''}`)
  } catch (error) {
    failed = true
    console.log(`✗ ${label} FAILED`)
    console.log(`  ${error.message}`)
  }
}

const { rows: [muni] } = await db.query(
  `insert into public.municipalities (name, slug, timezone, configuration)
   values ('City of Forsan', 'city-of-forsan', 'America/Chicago', '{}'::jsonb)
   returning id`)

const { rows: [other] } = await db.query(
  `insert into public.municipalities (name, slug, timezone, configuration)
   values ('City of Elsewhere', 'city-of-elsewhere', 'America/Chicago',
           '{"search_enabled": true}'::jsonb)
   returning id`)

const page = (id, url, title, source, body) =>
  db.query(
    `insert into public.search_documents (municipality_id, url, title, source, body)
     values ($1, $2, $3, $4::public.search_source, $5)`,
    [id, url, title, source, body])

await page(muni.id, 'https://forsantx.gov/water-rates', 'Water Rates', 'page',
  'Residential water service is billed monthly. The base rate is $35.00 for the first 2,000 gallons.')
await page(muni.id, 'https://forsantx.gov/new-service', 'Start New Water Service', 'page',
  'To begin new water service complete an application at City Hall and pay a deposit of $150.')
await page(muni.id, 'https://forsantx.gov/docs/ord-2024-02.pdf', 'Ordinance 2024-02 Water Rates', 'pdf',
  'AN ORDINANCE AMENDING THE WATER AND SEWER RATE SCHEDULE; PROVIDING FOR A DEPOSIT REQUIREMENT.')
await page(muni.id, 'https://forsantx.gov/trash', 'Trash and Brush Pickup', 'page',
  'Household trash is collected on Tuesdays. Brush pickup is the first Monday of each month.')
await page(other.id, 'https://elsewhere.gov/water', 'Elsewhere Water', 'page',
  'Water service in the City of Elsewhere. Deposit required.')

const find = (slug, q, limit = 20) =>
  db.query(`select * from public.search_site($1, $2, $3, 0)`, [slug, q, limit])

// ---------------------------------------------------------------------
// The gate. This is the commercial boundary, so it is enforced in the
// database rather than by withholding the widget file.
// ---------------------------------------------------------------------
await check('a municipality without the feature returns nothing', async () => {
  const { rows } = await find('city-of-forsan', 'water')
  if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`)
  return 'gated off'
})

await check('the gate is per municipality, not global', async () => {
  const { rows } = await find('city-of-elsewhere', 'water')
  if (rows.length !== 1) throw new Error(`expected 1 row for the enabled city, got ${rows.length}`)
  return rows[0].title
})

await db.query(
  `update public.municipalities
      set configuration = configuration || '{"search_enabled": true}'::jsonb
    where id = $1`, [muni.id])

await check('enabling the feature turns results on', async () => {
  const { rows } = await find('city-of-forsan', 'water')
  if (rows.length !== 3) throw new Error(`expected 3 matches, got ${rows.length}`)
  return `${rows.length} results`
})

// ---------------------------------------------------------------------
// Ranking and presentation
// ---------------------------------------------------------------------
await check('a mixed query returns both pages and documents', async () => {
  const { rows } = await find('city-of-forsan', 'water deposit')
  const kinds = new Set(rows.map((r) => r.source))
  if (!kinds.has('page') || !kinds.has('pdf')) {
    throw new Error(`expected both a page and a pdf, got ${[...kinds].join(', ')}`)
  }
  // Which of the two leads is a judgement call and both are genuinely
  // relevant, so the order is not asserted here. Asserting it would
  // freeze one opinion about relevance into a test that then has to be
  // fought every time the ranking is tuned.
  return rows.map((r) => `${r.source}:${r.rank.toFixed(3)}`).join(' ')
})

await check('searching a document by name returns that document first', async () => {
  const { rows } = await find('city-of-forsan', 'Ordinance 2024-02')
  if (!rows.length) throw new Error('no results')
  if (rows[0].source !== 'pdf') {
    throw new Error(`expected the ordinance first, got ${rows[0].source} ${rows[0].url}`)
  }
  return rows[0].title
})

await check('the type tiebreaker does not override relevance', async () => {
  // "brush" appears only on a page; "sewer" only in the ordinance. Each
  // must return its own document, whatever the type weighting says.
  const brush = await find('city-of-forsan', 'brush')
  const sewer = await find('city-of-forsan', 'sewer')
  if (brush.rows[0]?.source !== 'page') throw new Error('page-only term did not return the page')
  if (sewer.rows[0]?.source !== 'pdf') throw new Error('document-only term did not return the document')
  return 'relevance wins'
})

await check('results carry a highlighted snippet', async () => {
  const { rows } = await find('city-of-forsan', 'deposit')
  const hit = rows.find((r) => r.snippet.includes('[[hl]]'))
  if (!hit) throw new Error(`no highlight in: ${rows.map((r) => r.snippet).join(' | ')}`)
  return hit.snippet.replace(/\s+/g, ' ').slice(0, 60)
})

await check('a snippet can never carry markup out of a page', async () => {
  // Two things protect the snippet. ts_headline strips tags from the
  // text it summarises, and highlights are sentinels rather than tags.
  // So nothing in a crawled page can reach the widget as markup.
  await db.query(
    `insert into public.search_documents (municipality_id, url, title, source, body)
     values ($1, 'https://forsantx.gov/xss', 'Embedding', 'page',
             'Paste this snippet: <script>alert(1)</script> — it embeds the widget.')`,
    [muni.id])
  const { rows } = await db.query(
    `select snippet from public.search_site($1, $2, 20, 0)`, ['city-of-forsan', 'snippet'])
  const snippet = rows.map((r) => r.snippet).join(' ')
  if (!snippet.includes('[[hl]]')) throw new Error('fixture did not highlight; test proves nothing')
  if (/[<>]/.test(snippet)) throw new Error(`snippet carried markup: ${snippet}`)
  return 'tags stripped, highlights are sentinels'
})

await check('the TITLE is returned raw, so the widget must escape it', async () => {
  // This is the real injection vector and it is not defended here on
  // purpose: the title is data, and escaping belongs at the point of
  // render. This check exists so that stays a decision rather than an
  // oversight -- if it ever starts failing, something began sanitising
  // in the database and the widget's escaping may have been dropped.
  await db.query(
    `update public.search_documents set title = '<script>alert(1)</script>'
      where url = 'https://forsantx.gov/xss'`)
  const { rows } = await db.query(
    `select title from public.search_site($1, $2, 20, 0)`, ['city-of-forsan', 'snippet'])
  if (!rows.some((r) => r.title.includes('<script>'))) {
    throw new Error('the database now alters titles; check the widget still escapes them')
  }
  await db.query(`delete from public.search_documents where url = 'https://forsantx.gov/xss'`)
  return 'raw by design, escaped at render'
})

await check('the total is the full match count, not the page size', async () => {
  const { rows } = await find('city-of-forsan', 'water', 1)
  if (rows.length !== 1) throw new Error(`expected 1 row back, got ${rows.length}`)
  if (Number(rows[0].total) !== 3) throw new Error(`expected total 3, got ${rows[0].total}`)
  return `1 of ${rows[0].total}`
})

await check('one city never sees another city\'s pages', async () => {
  const { rows } = await find('city-of-forsan', 'water')
  const leaked = rows.filter((r) => r.url.includes('elsewhere'))
  if (leaked.length) throw new Error(`leaked: ${leaked.map((r) => r.url).join(', ')}`)
  return 'isolated'
})

// ---------------------------------------------------------------------
// A page taken off the site
// ---------------------------------------------------------------------
await check('a removed page drops out of results', async () => {
  await db.query(
    `update public.search_documents set removed_at = now()
      where municipality_id = $1 and url like '%trash%'`, [muni.id])
  const { rows } = await find('city-of-forsan', 'brush')
  if (rows.length !== 0) throw new Error(`removed page still returned`)
  return 'excluded'
})

// ---------------------------------------------------------------------
// Whatever a resident types, search must answer.
//
// to_tsquery raises a syntax error on most of these. An error page from
// the search box is worse than no search box.
// ---------------------------------------------------------------------
await check('malformed queries return results or nothing, never an error', async () => {
  const nasty = [
    `"unclosed quote`, `)(&^%$#`, `water &| rates`, `!!!`, `'`, `\\`,
    `water OR`, `AND`, `<script>alert(1)</script>`, `--`, `;drop table`,
    `   `, `ñ`, `水`, `a`.repeat(400),
  ]
  for (const q of nasty) {
    await db.query(`select * from public.search_site($1, $2, 20, 0)`, ['city-of-forsan', q])
  }
  return `${nasty.length} hostile inputs handled`
})

await check('an empty query returns nothing rather than everything', async () => {
  for (const q of ['', '   ', null]) {
    const { rows } = await db.query(
      `select * from public.search_site($1, $2, 20, 0)`, ['city-of-forsan', q])
    if (rows.length) throw new Error(`query ${JSON.stringify(q)} returned ${rows.length} rows`)
  }
  return 'empty in, empty out'
})

await check('a quoted phrase is treated as a phrase', async () => {
  const { rows } = await find('city-of-forsan', '"new water service"')
  if (rows.length !== 1) throw new Error(`expected 1 phrase match, got ${rows.length}`)
  return rows[0].title
})

// ---------------------------------------------------------------------
// Row-level security, independent of the function
// ---------------------------------------------------------------------
await check('an anonymous visitor cannot read a disabled city\'s index', async () => {
  await db.query(
    `update public.municipalities
        set configuration = configuration - 'search_enabled' where id = $1`, [muni.id])
  await db.exec(`set role anon`)
  const { rows } = await db.query(
    `select count(*)::int as n from public.search_documents where municipality_id = $1`,
    [muni.id])
  await db.exec(`reset role`)
  if (rows[0].n !== 0) throw new Error(`anon read ${rows[0].n} rows from a disabled city`)
  return 'blocked by RLS'
})

await check('an anonymous visitor cannot write to the index', async () => {
  await db.exec(`set role anon`)
  let blocked = false
  try {
    await db.query(
      `insert into public.search_documents (municipality_id, url, title, source, body)
       values ($1, 'https://forsantx.gov/spam', 'Spam', 'page', 'buy things')`, [muni.id])
  } catch {
    blocked = true
  }
  await db.exec(`reset role`)
  if (!blocked) throw new Error('anon inserted a row into the search index')
  return 'rejected'
})

// =====================================================================
// Direct indexing of this system's own records.
//
// The index is a second route to content, and the risk it carries is
// that something not meant to be public becomes findable through it.
// These are the checks that matter most in this file.
// =====================================================================
console.log('')

await db.query(
  `update public.municipalities
      set configuration = configuration
          || '{"search_enabled": true, "records_base_url": "https://records.forsan.texas.gov"}'::jsonb
    where id = $1`, [muni.id])

const { rows: [cat] } = await db.query(
  `insert into public.meeting_categories (municipality_id, name, slug)
   values ($1, 'City Council', 'city-council') returning id`, [muni.id])

const { rows: [meet] } = await db.query(
  `insert into public.meetings
     (municipality_id, category_id, title, slug, meeting_date, status, minutes_status)
   values ($1, $2, 'Regular Meeting', 'regular-meeting', '2026-02-17', 'draft', 'not_available')
   returning id`, [muni.id, cat.id])

const indexed = async () => (await db.query(
  `select url, title, source from public.search_documents
    where municipality_id = $1 and entity_type in ('meeting','document')
    order by url`, [muni.id])).rows

await check('a DRAFT meeting is not in the index', async () => {
  const rows = await indexed()
  if (rows.length) throw new Error(`draft meeting indexed: ${rows.map((r) => r.url).join(', ')}`)
  return 'absent'
})

await check('publishing a meeting puts it in the index', async () => {
  await db.query(`update public.meetings set status = 'published' where id = $1`, [meet.id])
  const rows = await indexed()
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`)
  if (!rows[0].url.startsWith('https://records.forsan.texas.gov/meetings/2026/02/17/')) {
    throw new Error(`unexpected url: ${rows[0].url}`)
  }
  return rows[0].title
})

await check('unpublishing takes it straight back out', async () => {
  await db.query(`update public.meetings set status = 'draft' where id = $1`, [meet.id])
  if ((await indexed()).length) throw new Error('still indexed after unpublishing')
  await db.query(`update public.meetings set status = 'published' where id = $1`, [meet.id])
  return 'removed and restored'
})

// Documents, and the rule that unapproved minutes stay private.
await db.exec(`set role authenticated`)
await db.exec(`select set_config('request.jwt.claim.role', 'service_role', false)`)
await db.exec(`reset role`)

const addDoc = (type) => db.query(
  `insert into public.meeting_documents
     (municipality_id, meeting_id, document_type, posted_date, storage_path, public_slug,
      original_filename, stored_filename, mime_type, file_size, version, active_version)
   values ($1, $2, $3, '2026-02-10', 'p/' || gen_random_uuid() || '.pdf',
           '2026-02-17-regular-meeting-' || $3, 'f.pdf', 'f.pdf', 'application/pdf', 1000, 1, true)
   returning id`, [muni.id, meet.id, type])

await check('a published agenda is indexed at its permanent URL', async () => {
  await addDoc('agenda')
  const rows = await indexed()
  const doc = rows.find((r) => r.source === 'document')
  if (!doc) throw new Error(`no document row: ${JSON.stringify(rows)}`)
  if (!doc.url.includes('/documents/city-of-forsan/')) throw new Error(`url: ${doc.url}`)
  return doc.title
})

await check('UNAPPROVED minutes are not in the index', async () => {
  await addDoc('minutes')
  await db.query(
    `update public.meetings set minutes_status = 'pending_approval' where id = $1`, [meet.id])
  const rows = await indexed()
  const minutes = rows.filter((r) => r.url.includes('minutes'))
  if (minutes.length) throw new Error(`unapproved minutes indexed: ${minutes[0].url}`)
  return 'withheld'
})

await check('approving the minutes publishes them to the index', async () => {
  await db.query(
    `update public.meetings set minutes_status = 'approved' where id = $1`, [meet.id])
  const rows = await indexed()
  if (!rows.some((r) => r.url.includes('minutes'))) throw new Error('approved minutes missing')
  return 'indexed'
})

await check('un-approving the minutes withdraws them again', async () => {
  await db.query(
    `update public.meetings set minutes_status = 'pending_approval' where id = $1`, [meet.id])
  const rows = await indexed()
  if (rows.some((r) => r.url.includes('minutes'))) {
    throw new Error('minutes stayed searchable after being un-approved')
  }
  return 'withdrawn'
})

await check('turning on publish_pending_minutes reindexes the whole city', async () => {
  await db.query(
    `update public.municipalities
        set configuration = configuration || '{"publish_pending_minutes": true}'::jsonb
      where id = $1`, [muni.id])
  const on = await indexed()
  if (!on.some((r) => r.url.includes('minutes'))) {
    throw new Error('pending minutes not indexed after the setting was turned on')
  }
  await db.query(
    `update public.municipalities
        set configuration = configuration || '{"publish_pending_minutes": false}'::jsonb
      where id = $1`, [muni.id])
  const off = await indexed()
  if (off.some((r) => r.url.includes('minutes'))) {
    throw new Error('pending minutes stayed searchable after the setting was turned off')
  }
  return 'follows the setting both ways'
})

await check('retiring a document removes it from the index', async () => {
  const { rows: [doc] } = await db.query(
    `select id from public.meeting_documents
      where meeting_id = $1 and document_type = 'agenda' and active_version`, [meet.id])
  await db.query(
    `update public.meeting_documents set active_version = false, removed_at = now()
      where id = $1`, [doc.id])
  const rows = await indexed()
  if (rows.some((r) => r.url.includes('agenda'))) throw new Error('retired document still indexed')
  return 'removed'
})

await check('deleting a meeting clears everything indexed under it', async () => {
  await db.query(`delete from public.meetings where id = $1`, [meet.id])
  const rows = await indexed()
  if (rows.length) throw new Error(`orphans left: ${rows.map((r) => r.url).join(', ')}`)
  return 'cleaned up'
})

await db.close()
console.log(failed ? '\nFAILED' : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
