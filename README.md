# Local Government Agenda & Minutes Management System

A public-records system for municipalities: city councils, planning
commissions, boards of adjustment, and any other public body that must post an
agenda before a meeting and minutes after it.

A city secretary creates a meeting, uploads its agenda, publishes it, and comes
back later to add the minutes. Citizens get a searchable archive with permanent
PDF links that keep working after a document is replaced. Every change is
recorded in an audit log that nobody using the application can edit.

The public archive can be embedded directly into a GoHighLevel site, so a new
meeting appears on the city's website without anyone editing a page.

---

## What it does

**For the clerk**

- One Meeting record holds its agenda and its minutes; they cannot drift apart
- Upload, replace, and retire PDFs without losing earlier versions
- Separate approval track for minutes: Not Available → Draft → Pending Approval → Approved
- Draft meetings are invisible to the public until deliberately published
- Duplicate a recurring meeting instead of retyping it
- Editable meeting categories, no code change required

**For the public**

- Upcoming meetings, soonest first; past meetings, newest first; both update on their own
- Keyword, category, year, and date-range filtering that composes, and works with JavaScript disabled
- Permanent document URLs suitable for newsletters, public notices, QR codes, and search engines
- WCAG 2.2 AA as a design target, not an afterthought

**For whoever maintains it**

- Every schema change, RLS policy, and storage policy lives in a migration in this repository
- Row-Level Security is the security boundary; the interface only decides which buttons to draw
- Multi-tenant from the first table, so a second municipality is configuration rather than a rewrite

---

## Technology

| Layer | Choice |
| --- | --- |
| Application | Next.js 15 (App Router), React 19, TypeScript strict mode |
| Database, auth, storage | Supabase Pro — PostgreSQL, Supabase Auth, Supabase Storage, RLS |
| Styling | Tailwind CSS with a fixed token set, system fonts only |
| Validation | Zod, shared by the form, the API, and the tests |
| Tests | Vitest for units and RLS, Playwright + axe for accessibility |
| Source of truth | This repository. Migrations, not dashboard clicks. |

---

## Requirements

- Node.js 20.11 or newer
- npm 10 or newer
- Supabase CLI (`npm install -g supabase`)
- Docker Desktop, for the local Supabase stack
- A Supabase Pro project for production

---

## Local development

```bash
git clone https://github.com/<your-account>/local-government-records.git
cd local-government-records
npm install

cp .env.example .env.local        # then fill in the values below

supabase start                    # local Postgres, Auth, Storage
supabase db reset                 # applies every migration, then seed.sql
npm run dev                       # http://localhost:3000
```

`supabase start` prints the local API URL and keys. Put them in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_MUNICIPALITY=city-of-example
```

The seed creates a sample city and a local sign-in:
`clerk@example-city.gov` / `LocalDev!2026`.

Full production setup, step by step, is in **[docs/INSTALLATION.md](docs/INSTALLATION.md)**.

**No terminal?** **[docs/WEB-SETUP.md](docs/WEB-SETUP.md)** installs the whole
system from the Supabase dashboard — paste three SQL files, set five
environment variables, deploy. No CLI and no Docker required.

---

## Everyday commands

```bash
npm run dev            # development server
npm run build          # production build, including the embed widget
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest: validation, permissions parity, time zones, RLS
npm run test:e2e       # playwright + axe accessibility checks

npm run db:reset       # rebuild the local database from migrations + seed
npm run db:diff -- add_meeting_notes   # capture local changes as a new migration
npm run db:push        # apply pending migrations to the linked project
npm run db:types       # regenerate lib/supabase/database.types.ts

npm run build:setup-sql  # regenerate the dashboard install SQL from migrations
npm run validate:sql     # apply that SQL to a real Postgres and assert it
npm run release          # build dist/local-government-records-v<version>.zip
```

---

## Database migrations

The repository is authoritative. A schema change that exists only in the
Supabase dashboard will be lost the next time someone rebuilds the database.

```bash
supabase migration new add_meeting_notes   # create the file
# edit supabase/migrations/<timestamp>_add_meeting_notes.sql
supabase db reset                          # replay everything locally
npm test                                   # confirm nothing broke
git add supabase/migrations && git commit  # ship it with the code that needs it
supabase db push                           # apply to the linked project
```

CI replays every migration into a throwaway database on each pull request, so a
migration that cannot be applied from scratch fails before it reaches
production.

See **[docs/DATABASE.md](docs/DATABASE.md)** for the schema and
**[docs/SUPABASE.md](docs/SUPABASE.md)** for the CLI workflow.

---

## Folder structure

```
app/
  meetings/              Public archive and meeting detail pages
  documents/             Permanent public PDF URLs
  embed/                 Iframe fallback for the public archive
  admin/                 Administrative interface
  api/public/            Read-only public API
  api/admin/             Authenticated administrative API
components/
  public/   admin/   accessibility/
lib/
  supabase/              Browser, server, and service-role clients
  auth/                  Session and permission guards
  permissions/           Permission matrix, mirrored from the database
  validation/            Zod schemas, PDF checks, filename safety
  services/              Meeting and document operations
  data/                  Tenant resolution and public queries
  time/                  Municipal time zone handling
  documents/             Permanent URL construction
supabase/
  migrations/            The authoritative schema, RLS, and storage policies
  functions/             Edge Functions
  seed.sql               Local development data only
public/
  government-meetings.js The embeddable widget
docs/                    Installation, deployment, security, accessibility
tests/                   Unit, RLS, and accessibility tests
```

---

## Security

- Row-Level Security on every table; the public role can read only published records
- The storage bucket is private; PDFs are served through an application route that checks publication state first
- The service-role key is server-only and never reaches the browser
- Uploads are validated by signature and trailer, not by filename
- The audit log is append-only, enforced by a database trigger
- Permissions are checked in the interface, again on the server, and again by PostgreSQL

**[docs/SECURITY.md](docs/SECURITY.md)** covers the model and how to verify it.

---

## Accessibility

WCAG 2.2 Level AA is the design target. Automated axe checks run in CI; the
manual checklist that automation cannot cover is in
**[docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)**.

---

## GoHighLevel integration

```html
<div id="government-meetings"></div>
<script src="https://records.example-city.gov/government-meetings.js" defer></script>
<script>
  window.addEventListener('load', function () {
    GovernmentMeetings.init({
      municipality: "city-of-example",
      showUpcoming: true,
      showPast: true,
      meetingsPerPage: 20
    })
  })
</script>
```

**[docs/GHL-INTEGRATION.md](docs/GHL-INTEGRATION.md)** covers the widget, the
iframe fallback, and how staff reach the administration from GoHighLevel.

---

## Contributing and updating

1. Branch from `main`.
2. Commit database migrations alongside the code that needs them.
3. Run `npm run typecheck && npm run lint && npm test` before opening a pull request.
4. Never commit `.env.local`, service-role keys, or production credentials.
5. Write commit messages that say what changed and why.

`main` is production-ready at all times.

---

## Further documentation

| Document | Covers |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [WEB-SETUP.md](docs/WEB-SETUP.md) | Dashboard-only setup, no CLI required |
| [GOOGLE-SIGN-IN.md](docs/GOOGLE-SIGN-IN.md) | Signing in with Google instead of a password |
| [INSTALLATION.md](docs/INSTALLATION.md) | Complete setup, GitHub through production |
| [SUPABASE.md](docs/SUPABASE.md) | CLI workflow, project linking, storage, auth settings |
| [DATABASE.md](docs/DATABASE.md) | Schema, relationships, RLS policies, indexes |
| [GHL-INTEGRATION.md](docs/GHL-INTEGRATION.md) | Public widget and administrative access |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting, environment variables, releases |
| [BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md) | Backups, recovery, rollback |
| [SECURITY.md](docs/SECURITY.md) | Security model and verification |
| [ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | Conformance approach and testing |
