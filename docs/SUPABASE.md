# Supabase workflow

Supabase provides the database, authentication, and file storage. This
repository provides everything that describes them. If those two ever
disagree, the repository wins — a dashboard click that is not in a migration
disappears the next time someone rebuilds the database.

---

## CLI commands you will actually use

```bash
supabase login                              # authenticate this machine
supabase link --project-ref <ref>           # bind this repo to a project
supabase start                              # local Postgres, Auth, Storage (Docker)
supabase stop                               # shut the local stack down
supabase status                             # local URLs and keys
supabase db reset                           # replay all migrations + seed.sql locally
supabase migration new <name>               # create an empty migration file
supabase db diff -f <name>                  # capture local changes as a migration
supabase db push                            # apply pending migrations to the linked project
supabase db pull                            # import remote schema (recovery only, see below)
supabase gen types typescript --local       # regenerate TypeScript types
supabase functions deploy <name>            # deploy an Edge Function
supabase secrets set KEY=value              # set an Edge Function secret
```

---

## The normal change loop

```bash
supabase migration new add_meeting_notes
# edit supabase/migrations/<timestamp>_add_meeting_notes.sql
supabase db reset          # prove it applies from scratch
npm run db:types           # refresh lib/supabase/database.types.ts
npm test                   # prove nothing broke
git add supabase/migrations lib/supabase/database.types.ts
git commit -m "Add meeting notes field"
supabase db push           # apply to the linked project
```

Two habits matter more than the rest:

- **Migrations ship in the same commit as the code that needs them.** A deploy that lands code without its migration produces errors nobody can explain.
- **`supabase db reset` before every push.** It is the only way to know a migration works on an empty database, which is exactly what a restore does.

## When you already changed something in the dashboard

It happens. Recover rather than leave it undocumented:

```bash
supabase db diff -f describe_dashboard_change
```

Read the generated file, confirm it matches what you did, and commit it. Now
the change exists in the repository and will survive a rebuild.

`supabase db pull` regenerates the whole schema as one migration. Reserve it
for genuine recovery — it collapses history into a single file.

---

## Project settings that are not in migrations

A few things live only in the dashboard because Supabase does not expose them
to the CLI. Set them once, and record that you did.

**Authentication → Providers → Email**
- Email sign-in: on
- Public sign-ups: **off** (accounts are created by administrators)
- Confirm email: on

**Authentication → URL Configuration**
- Site URL: the production URL
- Redirect URLs: `https://<domain>/auth/callback`, plus `http://localhost:3000/auth/callback` for development

**Authentication → Multi-Factor**
- TOTP enrolment: recommended for anyone holding `admin` or `super_admin`

**Database → Backups**
- Confirm daily backups; enable Point-in-Time Recovery if the retention policy calls for it

---

## Storage

One bucket, `meeting-documents`, private, created by migration 0500 with a
50 MB hard ceiling and `application/pdf` as the only accepted type. The
application enforces a lower, per-municipality limit on top of that.

```
municipalities/{municipality_id}/meetings/{meeting_id}/agendas/v1-<random>.pdf
municipalities/{municipality_id}/meetings/{meeting_id}/minutes/v2-<random>.pdf
```

The tenant id is the second path segment, which is what the storage policies
key on. Object names carry a random token so they cannot be guessed, but that
is a convenience, not the control — the control is that the bucket is private
and no anonymous policy exists.

Public delivery goes through `/documents/{municipality}/{slug}.pdf`, which
checks publication state and only then streams the object with the service
role. That is what makes the links permanent: no signed URL is ever handed to
a browser, so nothing expires.

---

## Keys

| Key | Where it belongs | What it does |
| --- | --- | --- |
| `anon` / publishable | Browser, server, widget | Subject to every RLS policy. Public by design. |
| `service_role` | Server environment only | Bypasses every RLS policy. Treat as a root password. |
| CLI access token | Your machine, CI secrets | Runs migrations. Never in the repository. |

If a `service_role` key is ever committed, pasted into a support ticket, or
sent over chat: rotate it in **Project Settings → API → Rotate**, update every
deployment, and redeploy. Assume the old one is compromised.

---

## Local stack

```bash
supabase start
supabase status        # copy the anon and service_role keys into .env.local
supabase db reset      # migrations + seed.sql
```

`supabase/seed.sql` runs only on reset and only locally. It creates a sample
city, categories, two meetings, and a sign-in of `clerk@example-city.gov` /
`LocalDev!2026`. It is never applied to production; production starts through
`npm run bootstrap:tenant`.

Studio runs at http://127.0.0.1:54323 for poking at the local database.
