-- =====================================================================
-- 1000 - Alerts: expired alerts must not hold the slot
--
-- The 0900 migration enforced "one live alert per municipality" with a
-- partial unique index on `where cleared_at is null`. But everywhere
-- else in the system — the RLS policy, the public API, the admin page,
-- `current_alert()` — "live" means `cleared_at is null AND expires_at >
-- now()`.
--
-- So an alert that reached its expiry without anyone pressing Clear
-- disappeared from the website, showed as "no alert" in the admin, and
-- still occupied the slot. Every subsequent post failed with
--
--     duplicate key value violates unique constraint
--     "alerts_one_live_per_tenant"
--
-- which the API reported as "An alert is already showing" — while the
-- same page showed none. Expiry is the normal way an alert ends, so
-- this broke the second alert a city ever posted.
--
-- `now()` is not immutable and cannot appear in an index predicate, so
-- the fix is to retire expired alerts before the insert rather than to
-- widen the predicate.
-- =====================================================================

-- Retire anything already expired, so existing installs are unblocked.
-- cleared_at is set to the expiry time, not now(), so the history shows
-- when the alert actually stopped being visible to residents.
update public.alerts
   set cleared_at = expires_at
 where cleared_at is null
   and expires_at <= now();

-- ---------------------------------------------------------------------
-- Auto-retire on insert.
--
-- A BEFORE INSERT trigger rather than application code: the uniqueness
-- rule lives in the database, so the thing that reconciles it with
-- expiry belongs there too. Posting an alert from psql, from a future
-- admin screen, or from a script all behave the same way.
-- ---------------------------------------------------------------------
create or replace function public.retire_expired_alerts()
returns trigger
language plpgsql
as $$
begin
  update public.alerts
     set cleared_at = expires_at
   where municipality_id = new.municipality_id
     and cleared_at is null
     and expires_at <= now();
  return new;
end $$;

drop trigger if exists alerts_retire_expired on public.alerts;
create trigger alerts_retire_expired before insert on public.alerts
  for each row execute function public.retire_expired_alerts();

-- ---------------------------------------------------------------------
-- Distinguish an alert that expired from one someone cleared.
--
-- Both end with cleared_at set. Only a deliberate clear records who did
-- it, so a null cleared_by is the signature of automatic expiry — worth
-- separating in the audit trail, because "the clerk took it down" and
-- "it timed out" are different facts after an emergency.
-- ---------------------------------------------------------------------
create or replace function public.audit_alert_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actions text[] := '{}';
  action  text;
begin
  if tg_op = 'INSERT' then
    actions := array['alert.published'];
  elsif tg_op = 'UPDATE' then
    if old.cleared_at is null and new.cleared_at is not null then
      actions := array[
        case when new.cleared_by is null then 'alert.expired' else 'alert.cleared' end
      ];
    elsif old.message is distinct from new.message
       or old.severity is distinct from new.severity
       or old.expires_at is distinct from new.expires_at then
      actions := array['alert.updated'];
    end if;
  elsif tg_op = 'DELETE' then
    actions := array['alert.deleted'];
  end if;

  foreach action in array actions loop
    perform public.record_audit_event(
      p_municipality_id => coalesce(new.municipality_id, old.municipality_id),
      p_action          => action,
      p_entity_type     => 'alert',
      p_entity_id       => coalesce(new.id, old.id)::text,
      p_metadata        => jsonb_build_object(
        'severity',   coalesce(new.severity, old.severity)::text,
        'expires_at', coalesce(new.expires_at, old.expires_at)
      )
    );
  end loop;

  return coalesce(new, old);
end $$;

-- Replace the misleading comment left on the index by 0900.
comment on index public.alerts_one_live_per_tenant is
  'One uncleared alert per municipality. Expired alerts are retired by the alerts_retire_expired trigger before an insert, so they do not hold the slot.';

insert into public.schema_version (version, notes)
values ('1.9.3', 'Expired alerts no longer block posting a new one.')
on conflict (version) do update
  set applied_at = now(), notes = excluded.notes;
