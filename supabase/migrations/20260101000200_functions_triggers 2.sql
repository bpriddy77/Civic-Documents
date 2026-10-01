-- =====================================================================
-- 0200 - Functions and triggers
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identity helpers used by every RLS policy.
-- SECURITY DEFINER so a policy on profiles can look at profiles without
-- recursing through its own policy.
-- ---------------------------------------------------------------------
create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.* from public.profiles p
  where p.auth_user_id = auth.uid() and p.active
  limit 1;
$$;

create or replace function public.current_role_name()
returns public.app_role
language sql stable security definer set search_path = public, pg_temp
as $$ select (public.current_profile()).role; $$;

create or replace function public.current_municipality_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select (public.current_profile()).municipality_id; $$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.current_role_name() = 'super_admin', false); $$;

-- Does the signed-in user hold `perm`? Super administrators hold everything.
create or replace function public.has_permission(perm text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then false
    when public.is_super_admin() then true
    else exists (
      select 1 from public.role_permissions rp
      where rp.role = public.current_role_name()
        and rp.permission = perm
    )
  end;
$$;

-- Tenant gate: a user may only touch rows inside their own municipality.
create or replace function public.can_access_municipality(target uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_super_admin()
      or (target is not null and target = public.current_municipality_id());
$$;

-- Combined helper: permission AND tenant match.
create or replace function public.may(perm text, target uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select public.has_permission(perm) and public.can_access_municipality(target); $$;

-- ---------------------------------------------------------------------
-- Generic bookkeeping
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists municipalities_touch on public.municipalities;
create trigger municipalities_touch before update on public.municipalities
  for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists meeting_categories_touch on public.meeting_categories;
create trigger meeting_categories_touch before update on public.meeting_categories
  for each row execute function public.touch_updated_at();
drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Time zone integrity
-- ---------------------------------------------------------------------
create or replace function public.assert_valid_timezone()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown IANA time zone: %', new.timezone
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists municipalities_timezone_check on public.municipalities;
create trigger municipalities_timezone_check
  before insert or update of timezone on public.municipalities
  for each row execute function public.assert_valid_timezone();

-- starts_at is the single source of truth for "is this meeting upcoming or
-- past". It is computed in the municipality's own time zone, never the
-- visitor's browser time zone.
create or replace function public.set_meeting_starts_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare tz text;
begin
  select m.timezone into tz from public.municipalities m where m.id = new.municipality_id;
  if tz is null then
    raise exception 'Municipality % not found', new.municipality_id using errcode = '23503';
  end if;
  new.starts_at := (new.meeting_date + coalesce(new.meeting_time, time '00:00')) at time zone tz;
  return new;
end;
$$;

drop trigger if exists meetings_set_starts_at on public.meetings;
create trigger meetings_set_starts_at
  before insert or update of meeting_date, meeting_time, municipality_id on public.meetings
  for each row execute function public.set_meeting_starts_at();

-- If a city changes its configured time zone, every stored instant is recomputed.
create or replace function public.recompute_tenant_meeting_instants()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.timezone is distinct from old.timezone then
    update public.meetings
       set starts_at = (meeting_date + coalesce(meeting_time, time '00:00')) at time zone new.timezone
     where municipality_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists municipalities_timezone_recompute on public.municipalities;
create trigger municipalities_timezone_recompute
  after update of timezone on public.municipalities
  for each row execute function public.recompute_tenant_meeting_instants();

-- ---------------------------------------------------------------------
-- Meeting lifecycle bookkeeping
-- ---------------------------------------------------------------------
create or replace function public.maintain_meeting_lifecycle()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then new.published_at := coalesce(new.published_at, now()); end if;
    if new.status = 'archived'  then new.archived_at  := coalesce(new.archived_at, now());  end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
      new.archived_at  := null;
    elsif new.status = 'archived' then
      new.archived_at := now();
    elsif new.status = 'draft' then
      new.published_at := null;
      new.archived_at  := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists meetings_lifecycle on public.meetings;
create trigger meetings_lifecycle
  before insert or update on public.meetings
  for each row execute function public.maintain_meeting_lifecycle();

-- The category a meeting points at must belong to the same municipality.
create or replace function public.assert_category_tenant()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare owner uuid;
begin
  select municipality_id into owner from public.meeting_categories where id = new.category_id;
  if owner is null or owner <> new.municipality_id then
    raise exception 'Category does not belong to this municipality'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists meetings_category_tenant on public.meetings;
create trigger meetings_category_tenant
  before insert or update of category_id, municipality_id on public.meetings
  for each row execute function public.assert_category_tenant();

-- A document must live under the same tenant and meeting.
create or replace function public.assert_document_tenant()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare owner uuid;
begin
  select municipality_id into owner from public.meetings where id = new.meeting_id;
  if owner is null or owner <> new.municipality_id then
    raise exception 'Document does not belong to the meeting''s municipality'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_documents_tenant on public.meeting_documents;
create trigger meeting_documents_tenant
  before insert or update of meeting_id, municipality_id on public.meeting_documents
  for each row execute function public.assert_document_tenant();

-- Uploading minutes moves a meeting off "Not Available" exactly once, so a
-- clerk never has to remember to change two fields.
create or replace function public.sync_minutes_status_on_upload()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.document_type = 'minutes' and new.active_version then
    update public.meetings
       set minutes_status = 'draft'
     where id = new.meeting_id and minutes_status = 'not_available';
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_documents_minutes_status on public.meeting_documents;
create trigger meeting_documents_minutes_status
  after insert on public.meeting_documents
  for each row execute function public.sync_minutes_status_on_upload();

-- ---------------------------------------------------------------------
-- Public visibility rules, in one place, used by RLS and by the API.
-- ---------------------------------------------------------------------
-- Minutes are public only once the governing body has approved them, unless
-- the municipality has opted in to publishing pending minutes.
create or replace function public.minutes_publicly_visible(
  m_status public.minutes_status,
  config jsonb
) returns boolean
language sql immutable as $$
  select m_status = 'approved'
      or (m_status = 'pending_approval'
          and coalesce((config ->> 'publish_pending_minutes')::boolean, false));
$$;

create or replace function public.document_publicly_visible(doc_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(bool_or(
      d.active_version
      and d.removed_at is null
      and m.status in ('published', 'archived')
      and (d.document_type <> 'minutes'
           or public.minutes_publicly_visible(m.minutes_status, mu.configuration))
    ), false)
  from public.meeting_documents d
  join public.meetings m on m.id = d.meeting_id
  join public.municipalities mu on mu.id = d.municipality_id
  where d.id = doc_id;
$$;
