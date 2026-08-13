import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The release version appears in three places that must agree: package.json,
 * CHANGELOG.md, and the schema_version migration. If they drift, a database
 * reports a version the code does not match, which makes every subsequent
 * "which version are you running?" answer misleading.
 */
const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')

const migrationsDir = join(root, 'supabase/migrations')
const versionMigration = readdirSync(migrationsDir).find((f) => f.includes('schema_version'))
const migrationSql = readFileSync(join(migrationsDir, versionMigration!), 'utf8')

describe('release version', () => {
  it('uses semantic versioning', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('matches the version recorded in the schema_version migration', () => {
    const recorded = migrationSql.match(/values \('(\d+\.\d+\.\d+)'/)?.[1]
    expect(recorded).toBe(pkg.version)
  })

  it('has a changelog entry for the current version', () => {
    expect(changelog).toContain(`## [${pkg.version}]`)
  })

  it('lists the current version first in the changelog', () => {
    const firstEntry = changelog.match(/## \[(\d+\.\d+\.\d+)\]/)?.[1]
    expect(firstEntry).toBe(pkg.version)
  })

  it('dates every changelog entry', () => {
    const headings = [...changelog.matchAll(/## \[\d+\.\d+\.\d+\] - (.+)/g)]
    expect(headings.length).toBeGreaterThan(0)
    for (const heading of headings) {
      expect(heading[1]?.trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('keeps the generated setup SQL in step with the migrations', () => {
    const setup = readFileSync(join(root, 'supabase/setup/01-complete-schema.sql'), 'utf8')
    const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))

    // Every migration must appear in the concatenated file. A missing one means
    // someone edited a migration and forgot `npm run build:setup-sql`, so a
    // dashboard install would silently get an older schema than a CLI install.
    for (const name of migrations) {
      expect(setup, `${name} missing from generated setup SQL`).toContain(`BEGIN ${name}`)
    }
  })
})
