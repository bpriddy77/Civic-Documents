-- =====================================================================
-- 1200 - A removed document can be uploaded again
--
-- `upsert_meeting_document` derived the next version number from the
-- row that is currently active:
--
--     select * into v_current ... and active_version;
--     if found then v_version := v_current.version + 1;
--
-- but the uniqueness rule spans every row, live or not:
--
--     unique (meeting_id, document_type, version)
--
-- `retire_meeting_document` clears active_version without putting
-- anything in its place, so after a removal there is no active row at
-- all. The lookup then finds nothing, version restarts at 1, and the
-- insert collides with the version 1 still sitting in history:
--
--     duplicate key value violates unique constraint
--     "meeting_documents_meeting_id_document_type_version_key"
--
-- The meeting is left permanently unable to accept that document type,
-- and the only thing the clerk sees is "The document could not be
-- recorded against this meeting." Remove-then-upload is the ordinary
-- way to fix a wrong file, so this was reachable the first time anyone
-- posted the wrong PDF.
--
-- Two changes, and the second matters as much as the first:
--
--  1. The version comes from the highest version ever issued for this
--     meeting and type, not from the active row. Version numbers are
--     an append-only sequence over the whole history, which is what
--     the constraint already assumed.
--
--  2. The public_slug is inherited from that same row. The previous
--     code only preserved the slug when replacing a live document; a
--     document uploaded again after a removal fell to the `else`
--     branch and was issued a brand-new public URL. Those URLs are
--     printed on posted notices and in meeting packets and are
--     promised to be permanent, so a clerk fixing a wrong file would
--     silently have broken every link already distributed.
-- =====================================================================

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
  v_previous public.meeting_documents;
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

  -- The most recent version of this document, whether it is live, has
  -- been replaced, or was removed. Ordering by version rather than by
  -- created_at keeps this consistent with the constraint it has to
  -- satisfy.
  select * into v_previous
  from public.meeting_documents
  where meeting_id = p_meeting_id
    and document_type = p_document_type
  order by version desc
  limit 1;

  if found then
    v_version := v_previous.version + 1;
    v_slug    := v_previous.public_slug;

    -- Stand down whatever is live. After a removal there is nothing to
    -- stand down, which is why this is a statement over the set rather
    -- than an update of one known row.
    update public.meeting_documents
       set active_version = false,
           replaced_at = now()
     where meeting_id = p_meeting_id
       and document_type = p_document_type
       and active_version;
  else
    -- Genuinely the first upload of this type. New public identifier,
    -- derived from the meeting so it reads clearly in an email or on a
    -- QR code, with a numeric suffix only if it collides.
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
-- Record a withdrawal as a withdrawal.
--
-- Reproduced byte-for-byte from 0300 with only the branch order changed,
-- so nothing else in this function can drift by transcription.
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
      -- Removal is tested first. Retiring a document sets removed_at and
      -- clears active_version in the same statement, so the superseded test
      -- matched first and a withdrawal was recorded as "replaced by a newer
      -- version" -- document.removed could never be emitted at all. In a
      -- public records system those are different facts, and the removal is
      -- the one someone will later need to account for.
      if new.removed_at is not null and old.removed_at is null then
        actions := array['document.removed'];
      elsif old.active_version and not new.active_version then
        actions := array['document.superseded'];
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

insert into public.schema_version (version, notes)
values ('1.10.2', 'Re-upload after removal; removals recorded as removals.')
on conflict (version) do update
  set applied_at = now(), notes = excluded.notes;
