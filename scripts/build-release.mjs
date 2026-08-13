/**
 * Builds a versioned distribution archive.
 *
 *   npm run release
 *   -> dist/local-government-records-v1.2.0.zip
 *
 * Refuses to run if the version is not consistent across package.json, the
 * changelog, and the schema_version migration — shipping a zip whose name
 * disagrees with the version the database will report is worse than not
 * shipping one, because the mismatch is invisible until someone is debugging.
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = pkg.version

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`package.json version "${version}" is not semantic versioning.`)
}

const changelog = readFileSync('CHANGELOG.md', 'utf8')
if (!changelog.includes(`## [${version}]`)) {
  fail(`CHANGELOG.md has no entry for ${version}. Add one before releasing.`)
}

const migrationsDir = 'supabase/migrations'
const versionFile = readdirSync(migrationsDir).find((f) => f.includes('schema_version'))
const recorded = readFileSync(join(migrationsDir, versionFile), 'utf8').match(
  /values \('(\d+\.\d+\.\d+)'/,
)?.[1]

if (recorded !== version) {
  fail(
    `Version mismatch: package.json says ${version}, ${versionFile} says ${recorded}.\n` +
      `  The database would report a different version than the code.`,
  )
}

// The generated setup SQL must include every migration, or a dashboard install
// silently gets an older schema than a CLI install.
const setup = readFileSync('supabase/setup/01-complete-schema.sql', 'utf8')
for (const name of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
  if (!setup.includes(`BEGIN ${name}`)) {
    fail(`${name} is missing from the generated setup SQL. Run: npm run build:setup-sql`)
  }
}

const name = `local-government-records-v${version}`
const dist = 'dist'
mkdirSync(dist, { recursive: true })

const archive = join(dist, `${name}.zip`)
if (existsSync(archive)) rmSync(archive)

// Exclude everything that is rebuilt, secret, or machine-specific.
const excludes = [
  'node_modules/*',
  '.next/*',
  'dist/*',
  '.git/*',
  '.env.local',
  '.env*.local',
  '*.tsbuildinfo',
  'public/government-meetings.min.js',
  'public/government-meetings.src.js',
  'test-results/*',
  'playwright-report/*',
]

execSync(
  `zip -rq "${archive}" . ${excludes.map((pattern) => `-x "${pattern}"`).join(' ')}`,
  { stdio: 'inherit' },
)

const size = (readFileSync(archive).length / 1024).toFixed(0)
console.log(`\n✓ ${archive}  (${size} KB)`)
console.log(`  Version ${version} — consistent across package.json, changelog, and schema.`)
