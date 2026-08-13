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
