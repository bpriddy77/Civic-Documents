# Database

PostgreSQL, through Supabase. Every table, constraint, index, function,
trigger, and policy described here is created by a migration in
`supabase/migrations/`, in filename order.

| Migration | Contents |
| --- | --- |
| `0100_core_schema` | Enums, tables, constraints, indexes |
| `0200_functions_triggers` | Identity helpers, time zone handling, lifecycle rules |
| `0300_audit` | Audit triggers and append-only enforcement |
| `0400_rls_policies` | Row-Level Security on every table |
| `0500_storage` | Bucket and storage policies |
| `0600_reference_data` | Permission matrix, document types, dashboard view |
| `0700_operations` | Transactional RPCs for versioning and duplication |

---

## The shape of the data

```
municipalities ──┬── profiles
                 ├── meeting_categories ── meetings ── meeting_documents
                 └── audit_log
```

A **Meeting** is the primary record. Its agenda and its minutes are child rows
of that same meeting, so they cannot be created separately and matched up
later — the association is the schema, not a convention.

### municipalities

The tenant. `slug` appears in every permanent document URL, so it is fixed
after setup. `timezone` is an IANA name, validated against `pg_timezone_names`
by a trigger, and it is what decides whether a meeting is upcoming or past.
`configuration` is JSONB holding display and branding settings; its shape is
validated in `lib/validation/schemas.ts`.

### profiles

One row per person who can sign in, linked to `auth.users`. `role` is one of
`super_admin`, `admin`, `editor`, `read_only`. A check constraint requires a
`municipality_id` for everyone except a super administrator. Accounts are
disabled (`active = false`), not deleted, so historical records keep the name
of whoever made each change.

### meeting_categories

Editable per municipality. Never hardcoded in application logic. A category
attached to historical meetings cannot be deleted — the API refuses and
suggests deactivating it instead.

### meetings

| Column | Notes |
| --- | --- |
| `meeting_date` | Required. `NOT NULL` at the database level. |
| `meeting_time` | Optional; some bodies post a date before a time is set. |
| `status` | `draft` / `published` / `archived` |
| `minutes_status` | `not_available` / `draft` / `pending_approval` / `approved` |
| `starts_at` | `timestamptz`, maintained by trigger from date + time + tenant zone |
| `slug` | Unique per municipality per date; part of the public URL |
| `search_vector` | Generated `tsvector` over title, description, location |

`starts_at` is the key design decision. Upcoming versus past is a comparison
against `now()`, evaluated in the database, so meetings move between the two
sections on their own and no clerk ever drags a record from one list to
another. Changing a municipality's time zone recomputes every stored instant
through `recompute_tenant_meeting_instants()`.

### meeting_documents

Versioned. Uploading a replacement does not overwrite anything: the live row is
marked `active_version = false` with a `replaced_at`, and a new row is inserted
with `version + 1`, inheriting the same `public_slug`.

Two partial unique indexes carry the important rules:

```sql
unique (meeting_id, document_type) where active_version        -- one live copy
unique (municipality_id, public_slug) where active_version     -- one live URL
```

The second is why a published link keeps working after a replacement: the URL
belongs to the document's identity, not to a particular file.

`document_type` is a foreign key to a `document_types` table rather than an
enum, so packets, ordinances, resolutions, or notices can be added later with
an insert instead of a schema change.

### audit_log

Append-only. Rows are written by triggers on `meetings`, `meeting_documents`,
`meeting_categories`, `profiles`, and `municipalities`, so an event cannot be
missed by forgetting to call a helper. `reject_audit_mutation()` raises on any
`UPDATE` or `DELETE`, and `INSERT`/`UPDATE`/`DELETE` are revoked from both
`anon` and `authenticated`.

Actions are semantic rather than mechanical: a status change records
`meeting.published`, not `meeting.updated`. IP address and user agent come
from PostgREST's `request.headers` when the write arrived over the API.

---

## Row-Level Security

Every table has RLS enabled and no permissive default. The policies compose
two questions:

```sql
public.has_permission('meeting.publish')     -- does this role hold it?
public.can_access_municipality(tenant_id)    -- is this their municipality?
public.may('meeting.publish', tenant_id)     -- both
```

`public.current_profile()` is `SECURITY DEFINER` so a policy on `profiles` can
read `profiles` without recursing through its own policy.

Three policies are worth reading closely:

**Drafts are invisible to the public.** The `anon` select policy on `meetings`
allows only `published` and `archived`. There is no code path that has to
remember this.

**An editor without publish rights cannot leave a row published.** The `UPDATE`
policy's `WITH CHECK` inspects the row as it will exist after the write:

```sql
(status <> 'published' or public.has_permission('meeting.publish'))
```

So the restriction covers editing an already-published meeting, not just
publishing a new one.

**Minutes have their own visibility rule.** The `anon` policy on
`meeting_documents` requires, for minutes specifically, that
`minutes_publicly_visible()` returns true — approved, or pending approval when
the municipality has opted in. Draft minutes are never public.

---

## Permissions

`role_permissions` is the authority. `lib/permissions/permissions.ts` mirrors
it so the interface knows which controls to draw, and
`tests/permissions.parity.test.ts` reads the migration and fails if the two
drift. Super administrators are not listed: `has_permission()` grants them
everything.

| Permission | admin | editor | read_only |
| --- | :-: | :-: | :-: |
| `meeting.read` | ✓ | ✓ | ✓ |
| `meeting.create` | ✓ | ✓ | |
| `meeting.update` | ✓ | ✓ | |
| `meeting.publish` | ✓ | ✓ | |
| `meeting.archive` | ✓ | | |
| `meeting.delete` | ✓ | | |
| `document.read` | ✓ | ✓ | ✓ |
| `document.manage` | ✓ | ✓ | |
| `document.delete` | ✓ | | |
| `category.read` | ✓ | ✓ | ✓ |
| `category.manage` | ✓ | | |
| `category.delete` | ✓ | | |
| `user.read` | ✓ | | |
| `user.manage` | ✓ | | |
| `audit.read` | ✓ | ✓ | ✓ |
| `municipality.update` | ✓ | | |

---

## Indexes

| Index | Serves |
| --- | --- |
| `meetings_public_listing_idx` | The archive listing, per tenant and status |
| `meetings_upcoming_idx` | Partial index on published meetings by `starts_at` |
| `meetings_category_idx` | Category filtering |
| `meetings_search_idx` | Full-text search over the generated `tsvector` |
| `meetings_title_trgm_idx` | Fuzzy title matching |
| `meeting_documents_active_key` | One live document per meeting and type |
| `meeting_documents_public_slug_key` | One live document per public URL |
| `audit_log_entity_idx` | History for one record |

---

## Rebuilding from scratch

```bash
supabase db reset
```

Replays every migration into an empty database, then applies `seed.sql`
locally. If that succeeds and the tests pass, the repository can recreate the
database — which is the same guarantee a restore depends on.

---

## About `lib/supabase/database.types.ts`

The types are hand-written so the repository builds without a database
connection. Two constraints are easy to violate by accident, and both fail in
the same confusing way — every query's row type becomes `never`, and the build
reports "Property 'x' does not exist on type 'never'" in an arbitrary file:

1. **Every row type must be a `type` alias, not an `interface`.** postgrest-js constrains rows to `Record<string, unknown>`, and a TypeScript interface has no implicit index signature, so it silently fails that constraint.
2. **Every table and view must declare `Relationships`.** Omit it and the schema no longer satisfies `GenericSchema`.

To regenerate from a live database instead, which handles both automatically:

```bash
npm run db:types
```

Then re-check that the RPCs under `Functions` still carry accurate argument
types, since a generated file will overwrite the hand-written comments there.
