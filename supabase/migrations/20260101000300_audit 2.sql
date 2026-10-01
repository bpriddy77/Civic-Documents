-- =====================================================================
-- 0300 - Audit trail
-- Every write to an audited table produces audit rows from inside the
-- database, so an event cannot be skipped by forgetting to call a helper.
-- =====================================================================

-- Request context, when the write arrived through PostgREST.
create or replace function public.request_ip()
returns inet language plpgsql stable as $$
declare raw text;
begin
  raw := split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  if btrim(raw) = '' then return null; end if;
  return btrim(raw)::inet;
exception when others then return null;
end;
$$;

create or replace function public.request_user_agent()
returns text language plpgsql stable as $$
begin
  return left(current_setting('request.headers', true)::json ->> 'user-agent', 512);
exception when others then return null;
end;
$$;

-- Single writer for audit rows. SECURITY DEFINER because `authenticated`
-- has no direct INSERT grant on audit_log.
create or replace function public.record_audit_event(
  p_municipality_id uuid,
  p_action          text,
  p_entity_type     text,
  p_entity_id       text default null,
  p_previous_data   jsonb default null,
  p_new_data        jsonb default null,
  p_metadata        jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prof public.profiles;
  new_id bigint;
begin
  prof := public.current_profile();
  insert into public.audit_log (
    municipality_id, user_id, user_name, user_email, action, entity_type,
    entity_id, previous_data, new_data, metadata, ip_address, user_agent)
  values (
    coalesce(p_municipality_id, prof.municipality_id), prof.id, prof.display_name,
    prof.email, p_action, p_entity_type, p_entity_id, p_previous_data, p_new_data,
    coalesce(p_metadata, '{}'::jsonb), public.request_ip(), public.request_user_agent())
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.record_audit_event(uuid, text, text, text, jsonb, jsonb, jsonb)
  to authenticated;

-- Columns that are noise in a diff.
create or replace function public.audit_scrub(payload jsonb)
returns jsonb language sql immutable as $$
  select coalesce(payload, '{}'::jsonb) - 'search_vector' - 'updated_at';
$$;

-- ---------------------------------------------------------------------
-- Generic row auditor. Derives semantic action names from the diff so the
-- log reads like a records history rather than a table changelog.
-- ---------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entity   text := tg_argv[0];
  tenant   uuid;
  old_j    jsonb := case when tg_op = 'INSERT' then null else public.audit_scrub(to_jsonb(old)) end;
  new_j    jsonb := case when tg_op = 'DELETE' then null else public.audit_scrub(to_jsonb(new)) end;
  actions  text[] := '{}';
  act      text;
  meta     jsonb := '{}'::jsonb;
begin
  tenant := coalesce(
    (new_j ->> 'municipality_id')::uuid,
    (old_j ->> 'municipality_id')::uuid);

  if tg_op = 'INSERT' then
    if entity = 'document' then
      actions := array[ case when new.version > 1 then 'document.replaced'
                             else 'document.uploaded' end ];
      meta := jsonb_build_object('document_type', new.document_type, 'version', new.version);
    else
      actions := array[entity || '.created'];
    end if;

  -- NOTE: every append to `actions` must cast the right side to ::text.
  -- `text[] || 'literal'` is ambiguous in PostgreSQL; it resolves to
  -- array || array and then fails with "malformed array literal".
  elsif tg_op = 'DELETE' then
    actions := array[entity || '.deleted'];

  else
    if entity = 'meeting' then
      if new.status is distinct from old.status then
        actions := actions || (case new.status
          when 'published' then 'meeting.published'
          when 'archived'  then 'meeting.archived'
          when 'draft'     then case when old.status = 'archived'
                                     then 'meeting.restored'
                                     else 'meeting.unpublished' end
        end)::text;
      end if;
      if new.minutes_status is distinct from old.minutes_status then
        actions := actions || 'meeting.minutes_status_changed'::text;
        meta := meta || jsonb_build_object('from', old.minutes_status, 'to', new.minutes_status);
      end if;
      if new.category_id is distinct from old.category_id then
        actions := actions || 'meeting.category_changed'::text;
      end if;
      if actions = '{}' then actions := array['meeting.updated']; end if;

    elsif entity = 'document' then
      if old.active_version and not new.active_version then
        actions := array['document.superseded'];
      elsif new.removed_at is not null and old.removed_at is null then
        actions := array['document.removed'];
      else
        actions := array['document.updated'];
      end if;
      meta := jsonb_build_object('document_type', new.document_type, 'version', new.version);

    elsif entity = 'user' then
      if new.role is distinct from old.role then
        actions := actions || 'user.role_changed'::text;
        meta := meta || jsonb_build_object('from', old.role, 'to', new.role);
      end if;
      if new.active is distinct from old.active then
        actions := actions || (case when new.active then 'user.enabled' else 'user.disabled' end)::text;
      end if;
      if actions = '{}' then actions := array['user.updated']; end if;

    else
      actions := array[entity || '.updated'];
    end if;
  end if;

  foreach act in array actions loop
    perform public.record_audit_event(
      tenant, act, entity,
      coalesce(new_j ->> 'id', old_j ->> 'id'),
      old_j, new_j, meta);
  end loop;

  return null;
end;
$$;

drop trigger if exists meetings_audit on public.meetings;
create trigger meetings_audit
  after insert or update or delete on public.meetings
  for each row execute function public.audit_row_change('meeting');

drop trigger if exists meeting_documents_audit on public.meeting_documents;
create trigger meeting_documents_audit
  after insert or update or delete on public.meeting_documents
  for each row execute function public.audit_row_change('document');

drop trigger if exists meeting_categories_audit on public.meeting_categories;
create trigger meeting_categories_audit
  after insert or update or delete on public.meeting_categories
  for each row execute function public.audit_row_change('category');

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change('user');

drop trigger if exists municipalities_audit on public.municipalities;
create trigger municipalities_audit
  after insert or update or delete on public.municipalities
  for each row execute function public.audit_row_change('municipality');

-- ---------------------------------------------------------------------
-- Tamper resistance
-- ---------------------------------------------------------------------
create or replace function public.reject_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'The audit log is append only'
    using errcode = '42501';
end;
$$;

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.reject_audit_mutation();

revoke insert, update, delete on public.audit_log from anon, authenticated;
