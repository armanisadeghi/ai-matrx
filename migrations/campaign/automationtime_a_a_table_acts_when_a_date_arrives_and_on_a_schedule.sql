-- lock: custom,platform
-- lane: AUTOMATION-TIME
-- chair-step: replaces two live function bodies (custom.automation_declare, custom._automation_value), revokes client EXECUTE on the two new internal functions, and schedules one pg_cron job (custom-automation-time-tick, every five minutes). Nothing is dropped; every existing trigger keeps its meaning.
--
-- LANE AUTOMATION-TIME — A TABLE ACTS WHEN A DATE ARRIVES, AND ON A SCHEDULE.
--
-- Table automations (custom.automation_declare) only ran when a row changed. Notion's database
-- automations also run "when a date arrives" and "every day / week / month". This adds both, and the
-- repeating row, without a second engine:
--
--   trigger {on:"date_arrives", field, offset_days?, at?}
--       a date or date-time property reaching now, N days before (negative) or after (positive), at a
--       time of day (default 09:00) in the person's own zone (custom.day_zone: her zone, else the
--       organization's, else UTC). Fires ONCE PER ROW PER DATE VALUE: the date changing re-arms it.
--   trigger {on:"schedule", every:"day"|"week"|"month", at?, weekday? (1 Monday..7), day? (1..31)}
--       the table acts with no row: add_row (a repeating row: the values are the template, and
--       {"in_days": N} is a date N days from the moment it runs), edit_rows with a filter, notify a
--       named person, webhook. A "set" step, a notify-a-property, a {"from"} copy or a {"trigger"}
--       reference has no row to read on a schedule and is refused by name when the automation is declared.
--
-- HOW IT RUNS. No second scheduler: the same pg_cron cadence the store's other ticks use
-- (custom-subscription-tick, custom-inbox-remind-tick), one more job every five minutes, calls
-- custom.automation_time_tick(). Each due automation runs through custom._automation_run — the
-- very function a row change and a button press run — so the steps, the run row (data_class
-- automation_run, listed by custom.automation_runs) and every existing action are the same.
-- An unattended run is made AS THE PERSON WHO SET THE AUTOMATION UP (the booking door's rule), so it
-- can never do what she could not do by hand; a removed member's automation fails honestly in its run.
--   * once-only memory: custom.automation_fired (automation, row or table, key). The key for a date is
--     the date value + offset + time, for a schedule the day of the occurrence + shape.
--   * a schedule never fires for an occurrence before the automation was declared / last edited /
--     switched on; a tick that was late still fires an occurrence up to custom/automation_catch_up_hours
--     (48) old, and never a stale one.
--   * custom._automation_now() is the clock; a suite injects custom.automation_clock.
--
-- REPLACES (declared below): custom.automation_declare (calls the timed check), custom._automation_value
-- (adds {"in_days": N}). ADDS: knob custom/automation_catch_up_hours, table custom.automation_fired,
-- custom._automation_now, custom._automation_check_timed, custom._automation_time_item,
-- custom.automation_time_tick, pg_cron job custom-automation-time-tick.
--
-- INVERSE: migrations/inverse/automationtime_a_a_table_acts_when_a_date_arrives_and_on_a_schedule_down.sql
--
-- based-on: custom.automation_declare(uuid, uuid, jsonb, uuid) 202fca59cb1af9778209f817cd0132a76b01197adf7ff5a1c04aa29308a72d23
-- based-on: custom._automation_value(jsonb, jsonb, uuid) 12ae4f1633612453832b49165e5d80f4113ee83bf4b4e6db0cfebcc785813c07

set local statement_timeout = '120s';

-- ── THE KNOB ────────────────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'automation_catch_up_hours', '48'::jsonb, '48'::jsonb, 'integer', 'hours', 1, 720,
   'Hours a late date or schedule automation may still run',
   'A "when a date arrives" or "on a schedule" automation whose moment passed while the store could not run it (an outage, a table switched on late) still runs if the moment is at most this many hours old, and never if it is older. Raise it to catch up after longer gaps; lower it to never send a stale reminder.',
   'agent', 'Lane AUTOMATION-TIME 2026-10-08: two days covers a weekend outage of the five-minute tick without reminding anybody about last week.',
   date '2027-01-08', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ── ONCE-ONLY MEMORY ────────────────────────────────────────────────────────────────────────────
-- No foreign keys on purpose (the 2026-09-21 write-freeze lesson). Written only by custom._automation_time_item.
create table custom.automation_fired (
  organization_id uuid        not null,
  automation_id   uuid        not null,
  subject_id      uuid        not null,  -- the row whose date arrived, or the table for a schedule
  fire_key        text        not null,  -- date value + offset + time, or the occurrence day + shape
  fired_at        timestamptz not null default now(),
  primary key (automation_id, subject_id, fire_key)
);
alter table custom.automation_fired enable row level security;
revoke all on table custom.automation_fired from public, anon, authenticated;
comment on table custom.automation_fired is
  'Lane AUTOMATION-TIME: which date or schedule moments an automation has already acted on, so each fires once. Written only by custom._automation_time_item; no client lane.';

-- ── THE CLOCK ───────────────────────────────────────────────────────────────────────────────────
create function custom._automation_now()
 returns timestamptz
 language sql
 stable
 set search_path to 'pg_catalog'
as $fn$
  select coalesce(nullif(current_setting('custom.automation_clock', true), '')::timestamptz, now())
$fn$;

-- ── A VALUE N DAYS FROM NOW ─────────────────────────────────────────────────────────────────────
create or replace function custom._automation_value(p_value jsonb, p_values jsonb, p_me uuid)
 returns jsonb
 language sql
 immutable
 set search_path to 'pg_catalog'
as $fn$
  select case
    when jsonb_typeof(p_value) = 'object' and p_value ? 'from' then coalesce(p_values -> (p_value ->> 'from'), 'null'::jsonb)
    when jsonb_typeof(p_value) = 'object' and p_value ? 'now' then to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    when jsonb_typeof(p_value) = 'object' and p_value ? 'in_days' and jsonb_typeof(p_value -> 'in_days') = 'number'
      then to_jsonb(to_char((now() + make_interval(days => ((p_value ->> 'in_days')::numeric)::integer)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    when jsonb_typeof(p_value) = 'object' and p_value ? 'me' then coalesce(to_jsonb(p_me::text), 'null'::jsonb)
    when jsonb_typeof(p_value) = 'object' and p_value ? 'clear' then 'null'::jsonb
    else p_value end;
$fn$;

-- ── THE TIMED TRIGGERS, JUDGED WHOLE ────────────────────────────────────────────────────────────
-- Anything that is not a timed trigger goes straight to the existing check. A timed spec is judged by that
-- same check with a row trigger standing in (name, condition, every action), then its own trigger is judged
-- and spliced back. {spec} when good, {_errors: {path: sentence}} when not.
create function custom._automation_check_timed(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
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

comment on function custom._automation_check_timed(uuid, uuid, jsonb) is
  'AUTOMATION-TIME: judges a spec whose trigger is date_arrives or schedule (every other trigger goes to custom._automation_check). Returns {spec} or {_errors: {path: sentence}}.';

-- ── THE DOOR NOW ACCEPTS THE TIMED TRIGGERS ─────────────────────────────────────────────────────
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

  v_check := custom._automation_check_timed(p_organization_id, p_table_id, p_spec);
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

comment on function custom.automation_declare(uuid, uuid, jsonb, uuid) is
  'AUTOMATION-DOOR/TIME: upsert one automation on a Table (editor on the Table). spec = {name, trigger:{on:row_added|property_edited|form_answered|date_arrives|schedule …}, condition?, actions:[set|add_row|edit_rows|notify|webhook|agent]}. date_arrives = {field, offset_days?, at?}; schedule = {every: day|week|month, at?, weekday?, day?}. Returns {ok, automation_id, spec} or {ok:false, _errors:{path: sentence}}.';

-- ── ONE AUTOMATION'S TIMED RUN(S): how many ran ─────────────────────────────────────────────────
create function custom._automation_time_item(p_organization_id uuid, p_table_id uuid, p_automation jsonb, p_now timestamptz)
 returns integer
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $fn$
declare
  v_trig   jsonb := p_automation -> 'spec' -> 'trigger';
  v_on     text := v_trig ->> 'on';
  v_id     uuid := (p_automation ->> 'id')::uuid;
  v_zone   text := custom.day_zone(p_organization_id);
  v_cu     integer := coalesce((platform.knob_resolve('custom', 'automation_catch_up_hours', p_organization_id) #>> '{}')::integer, 48);
  v_fields jsonb := custom._automation_fields(p_organization_id, p_table_id);
  v_at     time := coalesce(v_trig ->> 'at', '09:00')::time;
  v_local  timestamp := p_now at time zone custom.day_zone(p_organization_id);
  v_since  timestamptz := coalesce(nullif(p_automation ->> 'updated_at', ''), nullif(p_automation ->> 'created_at', ''))::timestamptz;
  v_occ    timestamp;
  v_due    timestamptz;
  v_d      date;
  v_m0     date;
  v_key    text;
  v_n      integer;
  v_ran    integer := 0;
  v_fld    jsonb;
  v_off    integer;
  v_kind   text;
  x        record;
  v_values jsonb;
  v_byid   jsonb;
  v_ctx    jsonb;
  v_spec   jsonb := p_automation -> 'spec';
begin
  if v_on = 'schedule' then
    if v_trig ->> 'every' = 'day' then
      v_occ := v_local::date + v_at;
      if v_occ > v_local then v_occ := v_occ - interval '1 day'; end if;
    elsif v_trig ->> 'every' = 'week' then
      v_d := v_local::date - ((((extract(isodow from v_local::date))::integer - (v_trig ->> 'weekday')::integer) + 7) % 7);
      v_occ := v_d + v_at;
      if v_occ > v_local then v_occ := v_occ - interval '7 days'; end if;
    else
      v_m0 := date_trunc('month', v_local)::date;
      v_d := v_m0 + (least((v_trig ->> 'day')::integer, (extract(day from (v_m0 + interval '1 month' - interval '1 day')))::integer) - 1);
      v_occ := v_d + v_at;
      if v_occ > v_local then
        v_m0 := (v_m0 - interval '1 month')::date;
        v_d := v_m0 + (least((v_trig ->> 'day')::integer, (extract(day from (v_m0 + interval '1 month' - interval '1 day')))::integer) - 1);
        v_occ := v_d + v_at;
      end if;
    end if;
    v_due := v_occ at time zone v_zone;
    -- Never an occurrence from before she set it up / last edited / switched it on, and never a stale one.
    if v_due <= v_since or p_now - v_due > make_interval(hours => v_cu) then
      return 0;
    end if;
    v_key := (v_trig ->> 'every') || '|' || v_occ::date::text || '@' || to_char(v_at, 'HH24:MI')
             || coalesce('|' || (v_trig ->> 'weekday'), '') || coalesce('|' || (v_trig ->> 'day'), '');
    insert into custom.automation_fired (organization_id, automation_id, subject_id, fire_key)
    values (p_organization_id, v_id, p_table_id, v_key) on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then return 0; end if;
    perform custom._automation_run(p_organization_id, p_table_id, null, p_automation, '{}'::jsonb, v_fields, null,
              jsonb_build_object('on', 'schedule', 'operation', 'time', 'via', 'schedule', 'changed_field_ids', '[]'::jsonb,
                                 'every', v_trig ->> 'every', 'fires_at', v_due));
    return 1;
  end if;

  -- DATE ARRIVES
  v_fld := v_fields -> (v_trig ->> 'field');
  if v_fld is null then
    raise exception 'The date property this automation waits for is gone, so it cannot run until it is edited.' using errcode = '23503';
  end if;
  v_kind := v_fld -> 'config' ->> 'kind';
  v_off := coalesce((v_trig ->> 'offset_days')::integer, 0);
  for x in
    select r.id, r.data ->> (v_fld ->> 'key') as dv
      from custom.record r
     where r.organization_id = p_organization_id and r.table_id = p_table_id
       and r.data_class = 'record' and r.deleted_at is null
       and nullif(r.data ->> (v_fld ->> 'key'), '') is not null
       and left(r.data ->> (v_fld ->> 'key'), 10) between to_char(v_local::date - v_off - (ceil(v_cu / 24.0)::integer + 2), 'YYYY-MM-DD')
                                                       and to_char(v_local::date - v_off + 2, 'YYYY-MM-DD')
     order by r.created_at
     limit 500
  loop
    if v_kind = 'date' then
      continue when x.dv !~ '^\d{4}-\d{2}-\d{2}' or not pg_input_is_valid(left(x.dv, 10), 'date');
      v_due := ((left(x.dv, 10)::date + v_off) + v_at) at time zone v_zone;
    else
      continue when not pg_input_is_valid(x.dv, 'timestamptz');
      v_due := x.dv::timestamptz + make_interval(days => v_off);
    end if;
    continue when v_due > p_now or p_now - v_due > make_interval(hours => v_cu);
    v_key := x.dv || '@' || v_off || '@' || to_char(v_at, 'HH24:MI');
    continue when exists (select 1 from custom.automation_fired f
                           where f.automation_id = v_id and f.subject_id = x.id and f.fire_key = v_key);

    v_values := custom.record_values(p_organization_id, x.id);
    continue when v_values is null;
    v_ctx := coalesce(custom.rule_context(p_organization_id, x.id), '{}'::jsonb)
             || jsonb_build_object('fx_self_id', x.id, 'fx_table_id', p_table_id);
    select coalesce(jsonb_object_agg(f.key, coalesce(v_values -> (f.value ->> 'key'), 'null'::jsonb)), '{}'::jsonb)
      into v_byid from jsonb_each(v_fields) f;
    if v_spec -> 'condition' is not null and jsonb_typeof(v_spec -> 'condition') = 'object' then
      begin
        continue when not custom._fx_truthy(custom.rule_eval(p_organization_id,
                         custom._automation_bind(v_spec -> 'condition', v_byid), v_values, v_ctx));
      exception when others then
        null;  -- a condition that cannot be worked out runs, exactly as it does for a row change
      end;
    end if;

    insert into custom.automation_fired (organization_id, automation_id, subject_id, fire_key)
    values (p_organization_id, v_id, x.id, v_key) on conflict do nothing;
    get diagnostics v_n = row_count;
    continue when v_n = 0;
    perform custom._automation_run(p_organization_id, p_table_id, x.id, p_automation, v_byid, v_fields, null,
              jsonb_build_object('on', 'date_arrives', 'operation', 'time', 'via', 'schedule', 'changed_field_ids', '[]'::jsonb,
                                 'date_value', x.dv, 'offset_days', v_off, 'fires_at', v_due));
    v_ran := v_ran + 1;
  end loop;
  return v_ran;
end
$fn$;
revoke all on function custom._automation_time_item(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;

-- ── THE TICK ────────────────────────────────────────────────────────────────────────────────────
create function custom.automation_time_tick()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $fn$
declare
  v_now  timestamptz := custom._automation_now();
  t      record;
  v_a    jsonb;
  v_who  uuid;
  v_held text;
  v_ran  integer := 0;
  v_failed integer := 0;
begin
  for t in
    select tb.organization_id, tb.id as table_id, tb.data -> 'automations' as autos
      from custom.record tb
      join iam.organizations g on g.id = tb.organization_id and g.archived_at is null
     where tb.data_class = 'table' and tb.deleted_at is null
       and jsonb_typeof(tb.data -> 'automations') = 'array'
       and (tb.data -> 'automations' @> '[{"spec":{"trigger":{"on":"date_arrives"}}}]'::jsonb
            or tb.data -> 'automations' @> '[{"spec":{"trigger":{"on":"schedule"}}}]'::jsonb)
  loop
    for v_a in select e from jsonb_array_elements(t.autos) e loop
      continue when (v_a ->> 'archived_at') is not null or not coalesce((v_a ->> 'enabled')::boolean, false)
                 or (v_a -> 'spec' -> 'trigger' ->> 'on') not in ('date_arrives', 'schedule');
      -- THE PRINCIPAL OF AN UNATTENDED RUN IS THE PERSON WHO SET IT UP.
      v_who := coalesce(nullif(v_a ->> 'created_by', '')::uuid, nullif(v_a ->> 'updated_by', '')::uuid);
      v_held := current_setting('request.jwt.claims', true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_who, 'role', 'authenticated')::text, true);
      begin
        v_ran := v_ran + custom._automation_time_item(t.organization_id, t.table_id, v_a, v_now);
      exception when others then
        v_failed := v_failed + 1;
        -- ONE AUTOMATION'S TROUBLE NEVER STOPS THE REST — and it is loud.
        raise warning 'custom.automation_time_tick: table % automation %: % (%)', t.table_id, v_a ->> 'id', sqlerrm, sqlstate;
      end;
      perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    end loop;
  end loop;
  return jsonb_build_object('ran', v_ran, 'failed', v_failed, 'at', v_now);
end
$fn$;
revoke all on function custom.automation_time_tick() from public, anon, authenticated;
comment on function custom.automation_time_tick() is
  'AUTOMATION-TIME: pg_cron every five minutes. Runs every enabled date_arrives / schedule automation whose moment came, once, as the person who set it up, through custom._automation_run. Internal: no client EXECUTE.';

select cron.schedule('custom-automation-time-tick', '*/5 * * * *', 'select custom.automation_time_tick();');
-- THE DEV CLONE STAYS QUARANTINED (pg_net absent -> job left inactive), like every other job.
select cron.alter_job(j.jobid, active := false)
  from cron.job j
 where j.jobname = 'custom-automation-time-tick'
   and not exists (select 1 from pg_extension where extname = 'pg_net');
