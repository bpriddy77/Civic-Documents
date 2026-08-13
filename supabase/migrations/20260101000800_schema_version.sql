-- =====================================================================
-- 0800 - Schema version
--
-- Records which release created or last updated this database.
--
-- The Supabase CLI keeps its own migration ledger, but a database
-- installed from the dashboard (supabase/setup/01-complete-schema.sql)
-- has no ledger at all. Without this, nobody can answer "which version
-- is this project running?" without reading the schema by hand — which
-- is exactly the question asked when something behaves unexpectedly
-- after an update.
--
-- Bump the value below in the same commit as any schema change.
-- =====================================================================

create table if not exists public.schema_version (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  notes       text
);

comment on table public.schema_version is
  'One row per release whose migrations have been applied. Newest row is current.';

alter table public.schema_version enable row level security;

-- Staff may read it; the public has no reason to know the version, and
-- advertising it to anonymous callers only helps someone fingerprinting
-- the deployment.
drop policy if exists schema_version_read on public.schema_version;
create policy schema_version_read on public.schema_version
  for select to authenticated
  using (true);

-- No insert, update, or delete policy: only a migration, running with
-- elevated privileges, writes here.

insert into public.schema_version (version, notes)
values ('1.4.1', 'Fixes audit trigger array concatenation that blocked status changes.')
on conflict (version) do update
  set applied_at = now(),
      notes = excluded.notes;
