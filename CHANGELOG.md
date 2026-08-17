# Changelog

Every notable change to this system, newest first.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning is [Semantic Versioning](https://semver.org/):

- **Major** — a breaking change. Published document URLs change, a migration is not reversible, or manual intervention is required on upgrade.
- **Minor** — new capability, backward compatible.
- **Patch** — fixes and corrections, no new capability.

The version is recorded in the database itself. To see what a project is
running, query `select * from public.schema_version order by applied_at desc`,
or run `supabase/setup/03-verify.sql`.

---

## [1.8.1] - 2026-08-18

**No database changes.** The new setting lives in the existing `configuration`
JSON column and defaults to empty.

### Added

- **Default meeting location**, at Admin → Settings → Municipality, directly beneath Contact phone. It fills in the location field when a new meeting is created, so the usual meeting place does not have to be retyped every time.

  It applies only on creation. Editing an existing meeting never overwrites the location a clerk entered — including one they deliberately cleared — and the field remains editable on every meeting, so a special meeting held elsewhere is still straightforward.

### Changed

- The weekly backup workflow now passes `--keep 52` when uploading to Google Drive, retaining one year of weekly archives and pruning older ones. These are disaster-recovery copies; the permanent public record lives in the archive itself and is never pruned by this.

---

## [1.8.0] - 2026-08-14

**No database changes.**

### Added

- **Automatic weekly backups** via `.github/workflows/backup.yml`. Runs the full backup every Monday, keeps the archive as a workflow artifact for 90 days, and can be triggered on demand before a migration. A failed checksum or missing document fails the run, so GitHub emails the repository owner rather than the problem going unnoticed.
- **`scripts/upload-drive.mjs`** — copies a backup into a Google Drive folder using a service account. No SDK: it signs its own JWT with `node:crypto` and calls the REST API directly, keeping the dependency surface small. Supports `--keep N` to prune older archives, off by default.
- Setup instructions for both in `docs/BACKUP-RESTORE.md`, including why the target must be a Shared Drive rather than a folder in My Drive — service accounts have no storage quota of their own, and a Shared Drive outlives the person who set it up.

### Notes

The Drive step is skipped when its secrets are absent, so the workflow is
useful immediately and Drive can be added later.

**No database changes.**

### Changed

- **Public API cache shortened** from `s-maxage=300, stale-while-revalidate=600` to `s-maxage=60, stale-while-revalidate=120`, and the browser cache from 60 seconds to zero.

  A newly published meeting could previously take up to 15 minutes to appear in the embedded widget. The server-rendered archive revalidates every 60 seconds, so the two surfaces disagreed with each other — the meeting was visible on the records site but missing from the city's own page, with nothing to indicate why.

  A municipal archive serves very little traffic. Freshness is worth more than cache efficiency here.

---

## [1.7.1] - 2026-08-14

**No database changes.**

### Fixed

- **The public archive declared three different names for itself.** The `<h1>` used the configured archive heading, but the site-wide title template appended the city name (`Meeting Agendas and Minutes | City of Forsan, TX`) and `og:site_name` was the city name alone.

  Google's OAuth branding review compares the configured app name against the name the home page declares, and machine-readable metadata is the obvious place to look. All three are now pinned to the archive heading on that page, and `application-name` is set to match. The city name still appears in the eyebrow above the heading and throughout the footer.

- The layout's fallback title still contained a literal ampersand, which would have reappeared for any municipality that never set an archive heading.

---

## [1.7.0] - 2026-08-14

**No database changes.**

### Added

- **`npm run backup`** — captures the database and the PDFs together, in one command, with no Supabase CLI and no Docker. Writes a dated, self-contained folder: one JSON file per table, every document in its exact storage path, and a manifest.

  It verifies as it goes: each PDF is checked against the SHA-256 recorded at upload, missing or corrupted files are listed in the manifest, and the command exits non-zero so a scheduled run fails loudly instead of producing a quietly incomplete backup. Superseded document versions are included, since an accidental replacement is only recoverable if the file it replaced was kept.

### Changed

- `docs/BACKUP-RESTORE.md` replaces the CLI-based storage backup with the above, and adds a full rebuild-from-scratch restore procedure — including recreating auth logins, which live outside the application schema and are not in any backup.

### Notes

Supabase's automatic database backups do not include Storage objects.
Restoring the database alone yields a complete, correct index of documents
that no longer exist — which is worse than an obvious failure, because
everything looks fine until someone clicks a link. This closes that gap.

---

## [1.6.0] - 2026-08-13

**No database changes.**

### Added

- **A privacy policy at `/privacy`**, served by the application on the same domain as the public archive. It states that reading records requires no account and collects nothing; that staff sign-in with Google receives only the name and email address on the account and nothing else; what those are used for; how they are stored; and that they are never sold or shared. It also covers the change history, retention, and how to ask questions.

### Changed

- The public footer links this policy first, with the city's own website privacy policy alongside it when set.
- The Settings help text for **Privacy policy URL** now explains that the field is for the city's general website policy, not this system's.

### Notes

Google's OAuth branding review requires the privacy policy to be hosted on the
domain that hosts the application home page, to be linked from that home page,
and to disclose specifically how the app handles Google user data. A city's
general website policy satisfies none of those reliably — it lives on a
different host, and it was written about a different system.

After deploying, set the consent screen's privacy policy link to
`https://<your-domain>/privacy` so it matches the link in the footer.

---

## [1.5.0] - 2026-08-13

**No database changes.** The two new settings live in the existing
`configuration` JSON column and default to empty.

### Added

- **Privacy policy and Terms of use links** in the public footer, set at Admin → Settings. Google's OAuth branding review requires the application home page to link to the privacy policy, with the link matching the consent screen configuration.
- **A plain statement of what staff sign-in collects**, in the public footer: that no account is needed to read anything, and that when Google is used the site receives only the name and email address on that account, used solely to identify who made each change. Google requires the home page to explain the purpose for which user data is requested; a citizen also deserves to know that reading public records is not tracked.
- `docs/GOOGLE-SIGN-IN.md` now documents the branding-verification requirements, including the two that are easy to miss.

---

## [1.4.1] - 2026-08-13

**Requires a database update.** Re-run `supabase/setup/01-complete-schema.sql`
in the SQL Editor. It is idempotent and safe to paste over an existing install.

### Fixed

- **Uploading minutes failed with "The document could not be recorded against this meeting."** In PostgreSQL, `text[] || 'literal'` is ambiguous: it resolves to `array || array` and then fails with *malformed array literal*. Five places in `audit_row_change()` appended an audit action that way, so **every status transition that wrote an audit entry was broken** — publishing, archiving, restoring, minutes-status changes, role changes, and enabling or disabling an account.

  The minutes upload surfaced it because that path fires a trigger that updates the meeting, three calls deep, and the resulting error reached the clerk as a generic save failure. Every appended action is now explicitly cast to `::text`, with a comment at the site so it is not reintroduced.

### Added

- `npm run validate:audit` — applies the schema to a real PostgreSQL engine, then exercises uploads, replacements, and every status transition as the `authenticated` role with RLS active, asserting each writes its audit entry. This bug was invisible to unit tests because it only appeared through trigger execution under a real engine.

  It also asserts that document replacement preserves the public slug, and that an `admin` cannot promote anyone to `super_admin`.

---

## [1.4.0] - 2026-08-13

**No database changes.** The new setting lives in the existing `configuration`
JSON column and defaults sensibly, so nothing needs updating for existing
municipalities.

### Added

- **`archive_about`** — a purpose statement shown under the heading on the public archive, editable at Admin → Settings → *About this archive*. Defaults to text explaining that the site is the city's official record of public meetings, that everything on it is free to read and share, and that no account is needed to read it.

### Changed

- The public archive's introductory paragraph now comes from that setting rather than being fixed in code. The previous text described the documents; the new default describes the system, which is what a first-time visitor needs.

### Notes

Written partly because Google's OAuth branding review requires an application
home page that explains the app's purpose. It is worth having regardless — a
citizen landing on a bare list of meetings should not have to infer what the
site is.

---

## [1.3.1] - 2026-08-13

**No database changes.**

### Added

- Vendor attribution and build version in the footer of the public archive, meeting detail pages, and the administration. The version is shown so a bug report can name the build without anyone having to dig for it.

### Notes

The notice is scoped to the software rather than the records: meeting agendas
and minutes are public documents of the municipality and are not the vendor's
copyright. Wording matters here — a bare copyright line over a page of public
minutes invites a public-information complaint.

---

## [1.3.0] - 2026-08-13

**No database changes.** Nothing to re-paste in the SQL Editor; the schema
stays at 1.2.0.

### Added

- **Google sign-in.** Staff can authenticate with their Google account instead of a separate password. Password sign-in remains available and should not be removed — it is the fallback when Google is unreachable.
- `docs/GOOGLE-SIGN-IN.md`, covering setup and the access model.

### Changed

- `/auth/callback` now confirms an active `profiles` row before completing any sign-in, and signs the session out if there is none. Google will authenticate any Google account in existence, so authentication had to be separated from authorisation explicitly. Previously an unknown account would have been bounced from `/admin` with no explanation.
- The sign-in page reports why a redirect happened — an unrecognised account, or an expired link — rather than silently re-rendering the form.

### Notes

Enabling Google does not widen access. Access still requires a profile created
by an administrator, enforced in the callback and again by Row-Level Security.
The email on the profile must match the Google account exactly.

---

## [1.2.0] - 2026-08-13

### Added

- `supabase/setup/04-add-user.sql` — adds staff without touching municipality settings. Reports whether the person was added, had their role changed, or was already set, and lists everyone with access afterwards.
- `public.schema_version` table recording which release created or last updated the database. A dashboard install has no CLI migration ledger, so without this there is no way to answer "which version is this project running?" without reading the schema by hand.
- `CHANGELOG.md`, and this versioning scheme.
- `npm run release` — builds a versioned distribution zip.
- `tests/version.test.ts` — fails the build if `package.json`, the changelog, and the schema version disagree, or if the generated setup SQL is missing a migration.

### Changed

- `03-verify.sql` now reports the installed version first, and checks nine tables and 33 policies.

### Notes

Existing installs: paste `01-complete-schema.sql` again. It is idempotent, and
adds only the version table.

---

## [1.1.0] - 2026-08-13

### Added

- **Dashboard-only setup path.** The system can now be installed entirely from the Supabase web interface, with no CLI and no Docker: `docs/WEB-SETUP.md` plus three SQL files in `supabase/setup/`.
- `scripts/build-setup-sql.mjs` generates the paste-once schema file from the migrations, so the dashboard and CLI paths cannot diverge.
- `scripts/validate-setup-sql.mjs` applies the setup SQL to a real PostgreSQL engine with Supabase's `auth` and `storage` objects stubbed in, and asserts tables, RLS, policy counts, bucket privacy, and audit-log immutability.

### Fixed

- **All 32 policies and 17 triggers are now idempotent.** They previously failed with "already exists" on a second run. This mattered because a dashboard user who hits an error mid-paste will naturally re-run the whole file, and had no way forward. Caught by the new validation harness.
- The storage helper function moved from the `storage` schema to `public`, avoiding a permission error when created from the dashboard SQL Editor.

---

## [1.0.1] - 2026-08-13

### Fixed

- **Production build failed on Vercel.** `@supabase/ssr` 0.5.2 forwards generic type parameters positionally to `supabase-js`, and 2.112 changed that signature. The schema landed in the wrong slot and resolved to `never`, so every query in the codebase inferred `never` rows — surfacing as `Property 'id' does not exist on type 'never'` in whichever file the type checker reached first. Pinned `@supabase/ssr` to `^0.12.4`.
- Row types in `database.types.ts` changed from `interface` to `type` alias. Interfaces have no implicit index signature and so fail postgrest-js's `Record<string, unknown>` constraint.
- Added the `Relationships` key required on every table and view.
- Declared the three operation RPCs (`upsert_meeting_document`, `duplicate_meeting`, `retire_meeting_document`), removing `as never` casts that were masking the missing declarations.
- `crypto.subtle.digest` now receives a definitely-unshared buffer; TypeScript 5.7 made typed arrays generic over their backing buffer.
- Query-string values are narrowed before use as enum filters, so `?status=junk` is ignored rather than filtering to an empty archive.
- `supabase/functions` excluded from the Next.js type check — it is Deno code.

### Notes

The version-skew trap is documented in `docs/DEPLOYMENT.md`, because it will
recur on any future dependency bump and the error message points nowhere near
the cause.

---

## [1.0.0] - 2026-08-13

Initial release.

### Added

- Multi-tenant PostgreSQL schema with Row-Level Security on every table, meetings as the primary record, and agenda/minutes as versioned child documents.
- Automatic upcoming/past classification from a `timestamptz` maintained in the municipality's own time zone, so meetings move between sections without anyone dragging them.
- Document versioning that preserves the public URL across replacements, so links printed in public notices keep working.
- Append-only audit log written by database triggers, with semantic action names.
- Four-role permission matrix stored in the database and mirrored in TypeScript, with a parity test preventing drift.
- Private storage bucket; public PDFs served through an application route that authorizes first and returns 404 rather than 403 for non-public documents.
- Upload validation by file signature and trailer, rejecting embedded JavaScript and launch actions.
- Public archive with filtering that works without JavaScript, and meeting detail pages with structured data.
- Administrative interface: dashboard, meetings, documents with version history, categories, users, audit, settings.
- Embeddable GoHighLevel widget rendering in a shadow root with no dependencies and no external fonts.
- WCAG 2.2 AA as the design target, with axe accessibility tests.
- Documentation: installation, Supabase workflow, database, GoHighLevel integration, deployment, backup and restore, security, accessibility.

### Known issue

Did not build on Vercel. Fixed in 1.0.1.
