-- =====================================================================
-- 1100 - New-meeting defaults
--
-- Four settings that pre-fill the Create meeting form: title, category,
-- day of the week, and time. They live in the municipality's
-- `configuration` JSON alongside the existing default location, so this
-- migration adds no columns and no constraints — the application's
-- schema validation supplies the defaults for any city that has not set
-- them, and an unset default simply leaves that field empty.
--
-- Each is per-municipality by construction. A city that meets on the
-- second Tuesday sets Tuesday; a city with no fixed pattern leaves the
-- day blank and gets the form it has today.
--
-- Why the category is stored as a slug rather than an id: a slug is
-- stable across a category being renamed, and across the category being
-- deleted and created again — which is what actually happens when
-- someone tidies the category list. An id stored here would dangle
-- silently, and the form would quietly stop pre-filling with no
-- indication why. A slug that no longer matches resolves to no default,
-- which is the correct fallback.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Forsan's own pattern: a Regular Meeting of the City Council, Tuesday
-- at 6:00 PM, at City Hall. Agendas are posted the Thursday before, which
-- does not affect the default — the next Tuesday counted from a Thursday is
-- that same meeting.
--
-- `||` merges, so any value the city has already chosen in Settings is
-- preserved rather than reset — this is safe to re-run, and re-running
-- the whole setup script will not undo a clerk's change.
-- ---------------------------------------------------------------------
update public.municipalities
   set configuration = jsonb_build_object(
         'default_meeting_title',   'Regular Meeting',
         'default_category_slug',   'city-council',
         'default_meeting_weekday', 2,          -- Tuesday; Sunday is 0
         'default_meeting_time',    '18:00'     -- 24-hour, as the time input uses
       ) || coalesce(configuration, '{}'::jsonb)
 where slug = 'city-of-forsan';

insert into public.schema_version (version, notes)
values ('1.10.1', 'New-meeting defaults: title, category, weekday, and time.')
on conflict (version) do update
  set applied_at = now(), notes = excluded.notes;
