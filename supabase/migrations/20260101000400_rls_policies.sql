-- =====================================================================
-- 0400 - Row-Level Security
--
-- Every table is deny-by-default. The public (anon) role can read only
-- explicitly published records. Authenticated users are confined to their
-- own municipality by public.can_access_municipality(), and to their own
-- capabilities by public.has_permission().
-- =====================================================================

alter table public.municipalities     enable row level security;
alter table public.profiles           enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.document_types     enable row level security;
alter table public.meeting_categories enable row level security;
alter table public.meetings           enable row level security;
alter table public.meeting_documents  enable row level security;
alter table public.audit_log          enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.municipalities, public.meeting_categories,
                public.meetings, public.meeting_documents,
                public.document_types, public.role_permissions
  to anon, authenticated;
grant select, insert, update, delete
  on public.meetings, public.meeting_documents, public.meeting_categories,
     public.profiles, public.municipalities
  to authenticated;
grant select on public.audit_log to authenticated;

-- ---------------------------------------------------------------------
-- municipalities
-- ---------------------------------------------------------------------
create policy municipalities_public_read on public.municipalities
  for select to anon using (active);

create policy municipalities_member_read on public.municipalities
  for select to authenticated
  using (public.is_super_admin() or id = public.current_municipality_id());

create policy municipalities_update on public.municipalities
  for update to authenticated
  using (public.may('municipality.update', id))
  with check (public.may('municipality.update', id));

create policy municipalities_insert on public.municipalities
  for insert to authenticated
  with check (public.is_super_admin());

create policy municipalities_delete on public.municipalities
  for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- reference data
-- ---------------------------------------------------------------------
create policy document_types_read on public.document_types
  for select to anon, authenticated using (true);

create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_self_read on public.profiles
  for select to authenticated using (auth_user_id = auth.uid());

create policy profiles_tenant_read on public.profiles
  for select to authenticated
  using (public.may('user.read', municipality_id));

create policy profiles_manage_insert on public.profiles
  for insert to authenticated
  with check (
    public.may('user.manage', municipality_id)
    -- Only a super administrator may mint another super administrator.
    and (role <> 'super_admin' or public.is_super_admin())
  );

create policy profiles_manage_update on public.profiles
  for update to authenticated
  using (public.may('user.manage', municipality_id))
  with check (
    public.may('user.manage', municipality_id)
    and (role <> 'super_admin' or public.is_super_admin())
  );

-- Accounts are disabled, not deleted, so history keeps its author.
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- meeting_categories
-- ---------------------------------------------------------------------
create policy categories_public_read on public.meeting_categories
  for select to anon
  using (
    active and archived_at is null
    and exists (select 1 from public.municipalities m
                where m.id = municipality_id and m.active)
  );

create policy categories_member_read on public.meeting_categories
  for select to authenticated
  using (public.may('category.read', municipality_id));

create policy categories_insert on public.meeting_categories
  for insert to authenticated
  with check (public.may('category.manage', municipality_id));

create policy categories_update on public.meeting_categories
  for update to authenticated
  using (public.may('category.manage', municipality_id))
  with check (public.may('category.manage', municipality_id));

create policy categories_delete on public.meeting_categories
  for delete to authenticated
  using (public.may('category.delete', municipality_id));

-- ---------------------------------------------------------------------
-- meetings
--
-- Drafts are invisible to anon. On update, WITH CHECK inspects the row as
-- it will exist after the write, so an editor without meeting.publish can
-- never leave a row in the published state - including by editing one that
-- is already published.
-- ---------------------------------------------------------------------
create policy meetings_public_read on public.meetings
  for select to anon
  using (
    status in ('published', 'archived')
    and exists (select 1 from public.municipalities m
                where m.id = municipality_id and m.active)
  );

create policy meetings_member_read on public.meetings
  for select to authenticated
  using (public.may('meeting.read', municipality_id));

create policy meetings_insert on public.meetings
  for insert to authenticated
  with check (
    public.may('meeting.create', municipality_id)
    and (status <> 'published' or public.has_permission('meeting.publish'))
    and (status <> 'archived'  or public.has_permission('meeting.archive'))
  );

create policy meetings_update on public.meetings
  for update to authenticated
  using (public.may('meeting.update', municipality_id))
  with check (
    public.may('meeting.update', municipality_id)
    and (status <> 'published' or public.has_permission('meeting.publish'))
    and (status <> 'archived'  or public.has_permission('meeting.archive'))
  );

create policy meetings_delete on public.meetings
  for delete to authenticated
  using (public.may('meeting.delete', municipality_id));

-- ---------------------------------------------------------------------
-- meeting_documents
-- ---------------------------------------------------------------------
create policy documents_public_read on public.meeting_documents
  for select to anon
  using (
    active_version
    and removed_at is null
    and exists (
      select 1
      from public.meetings mt
      join public.municipalities mu on mu.id = mt.municipality_id
      where mt.id = meeting_id
        and mu.active
        and mt.status in ('published', 'archived')
        and (document_type <> 'minutes'
             or public.minutes_publicly_visible(mt.minutes_status, mu.configuration))
    )
  );

create policy documents_member_read on public.meeting_documents
  for select to authenticated
  using (public.may('document.read', municipality_id));

create policy documents_insert on public.meeting_documents
  for insert to authenticated
  with check (public.may('document.manage', municipality_id));

create policy documents_update on public.meeting_documents
  for update to authenticated
  using (public.may('document.manage', municipality_id))
  with check (public.may('document.manage', municipality_id));

create policy documents_delete on public.meeting_documents
  for delete to authenticated
  using (public.may('document.delete', municipality_id));

-- ---------------------------------------------------------------------
-- audit_log - readable by permitted staff, writable by nobody.
-- Rows are inserted by public.record_audit_event(), which is SECURITY
-- DEFINER and owned by the table owner, so it bypasses these policies.
-- ---------------------------------------------------------------------
create policy audit_read on public.audit_log
  for select to authenticated
  using (public.may('audit.read', municipality_id));
