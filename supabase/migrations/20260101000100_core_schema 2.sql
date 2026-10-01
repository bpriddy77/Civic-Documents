-- =====================================================================
-- Local Government Agenda & Minutes Management System
-- 0100 - Core schema: enums, tables, constraints, indexes
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('super_admin', 'admin', 'editor', 'read_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.meeting_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.minutes_status as enum ('not_available', 'draft', 'pending_approval', 'approved');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- municipalities (tenants)
-- ---------------------------------------------------------------------
create table if not exists public.municipalities (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 200),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone        text not null default 'America/Chicago',
  logo_url        text,
  website_url     text,
  contact_email   text,
  contact_phone   text,
  contact_address text,
  -- Public/branding configuration. Shape is validated in the application layer
  -- (lib/validation/schemas.ts -> municipalityConfigurationSchema).
  configuration   jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.municipalities.timezone is
  'IANA time zone used for every meeting date/time calculation for this tenant.';

-- ---------------------------------------------------------------------
-- profiles (application users, 1:1 with auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid not null unique references auth.users (id) on delete cascade,
  municipality_id  uuid references public.municipalities (id) on delete restrict,
  display_name     text not null check (length(btrim(display_name)) between 1 and 200),
  email            text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role             public.app_role not null default 'read_only',
  active           boolean not null default true,
  disabled_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Only platform super administrators may exist outside a municipality.
  constraint profiles_tenant_required
    check (role = 'super_admin' or municipality_id is not null)
);

create unique index if not exists profiles_municipality_email_key
  on public.profiles (municipality_id, lower(email));
create index if not exists profiles_municipality_idx
  on public.profiles (municipality_id) where active;

-- ---------------------------------------------------------------------
-- role_permissions (single source of truth for RBAC)
--   Mirrored in TypeScript at lib/permissions/permissions.ts.
--   tests/permissions.parity.test.ts asserts the two never drift.
-- ---------------------------------------------------------------------
create table if not exists public.role_permissions (
  role       public.app_role not null,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);

-- ---------------------------------------------------------------------
-- document_types (extensible: packets, ordinances, notices ... later)
-- ---------------------------------------------------------------------
create table if not exists public.document_types (
  code          text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  label         text not null,
  display_order integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- meeting_categories
-- ---------------------------------------------------------------------
create table if not exists public.meeting_categories (
  id              uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description     text,
  display_order   integer not null default 0,
  active          boolean not null default true,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (municipality_id, slug)
);

create index if not exists meeting_categories_tenant_order_idx
  on public.meeting_categories (municipality_id, display_order, name);

-- ---------------------------------------------------------------------
-- meetings (the primary record)
-- ---------------------------------------------------------------------
create table if not exists public.meetings (
  id              uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  category_id     uuid not null references public.meeting_categories (id) on delete restrict,
  title           text not null check (length(btrim(title)) between 1 and 300),
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description     text,
  meeting_date    date not null,
  meeting_time    time,
  location        text,
  status          public.meeting_status  not null default 'draft',
  minutes_status  public.minutes_status  not null default 'not_available',
  -- Absolute instant, derived from meeting_date/meeting_time in the tenant's
  -- time zone. Maintained by trigger; never written by the application.
  starts_at       timestamptz not null,
  published_at    timestamptz,
  archived_at     timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  search_vector   tsvector generated always as (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(location, '')), 'C')
    ) stored,
  unique (municipality_id, meeting_date, slug)
);

create index if not exists meetings_public_listing_idx
  on public.meetings (municipality_id, status, starts_at desc);
create index if not exists meetings_upcoming_idx
  on public.meetings (municipality_id, starts_at)
  where status = 'published';
create index if not exists meetings_category_idx
  on public.meetings (municipality_id, category_id, starts_at desc);
create index if not exists meetings_search_idx
  on public.meetings using gin (search_vector);
create index if not exists meetings_title_trgm_idx
  on public.meetings using gin (title gin_trgm_ops);
create index if not exists meetings_updated_idx
  on public.meetings (municipality_id, updated_at desc);

-- ---------------------------------------------------------------------
-- meeting_documents (versioned child records)
-- ---------------------------------------------------------------------
create table if not exists public.meeting_documents (
  id                uuid primary key default gen_random_uuid(),
  municipality_id   uuid not null references public.municipalities (id) on delete cascade,
  meeting_id        uuid not null references public.meetings (id) on delete cascade,
  document_type     text not null references public.document_types (code) on delete restrict,
  posted_date       date not null,
  storage_path      text not null unique,
  -- Stable, human-readable identifier used to build the permanent public URL.
  -- Preserved across replacements so shared links never break.
  public_slug       text not null check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  original_filename text not null,
  stored_filename   text not null,
  mime_type         text not null default 'application/pdf'
                      check (mime_type = 'application/pdf'),
  file_size         bigint not null check (file_size > 0),
  sha256            text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  version           integer not null default 1 check (version >= 1),
  active_version    boolean not null default true,
  uploaded_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  replaced_at       timestamptz,
  removed_at        timestamptz,
  unique (meeting_id, document_type, version)
);

-- Exactly one live document per meeting + type.
create unique index if not exists meeting_documents_active_key
  on public.meeting_documents (meeting_id, document_type)
  where active_version;

-- The permanent public URL must resolve to exactly one live document.
create unique index if not exists meeting_documents_public_slug_key
  on public.meeting_documents (municipality_id, public_slug)
  where active_version;

create index if not exists meeting_documents_meeting_idx
  on public.meeting_documents (meeting_id, document_type, version desc);
create index if not exists meeting_documents_recent_idx
  on public.meeting_documents (municipality_id, created_at desc);

-- ---------------------------------------------------------------------
-- audit_log (append only; see 0300_audit.sql for the write triggers)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id              bigserial primary key,
  municipality_id uuid references public.municipalities (id) on delete set null,
  user_id         uuid references public.profiles (id) on delete set null,
  user_name       text,
  user_email      text,
  action          text not null,
  entity_type     text not null,
  entity_id       text,
  previous_data   jsonb,
  new_data        jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists audit_log_tenant_time_idx
  on public.audit_log (municipality_id, created_at desc);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_action_idx
  on public.audit_log (municipality_id, action, created_at desc);
