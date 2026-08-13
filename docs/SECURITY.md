# Security

The threat this system actually faces is not a sophisticated attacker. It is a
draft agenda becoming public before the body has adopted it, a replaced
document quietly changing the record, or a departed employee still holding a
login. The controls below are arranged around those.

Nothing here depends on the interface hiding a button. Every rule is enforced
by PostgreSQL, which is the only layer no request can route around.

---

## The layers, and what each one is actually for

| Layer | Enforces | If it fails alone |
| --- | --- | --- |
| Interface | Which controls are drawn | A user sees a button that then fails |
| Route guard | Session and permission on every request | RLS still refuses the query |
| Zod validation | Shape and range of every input | Constraints still refuse the row |
| Row-Level Security | Who may read or write which rows | Nothing else is left — this is the boundary |
| Database constraints | Invariants the data must hold | Corrupt data |

The interface layer is a convenience for the person using it, not a control.
Assume every API route can be called directly with a hand-written request,
because it can be.

---

## Authentication

Supabase Auth, email and password, with public sign-ups **disabled**. Accounts
exist because an administrator created them.

- Sessions are cookie-based, `httpOnly`, `secure`, `sameSite=lax`.
- Every request re-reads the `profiles` row. Disabling an account takes effect on the next request, not when a token happens to expire. This is the control that matters when someone leaves.
- Deactivation (`active = false`) rather than deletion, so historical audit entries keep the name of whoever made each change.
- TOTP multi-factor is available in Supabase Auth and recommended for anyone holding `admin` or `super_admin`.

`middleware.ts` refreshes the session and redirects unauthenticated requests
away from `/admin`. That redirect is ergonomics. The reason an unauthenticated
request cannot read a draft meeting is the RLS policy, not the middleware.

## Authorisation

Four roles, one permission matrix, stored in `role_permissions` in the
database. `lib/permissions/permissions.ts` mirrors it so the interface knows
what to draw, and `tests/permissions.parity.test.ts` fails the build if the two
ever disagree.

Checks happen three times: in the interface, again in the route handler via
`requirePermission()`, and again inside every RLS policy via
`public.may(permission, municipality_id)`. The third is the one that counts.

## Tenant isolation

Every row carries `municipality_id`. Every policy tests it. Cross-tenant reads
are impossible for anonymous and authenticated roles alike, and a trigger
asserts that a meeting's category and documents belong to the same tenant as
the meeting, so a mismatched foreign key cannot be written even by a bug.

Storage paths key on the tenant id as the second segment
(`municipalities/{id}/...`), and `storage.object_municipality_id()` extracts it
for the storage policies to test.

## Document storage and public delivery

The bucket is **private**. There is no anonymous policy on `storage.objects` at
all — not a restrictive one, none.

Public PDFs are served exclusively through
`app/documents/[municipality]/[slug]/route.ts`, which:

1. Resolves the document with the **anonymous** client, so RLS decides visibility rather than application code.
2. Falls back to a staff-authenticated lookup, so an editor can preview an unpublished document.
3. Only then streams the bytes using the service-role client.

A document that is not publicly visible returns **404, not 403**. A 403
confirms that a document exists at that slug, which is exactly what someone
probing for an unreleased agenda wants to learn.

Because no signed URL is ever handed to a browser, published links do not
expire — which is the whole point for a public notice printed in a newspaper.

## Upload validation

Filenames prove nothing. Uploads are checked by content:

- `%PDF-` signature and a parseable version
- `%%EOF` trailer present, so truncated uploads are refused
- Rejected if the file carries `/JavaScript`, `/JS`, or `/Launch`
- Size checked against the municipality's limit, under a 50 MB bucket ceiling
- SHA-256 recorded, so drift can be detected later
- Filenames sanitised: traversal stripped, leading dots removed, second extensions neutralised (`agenda.pdf.exe` becomes `agenda.pdf.pdf`)
- Storage paths asserted to sit inside the caller's own tenant folder

A file with no embedded fonts is flagged as probably a scan, and the clerk is
told it likely needs OCR before it meets accessibility obligations. That is a
records-quality control rather than a security one, but it lives in the same
validation pass.

## The audit trail

Written by database triggers, not by application calls, so an event cannot be
missed by forgetting to log it. Append-only: `reject_audit_mutation()` raises
on any `UPDATE` or `DELETE`, and write grants are revoked from `anon` and
`authenticated`.

Recorded per event: who, when, which record, the before and after state, the
IP address and user agent from PostgREST's request headers, and a semantic
action name — `meeting.published`, `document.replaced`, `user.role_changed`.

Nobody using the application can edit it. That is the property an auditor is
asking about.

## Input handling

Zod validates every input at the boundary, and the same schema is used by the
form and the API so they cannot diverge. All database access goes through
PostgREST or parameterised RPCs; no SQL is assembled from strings anywhere.
React escapes rendered output, and the widget escapes every interpolated value
explicitly.

`lib/errors.ts` maps errors to messages safe to show a clerk. Constraint
names, SQL fragments, and stack traces are never returned to a client.

## Transport and headers

`next.config.mjs` sets HSTS, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
`Permissions-Policy`, and a Content-Security-Policy.

`frame-ancestors` and CORS are relaxed **only** for `/embed` and
`/government-meetings.js`, because those exist to be loaded by a GoHighLevel
page. The administration is never framable.

## Key handling

| Key | Location | Exposure |
| --- | --- | --- |
| `anon` | Browser, server, widget | Public by design; RLS is the protection |
| `service_role` | Server environment only | Bypasses every policy — treat as a root password |
| CLI access token | Developer machines, CI secrets | Runs migrations |

`lib/env.ts` refuses to read server-only variables from browser code, so an
accidental import fails at build time rather than shipping a key to the public.

The service role is used in exactly three places, each documented at the call
site: streaming an authorised public PDF, the tenant bootstrap script, and the
integrity-scan Edge Function.

If a `service_role` key is ever committed, pasted into a ticket, or sent over
chat: rotate it in **Project Settings → API**, update every deployment, and
assume the old one is compromised.

## Rate limiting

`/api/public/*` is limited per IP by a fixed-window in-process limiter. It
protects a single instance from a scraper with no extra infrastructure, and it
does **not** coordinate across instances. On a horizontally scaled deployment,
add a CDN or WAF rule in front of `/api/public/*`, or swap the backing `Map`
for Redis — the interface is one function.

---

## Verifying it yourself

Signed out, from a terminal:

```bash
# A draft meeting must not be readable
curl -s "$SITE/api/public/meetings" | grep -c '"status":"draft"'      # expect 0

# Anonymous writes must fail
curl -s -X POST "$SITE/api/admin/meetings" -d '{"title":"test"}'      # expect 401

# The audit log must not be readable
curl -s "$SITE/api/admin/audit"                                        # expect 401

# An unpublished document must 404, not 403
curl -s -o /dev/null -w '%{http_code}' "$SITE/documents/city-of-example/unpublished.pdf"
```

Against a database, `tests/rls.integration.test.ts` asserts the same properties
directly, including that the audit log rejects modification even over a
service-role connection.

## Reporting a vulnerability

Do not open a public GitHub issue. Contact the municipality's IT contact or the
maintainer of this deployment directly, with enough detail to reproduce.
