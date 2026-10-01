-- =====================================================================
-- 0900 - Emergency alerts
--
-- A separate feature from meetings and documents. It shares this
-- database and this login only so a city secretary does not have to
-- remember a second password during an actual emergency — nothing here
-- reads from or writes to any meetings table.
--
-- One alert at a time per municipality, by design. A city of 250 people
-- posting two simultaneous emergencies is a sign something has gone
-- wrong with the process, not a feature to support.
-- =====================================================================

-- `create type` has no IF NOT EXISTS, and this file must be re-runnable:
-- a dashboard install pastes the whole schema again to pick up a release.
do $$ begin
  create type public.alert_severity as enum ('emergency', 'advisory', 'information');
exception when duplicate_object then null;
end $$;

create table if not exists public.alerts (
  id               uuid primary key default gen_random_uuid(),
  municipality_id  uuid not null references public.municipalities (id) on delete cascade,

  message          text not null check (length(btrim(message)) between 1 and 500),
  severity         public.alert_severity not null default 'emergency',
  link_url         text,
  link_label       text,

  -- Expiry is mandatory, and this is the most important column in the
  -- table. The failure that destroys trust is not forgetting to post an
  -- alert; it is forgetting to take one down. An alert still scrolling
  -- three days after the storm passed teaches residents to ignore the
  -- banner, which makes the next real one useless.
  expires_at       timestamptz not null,

  published_at     timestamptz not null default now(),
  published_by     uuid references public.profiles (id),
  cleared_at       timestamptz,
  cleared_by       uuid references public.profiles (id),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint alerts_expiry_after_publish check (expires_at > published_at),
  constraint alerts_link_pair check (
    (link_url is null and link_label is null)
    or (link_url is not null and link_label is not null)
  )
);

comment on table public.alerts is
  'Urgent public notices shown as a banner on the municipality''s website. Separate from meetings.';

-- At most one live alert per municipality. Partial index: cleared alerts
-- and expired ones stay as history without blocking a new alert.
create unique index if not exists alerts_one_live_per_tenant
  on public.alerts (municipality_id)
  where cleared_at is null;

create index if not exists alerts_live_lookup
  on public.alerts (municipality_id, expires_at)
  where cleared_at is null;

create index if not exists alerts_history_idx
  on public.alerts (municipality_id, published_at desc);

drop trigger if exists alerts_touch on public.alerts;
create trigger alerts_touch before update on public.alerts
  for each row execute function public.touch_updated_at();

-- Tenant consistency: the publisher must belong to the same municipality.
create or replace function public.assert_alert_tenant()
returns trigger language plpgsql as $$
declare v_tenant uuid;
begin
  if new.published_by is not null then
    select municipality_id into v_tenant from public.profiles where id = new.published_by;
    if v_tenant is not null and v_tenant <> new.municipality_id then
      raise exception 'The publishing account belongs to a different municipality.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists alerts_assert_tenant on public.alerts;
create trigger alerts_assert_tenant before insert or update on public.alerts
  for each row execute function public.assert_alert_tenant();

-- ---------------------------------------------------------------- audit
-- Every publish and every clear is recorded. After an emergency, "when
-- did the city post the notice?" has an answer nobody can edit.
create or replace function public.audit_alert_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actions text[] := '{}';
  action  text;
begin
  if tg_op = 'INSERT' then
    actions := array['alert.published'];
  elsif tg_op = 'UPDATE' then
    if old.cleared_at is null and new.cleared_at is not null then
      actions := array['alert.cleared'];
    elsif old.message is distinct from new.message
       or old.severity is distinct from new.severity
       or old.expires_at is distinct from new.expires_at then
      actions := array['alert.updated'];
    end if;
  elsif tg_op = 'DELETE' then
    actions := array['alert.deleted'];
  end if;

  foreach action in array actions loop
    perform public.record_audit_event(
      p_municipality_id => coalesce(new.municipality_id, old.municipality_id),
      p_action          => action,
      p_entity_type     => 'alert',
      p_entity_id       => coalesce(new.id, old.id)::text,
      p_metadata        => jsonb_build_object(
        'severity',   coalesce(new.severity, old.severity)::text,
        'expires_at', coalesce(new.expires_at, old.expires_at)
      )
    );
  end loop;

  return coalesce(new, old);
end $$;

drop trigger if exists alerts_audit on public.alerts;
create trigger alerts_audit after insert or update or delete on public.alerts
  for each row execute function public.audit_alert_change();

-- ------------------------------------------------------------------ RLS
alter table public.alerts enable row level security;

-- The public sees a live alert and nothing else: not expired ones, not
-- cleared ones, not the history.
drop policy if exists alerts_public_read on public.alerts;
create policy alerts_public_read on public.alerts
  for select to anon
  using (cleared_at is null and expires_at > now());

drop policy if exists alerts_staff_read on public.alerts;
create policy alerts_staff_read on public.alerts
  for select to authenticated
  using (public.can_access_municipality(municipality_id));

drop policy if exists alerts_insert on public.alerts;
create policy alerts_insert on public.alerts
  for insert to authenticated
  with check (public.may('alert.manage', municipality_id));

drop policy if exists alerts_update on public.alerts;
create policy alerts_update on public.alerts
  for update to authenticated
  using (public.may('alert.manage', municipality_id))
  with check (public.may('alert.manage', municipality_id));

drop policy if exists alerts_delete on public.alerts;
create policy alerts_delete on public.alerts
  for delete to authenticated
  using (public.may('alert.manage', municipality_id));

-- ---------------------------------------------------------- permissions
-- Posting an emergency notice to the whole city is an administrative act,
-- not an editorial one. Editors who publish agendas do not get it by
-- default; an administrator can grant it per city if they want otherwise.
insert into public.role_permissions (role, permission) values
  ('admin', 'alert.manage'),
  ('admin', 'alert.read'),
  ('editor', 'alert.read'),
  ('read_only', 'alert.read')
on conflict do nothing;

-- ------------------------------------------------------------- helper
-- The live alert for a municipality, or nothing. Used by the public API.
create or replace function public.current_alert(p_municipality_id uuid)
returns setof public.alerts
language sql
stable
security invoker
as $$
  select * from public.alerts
  where municipality_id = p_municipality_id
    and cleared_at is null
    and expires_at > now()
  order by published_at desc
  limit 1
$$;

insert into public.schema_version (version, notes)
values ('1.9.0', 'Adds emergency alerts. No change to meetings or documents.')
on conflict (version) do update
  set applied_at = now(), notes = excluded.notes;
