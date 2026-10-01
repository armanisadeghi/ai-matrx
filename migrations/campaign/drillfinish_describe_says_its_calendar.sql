-- applied directly 2026-09-30 by the owner (program DRILL-FINISH). The lane's draft called custom.agg_calendar from the INVOKER describe door, which signed-in seats cannot execute (would have refused every describe); this routes through a signed-in definer door instead. Clone-proven as test@test.com.
create or replace function platform.drill_calendar(p_organization_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog'
as $function$
begin
  -- The calendar an organization's periods are cut in (time zone + week start). The drill doors run as the
  -- seat, which may not execute custom.agg_calendar; this signed-in door decides reach first.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.drill_calendar');
  return custom.agg_calendar(p_organization_id);
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, non_client_lane, anonymous_callers)
values ('platform', 'drill_calendar', 'p_organization_id uuid', array['uuid'::regtype]::oid[],
  'Asks custom.assert_client_may_reach(p_organization_id) first; returns only that organization''s calendar settings (time zone, week start) that cut drill periods; reads no row of anyone''s data.',
  'migrations/campaign/drillfinish_describe_says_its_calendar.sql (program DRILL-FINISH)', true, null, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
revoke all on function platform.drill_calendar(uuid) from public, anon;
grant execute on function platform.drill_calendar(uuid) to authenticated;

-- based-on: platform.drill_describe(uuid,jsonb) c2e182c3fcb092dacb76915c5cf6d36946aef384d118818fe97b9926192bb495
create or replace function platform.drill_describe(p_organization_id uuid, p_source jsonb)
 returns jsonb language plpgsql stable set search_path to 'pg_catalog'
as $function$
declare
  v jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_describe');
  v := platform._drill_plan(p_organization_id, p_source, null, 'describe');
  if p_source ->> 'kind' = 'table' then
    if not coalesce((v ->> 'd2')::boolean, false) then
      raise exception 'A custom Table says its own dimensions and measures once lane DRILL-CUSTOM-PARITY''s door (custom.table_dimensions) is on this database.'
        using errcode = '0A000', hint = 'Until then ask it directly: its columns are its dimensions, and count / sum_<column> its measures.';
    end if;
    execute 'select custom.table_dimensions($1, $2)' into v using p_organization_id, (p_source ->> 'id')::uuid;
    return v || jsonb_build_object('source', jsonb_build_object('kind', 'table', 'id', p_source ->> 'id'),
                                   'stale_after_knob', null,
                                   'calendar', platform.drill_calendar(p_organization_id));
  end if;
  -- the calendar the door cuts periods in (VERIFY-DRILL-LIVE F8): screens print times in it and say it once
  return (v -> 'def') || jsonb_build_object('calendar', platform.drill_calendar(p_organization_id));
end
$function$;
;
