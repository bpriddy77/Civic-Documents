-- =====================================================================
-- seed.sql - local development only.
--
-- Applied by `supabase db reset`. Never applied to production: production
-- bootstraps through `npm run bootstrap:tenant` (see docs/INSTALLATION.md).
-- =====================================================================

insert into public.municipalities (id, name, slug, timezone, website_url, contact_email, configuration)
values (
  '00000000-0000-4000-8000-000000000001',
  'City of Example',
  'city-of-example',
  'America/Chicago',
  'https://www.example-city.gov',
  'cityclerk@example-city.gov',
  jsonb_build_object(
    'date_format', 'MMMM d, yyyy',
    'time_format', 'h:mm a',
    'meetings_per_page', 20,
    'default_sort', 'newest',
    'archive_heading', 'Meeting Agendas & Minutes',
    'show_meeting_time', true,
    'show_location', true,
    'publish_pending_minutes', false,
    'max_upload_mb', 25,
    'primary_color', '#1B3A5C'
  )
)
on conflict (id) do nothing;

insert into public.meeting_categories (municipality_id, name, slug, display_order) values
  ('00000000-0000-4000-8000-000000000001', 'City Council',           'city-council',           10),
  ('00000000-0000-4000-8000-000000000001', 'Planning & Zoning',      'planning-zoning',        20),
  ('00000000-0000-4000-8000-000000000001', 'Economic Development',   'economic-development',   30),
  ('00000000-0000-4000-8000-000000000001', 'Board of Adjustments',   'board-of-adjustments',   40),
  ('00000000-0000-4000-8000-000000000001', 'Special Meeting',        'special-meeting',        50),
  ('00000000-0000-4000-8000-000000000001', 'Public Hearing',         'public-hearing',         60),
  ('00000000-0000-4000-8000-000000000001', 'Workshop',               'workshop',               70),
  ('00000000-0000-4000-8000-000000000001', 'Emergency Meeting',      'emergency-meeting',      80)
on conflict (municipality_id, slug) do nothing;

-- Local sign-in: clerk@example-city.gov / LocalDev!2026
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-00000000000a',
  'authenticated', 'authenticated', 'clerk@example-city.gov',
  crypt('LocalDev!2026', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Example City Clerk"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (auth_user_id, municipality_id, display_name, email, role)
values (
  '00000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-000000000001',
  'Example City Clerk', 'clerk@example-city.gov', 'admin')
on conflict (auth_user_id) do nothing;

-- A published past meeting and a published upcoming meeting so the public
-- pages have something to render immediately after a reset.
insert into public.meetings (municipality_id, category_id, title, slug, description,
                             meeting_date, meeting_time, location, status, minutes_status)
select
  '00000000-0000-4000-8000-000000000001', c.id,
  'City Council Regular Meeting', 'city-council-regular-meeting',
  'Regular monthly meeting of the City Council.',
  (current_date + 6), time '18:00', 'City Hall Council Chambers',
  'published', 'not_available'
from public.meeting_categories c
where c.municipality_id = '00000000-0000-4000-8000-000000000001' and c.slug = 'city-council'
on conflict do nothing;

insert into public.meetings (municipality_id, category_id, title, slug, description,
                             meeting_date, meeting_time, location, status, minutes_status)
select
  '00000000-0000-4000-8000-000000000001', c.id,
  'City Council Regular Meeting', 'city-council-regular-meeting',
  'Regular monthly meeting of the City Council.',
  (current_date - 24), time '18:00', 'City Hall Council Chambers',
  'published', 'approved'
from public.meeting_categories c
where c.municipality_id = '00000000-0000-4000-8000-000000000001' and c.slug = 'city-council'
on conflict do nothing;
