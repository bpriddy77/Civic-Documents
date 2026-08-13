# Web setup — no terminal required

Everything in the Supabase dashboard, from a project you have just created to
a working system. No CLI, no Docker, no local database.

[INSTALLATION.md](INSTALLATION.md) is the CLI path and is better for ongoing
work, because it keeps the database and the repository in step automatically.
This document exists because you should not have to install a toolchain to get
started, and because a city's IT staff often cannot.

You need about 20 minutes. Have the repository files open — you will copy from
`supabase/setup/`.

---

## Step 1 — Confirm where you are

You have created a Supabase project and done nothing else. That is exactly the
right starting point.

Open your project in the dashboard and keep it open.

## Step 2 — Create the schema

This is the big one. It creates every table, every security policy, the
storage bucket, and the reference data, in a single paste.

1. Left sidebar → **SQL Editor**
2. **New query**
3. Open `supabase/setup/01-complete-schema.sql` from the repository
4. Select all of it, copy, and paste into the editor
5. **Run** (or Ctrl/Cmd + Enter)

Expect **"Success. No rows returned"**. It may take 10–20 seconds.

The file is safe to run again. If it fails partway, fix the cause and re-run
the whole thing — every statement is written to tolerate that.

> **Why one giant file?** The repository's real source of truth is the seven
> numbered files in `supabase/migrations/`. This one is generated from them by
> `scripts/build-setup-sql.mjs` purely so it can be pasted in one go. If you
> later adopt the CLI, the migrations are already there and consistent.

## Step 3 — Create the administrator's login

The login must exist before the profile that grants it permissions.

1. Left sidebar → **Authentication** → **Users**
2. **Add user** → **Create new user**
3. Email: the clerk's real work address
4. Password: a strong temporary one
5. Tick **Auto Confirm User** — otherwise they cannot sign in until they click a confirmation email
6. **Create user**

Note the email exactly. The next step matches on it.

## Step 4 — Create the municipality

1. **SQL Editor** → **New query**
2. Paste `supabase/setup/02-create-municipality.sql`
3. **Edit the seven values at the top** — city name, slug, time zone, and the administrator's email and name
4. **Run**

The `admin_email` must match Step 3 exactly. If it does not, the script stops
with a message telling you so and changes nothing.

Three values deserve thought:

- **`slug`** goes into every permanent document URL. Once agendas are published and links are in circulation, changing it breaks them. Choose it as you would a domain name.
- **`timezone`** decides when a meeting moves from Upcoming to Past. Use the IANA name for the city — `America/Chicago`, `America/New_York`, `America/Denver`, `America/Los_Angeles`, `America/Phoenix`.
- **`admin_role`** should be `super_admin` for the first account.

The query returns a table at the end. Copy the **slug** — you need it in Step 7.

## Step 5 — Verify

1. **SQL Editor** → **New query**
2. Paste `supabase/setup/03-verify.sql`
3. **Run**

Work down the results. Check 0 reports the installed version — quote it if you
ever report a problem. Every other check should say **PASS**.

Two are worth reading rather than skimming:

- **Check 4** — the bucket must be **private**. If it says `FAIL — BUCKET IS PUBLIC`, stop and fix it, because every published PDF would otherwise be reachable by guessing a path, bypassing the publication check.
- **Check 5** — must return **zero rows**. Any row means the anonymous role can reach storage directly.

If Check 2 shows RLS off for any table, re-run Step 2 rather than flipping the
toggle in the dashboard. A manual change is not recorded anywhere and vanishes
the next time the database is rebuilt.

## Step 6 — Configure authentication

**Authentication → Sign In / Providers → Email**:

- Email sign-in: **enabled**
- **Allow new users to sign up: OFF** — this matters. Accounts are created by an administrator; public sign-up would let anyone create a login.
- Confirm email: enabled

**Authentication → URL Configuration**:

- **Site URL**: your production URL, e.g. `https://records.example-city.gov`
- **Redirect URLs**: add both
  - `https://records.example-city.gov/auth/callback`
  - `http://localhost:3000/auth/callback`

If you do not have the production URL yet, put a placeholder and come back
after deploying. Sign-in will not work until this matches.

Optional, recommended: **Authentication → Multi-Factor** → enable **TOTP**.

## Step 7 — Collect your keys

**Project Settings → API Keys**. You need three values for the hosting
environment:

| Dashboard label | Environment variable | Safe in a browser? |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `anon` / `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes, by design |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | **Never** |

Plus two you set yourself:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Production URL, no trailing slash |
| `NEXT_PUBLIC_DEFAULT_MUNICIPALITY` | The slug from Step 4 |

The `anon` key being public is not a mistake — Row-Level Security is what
protects the data, and you just verified it is on. The `service_role` key
bypasses every one of those policies. Treat it like a root password: paste it
only into your host's secret store, never into the repository, a ticket, or a
chat message.

## Step 8 — Deploy

In Vercel (or your host): import the repository, add the five variables from
Step 7, deploy.

Then return to **Step 6** and confirm the Site URL and redirect URLs match the
real deployed domain.

## Step 9 — Test it

Open `https://your-domain/admin` and sign in with the Step 3 credentials.

Then walk the whole workflow once:

1. **Create meeting** — title, category, a date next week, 6:00 PM, location
2. Save, then upload an agenda PDF
3. Set status to **Published**, save
4. Open `/meetings` — the meeting appears under **Upcoming**
5. Click the agenda link — the PDF opens at a permanent URL
6. Try uploading a `.docx` renamed to `.pdf` — it is refused
7. Sign out, open `/admin` — you are redirected to sign in
8. Create a second meeting, leave it **Draft**, sign out, and confirm it is invisible on `/meetings`

Step 8 is the one that matters most. A draft agenda appearing publicly before
the body has adopted it is the failure this system exists to prevent.

## Step 10 — Back up before real records go in

**Database → Backups**. Confirm daily backups are running, and enable
Point-in-Time Recovery if the city's retention policy calls for it.

Then read [BACKUP-RESTORE.md](BACKUP-RESTORE.md) and note the part that catches
people out: **database backups do not include uploaded files**. Restoring the
database alone leaves you with a complete index of documents that no longer
exist. Schedule the storage export described there before the clerk starts
uploading real agendas.

---

## Adding more staff — a second admin, a deputy clerk

Two steps, and **do not re-run `02-create-municipality.sql`** to do it.

1. **Authentication → Users → Add user** — their email, tick **Auto Confirm User**
2. **SQL Editor** → paste `supabase/setup/04-add-user.sql`, edit the four values at the top → **Run**

It tells you whether the person was added, had their role changed, or was
already set that way, then lists everyone with access.

> **Why not re-run `02`?** It would work, but it also rewrites the
> municipality's name, time zone, and website from the values hardcoded in
> that file. If anyone has since changed those in **Admin → Settings**, running
> `02` again silently reverts them. `04` touches nothing but the one profile.

Roles: **editor** creates and publishes meetings and manages documents;
**admin** additionally manages users, categories, settings, archiving, and
deletion; **read_only** views everything and changes nothing; **super_admin**
spans municipalities and should be rare.

Most clerks should be `editor`. Grant `admin` deliberately.

Once the site is deployed, **Admin → Users** does all this without SQL.

## Removing someone's access

Set `active = false` rather than deleting. Deletion would orphan the audit
entries that record what they did.

```sql
update public.profiles set active = false
where lower(email) = lower('former.employee@example-city.gov');
```

This takes effect on their next request, not when their session expires.

---

## When something goes wrong

| Message | Cause | Fix |
| --- | --- | --- |
| `No user found with the email …` | Step 3 not done, or the email differs | Create the login, or correct the email in the script |
| `relation "public.municipalities" does not exist` | Step 2 did not complete | Re-run `01-complete-schema.sql` and read the error output |
| `permission denied for schema storage` | The dashboard role lacks storage privileges | Rare on Supabase Pro. Create the bucket by hand (below), then re-run Step 2 |
| `duplicate key value violates unique constraint` on slug | The municipality already exists | Harmless — the script updates it. Check the results table |
| Sign-in works, `/admin` bounces to sign-in | No profile row, or `active = false` | Re-run Step 4, or check `select * from public.profiles` |
| "That municipality could not be found" | `NEXT_PUBLIC_DEFAULT_MUNICIPALITY` does not match the slug | Correct it in the host's environment variables and redeploy |
| PDFs 404 for the public, open for staff | Meeting is Draft, or minutes are not approved | Working as designed |

**Creating the bucket by hand**, if you ever need to: **Storage → New bucket**
→ name `meeting-documents` → **Public bucket: OFF** → Create. Then re-run
Step 2 so the policies attach.

---

## Moving to the CLI later

Nothing here blocks that. The schema you just installed is exactly what the
migrations produce. When you are ready:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase migration repair --status applied 20260101000100 \
  20260101000200 20260101000300 20260101000400 \
  20260101000500 20260101000600 20260101000700
```

That last command tells the CLI these migrations are already applied, so it
does not try to run them again. From then on, follow
[SUPABASE.md](SUPABASE.md).
