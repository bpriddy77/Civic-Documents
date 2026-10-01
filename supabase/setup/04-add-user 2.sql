-- =====================================================================
-- ADD A STAFF MEMBER
--
-- Use this for every user after the first one. Run it in the Supabase
-- SQL Editor AFTER creating their login under
-- Authentication -> Users -> Add user.
--
-- Do NOT re-run 02-create-municipality.sql to add a second person. That
-- script also rewrites the municipality's name, time zone, and website
-- from the values hardcoded in it — so if anyone has since changed those
-- in Admin -> Settings, running it again silently reverts them.
-- This script touches nothing but the one profile.
--
-- Safe to run more than once. Running it again updates that person's
-- name and role rather than creating a duplicate.
-- =====================================================================


-- ---------------------------------------------------------------------
-- EDIT THESE FOUR VALUES, THEN RUN.
--
--   ROLES
--     read_only    Views meetings, documents, and history. Changes nothing.
--     editor       Creates, edits, and publishes meetings; uploads and
--                  replaces documents. Cannot delete, manage users,
--                  change categories, or change settings.
--     admin        Everything above, plus users, categories, settings,
--                  archiving, and deletion.
--     super_admin  Spans municipalities. Reserve for whoever maintains
--                  the system, not for day-to-day city staff.
--
--   Most clerks should be `editor`. Grant `admin` deliberately, and
--   `super_admin` almost never.
-- ---------------------------------------------------------------------

do $$
declare
  -- ↓↓↓ EDIT ↓↓↓
  v_email             text := 'deputy@example-city.gov';
  v_display_name      text := 'Deputy Clerk';
  v_role              public.app_role := 'editor';
  v_municipality_slug text := 'city-of-example';
  -- ↑↑↑ EDIT ↑↑↑

  v_auth_user_id    uuid;
  v_municipality_id uuid;
  v_existing        text;
begin
  select id into v_auth_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_auth_user_id is null then
    raise exception
      'No login found for %. Create it first: Authentication -> Users -> Add user (tick Auto Confirm User), then run this again.',
      v_email;
  end if;

  select id into v_municipality_id
  from public.municipalities
  where slug = v_municipality_slug;

  if v_municipality_id is null then
    raise exception
      'No municipality with the slug %. Check the spelling, or run 02-create-municipality.sql first.',
      v_municipality_slug;
  end if;

  select role::text into v_existing
  from public.profiles
  where auth_user_id = v_auth_user_id;

  insert into public.profiles (auth_user_id, municipality_id, display_name, email, role, active)
  values (v_auth_user_id, v_municipality_id, v_display_name, v_email, v_role, true)
  on conflict (auth_user_id) do update
    set municipality_id = excluded.municipality_id,
        display_name    = excluded.display_name,
        role            = excluded.role,
        active          = true;

  if v_existing is null then
    raise notice 'Added % as % for %.', v_email, v_role, v_municipality_slug;
  elsif v_existing <> v_role::text then
    raise notice 'Changed % from % to %.', v_email, v_existing, v_role;
  else
    raise notice 'No change: % was already %.', v_email, v_role;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- Everyone who can sign in, and what they can do.
-- ---------------------------------------------------------------------
select
  p.display_name,
  p.email,
  p.role,
  m.slug as municipality,
  case when p.active then 'active' else 'DISABLED' end as status,
  p.created_at::date as added
from public.profiles p
left join public.municipalities m on m.id = p.municipality_id
order by
  case p.role
    when 'super_admin' then 1 when 'admin' then 2
    when 'editor' then 3 else 4
  end,
  p.display_name;


-- ---------------------------------------------------------------------
-- To remove someone's access, disable rather than delete — deleting the
-- profile would orphan the audit entries recording what they did.
-- Takes effect on their next request, not when their session expires.
-- ---------------------------------------------------------------------
--
-- update public.profiles set active = false, disabled_at = now()
-- where lower(email) = lower('former.employee@example-city.gov');
