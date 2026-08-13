# Deployment

## What the host must support

A Node.js server running Next.js 15. Static export will not work: the
permanent document route streams PDFs from private storage after checking
publication state, and that requires a server.

Vercel is the path of least resistance. Netlify, Fly.io, Railway, Render, or a
self-managed Node process behind nginx all work.

---

## First deployment

1. Import the GitHub repository into the host.
2. Framework preset: Next.js. Build command `npm run build`, output handled by the adapter.
3. Add the environment variables below.
4. Deploy.
5. In Supabase, set **Authentication → URL Configuration → Site URL** to the production domain and add `https://<domain>/auth/callback` to the redirect list.

## Environment variables

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Public by design; RLS is the protection |
| `NEXT_PUBLIC_SITE_URL` | Browser + server | No trailing slash. Used for permanent URLs, canonicals, sitemap |
| `NEXT_PUBLIC_DEFAULT_MUNICIPALITY` | Browser + server | Slug of the primary tenant |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Mark as a secret. Bypasses all RLS |
| `MAX_UPLOAD_MB` | Server | Hard ceiling; per-municipality settings may be lower |
| `PUBLIC_API_RATE_LIMIT` | Server | Requests per minute per IP against `/api/public/*` |

`lib/env.ts` validates all of these at startup and refuses to read server-only
values from browser code. A missing variable fails the build rather than
producing a subtly broken deployment.

## Release process

```bash
git checkout -b feature/meeting-packets
# work, including any migration
npm run typecheck && npm run lint && npm test
git commit -m "Add meeting packet document type"
git push origin feature/meeting-packets
# open a pull request; CI runs type check, lint, tests, build, and replays migrations
```

On merge to `main`:

```bash
supabase db push     # migrations first
# then let the host deploy the code
```

**Migrations before code.** New code that expects a column which does not exist
yet produces errors nobody can diagnose from a stack trace. The reverse — a
column that exists before anything uses it — is harmless.

For a change that removes or renames a column, take two releases: first ship
code that no longer depends on it, then ship the migration that drops it.

## Caching

| Surface | Policy |
| --- | --- |
| `/meetings`, `/meetings/...` | `revalidate = 60` |
| `/api/public/*` | `s-maxage=300, stale-while-revalidate=600` |
| `/documents/*` | `max-age=300, s-maxage=3600, stale-while-revalidate=86400` |
| `/admin/*`, `/api/admin/*` | Never cached |

Documents cache aggressively because a replacement keeps the same URL, and a
few minutes of staleness on a published agenda is acceptable. If a municipality
needs an instant swap, purge the CDN path for that document after replacing it.

## Rate limiting

`lib/api/rate-limit.ts` is a fixed-window in-process limiter: it protects a
single instance from a scraper with no extra infrastructure. It does **not**
coordinate across instances. On a horizontally scaled deployment, either put a
CDN or WAF rule in front of `/api/public/*`, or swap the `Map` for Redis or
Upstash — the interface is one function.

## Custom domain

Point the domain at the host, then update `NEXT_PUBLIC_SITE_URL`, the Supabase
Site URL, the redirect list, and the `<script src>` in the GoHighLevel embed.
Document URLs already in circulation contain the old domain, so keep a redirect
from the previous host for as long as the municipality's notices remain in
circulation — indefinitely, in practice, for public records.

## Health checks

| Check | Meaning |
| --- | --- |
| `GET /api/public/config` returns 200 | Application and database reachable |
| `GET /meetings` returns 200 | Public rendering path healthy |
| `HEAD /documents/<slug>.pdf` returns 200 | Storage delivery healthy |

## Rolling back

Code: redeploy the previous build from the host's dashboard.

Database: **do not** roll a migration back casually. Write a new forward
migration that reverses the change, test it with `supabase db reset`, and push
it. See [BACKUP-RESTORE.md](BACKUP-RESTORE.md) for genuine recovery.
