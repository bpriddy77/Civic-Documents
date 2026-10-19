import { execSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Catches the duplicate files an extract-over-the-top creates.
 *
 * Releases arrive as a zip. Unpacked over an existing checkout, Finder and
 * several unzip tools do not replace a file that is already there — they keep
 * both, naming the newcomer "core_schema 2.sql". Committed, that leaves two
 * copies of the same migration: the old one still the one being applied, the
 * new one applied straight after it.
 *
 * The failure that follows is nothing like its cause. A duplicated migration
 * runs its whole file twice, and the first visible sign is some unrelated
 * constraint violation during a database reset. This test names the real
 * problem instead.
 *
 * Only release-relevant directories are checked, so a file a person
 * deliberately called "notes 2.md" somewhere else is their business.
 */

const root = process.cwd()
const DUPLICATE = / \d+\.[A-Za-z0-9]+$/
const WATCHED = ['supabase/migrations', 'supabase/setup', 'scripts', 'lib', 'app', 'components', 'tests']

function walk(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, found)
    else if (DUPLICATE.test(entry.name)) found.push(path)
  }
  return found
}

describe('no duplicate files from unzipping over a checkout', () => {
  it('has no "name 2.ext" copies in the directories that ship', () => {
    const duplicates = WATCHED.flatMap((dir) => walk(join(root, dir)))
    if (duplicates.length) {
      throw new Error(
        `Found ${duplicates.length} duplicate file(s) left by unzipping a release over an ` +
          `existing checkout:\n\n` +
          duplicates.map((f) => `  ${f.replace(`${root}/`, '')}`).join('\n') +
          `\n\nThese are copies, not new work. A duplicated migration is applied twice and ` +
          `fails later in a way that looks unrelated.\n\nRemove them:\n\n` +
          `  git ls-files -z | grep -zE ' [0-9]+\\.[a-z]+$' | xargs -0 git rm\n\n` +
          `To avoid it next time, delete the old directory before unpacking, or unzip ` +
          `with -o to overwrite.`,
      )
    }
    expect(duplicates).toEqual([])
  })

  it('does not flag ordinary filenames that contain digits', () => {
    // The pattern needs a space before the number, so none of these match.
    const safe = [
      '20260101000100_core_schema.sql', 'city-alert.js', 'page.tsx',
      'v1.11.0.md', 'report-2.pdf', 'Chapter 2.md'.replace(' 2', '-2'),
    ]
    for (const name of safe) expect(DUPLICATE.test(name)).toBe(false)
  })

  it('does flag the shapes these tools actually produce', () => {
    for (const name of ['core_schema 2.sql', 'page 3.tsx', 'README 2.md']) {
      expect(DUPLICATE.test(name)).toBe(true)
    }
  })
})

describe('migration filenames', () => {
  /**
   * Two migrations sharing a timestamp prefix is the other way this goes
   * wrong — they apply in an order that depends on how the directory is read.
   */
  it('has one migration per timestamp', () => {
    const dir = join(root, 'supabase/migrations')
    const prefixes = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.split('_')[0])
    const seen = new Set<string>()
    const repeated = prefixes.filter((p) => (seen.has(p!) ? true : (seen.add(p!), false)))
    expect(repeated).toEqual([])
  })

  it('names every migration in the expected form', () => {
    const dir = join(root, 'supabase/migrations')
    for (const file of readdirSync(dir)) {
      expect(file, `${file} is not a <timestamp>_<name>.sql migration`)
        .toMatch(/^\d{14}_[a-z0-9_]+\.sql$/)
    }
  })
})

describe('git tracked files', () => {
  it('tracks no duplicate copies anywhere in the repository', () => {
    let tracked: string[]
    try {
      tracked = execSync('git ls-files', {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).split('\n')
    } catch {
      return // not a git checkout (a release zip, say) — the walk above covers it
    }
    const duplicates = tracked.filter((f) => DUPLICATE.test(f))
    expect(duplicates, `git is tracking duplicate copies:\n${duplicates.join('\n')}`).toEqual([])
  })
})
