-- =====================================================================
-- VERIFY THE INSTALL
--
-- Run this in the SQL Editor after 01 and 02. Every check should say PASS.
-- Nothing here changes any data.
-- =====================================================================

-- 0. Which release is installed. Quote this when reporting a problem.
select version, applied_at, notes from public.schema_version
order by applied_at desc;


-- 1. All nine tables exist.
select
  case when count(*) = 9 then 'PASS' else 'FAIL' end as result,
  count(*) || ' of 9 tables found' as detail
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'municipalities','profiles','meetings','meeting_documents',
    'meeting_categories','audit_log','role_permissions','document_types',
    'schema_version'
  );


-- 2. Row-Level Security is enabled on every one of them.
--    If any row says FAIL, re-run 01-complete-schema.sql. Do not enable RLS
--    by hand in the dashboard: a manual change is not reproducible and will
--    be lost the next time the database is rebuilt.
select
  tablename,
  case when rowsecurity then 'PASS' else 'FAIL — RLS IS OFF' end as result
from pg_tables
where schemaname = 'public'
  and tablename in (
    'municipalities','profiles','meetings','meeting_documents',
    'meeting_categories','audit_log','role_permissions','document_types',
    'schema_version'
  )
order by rowsecurity, tablename;


-- 3. Policies were created (expect 33).
select
  case when count(*) >= 33 then 'PASS' else 'FAIL' end as result,
  count(*) || ' policies found' as detail
from pg_policies
where schemaname in ('public','storage');


-- 4. The storage bucket exists and is PRIVATE.
--    Public must be false. If it is true, published PDFs would be reachable
--    by guessing a path, bypassing the publication check entirely.
select
  id,
  case when public = false then 'PASS — private' else 'FAIL — BUCKET IS PUBLIC' end as result,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'meeting-documents';


-- 5. No anonymous access to storage. Expect zero rows.
--    Any row here means the public could read documents directly.
select policyname, roles, 'FAIL — anon can reach storage' as result
from pg_policies
where schemaname = 'storage'
  and 'anon' = any (roles);


-- 6. The permission matrix seeded.
select
  role,
  count(*) as permissions,
  case when count(*) > 0 then 'PASS' else 'FAIL' end as result
from public.role_permissions
group by role
order by role;


-- 7. Document types seeded (expect at least agenda and minutes).
select code, label, case when active then 'PASS' else 'inactive' end as result
from public.document_types
order by display_order;


-- 8. The municipality and its administrator exist, and the administrator's
--    profile is correctly linked to a real login.
select
  m.name,
  m.slug,
  m.timezone,
  p.email,
  p.role,
  case
    when p.auth_user_id is null then 'FAIL — profile not linked to a login'
    when not p.active then 'FAIL — account is inactive'
    else 'PASS'
  end as result
from public.municipalities m
left join public.profiles p on p.municipality_id = m.id;


-- 9. The audit log refuses modification. This should raise:
--    "The audit log is append only."
--    Uncomment to test, then re-comment. It is expected to ERROR.
--
-- update public.audit_log set action = 'tampered' where true;
