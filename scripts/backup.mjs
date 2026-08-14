/**
 * Backs up everything a restore actually needs: the database rows AND the PDF
 * files.
 *
 * This exists because the trap is easy to fall into. Supabase's automatic
 * database backups do not include Storage objects. Restoring the database
 * alone gives you a complete, correct index of documents that no longer
 * exist — which for a records office is worse than an obvious failure,
 * because everything looks fine until someone clicks a link.
 *
 *   npm run backup
 *   npm run backup -- --out /Volumes/CityBackups
 *
 * Needs only Node and the service role key. No Supabase CLI, no Docker.
 * Run it from a machine that has .env.local, or set the two variables inline.
 *
 * Every run writes a self-contained, dated folder. Each PDF is verified
 * against the SHA-256 recorded when it was uploaded, so a silently corrupted
 * or missing file is reported rather than quietly backed up as-is.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BUCKET = 'meeting-documents'

const TABLES = [
  'municipalities',
  'profiles',
  'meeting_categories',
  'meetings',
  'meeting_documents',
  'document_types',
  'role_permissions',
  'audit_log',
]

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

/** Reads .env.local without adding a dependency. */
async function loadEnv() {
  if (!existsSync('.env.local')) return
  const text = await readFile('.env.local', 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

await loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error(
    '\nMissing credentials.\n\n' +
      '  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,\n' +
      '  or run this from a folder containing .env.local.\n\n' +
      '  Both are in Supabase: Project Settings -> API.\n',
  )
  process.exit(1)
}

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const root = join(arg('out', 'backups'), `forsan-records-${stamp}`)
const docsDir = join(root, 'documents')

await mkdir(docsDir, { recursive: true })

const supabase = createClient(url, key, { auth: { persistSession: false } })

console.log(`\nBacking up to ${root}\n`)

// ---------------------------------------------------------------- database
const counts = {}
let dbFailed = false

for (const table of TABLES) {
  const rows = []
  let from = 0
  const page = 1000
  let pages = 0

  // Paginate: an audit log grows without bound and will exceed any single
  // request long before anything else does. The page cap is a guard against
  // a server that ignores the range and returns the same rows forever —
  // better to stop and say so than to spin silently.
  for (;;) {
    if (++pages > 1000) {
      console.log(`  ✗ ${table}: stopped after ${pages - 1} pages — server may be ignoring pagination`)
      dbFailed = true
      break
    }
    const { data, error } = await supabase.from(table).select('*').range(from, from + page - 1)
    if (error) {
      console.log(`  ✗ ${table}: ${error.message}`)
      dbFailed = true
      break
    }
    rows.push(...data)
    if (data.length < page) break
    from += page
    if (rows.length > 2_000_000) {
      console.log(`  ✗ ${table}: unexpectedly large, stopping`)
      dbFailed = true
      break
    }
  }

  counts[table] = rows.length
  await writeFile(join(root, `${table}.json`), JSON.stringify(rows, null, 2))
  console.log(`  ✓ ${table}: ${rows.length} rows`)
}

// ---------------------------------------------------------------- documents
console.log('')

const { data: documents, error: docError } = await supabase
  .from('meeting_documents')
  .select('id, storage_path, original_filename, sha256, file_size, version, active_version')

if (docError) {
  console.error(`Could not list documents: ${docError.message}`)
  process.exit(1)
}

const manifest = []
const problems = []
let bytes = 0

for (const doc of documents ?? []) {
  const { data: file, error } = await supabase.storage.from(BUCKET).download(doc.storage_path)

  if (error || !file) {
    problems.push({ id: doc.id, path: doc.storage_path, issue: 'missing from storage' })
    continue
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const sha = createHash('sha256').update(buffer).digest('hex')

  // Every superseded version is kept too. An accidental replacement is only
  // recoverable if the earlier file was backed up as well.
  const target = join(docsDir, doc.storage_path)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, buffer)

  bytes += buffer.length

  if (doc.sha256 && sha !== doc.sha256) {
    problems.push({ id: doc.id, path: doc.storage_path, issue: 'checksum mismatch' })
  }

  manifest.push({
    id: doc.id,
    storage_path: doc.storage_path,
    original_filename: doc.original_filename,
    version: doc.version,
    active_version: doc.active_version,
    bytes: buffer.length,
    sha256: sha,
    sha256_matches_database: doc.sha256 ? sha === doc.sha256 : null,
  })

  process.stdout.write(`\r  documents: ${manifest.length} of ${documents.length}`)
}

console.log('')

await writeFile(join(root, 'MANIFEST.json'), JSON.stringify(
  {
    created_at: new Date().toISOString(),
    supabase_url: url,
    table_row_counts: counts,
    document_count: manifest.length,
    total_document_bytes: bytes,
    problems,
    documents: manifest,
  },
  null,
  2,
))

await writeFile(join(root, 'README.txt'),
`City of Forsan — meeting records backup
Created ${new Date().toUTCString()}

WHAT IS IN HERE

  *.json           One file per database table, complete.
  documents/       Every PDF, current and superseded, in its storage path.
  MANIFEST.json    Every file with its size and SHA-256 checksum.

HOW TO CHECK THIS BACKUP IS GOOD

  Open MANIFEST.json and look at "problems". An empty list means every
  document was downloaded and every checksum matched what the database
  recorded at upload time.

HOW TO RESTORE

  See docs/BACKUP-RESTORE.md in the application repository.
  In short: restore the database first, then upload documents/ back into
  the meeting-documents bucket, preserving the folder structure exactly.
  The paths in documents/ are the storage paths — they must not change.

KEEP A COPY SOMEWHERE ELSE

  A backup stored only in the same account as the original protects
  against deletion, not against losing the account. Copy this folder to
  external storage, or to the city's records retention system.

  These files contain public records plus staff names and email
  addresses. Store accordingly.
`)

// ---------------------------------------------------------------- summary
const mb = (bytes / 1024 / 1024).toFixed(1)
console.log(`\n  ${manifest.length} documents, ${mb} MB`)

if (problems.length) {
  console.log(`\n  ⚠  ${problems.length} problem(s) — see MANIFEST.json:`)
  for (const p of problems.slice(0, 10)) console.log(`     ${p.issue}: ${p.path}`)
} else if (manifest.length) {
  console.log('  ✓ every document downloaded and every checksum matched')
}

console.log(`\nBackup written to ${root}`)
console.log('Copy it somewhere off this machine.\n')

process.exit(dbFailed || problems.length ? 1 : 0)
