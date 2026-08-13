-- =====================================================================
-- CREATE MUNICIPALITY AND FIRST ADMINISTRATOR
--
-- Run this in the Supabase SQL Editor AFTER 01-complete-schema.sql, and
-- AFTER creating the administrator's login under
-- Authentication -> Users -> Add user.
--
-- This is the dashboard equivalent of `npm run bootstrap:tenant`.
--
-- Safe to run more than once. Running it again updates the municipality's
-- details rather than creating a duplicate.
-- =====================================================================


-- ---------------------------------------------------------------------
-- EDIT THESE SEVEN VALUES, THEN RUN THE WHOLE FILE.
-- ---------------------------------------------------------------------
--
--   admin_email   MUST exactly match the email of the user you created
--                 under Authentication -> Users. If it does not match,
--                 the script stops with a clear message and changes nothing.
--
--   slug          Appears in every permanent document URL and is
--                 effectively permanent once anything is published.
--                 Lowercase letters, numbers, and hyphens only.
--
--   timezone      An IANA name, e.g. America/Chicago, America/New_York,
--                 America/Denver, America/Los_Angeles, America/Phoenix.
--                 This decides when a meeting moves from Upcoming to Past.
--
-- ---------------------------------------------------------------------

do $$
declare
  -- ↓↓↓ EDIT ↓↓↓
  v_name        text := 'City of Example';
  v_slug        text := 'city-of-example';
  v_timezone    text := 'America/Chicago';
  v_admin_email text := 'clerk@example-city.gov';
  v_admin_name  text := 'Jane Clerk';
  v_admin_role  public.app_role := 'super_admin';
  v_website     text := 'https://www.example-city.gov';
  -- ↑↑↑ EDIT ↑↑↑

  v_municipality_id uuid;
  v_auth_user_id    uuid;
  v_categories      text[] := array[
    'City Council',
    'Planning & Zoning',
    'Economic Development',
    'Board of Adjustments',
    'Special Meeting',
    'Public Hearing',
    'Workshop',
    'Emergency Meeting'
  ];
  v_category text;
  v_index    int := 0;
begin
  -- Fail early and clearly if the login has not been created yet, rather
  -- than creating a municipality nobody can sign in to administer.
  select id into v_auth_user_id
  from auth.users
  where lower(email) = lower(v_admin_email)
  limit 1;

  if v_auth_user_id is null then
    raise exception
      'No user found with the email %. Create the login first: Authentication -> Users -> Add user, then run this again.',
      v_admin_email;
  end if;

  -- The municipality.
  insert into public.municipalities (name, slug, timezone, website_url, configuration)
  values (
    v_name,
    v_slug,
    v_timezone,
    v_website,
    jsonb_build_object(
      'date_format', 'MMMM d, yyyy',
      'time_format', 'h:mm a',
      'meetings_per_page', 20,
      'default_sort', 'newest',
      'archive_heading', 'Meeting Agendas & Minutes',
      'show_meeting_time', true,
      'show_location', true,
      'publish_pending_minutes', false,
      'max_upload_mb', 25
    )
  )
  on conflict (slug) do update
    set name        = excluded.name,
        timezone    = excluded.timezone,
        website_url = excluded.website_url
  returning id into v_municipality_id;

  -- Starter categories. Editable later in Admin -> Categories.
  foreach v_category in array v_categories loop
    v_index := v_index + 1;
    insert into public.meeting_categories (municipality_id, name, slug, display_order)
    values (
      v_municipality_id,
      v_category,
      lower(regexp_replace(regexp_replace(v_category, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')),
      v_index * 10
    )
    on conflict (municipality_id, slug) do nothing;
  end loop;

  -- The administrator's profile, linked to the login you already created.
  insert into public.profiles (auth_user_id, municipality_id, display_name, email, role, active)
  values (v_auth_user_id, v_municipality_id, v_admin_name, v_admin_email, v_admin_role, true)
  on conflict (auth_user_id) do update
    set municipality_id = excluded.municipality_id,
        display_name    = excluded.display_name,
        role            = excluded.role,
        active          = true;

  raise notice 'Municipality ready: % (%)', v_name, v_municipality_id;
  raise notice 'Administrator: % (%)', v_admin_email, v_admin_role;
  raise notice 'Set NEXT_PUBLIC_DEFAULT_MUNICIPALITY to: %', v_slug;
end $$;


-- ---------------------------------------------------------------------
-- Confirm it worked. Expect one municipality, one profile, 8 categories.
-- ---------------------------------------------------------------------
select
  m.name,
  m.slug        as "set NEXT_PUBLIC_DEFAULT_MUNICIPALITY to this",
  m.timezone,
  p.email       as administrator,
  p.role,
  (select count(*) from public.meeting_categories c where c.municipality_id = m.id) as categories
from public.municipalities m
left join public.profiles p on p.municipality_id = m.id
order by m.created_at desc;
