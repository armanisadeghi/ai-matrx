-- additive: yes
-- based-on: platform._final_switch_keeps_no_owner_lists_archived() 6b064491aec06763362f0ec188e4bfa1ed2d87753fbe5472192d850854e4da29
--
-- HANDOVER (2026-09-27) — AN OLDER LIST'S UPDATE NEVER TRIPS THE FINAL SWITCH'S GUARD.
--
-- Replaces ONE live trigger-function body, same signature; nothing dropped, granted or revoked; no
-- row touched.
--
-- What a person met (admin@admin.com, a picklist in Lakeside Orthopedic Referrals, an organization
-- still on the old system, 2026-09-27): "Delete list" answered 500. EVERY update a signed-in person
-- makes to `workbench.udt_structured_lists` failed with 42501 "permission denied for function
-- _final_switch_is_on": the trigger `final_switch_keeps_no_owner_lists_archived` is SECURITY
-- INVOKER, and its one IF named `platform._final_switch_is_on()`, which `authenticated` may not
-- execute — Postgres checks a function's privilege when the expression is prepared, not only when
-- the AND reaches it, so a rename, a delete, a visibility change all failed, in every organization
-- still on the old system.
-- Now: the cheap tests (is it a restore of a no-owner list, outside the switch's own step) come
-- first in their own IF, and the function runs as its owner (a trigger function has no call surface
-- of its own), so the final switch's question is asked only for the one row it guards.
-- Guard: matrx-frontend/scripts/campaign-tests/handover_an_older_list_update_never_trips_the_final_switch_guard.sql
-- Inverse: migrations/inverse/handover_an_older_list_update_never_trips_the_final_switch_guard_down.sql

CREATE OR REPLACE FUNCTION platform._final_switch_keeps_no_owner_lists_archived()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- A restore of a pick list the final switch archived with no owner organization, and only that.
  if old.deleted_at is not null and new.deleted_at is null
     and coalesce(old.metadata, '{}'::jsonb) ? 'final_switch_no_owner'
     and coalesce(current_setting('app.final_switch_step', true), '') <> 'on' then
    if platform._final_switch_is_on() then
      raise exception 'This pick list belonged to no organization, so the final switch archived it with no owner organization. Undoing the final switch (Administration → Database → Final switch) restores it; nothing was changed.'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$function$;
