# Installation

Everything from an empty GitHub account to a live public archive embedded in a
GoHighLevel site. Written for someone comfortable with a terminal who has not
seen this system before. Nothing here is automatic; every step says where to go
and what to enter.

Budget about two hours the first time.

> **Prefer not to install a toolchain?** [WEB-SETUP.md](WEB-SETUP.md) does the
> whole database setup from the Supabase dashboard instead — three SQL files
> pasted into the SQL Editor, no CLI and no Docker. Come back here when you
> want the migration workflow for ongoing changes.

---

## Before you start

| You need | Where to get it |
| --- | --- |
| Node.js 20.11+ | https://nodejs.org — `node -v` to confirm |
| npm 10+ | Ships with Node — `npm -v` |
| Git | https://git-scm.com — `git --version` |
| Docker Desktop | https://docker.com — only for local development |
| Supabase CLI | `npm install -g supabase` |
| A GitHub account | https://github.com |
| A Supabase Pro project | https://supabase.com |
| A hosting account | Vercel, Netlify, Fly.io, or your own server |

---

## 1. Create the GitHub repository

On GitHub: **New repository** → name it `local-government-records` → set it
**Private** → do not add a README (this project has one) → **Create**.

## 2. Push this project to it

```bash
cd local-government-records
git init
git add .
git commit -m "Initial commit: agenda and minutes management system"
git branch -M main
git remote add origin https://github.com/<your-account>/local-government-records.git
git push -u origin main
```

## 3. Clone it on the machine you will work from

```bash
git clone https://github.com/<your-account>/local-government-records.git
cd local-government-records
```

## 4. Confirm your tooling

```bash
node -v          # v20.11.0 or higher
npm -v           # 10 or higher
supabase --version
docker info      # should not error, if you want a local database
```

## 5. Install dependencies

```bash
npm install
```

## 6. Sign in to the Supabase CLI

```bash
supabase login
```

A browser opens; approve the request. This stores an access token on your
machine. Do not put that token in the repository.

## 7. Create the Supabase project

In the Supabase dashboard: **New project**.

- **Name**: `city-of-example-records`
- **Database password**: generate a strong one and store it in your password manager. You need it in step 10 and you cannot retrieve it later.
- **Region**: closest to the municipality
- **Plan**: Pro

Wait for provisioning to finish (a minute or two).

## 8. Find the project reference

**Project Settings → General → Reference ID**. It looks like
`abcdefghijklmnopqrst`. Copy it.

## 9. Link the repository to the project

```bash
supabase link --project-ref <your-project-ref>
```

Enter the database password from step 7 when prompted.

## 10. Set the environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` from **Project Settings → API**:

| Variable | Value | Visible to the browser? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Yes, by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key | Yes, by design |
| `NEXT_PUBLIC_SITE_URL` | Your final public URL, no trailing slash | Yes |
| `NEXT_PUBLIC_DEFAULT_MUNICIPALITY` | The slug you choose in step 16 | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret | **Never** |
| `MAX_UPLOAD_MB` | `25` | No |
| `PUBLIC_API_RATE_LIMIT` | `120` | No |

The `anon` key is meant to be public: Row-Level Security is what protects the
data. The `service_role` key bypasses every policy in the database. It belongs
in `.env.local` and in your host's secret store, nowhere else. `.env.local` is
already in `.gitignore`.

## 11. Review the migrations

```bash
ls supabase/migrations
```

You should see, in order: core schema, functions and triggers, audit, RLS
policies, storage, reference data, operations. They apply in filename order.

## 12. Apply the schema to production

```bash
supabase db push
```

Confirm in **Table Editor** that `municipalities`, `profiles`, `meetings`,
`meeting_documents`, `meeting_categories`, `audit_log`, `role_permissions`,
and `document_types` now exist.

## 13. Verify Row-Level Security is on

**Authentication → Policies**. Every table above must show **RLS enabled**.
Migration `20260101000400_rls_policies.sql` does this; if a table shows RLS
disabled, the migration did not fully apply — re-run `supabase db push` and
read the output rather than enabling it by hand, because a manual change is
not reproducible.

## 14. Confirm the storage bucket

**Storage**. There must be a bucket named `meeting-documents`, marked
**Private**. It is created by `20260101000500_storage.sql`.

If it is missing: **New bucket** → name `meeting-documents` → **Public
bucket: off** → **Create**, then re-run `supabase db push` so the policies
attach.

## 15. Confirm the storage policies

**Storage → meeting-documents → Policies**. Four policies should be listed,
each scoped to a municipality folder. There must be **no policy granting the
`anon` role access**. Public PDFs are served by the application, which checks
publication state first — see `app/documents/[municipality]/[slug]/route.ts`.

## 16. Configure authentication

**Authentication → Providers → Email**:

- Enable email sign-in
- **Disable public sign-ups** — accounts are created by administrators
- Enable **Confirm email**

**Authentication → URL Configuration**:

- **Site URL**: your production URL
- **Redirect URLs**: add `https://your-domain/auth/callback` and, for local work, `http://localhost:3000/auth/callback`

Optional but recommended: **Authentication → Multi-Factor** → enable TOTP.

## 17. Create the municipality and the first administrator

```bash
npm run bootstrap:tenant -- \
  --name "City of Example" \
  --slug city-of-example \
  --timezone America/Chicago \
  --admin-email cityclerk@example-city.gov \
  --admin-name "Jane Clerk" \
  --role super_admin
```

This creates the municipality, its eight starter categories, and an invitation
email. The administrator sets their own password from the link — no password
is ever typed into a terminal or stored in the repository.

Set `NEXT_PUBLIC_DEFAULT_MUNICIPALITY` in `.env.local` to the slug you used.

## 18. Run it locally

```bash
npm run dev
```

Open http://localhost:3000/meetings. You should see the archive with the
municipality's name and no meetings yet.

## 19. Test the workflow end to end

1. Go to `/admin` and sign in.
2. **Create meeting** → title, category, a date next week, 6:00 PM, location.
3. Save. Upload an agenda PDF and enter its posted date.
4. Set the status to **Published** and save.
5. Open `/meetings`. The meeting appears under **Upcoming meetings**.
6. Open the agenda link. It opens the PDF at a permanent URL.
7. Try uploading a `.docx` renamed to `.pdf`. It is refused.
8. Sign out and open `/admin`. You are redirected to sign in.

## 20. Run the automated checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e     # requires the dev server; runs axe accessibility checks
```

## 21. Commit your configuration changes

```bash
git add .
git commit -m "Configure municipality and environment"
```

`.env.local` will not be included — check with `git status` that it is absent.

## 22. Push to GitHub

```bash
git push origin main
```

## 23. Deploy to production

Using Vercel as the example:

1. **Add New → Project** → import the GitHub repository
2. Framework preset: **Next.js** (detected automatically)
3. Build command: `npm run build`
4. Deploy

Other hosts work the same way; anything that runs a Node.js Next.js server is
fine. Static export is not, because the document route needs a server.

## 24. Set production environment variables

In your host's dashboard, add every variable from step 10, with
`NEXT_PUBLIC_SITE_URL` set to the real production URL. Mark
`SUPABASE_SERVICE_ROLE_KEY` as a secret. Redeploy so the values take effect.

## 25. Point production at Supabase

Nothing further to do — the variables from step 24 are the connection. Confirm
by opening `https://your-domain/meetings`; the meeting created in step 19
should appear.

Then go back to **Authentication → URL Configuration** in Supabase and make
sure the production domain is the Site URL and is in the redirect list.

## 26. Install the GoHighLevel public widget

In GoHighLevel: **Sites → Pages →** the page that should hold the archive →
add a **Custom Code / HTML** element → paste:

```html
<div id="government-meetings"></div>
<script src="https://your-domain/government-meetings.js" defer></script>
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

Save and publish. The exact snippet for your municipality is also shown in
**Admin → Settings**, ready to copy. Details and troubleshooting:
[GHL-INTEGRATION.md](GHL-INTEGRATION.md).

## 27. Give staff a way in from GoHighLevel

**Settings → Custom Menu Links → Add**:

- **Name**: Agendas & Minutes Admin
- **URL**: `https://your-domain/admin`
- **Open in**: New tab
- **Visible to**: the staff who need it

Signing in to GoHighLevel does not sign anyone in here. That is deliberate —
see [GHL-INTEGRATION.md](GHL-INTEGRATION.md) for the reasoning.

## 28. Test production

Work through step 19 again against the live URL, and then:

- Open the public page on a phone. Nothing should scroll sideways.
- Zoom the browser to 200%. Nothing should be cut off.
- Tab through the archive with the keyboard. Focus should always be visible.
- Confirm a **Draft** meeting does not appear publicly and its URL 404s while signed out.

## 29. Configure backups

Supabase Pro takes daily automatic backups. Confirm under **Database →
Backups**, and set up Point-in-Time Recovery if the municipality's retention
policy calls for it. Storage objects are **not** covered by database backups —
read [BACKUP-RESTORE.md](BACKUP-RESTORE.md) and schedule the storage export
described there before you go live.

## 30. Applying future updates

```bash
git pull origin main
npm install
supabase db push        # applies any new migrations
npm test
git push origin main    # triggers a production deploy
```

Always run `supabase db push` against a staging project first if one exists,
and read [BACKUP-RESTORE.md](BACKUP-RESTORE.md) before applying a migration
that drops or rewrites a column.

---

## If something goes wrong

| Symptom | Likely cause |
| --- | --- |
| "That municipality could not be found" | `NEXT_PUBLIC_DEFAULT_MUNICIPALITY` does not match a slug in `municipalities`, or the row is `active = false` |
| Sign-in succeeds but `/admin` bounces back | No `profiles` row for that auth user, or `active = false` |
| Uploads fail with a storage error | Bucket missing, or the storage policies from migration 0500 did not apply |
| PDFs 404 for the public but open for staff | The meeting is still Draft, or minutes are still Draft/Pending and the tenant does not publish pending minutes |
| Build fails on the host | An environment variable is missing; `lib/env.ts` validates them at startup by design |
