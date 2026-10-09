-- lock: custom,platform
-- lane: AUTOMATION-TIME
-- chair-step: the inverse of campaign/automationtime_b_a_missing_weekday_is_refused.sql: puts back the first body of custom._automation_check_timed.
-- based-on: custom._automation_check_timed(uuid, uuid, jsonb) 4860254abd63094f5dd1e41f5dfc0d90981d3480f85bdee482f74b0830d3d6c3

set local statement_timeout = '60s';

create or replace function custom._automation_check_timed(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $fn$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_trig  jsonb := case when jsonb_typeof(p_spec) = 'object' then p_spec -> 'trigger' end;
  v_on    text := case when jsonb_typeof(v_trig) = 'object' then v_trig ->> 'on' end;
  v_core  jsonb;
  v_err   jsonb := '{}'::jsonb;
  v_norm  jsonb;
  v_at    text;
  v_fld   jsonb;
  v_kind  text;
  v_every text;
  v_a     jsonb;
  v_i     integer := 0;
begin
  if v_on is null or v_on not in ('date_arrives', 'schedule') then
    return custom._automation_check(p_organization_id, p_table_id, p_spec);
  end if;

  v_core := custom._automation_check(p_organization_id, p_table_id,
              jsonb_set(p_spec, '{trigger}', jsonb_build_object('on', 'row_added')));
  if v_core ? '_errors' then
    v_err := v_core -> '_errors';
  end if;

  v_at := coalesce(nullif(btrim(v_trig ->> 'at'), ''), '09:00');
  if v_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    v_err := v_err || jsonb_build_object('trigger.at', 'Say the time of day as HH:MM on a 24-hour clock, like 09:00.');
  end if;

  if v_on = 'date_arrives' then
    v_fld := case when jsonb_typeof(v_trig -> 'field') = 'string' and (v_trig ->> 'field') ~* c_uuid
                  then custom._automation_fields(p_organization_id, p_table_id) -> (v_trig ->> 'field') end;
    v_kind := v_fld -> 'config' ->> 'kind';
    if v_fld is null or v_fld ->> 'type' <> 'range' or v_kind not in ('date', 'datetime') then
      v_err := v_err || jsonb_build_object('trigger.field', 'Name the date property to wait for, by its id, from this table.');
    end if;
    if v_trig ? 'offset_days' and (jsonb_typeof(v_trig -> 'offset_days') <> 'number'
         or (v_trig ->> 'offset_days')::numeric <> trunc((v_trig ->> 'offset_days')::numeric)
         or abs((v_trig ->> 'offset_days')::numeric) > 365) then
      v_err := v_err || jsonb_build_object('trigger.offset_days', 'Say how many whole days before (negative) or after (positive) the date, up to 365.');
    end if;
    v_norm := jsonb_build_object('on', 'date_arrives', 'field', v_trig ->> 'field',
                'offset_days', coalesce((v_trig ->> 'offset_days')::numeric::integer, 0), 'at', v_at);
  else
    v_every := v_trig ->> 'every';
    if v_every is null or v_every not in ('day', 'week', 'month') then
      v_err := v_err || jsonb_build_object('trigger.every', 'Say how often: day, week or month.');
    end if;
    v_norm := jsonb_build_object('on', 'schedule', 'every', v_every, 'at', v_at);
    if v_every = 'week' then
      if jsonb_typeof(v_trig -> 'weekday') <> 'number' or (v_trig ->> 'weekday')::numeric not between 1 and 7
         or (v_trig ->> 'weekday')::numeric <> trunc((v_trig ->> 'weekday')::numeric) then
        v_err := v_err || jsonb_build_object('trigger.weekday', 'Say which day of the week: 1 is Monday, 7 is Sunday.');
      else
        v_norm := v_norm || jsonb_build_object('weekday', (v_trig ->> 'weekday')::numeric::integer);
      end if;
    elsif v_every = 'month' then
      if jsonb_typeof(v_trig -> 'day') <> 'number' or (v_trig ->> 'day')::numeric not between 1 and 31
         or (v_trig ->> 'day')::numeric <> trunc((v_trig ->> 'day')::numeric) then
        v_err := v_err || jsonb_build_object('trigger.day', 'Say which day of the month, 1 to 31 (a short month runs on its last day).');
      else
        v_norm := v_norm || jsonb_build_object('day', (v_trig ->> 'day')::numeric::integer);
      end if;
    end if;
    -- A schedule has no row: whatever reads one is refused by name, never silently written as empty.
    if p_spec ? 'condition' and jsonb_typeof(p_spec -> 'condition') <> 'null' then
      v_err := v_err || jsonb_build_object('condition', 'A schedule has no row to test, so it has no condition. To act on some rows only, use an "edit rows" step with a filter.');
    end if;
    for v_a in select e from jsonb_array_elements(case when jsonb_typeof(p_spec -> 'actions') = 'array' then p_spec -> 'actions' else '[]'::jsonb end) e loop
      if v_a ->> 'do' = 'set' then
        v_err := v_err || jsonb_build_object('actions.' || v_i, 'On a schedule there is no row for "set" to change. Use "add row" or "edit rows" with a filter.');
      elsif v_a ->> 'do' = 'notify' and (v_a -> 'to') ? 'field' then
        v_err := v_err || jsonb_build_object('actions.' || v_i || '.to', 'On a schedule there is no row to read a person from. Name the person.');
      elsif jsonb_path_exists(v_a, '$.**."from"') or jsonb_path_exists(v_a, '$.**."trigger"') then
        v_err := v_err || jsonb_build_object('actions.' || v_i, 'On a schedule there is no row to copy from or to match against; write the value itself.');
      end if;
      v_i := v_i + 1;
    end loop;
  end if;

  if v_err <> '{}'::jsonb then
    return jsonb_build_object('_errors', v_err);
  end if;
  return jsonb_build_object('spec', jsonb_set(v_core -> 'spec', '{trigger}', v_norm));
end
$fn$;

