-- =====================================================================
-- 0600 - Reference data
--
-- This is schema, not sample content: the permission matrix and the
-- document type list are part of the security model and must be
-- reproducible from migrations alone.
-- =====================================================================

insert into public.document_types (code, label, display_order) values
  ('agenda',  'Agenda',  10),
  ('minutes', 'Minutes', 20)
on conflict (code) do update set label = excluded.label,
                                 display_order = excluded.display_order;

-- Super administrators are not listed: public.has_permission() grants them
-- everything unconditionally.
delete from public.role_permissions where role <> 'super_admin';

insert into public.role_permissions (role, permission) values
  -- Administrator: everything inside their own municipality.
  ('admin', 'meeting.read'),
  ('admin', 'meeting.create'),
  ('admin', 'meeting.update'),
  ('admin', 'meeting.publish'),
  ('admin', 'meeting.archive'),
  ('admin', 'meeting.delete'),
  ('admin', 'document.read'),
  ('admin', 'document.manage'),
  ('admin', 'document.delete'),
  ('admin', 'category.read'),
  ('admin', 'category.manage'),
  ('admin', 'category.delete'),
  ('admin', 'user.read'),
  ('admin', 'user.manage'),
  ('admin', 'audit.read'),
  ('admin', 'municipality.update'),

  -- Editor / City Secretary: the day to day clerk workflow.
  ('editor', 'meeting.read'),
  ('editor', 'meeting.create'),
  ('editor', 'meeting.update'),
  ('editor', 'meeting.publish'),
  ('editor', 'document.read'),
  ('editor', 'document.manage'),
  ('editor', 'category.read'),
  ('editor', 'audit.read'),

  -- Read only: look, do not touch.
  ('read_only', 'meeting.read'),
  ('read_only', 'document.read'),
  ('read_only', 'category.read'),
  ('read_only', 'audit.read')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Convenience view for the admin dashboard counters.
-- ---------------------------------------------------------------------
create or replace view public.meeting_dashboard_counts
with (security_invoker = true) as
select
  m.municipality_id,
  count(*) filter (where m.status = 'published' and m.starts_at >= now())            as upcoming,
  count(*) filter (where m.status = 'draft')                                          as drafts,
  count(*) filter (where m.status = 'published')                                      as published,
  count(*) filter (where m.status = 'archived')                                       as archived,
  count(*) filter (where m.status = 'published' and m.starts_at < now()
                     and m.minutes_status = 'not_available')                          as awaiting_minutes,
  count(*) filter (where m.minutes_status = 'pending_approval')                       as minutes_pending_approval,
  count(*) filter (where m.status = 'published'
                     and date_part('year', m.starts_at) = date_part('year', now()))   as published_this_year
from public.meetings m
group by m.municipality_id;

grant select on public.meeting_dashboard_counts to authenticated;
