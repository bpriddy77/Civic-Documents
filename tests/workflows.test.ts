import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the GitHub Actions workflows against a regression that has already
 * happened once.
 *
 * `supabase-js` needs Node 22 or later for the native WebSocket API; on Node 20
 * it throws at `createClient()` before any query runs. The scheduled backup was
 * fixed by hand in the repository, but subsequent releases were built from an
 * older tree and silently reverted it — so the weekly backup failed every time
 * a release was pushed, with no sign of it except an email nobody was reading.
 *
 * These assertions are cheap and they fail loudly in CI, which is the point.
 */
const root = process.cwd()
const workflowDir = join(root, '.github/workflows')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const workflows = readdirSync(workflowDir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => [f, readFileSync(join(workflowDir, f), 'utf8')] as const)

/** Minimum Node the project declares it needs. */
function requiredMajor(): number {
  const match = /(\d+)/.exec(pkg.engines?.node ?? '')
  return match ? Number(match[1]) : 0
}

describe('GitHub Actions workflows', () => {
  it('declares a Node engine requirement', () => {
    expect(pkg.engines?.node).toBeTruthy()
    expect(requiredMajor()).toBeGreaterThanOrEqual(22)
  })

  it('finds at least the backup and CI workflows', () => {
    const names = workflows.map(([f]) => f)
    expect(names).toContain('backup.yml')
    expect(names).toContain('ci.yml')
  })

  it.each(workflows.map(([f]) => f))(
    '%s pins a Node version that satisfies package.json engines',
    (name) => {
      const [, content] = workflows.find(([f]) => f === name)!
      const pinned = [...content.matchAll(/node-version:\s*'?(\d+)/g)].map((m) => Number(m[1]))

      expect(pinned.length, `${name} sets no node-version`).toBeGreaterThan(0)
      for (const version of pinned) {
        expect(
          version,
          `${name} pins Node ${version}, but package.json requires >= ${requiredMajor()}`,
        ).toBeGreaterThanOrEqual(requiredMajor())
      }
    },
  )

  it('the backup workflow tolerates an out-of-sync lockfile', () => {
    const [, backup] = workflows.find(([f]) => f === 'backup.yml')!
    // A version bump committed without refreshing package-lock.json makes
    // `npm ci` fail outright. A scheduled backup should still run.
    expect(backup).toMatch(/npm ci \|\| npm install/)
  })

  it('the backup workflow still uploads an artifact', () => {
    const [, backup] = workflows.find(([f]) => f === 'backup.yml')!
    expect(backup).toContain('actions/upload-artifact')
  })
})
