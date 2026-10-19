-- =====================================================================
-- 1400 - Index this system's own records directly
--
-- Meetings and their documents already live in this database, so there
-- is no reason to discover them by crawling the website. They are
-- written into the search index by trigger, in the same transaction
-- that publishes them, which means a resident can find an agenda the
-- moment the clerk posts it rather than after the next nightly crawl.
--
-- That immediacy is the whole argument for building this instead of
-- telling residents to use Google. Google will not have the agenda an
-- hour after it goes up, and for a new small-city site it may not have
-- indexed anything at all.
--
-- THE INVARIANT THAT MATTERS
--
-- A draft meeting and an unapproved set of minutes must never be
-- findable. The search index is a second route to content, and a
-- second route is exactly where a visibility rule gets quietly
-- reimplemented slightly differently and leaks something.
--
-- So nothing here restates the rule. Visibility is decided by the same
-- `document_publicly_visible()` the public API and the RLS policy use.
-- If that rule changes, this follows automatically.
--
-- Document bodies are filled in later by the crawler, which fetches
-- the PDF and extracts its text layer. Until then a document is
-- findable by its title, which is immediate and already useful.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Where a published record lives on the public web.
--
-- `records_base_url` is set from the deployment's own site URL when
-- settings are saved, so nobody types it. When it is missing the path
-- is still stored and the links are relative rather than wrong, and
-- the admin crawl page shows that it needs setting.
-- ---------------------------------------------------------------------
create or replace function public.records_url(p_municipality_id uuid, p_path text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select rtrim(coalesce(m.configuration ->> 'records_base_url', ''), '/') || p_path
    from public.municipalities m
   where m.id = p_municipality_id;
$$;

-- ---------------------------------------------------------------------
-- Recompute every index row belonging to one meeting.
--
-- Written as "work out what should exist, then make that true" rather
-- than as a set of insert/update/delete branches per event. A meeting
-- being unpublished, a document being retired, minutes being
-- un-approved and a title being corrected all reduce to the same
-- operation, and the paths that remove content cannot be the ones that
-- are missing.
-- ---------------------------------------------------------------------
create or replace function public.reindex_meeting(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting public.meetings;
  v_muni    public.municipalities;
  v_keep    text[] := '{}';
  v_url     text;
  v_doc     record;
begin
  select * into v_meeting from public.meetings where id = p_meeting_id;
  if not found then
    -- The meeting is gone, so everything indexed under it goes too.
    delete from public.search_documents
     where entity_type in ('meeting', 'document')
       and entity_id = p_meeting_id;
    return;
  end if;

  select * into v_muni from public.municipalities where id = v_meeting.municipality_id;

  -- The meeting's own page, if the public may see it.
  if v_meeting.status in ('published', 'archived') and v_muni.active then
    v_url := public.records_url(
      v_meeting.municipality_id,
      '/meetings/' || to_char(v_meeting.meeting_date, 'YYYY/MM/DD') || '/' || v_meeting.slug);
    v_keep := v_keep || v_url;

    insert into public.search_documents (
      municipality_id, url, title, source, body, entity_type, entity_id, indexed_at, last_seen_at)
    values (
      v_meeting.municipality_id, v_url,
      v_meeting.title || ' — ' || to_char(v_meeting.meeting_date, 'FMMonth FMDD, YYYY'),
      'meeting',
      coalesce(v_meeting.description, '') || ' ' || coalesce(v_meeting.location, ''),
      'meeting', v_meeting.id, now(), now())
    on conflict (municipality_id, url) do update
      set title        = excluded.title,
          source       = excluded.source,
          body         = excluded.body,
          entity_type  = excluded.entity_type,
          entity_id    = excluded.entity_id,
          removed_at   = null,
          last_seen_at = now(),
          updated_at   = now();
  end if;

  -- Each document the public may see. The body is left alone on
  -- update: the crawler owns it, and overwriting it here would throw
  -- away extracted PDF text every time a title was corrected.
  for v_doc in
    select d.*
      from public.meeting_documents d
     where d.meeting_id = p_meeting_id
       and public.document_publicly_visible(d.id)
  loop
    v_url := public.records_url(
      v_doc.municipality_id, '/documents/' || v_muni.slug || '/' || v_doc.public_slug);
    v_keep := v_keep || v_url;

    insert into public.search_documents (
      municipality_id, url, title, source, body, entity_type, entity_id, indexed_at, last_seen_at)
    values (
      v_doc.municipality_id, v_url,
      initcap(replace(v_doc.document_type, '_', ' ')) || ' — ' || v_meeting.title
        || ' — ' || to_char(v_meeting.meeting_date, 'FMMonth FMDD, YYYY'),
      'document', '', 'document', v_doc.id, now(), now())
    on conflict (municipality_id, url) do update
      set title        = excluded.title,
          source       = excluded.source,
          entity_type  = excluded.entity_type,
          entity_id    = excluded.entity_id,
          removed_at   = null,
          last_seen_at = now(),
          updated_at   = now();
  end loop;

  -- Anything previously indexed for this meeting that is no longer
  -- publicly visible. Deleted outright rather than marked removed: this
  -- is content that has been withdrawn or unpublished, and leaving a
  -- row behind is how an unapproved set of minutes stays findable.
  delete from public.search_documents
   where municipality_id = v_meeting.municipality_id
     and entity_type in ('meeting', 'document')
     and (entity_id = v_meeting.id
          or entity_id in (select id from public.meeting_documents
                            where meeting_id = p_meeting_id))
     and not (url = any (v_keep));
end $$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function public.search_index_meeting()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.reindex_meeting(coalesce(new.id, old.id));
  return coalesce(new, old);
end $$;

create or replace function public.search_index_document()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.reindex_meeting(coalesce(new.meeting_id, old.meeting_id));
  return coalesce(new, old);
end $$;

drop trigger if exists meetings_search_index on public.meetings;
create trigger meetings_search_index
  after insert or update or delete on public.meetings
  for each row execute function public.search_index_meeting();

drop trigger if exists documents_search_index on public.meeting_documents;
create trigger documents_search_index
  after insert or update or delete on public.meeting_documents
  for each row execute function public.search_index_document();

-- ---------------------------------------------------------------------
-- A settings change can alter what the public may see.
--
-- Turning on `publish_pending_minutes` makes every unapproved set of
-- minutes in the city public at once, and turning it back off makes
-- them private again. Without this, the index would keep answering by
-- the old setting -- and the direction that matters is the second one,
-- where minutes the council has not approved would remain findable
-- after the city decided they should not be.
-- ---------------------------------------------------------------------
create or replace function public.search_reindex_municipality()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if coalesce(old.configuration ->> 'publish_pending_minutes', '')
     is distinct from coalesce(new.configuration ->> 'publish_pending_minutes', '')
     or coalesce(old.configuration ->> 'records_base_url', '')
        is distinct from coalesce(new.configuration ->> 'records_base_url', '')
     or old.active is distinct from new.active
     or old.slug is distinct from new.slug
  then
    for v_id in select id from public.meetings where municipality_id = new.id loop
      perform public.reindex_meeting(v_id);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists municipalities_search_reindex on public.municipalities;
create trigger municipalities_search_reindex
  after update on public.municipalities
  for each row execute function public.search_reindex_municipality();

-- ---------------------------------------------------------------------
-- Backfill for an install that already has records.
-- ---------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  for v_id in select id from public.meetings loop
    perform public.reindex_meeting(v_id);
  end loop;
end $$;

insert into public.schema_version (version, notes)
values ('1.11.0', 'Site search: crawled pages and PDFs plus directly indexed records.')
on conflict (version) do update
  set applied_at = now(), notes = excluded.notes;
