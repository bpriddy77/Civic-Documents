-- =====================================================================
-- 0500 - Supabase Storage
--
-- The bucket is private. Nothing in it is ever served directly to the
-- public; citizens reach documents through /documents/... which checks
-- publication state first and then streams the object server side.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-documents',
  'meeting-documents',
  false,
  52428800,                      -- 50 MB ceiling; the app enforces a lower,
  array['application/pdf']       -- configurable limit per municipality.
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path shape: municipalities/{municipality_id}/meetings/{meeting_id}/{type}/{file}
create or replace function storage.object_municipality_id(object_name text)
returns uuid language plpgsql immutable as $$
declare parts text[] := string_to_array(object_name, '/');
begin
  if array_length(parts, 1) < 2 or parts[1] <> 'municipalities' then
    return null;
  end if;
  return parts[2]::uuid;
exception when others then return null;
end;
$$;

create policy "staff read own municipality documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-documents'
    and public.may('document.read', storage.object_municipality_id(name))
  );

create policy "staff write own municipality documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meeting-documents'
    and public.may('document.manage', storage.object_municipality_id(name))
  );

create policy "staff update own municipality documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'meeting-documents'
    and public.may('document.manage', storage.object_municipality_id(name))
  );

-- Superseded versions are retained. Only a role holding document.delete may
-- remove bytes, and only inside its own tenant folder.
create policy "restricted delete of municipality documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meeting-documents'
    and public.may('document.delete', storage.object_municipality_id(name))
  );

-- Deliberately absent: any policy granting the `anon` role access to
-- storage.objects. Public document delivery goes through the application.
