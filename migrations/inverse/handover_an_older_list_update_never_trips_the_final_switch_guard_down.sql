-- Inverse of handover_an_older_list_update_never_trips_the_final_switch_guard.sql: the body it replaced, byte for byte.
-- based-on: platform._final_switch_keeps_no_owner_lists_archived() e3c076e93853eb4b55b6ffb9dd60f77e175911999a24e0da21c395b9c7c9b95a
-- chair-step: restores the SECURITY INVOKER body of platform._final_switch_keeps_no_owner_lists_archived() that handover_an_older_list_update_never_trips_the_final_switch_guard.sql replaced

CREATE OR REPLACE FUNCTION platform._final_switch_keeps_no_owner_lists_archived()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if old.deleted_at is not null and new.deleted_at is null
     and coalesce(old.metadata, '{}'::jsonb) ? 'final_switch_no_owner'
     and coalesce(current_setting('app.final_switch_step', true), '') <> 'on'
     and platform._final_switch_is_on() then
    raise exception 'This pick list belonged to no organization, so the final switch archived it with no owner organization. Undoing the final switch (Administration → Database → Final switch) restores it; nothing was changed.'
      using errcode = '55000';
  end if;
  return new;
end;
$function$

