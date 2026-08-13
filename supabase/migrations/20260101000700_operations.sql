-- =====================================================================
-- 0700 - Multi-statement operations that must not half-happen
--
-- These run SECURITY INVOKER, so Row-Level Security still applies to every
-- statement inside them. They exist for atomicity, not for privilege.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Upload or replace a document.
--
-- Version 1 is an upload. Every later version supersedes the previous one
-- and inherits its public_slug, so the URL already printed on a public
-- notice keeps resolving to the current record. The superseded row is
-- retained: previous government documents are never destroyed here.
-- ---------------------------------------------------------------------
create or replace function public.upsert_meeting_document(
  p_meeting_id        uuid,
  p_document_type     text,
  p_posted_date       date,
  p_storage_path      text,
  p_original_filename text,
  p_stored_filename   text,
  p_file_size         bigint,
  p_sha256            text default null
) returns public.meeting_documents
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_meeting  public.meetings;
  v_current  public.meeting_documents;
  v_profile  public.profiles;
  v_version  integer := 1;
  v_slug     text;
  v_row      public.meeting_documents;
begin
  select * into v_meeting from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'That meeting could not be found.' using errcode = 'P0002';
  end if;

  if p_posted_date is null then
    raise exception 'A Posted Date is required whenever a document is uploaded.'
      using errcode = '23502';
  end if;

  v_profile := public.current_profile();

  select * into v_current
  from public.meeting_documents
  where meeting_id = p_meeting_id
    and document_type = p_document_type
    and active_version;

  if found then
    v_version := v_current.version + 1;
    v_slug    := v_current.public_slug;

    update public.meeting_documents
       set active_version = false,
           replaced_at = now()
     where id = v_current.id;
  else
    -- New public identifier, derived from the meeting so it reads clearly in
    -- an email or on a QR code, with a numeric suffix only if it collides.
    v_slug := v_meeting.meeting_date || '-' || v_meeting.slug || '-' || p_document_type;
    if exists (
      select 1 from public.meeting_documents
      where municipality_id = v_meeting.municipality_id
        and public_slug = v_slug
        and active_version
    ) then
      v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
  end if;

  insert into public.meeting_documents (
    municipality_id, meeting_id, document_type, posted_date, storage_path,
    public_slug, original_filename, stored_filename, mime_type, file_size,
    sha256, version, active_version, uploaded_by)
  values (
    v_meeting.municipality_id, p_meeting_id, p_document_type, p_posted_date,
    p_storage_path, v_slug, p_original_filename, p_stored_filename,
    'application/pdf', p_file_size, p_sha256, v_version, true, v_profile.id)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.upsert_meeting_document(uuid, text, date, text, text, text, bigint, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- Duplicate a meeting.
--
-- Copies the recurring details a clerk would retype. Deliberately does not
-- copy documents, posted dates, approval status, or history: the new record
-- starts as an empty draft that happens to be pre-filled.
-- ---------------------------------------------------------------------
create or replace function public.duplicate_meeting(
  p_meeting_id       uuid,
  p_meeting_date     date,
  p_copy_description boolean default true
) returns public.meetings
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source public.meetings;
  v_new    public.meetings;
  v_profile public.profiles;
begin
  select * into v_source from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'That meeting could not be found.' using errcode = 'P0002';
  end if;

  v_profile := public.current_profile();

  insert into public.meetings (
    municipality_id, category_id, title, slug, description, meeting_date,
    meeting_time, location, status, minutes_status, created_by, updated_by)
  values (
    v_source.municipality_id, v_source.category_id, v_source.title, v_source.slug,
    case when p_copy_description then v_source.description else null end,
    p_meeting_date, v_source.meeting_time, v_source.location,
    'draft', 'not_available', v_profile.id, v_profile.id)
  returning * into v_new;

  perform public.record_audit_event(
    v_new.municipality_id, 'meeting.duplicated', 'meeting', v_new.id::text,
    null, to_jsonb(v_new), jsonb_build_object('duplicated_from', p_meeting_id));

  return v_new;
end;
$$;

grant execute on function public.duplicate_meeting(uuid, date, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Remove a document from public view without destroying it.
-- ---------------------------------------------------------------------
create or replace function public.retire_meeting_document(p_document_id uuid)
returns public.meeting_documents
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row public.meeting_documents;
begin
  update public.meeting_documents
     set active_version = false,
         removed_at = now(),
         replaced_at = coalesce(replaced_at, now())
   where id = p_document_id
   returning * into v_row;

  if not found then
    raise exception 'That document could not be found.' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

grant execute on function public.retire_meeting_document(uuid) to authenticated;
