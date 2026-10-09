-- lock: custom,platform
-- lane: AUTOMATION-TIME
-- chair-step: the inverse of campaign/automationtime_a_a_table_acts_when_a_date_arrives_and_on_a_schedule.sql. It unschedules the pg_cron job custom-automation-time-tick, drops the tick, the timed-run helper, the timed check, the clock and the once-only memory table custom.automation_fired, removes the knob custom/automation_catch_up_hours, and puts back the previous bodies of custom.automation_declare (calls the plain check) and custom._automation_value (no in_days).
-- WHAT IT DOES NOT UNDO: a Table's stored date_arrives / schedule automations stay in its automations list (they simply never run again and cannot be re-declared) and every automation_run record keeps existing.
-- based-on: custom.automation_declare(uuid, uuid, jsonb, uuid) 6a1b0d0e4f3c8d9e7f2a5b6c1d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e
-- based-on: custom._automation_value(jsonb, jsonb, uuid) 6a1b0d0e4f3c8d9e7f2a5b6c1d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e

set local statement_timeout = '120s';

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'custom-automation-time-tick';

create or replace function custom.automation_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb, p_automation_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_doc    jsonb;
  v_check  jsonb;
  v_list   jsonb;
  v_item   jsonb;
  v_id     uuid;
  v_found  boolean := false;
  v_new    jsonb := '[]'::jsonb;
  e        jsonb;
  v_me     uuid := custom.query_principal();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.automation_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.automation_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.automation_declare',
                                          'editor'::public.permission_level, 'table');
  select t.data into v_doc from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null
   for update;
  if not found then
    raise exception 'That table is not in this organization, so it has no automations to change.'
      using errcode = '23503', hint = 'REC-29: organizations are hard walls. Nothing was written.';
  end if;

  v_check := custom._automation_check(p_organization_id, p_table_id, p_spec);
  if v_check ? '_errors' then
    return jsonb_build_object('ok', false, '_errors', v_check -> '_errors');
  end if;

  v_list := case when jsonb_typeof(v_doc -> 'automations') = 'array' then v_doc -> 'automations' else '[]'::jsonb end;
  v_id := coalesce(p_automation_id, gen_random_uuid());

  for e in select x from jsonb_array_elements(v_list) x loop
    if e ->> 'id' = v_id::text then
      v_found := true;
      v_item := e || jsonb_build_object('spec', v_check -> 'spec', 'updated_at', now(), 'updated_by', v_me);
      v_new := v_new || jsonb_build_array(v_item);
    else
      v_new := v_new || jsonb_build_array(e);
    end if;
  end loop;
  if p_automation_id is not null and not v_found then
    raise exception 'There is no such automation on this table.'
      using errcode = '23503', hint = 'It may belong to another table or organization. Nothing was changed.';
  end if;
  if not v_found then
    if jsonb_array_length(v_list) >= 50 then
      return jsonb_build_object('ok', false, '_errors', jsonb_build_object('automations', 'A table has at most 50 automations; archive one first.'));
    end if;
    v_item := jsonb_strip_nulls(jsonb_build_object('id', v_id, 'spec', v_check -> 'spec', 'enabled', true,
                'created_at', now(), 'created_by', v_me, 'updated_at', now(), 'updated_by', v_me));
    v_new := v_new || jsonb_build_array(v_item);
  end if;

  update custom.record set data = jsonb_set(data, '{automations}', v_new, true)
   where organization_id = p_organization_id and id = p_table_id and table_id = custom.table_kernel_id();

  return jsonb_build_object('ok', true, 'automation_id', v_id, 'table_id', p_table_id,
           'enabled', coalesce((v_item ->> 'enabled')::boolean, true), 'spec', v_check -> 'spec');
end
$function$;

create or replace function custom._automation_value(p_value jsonb, p_values jsonb, p_me uuid)
 returns jsonb
 language sql
 immutable
 set search_path to 'pg_catalog'
as $fn$
  select case
    when jsonb_typeof(p_value) = 'object' and p_value ? 'from' then coalesce(p_values -> (p_value ->> 'from'), 'null'::jsonb)
    when jsonb_typeof(p_value) = 'object' and p_value ? 'now' then to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    when jsonb_typeof(p_value) = 'object' and p_value ? 'me' then coalesce(to_jsonb(p_me::text), 'null'::jsonb)
    when jsonb_typeof(p_value) = 'object' and p_value ? 'clear' then 'null'::jsonb
    else p_value end;
$fn$;

drop function if exists custom.automation_time_tick();
drop function if exists custom._automation_time_item(uuid, uuid, jsonb, timestamptz);
drop function if exists custom._automation_check_timed(uuid, uuid, jsonb);
drop function if exists custom._automation_now();
drop table if exists custom.automation_fired;
delete from platform.feature_knob where feature = 'custom' and key = 'automation_catch_up_hours';
