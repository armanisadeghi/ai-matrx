-- lock: custom,platform
-- lane: AUTOMATION-DOOR
--
-- LANE AUTOMATION-DOOR — `custom.automation_declare` and its five siblings.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- "WHEN STATUS BECOMES READY, ADD A ROW TO APPROVALS AND TELL THE OWNER"
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- Notion-style database automations for the record store, declared with ONE door.
--
-- WHAT THIS ADDS (nothing existing is replaced, dropped or revoked):
--   custom.automation_declare(org, table, spec, automation_id)   upsert one automation on a table
--   custom.automations(table, org, include_archived)             list a table's automations + last run
--   custom.automation_archive / automation_restore               archive, never delete
--   custom.automation_set_enabled                                 on / off
--   custom.automation_runs(automation, limit, cursor, org)       run history: status, steps, errors
--   custom._automation_check / _automation_bind / _automation_value / _automation_fields
--   custom._automation_fire()                                    the run path (statement trigger below)
--   trigger zzzz_automations_fire_s_i on custom.io_outbox        AFTER INSERT, statement level
--   six platform.client_callable_door rows
--
-- WHERE IT LIVES. An automation is one item of the Table record's `automations` list (the same
-- place `row_actions` lives, written by the same kind of door: editor on the Table, the Table row
-- locked, the whole item judged before it is stored). Archiving sets `archived_at` on the item;
-- nothing is ever removed. Every run is a record of data_class `automation_run`, the way
-- `action_run` rows are kept, so run history is read back by `custom.automation_runs`.
--
-- HOW IT RUNS. It does NOT add a second change feed. The store already writes one `custom.io_outbox`
-- row per record change (`records.changed`, with the operation, the changed field ids and
-- `metadata.change.via`), and that is the feed the workflow engine's store triggers read. This file
-- adds ONE statement trigger on that same feed. For each new row it makes ONE primary-key read of
-- the Table record; a Table with no automations costs that read and nothing else. A matching
-- automation then runs in the writer's own transaction, as the writer, through the store's own doors
-- (custom.record_update, custom.record_write, communication.notify_from_sql), so the writer can
-- never cause a change she could not make by hand.
--   * A failing step is caught, written to the run as the store's own sentence, and stops the list;
--     earlier steps stay. The person's own write is never refused because an automation failed.
--   * Loops stop at three rounds (custom.automation_depth) and say so in the run.
--   * Schedules are refused by name: a schedule needs the platform scheduler, which this file does
--     not touch and must not fork.
--   * An agent step is recorded as WAITING FOR A PERSON, exactly as `action_run` refuses to run an
--     agent action as a fixed change.
--
-- The inverse is migrations/inverse/automation_door_a_table_declares_what_happens_when_a_row_changes_down.sql.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- helpers
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- The Table's live Fields by id: {id: {key, label, type, config}} — what action_run reads.
create function custom._automation_fields(p_organization_id uuid, p_table_id uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select coalesce(jsonb_object_agg(f.id::text, jsonb_build_object('key', f.data ->> 'key', 'label', f.data ->> 'label',
                                   'type', f.data ->> 'type', 'config', f.data -> 'config')), '{}'::jsonb)
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = p_table_id::text;
$fn$;

-- {"trigger": "<field id>"} anywhere inside a filter becomes {"const": <that value on the triggering row>}.
create function custom._automation_bind(p_expr jsonb, p_values jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  k text;
  v jsonb;
  o jsonb := '{}'::jsonb;
  a jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_expr) = 'object' then
    if p_expr ? 'trigger' and jsonb_typeof(p_expr -> 'trigger') = 'string'
       and (select count(*) from jsonb_object_keys(p_expr)) = 1 then
      return jsonb_build_object('const', coalesce(p_values -> (p_expr ->> 'trigger'), 'null'::jsonb));
    end if;
    for k, v in select key, value from jsonb_each(p_expr) loop
      o := o || jsonb_build_object(k, custom._automation_bind(v, p_values));
    end loop;
    return o;
  elsif jsonb_typeof(p_expr) = 'array' then
    for v in select value from jsonb_array_elements(p_expr) loop
      a := a || jsonb_build_array(custom._automation_bind(v, p_values));
    end loop;
    return a;
  end if;
  return p_expr;
end
$fn$;

-- A value the automation writes: a literal, or {"from": field}, {"now": true}, {"me": true}, {"clear": true}.
create function custom._automation_value(p_value jsonb, p_values jsonb, p_me uuid)
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

-- The sentences for one `values` map: every key a live Field of the target table, every {"from"} a
-- live Field of the source table. Returns {path: sentence}; empty when nothing is wrong.
create function custom._automation_values_errors(p_organization_id uuid, p_target uuid, p_source uuid,
                                                  p_values jsonb, p_path text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  k     text;
  v     jsonb;
  v_err jsonb := '{}'::jsonb;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    return jsonb_build_object(p_path, 'Say which properties to set: a map from a property of the table to its new value.');
  end if;
  for k, v in select key, value from jsonb_each(p_values) loop
    if k !~* c_uuid or not custom._decoration_field_ok(p_organization_id, p_target, k) then
      v_err := v_err || jsonb_build_object(p_path || '.' || k, 'That is not a property of the table it should be set on.');
    elsif jsonb_typeof(v) = 'object' and v ? 'from' then
      if jsonb_typeof(v -> 'from') <> 'string' or (v ->> 'from') !~* c_uuid
         or not custom._decoration_field_ok(p_organization_id, p_source, v ->> 'from') then
        v_err := v_err || jsonb_build_object(p_path || '.' || k, 'Copying from a property: that property is not on the table the automation watches.');
      end if;
    end if;
  end loop;
  return v_err;
end
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom._automation_check — the whole spec judged whole. {spec} when it is good, {_errors} when not.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom._automation_check(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_err   jsonb := '{}'::jsonb;
  v_name  text;
  v_trig  jsonb;
  v_on    text;
  v_cond  jsonb;
  v_acts  jsonb;
  v_a     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_norm  jsonb;
  v_do    text;
  v_i     integer := 0;
  v_p     text;
  v_tgt   uuid;
  v_e     jsonb;
  v_url   text;
  v_to    jsonb;
  v_msg   text;
  v_spec_trig jsonb;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    return jsonb_build_object('_errors', jsonb_build_object('spec', 'An automation is a JSON object with a name, a trigger and a list of actions.'));
  end if;

  v_name := btrim(coalesce(p_spec ->> 'name', ''));
  if v_name = '' then
    v_err := v_err || jsonb_build_object('name', 'An automation needs a name so its runs can be told apart.');
  elsif char_length(v_name) > 80 then
    v_err := v_err || jsonb_build_object('name', 'An automation name is at most 80 characters.');
  end if;

  -- TRIGGER
  v_trig := p_spec -> 'trigger';
  v_on := case when jsonb_typeof(v_trig) = 'object' then v_trig ->> 'on' end;
  if v_on is null then
    v_err := v_err || jsonb_build_object('trigger', 'Say when it runs: row_added, property_edited, or form_answered.');
  elsif v_on = 'schedule' then
    v_err := v_err || jsonb_build_object('trigger', 'Running on a schedule is not switched on: schedules go through the platform scheduler, and that connection to automations is not built yet. Use row_added, property_edited or form_answered.');
  elsif v_on not in ('row_added', 'property_edited', 'form_answered') then
    v_err := v_err || jsonb_build_object('trigger', format('"%s" is not a trigger. Use row_added, property_edited, or form_answered.', left(v_on, 40)));
  elsif v_on = 'property_edited' then
    if jsonb_typeof(v_trig -> 'field') <> 'string' or (v_trig ->> 'field') !~* c_uuid
       or not custom._decoration_field_ok(p_organization_id, p_table_id, v_trig ->> 'field') then
      v_err := v_err || jsonb_build_object('trigger.field', 'Name the property that is edited, by its id, from this table.');
    else
      v_spec_trig := jsonb_build_object('on', 'property_edited', 'field', v_trig ->> 'field');
      if v_trig ? 'to' then
        v_spec_trig := v_spec_trig || jsonb_build_object('to', v_trig -> 'to');
      end if;
    end if;
  else
    v_spec_trig := jsonb_build_object('on', v_on);
  end if;
  if v_on in ('row_added', 'form_answered') then
    v_spec_trig := jsonb_build_object('on', v_on);
  end if;

  -- CONDITION (optional): the store's one filter shape, tried once against an empty row.
  v_cond := p_spec -> 'condition';
  if v_cond is not null and jsonb_typeof(v_cond) <> 'null' then
    if jsonb_typeof(v_cond) <> 'object' then
      v_err := v_err || jsonb_build_object('condition', 'A condition is a filter on the row that triggered it.');
    else
      begin
        perform custom.rule_eval(p_organization_id, custom._automation_bind(v_cond, '{}'::jsonb), '{}'::jsonb, '{}'::jsonb);
      exception when others then
        get stacked diagnostics v_msg = message_text;
        v_err := v_err || jsonb_build_object('condition', 'The condition cannot be worked out: ' || v_msg);
      end;
    end if;
  else
    v_cond := null;
  end if;

  -- ACTIONS
  v_acts := p_spec -> 'actions';
  if jsonb_typeof(v_acts) <> 'array' or jsonb_array_length(v_acts) = 0 then
    v_err := v_err || jsonb_build_object('actions', 'An automation needs at least one action.');
  elsif jsonb_array_length(v_acts) > 20 then
    v_err := v_err || jsonb_build_object('actions', 'An automation has at most 20 actions.');
  else
    for v_a in select e from jsonb_array_elements(v_acts) e loop
      v_p := 'actions.' || v_i::text;
      v_i := v_i + 1;
      v_do := case when jsonb_typeof(v_a) = 'object' then v_a ->> 'do' end;
      v_norm := null;
      if v_do = 'set' then
        v_e := custom._automation_values_errors(p_organization_id, p_table_id, p_table_id, v_a -> 'values', v_p || '.values');
        if v_e = '{}'::jsonb then
          v_norm := jsonb_build_object('do', 'set', 'values', v_a -> 'values');
        else
          v_err := v_err || v_e;
        end if;
      elsif v_do = 'add_row' then
        v_tgt := case when (v_a ->> 'table_id') ~* c_uuid then (v_a ->> 'table_id')::uuid end;
        if v_tgt is null or not exists (select 1 from custom.record t where t.organization_id = p_organization_id
              and t.id = v_tgt and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
          v_err := v_err || jsonb_build_object(v_p || '.table_id', 'The table to add a row to is not in this organization.');
        else
          v_e := custom._automation_values_errors(p_organization_id, v_tgt, p_table_id, v_a -> 'values', v_p || '.values');
          if v_e = '{}'::jsonb then
            v_norm := jsonb_build_object('do', 'add_row', 'table_id', v_tgt, 'values', v_a -> 'values');
          else
            v_err := v_err || v_e;
          end if;
        end if;
      elsif v_do = 'edit_rows' then
        v_tgt := case when (v_a ->> 'table_id') ~* c_uuid then (v_a ->> 'table_id')::uuid end;
        if v_tgt is null or not exists (select 1 from custom.record t where t.organization_id = p_organization_id
              and t.id = v_tgt and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
          v_err := v_err || jsonb_build_object(v_p || '.table_id', 'The table whose rows to edit is not in this organization.');
        elsif jsonb_typeof(v_a -> 'where') <> 'object' then
          v_err := v_err || jsonb_build_object(v_p || '.where', 'Say which rows to edit: a filter on that table. Editing every row is not offered.');
        else
          begin
            perform custom.rule_eval(p_organization_id, custom._automation_bind(v_a -> 'where', '{}'::jsonb), '{}'::jsonb, '{}'::jsonb);
            v_e := custom._automation_values_errors(p_organization_id, v_tgt, p_table_id, v_a -> 'values', v_p || '.values');
            if v_e = '{}'::jsonb then
              v_norm := jsonb_build_object('do', 'edit_rows', 'table_id', v_tgt, 'where', v_a -> 'where',
                          'values', v_a -> 'values',
                          'limit', least(greatest(coalesce((v_a ->> 'limit')::integer, 100), 1), 500));
            else
              v_err := v_err || v_e;
            end if;
          exception when others then
            get stacked diagnostics v_msg = message_text;
            v_err := v_err || jsonb_build_object(v_p || '.where', 'The filter cannot be worked out: ' || v_msg);
          end;
        end if;
      elsif v_do = 'notify' then
        v_to := v_a -> 'to';
        if jsonb_typeof(v_to) <> 'object' or jsonb_typeof(v_a -> 'text') <> 'string' or btrim(v_a ->> 'text') = '' then
          v_err := v_err || jsonb_build_object(v_p, 'A notification needs who to tell (a person, a person property, or the automation''s author) and its words.');
        elsif v_to ? 'person' and ((v_to ->> 'person') !~* c_uuid
              or not iam.is_org_member((v_to ->> 'person')::uuid, p_organization_id)) then
          v_err := v_err || jsonb_build_object(v_p || '.to', 'That person is not a member of this organization.');
        elsif v_to ? 'field' and ((v_to ->> 'field') !~* c_uuid
              or not custom._decoration_field_ok(p_organization_id, p_table_id, v_to ->> 'field')) then
          v_err := v_err || jsonb_build_object(v_p || '.to', 'The person property is not a property of this table.');
        elsif not (v_to ? 'person' or v_to ? 'field' or v_to ? 'author') then
          v_err := v_err || jsonb_build_object(v_p || '.to', 'Say who: {"person": id}, {"field": property id} or {"author": true}.');
        else
          v_norm := jsonb_build_object('do', 'notify', 'text', left(btrim(v_a ->> 'text'), 600),
                      'to', case when v_to ? 'person' then jsonb_build_object('person', v_to ->> 'person')
                                 when v_to ? 'field' then jsonb_build_object('field', v_to ->> 'field')
                                 else jsonb_build_object('author', true) end);
        end if;
      elsif v_do = 'webhook' then
        v_url := v_a ->> 'url';
        if not coalesce(files.is_safe_webhook_url(v_url), false) then
          v_err := v_err || jsonb_build_object(v_p || '.url', 'A webhook sends to a public https address; that one is not.');
        else
          v_norm := jsonb_build_object('do', 'webhook', 'url', v_url);
        end if;
      elsif v_do = 'agent' then
        if jsonb_typeof(v_a -> 'prompt') <> 'string' or btrim(v_a ->> 'prompt') = '' then
          v_err := v_err || jsonb_build_object(v_p || '.prompt', 'An agent step needs the question it asks.');
        else
          v_norm := jsonb_build_object('do', 'agent', 'prompt', left(btrim(v_a ->> 'prompt'), 2000));
        end if;
      else
        v_err := v_err || jsonb_build_object(v_p, 'Each action is one of: set, add_row, edit_rows, notify, webhook, agent.');
      end if;
      if v_norm is not null then
        v_out := v_out || jsonb_build_array(v_norm);
      end if;
    end loop;
  end if;

  if v_err <> '{}'::jsonb then
    return jsonb_build_object('_errors', v_err);
  end if;
  return jsonb_build_object('spec', jsonb_strip_nulls(jsonb_build_object(
           'name', v_name, 'trigger', v_spec_trig, 'condition', v_cond, 'actions', v_out)));
end
$fn$;

comment on function custom._automation_check(uuid, uuid, jsonb) is
  'AUTOMATION-DOOR: an automation spec judged whole before custom.automation_declare stores it. Returns {spec} or {_errors: {path: sentence}}. Fields by id; a schedule trigger is refused by name.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- the doors
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.automation_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb,
                                          p_automation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

comment on function custom.automation_declare(uuid, uuid, jsonb, uuid) is
  'AUTOMATION-DOOR: upsert one automation on a Table (editor on the Table). spec = {name, trigger:{on:row_added|property_edited|form_answered}, condition?, actions:[set|add_row|edit_rows|notify|webhook|agent]}. Returns {ok, automation_id, spec} or {ok:false, _errors:{path: sentence}}. A schedule trigger is refused by name.';

-- The one lookup every sibling door uses: the Table that holds an automation id, inside ONE organization.
create function custom._automation_home(p_organization_id uuid, p_automation_id uuid)
returns table (table_id uuid, doc jsonb, item jsonb)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select t.id, t.data, a.e
    from custom.record t
    cross join lateral jsonb_array_elements(case when jsonb_typeof(t.data -> 'automations') = 'array'
                                                 then t.data -> 'automations' else '[]'::jsonb end) a(e)
   where t.organization_id = p_organization_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data -> 'automations' @> jsonb_build_array(jsonb_build_object('id', p_automation_id::text))
     and a.e ->> 'id' = p_automation_id::text
   limit 1;
$fn$;

create function custom.automations(p_table_id uuid, p_organization_id uuid default null, p_include_archived boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_org  uuid := p_organization_id;
  v_list jsonb;
  v_out  jsonb := '[]'::jsonb;
  e      jsonb;
  v_last jsonb;
begin
  if v_org is null then
    select t.organization_id into v_org from custom.record t
     where t.id = p_table_id and t.table_id = custom.table_kernel_id() and t.deleted_at is null limit 1;
  end if;
  if v_org is null then
    raise exception 'That table is not here.' using errcode = '23503';
  end if;
  perform custom.assert_client_may_reach(v_org, 'custom.automations');
  perform custom.assert_may_know_table(v_org, p_table_id, 'custom.automations');
  select coalesce(t.data -> 'automations', '[]'::jsonb) into v_list from custom.record t
   where t.organization_id = v_org and t.id = p_table_id and t.table_id = custom.table_kernel_id() and t.deleted_at is null;
  for e in select x from jsonb_array_elements(case when jsonb_typeof(v_list) = 'array' then v_list else '[]'::jsonb end) x loop
    continue when (e ->> 'archived_at') is not null and not p_include_archived;
    select jsonb_build_object('run_id', r.id, 'status', r.data ->> 'status', 'at', r.data ->> 'started_at', 'says', r.data ->> 'says')
      into v_last
      from custom.record r
     where r.organization_id = v_org and r.data_class = 'automation_run' and r.deleted_at is null
       and r.data ->> 'automation_id' = e ->> 'id'
     order by r.created_at desc limit 1;
    v_out := v_out || jsonb_build_array(e || jsonb_build_object('name', e -> 'spec' -> 'name', 'last_run', coalesce(v_last, 'null'::jsonb)));
  end loop;
  return jsonb_build_object('table_id', p_table_id, 'automations', v_out);
end
$fn$;

comment on function custom.automations(uuid, uuid, boolean) is
  'AUTOMATION-DOOR: a Table''s automations as a screen draws them: id, name, spec, enabled, archived_at and the last run. Archived ones only when asked.';

create function custom._automation_flip(p_organization_id uuid, p_automation_id uuid, p_door text, p_patch jsonb, p_strip text default null)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_table uuid;
  v_doc   jsonb;
  e       jsonb;
  v_new   jsonb := '[]'::jsonb;
  v_item  jsonb;
begin
  perform custom.assert_store_door(p_organization_id, p_door);
  perform custom.assert_client_may_reach(p_organization_id, p_door);
  select h.table_id into v_table from custom._automation_home(p_organization_id, p_automation_id) h;
  if v_table is null then
    raise exception 'There is no such automation here.'
      using errcode = '23503', hint = 'It may have been removed, or it belongs to another organization. Nothing was changed.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_table, p_door, 'editor'::public.permission_level, 'table');
  select t.data into v_doc from custom.record t
   where t.organization_id = p_organization_id and t.id = v_table and t.table_id = custom.table_kernel_id() for update;
  for e in select x from jsonb_array_elements(v_doc -> 'automations') x loop
    if e ->> 'id' = p_automation_id::text then
      v_item := (case when p_strip is null then e else e - p_strip end)
                || p_patch || jsonb_build_object('updated_at', now(), 'updated_by', custom.query_principal());
      v_new := v_new || jsonb_build_array(v_item);
    else
      v_new := v_new || jsonb_build_array(e);
    end if;
  end loop;
  update custom.record set data = jsonb_set(data, '{automations}', v_new, true)
   where organization_id = p_organization_id and id = v_table and table_id = custom.table_kernel_id();
  return jsonb_build_object('ok', true, 'automation_id', p_automation_id, 'table_id', v_table,
           'enabled', coalesce((v_item ->> 'enabled')::boolean, false), 'archived_at', v_item -> 'archived_at');
end
$fn$;

create function custom.automation_archive(p_organization_id uuid, p_automation_id uuid)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog'
as $fn$
  select custom._automation_flip(p_organization_id, p_automation_id, 'custom.automation_archive',
           jsonb_build_object('archived_at', now(), 'enabled', false));
$fn$;

create function custom.automation_restore(p_organization_id uuid, p_automation_id uuid)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog'
as $fn$
  select custom._automation_flip(p_organization_id, p_automation_id, 'custom.automation_restore', '{}'::jsonb, 'archived_at');
$fn$;

create function custom.automation_set_enabled(p_organization_id uuid, p_automation_id uuid, p_enabled boolean)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog'
as $fn$
  select custom._automation_flip(p_organization_id, p_automation_id, 'custom.automation_set_enabled',
           jsonb_build_object('enabled', coalesce(p_enabled, false)));
$fn$;

comment on function custom.automation_archive(uuid, uuid) is 'AUTOMATION-DOOR: archive an automation (it stays, switched off, with its history). Editor on the Table.';
comment on function custom.automation_restore(uuid, uuid) is 'AUTOMATION-DOOR: bring an archived automation back (still switched off until set_enabled). Editor on the Table.';
comment on function custom.automation_set_enabled(uuid, uuid, boolean) is 'AUTOMATION-DOOR: switch an automation on or off. Editor on the Table.';

create function custom.automation_runs(p_automation_id uuid, p_limit integer default 50, p_cursor timestamptz default null,
                                       p_organization_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_org   uuid := p_organization_id;
  v_table uuid;
  v_n     integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows  jsonb;
  v_next  timestamptz;
  v_count integer;
begin
  if v_org is null then
    select t.organization_id, t.id into v_org, v_table from custom.record t
     where t.table_id = custom.table_kernel_id() and t.deleted_at is null
       and t.data -> 'automations' @> jsonb_build_array(jsonb_build_object('id', p_automation_id::text)) limit 1;
  else
    select h.table_id into v_table from custom._automation_home(v_org, p_automation_id) h;
  end if;
  if v_org is null or v_table is null then
    raise exception 'There is no such automation here.'
      using errcode = '23503', hint = 'It may have been removed, or it belongs to another organization.';
  end if;
  perform custom.assert_client_may_reach(v_org, 'custom.automation_runs');
  perform custom.assert_may_know_table(v_org, v_table, 'custom.automation_runs');

  select coalesce(jsonb_agg(r.j order by r.at desc), '[]'::jsonb), count(*), min(r.at)
    into v_rows, v_count, v_next
    from (select x.created_at as at,
                 jsonb_build_object('run_id', x.id, 'status', x.data ->> 'status', 'says', x.data ->> 'says',
                   'record_id', x.data -> 'record_id', 'started_at', x.data ->> 'started_at',
                   'finished_at', x.data ->> 'finished_at', 'steps', x.data -> 'steps', 'ran_by', x.data -> 'ran_by',
                   'trigger', x.data -> 'trigger', 'at', x.created_at) as j
            from custom.record x
           where x.organization_id = v_org and x.data_class = 'automation_run' and x.deleted_at is null
             and x.data ->> 'automation_id' = p_automation_id::text
             and (p_cursor is null or x.created_at < p_cursor)
           order by x.created_at desc
           limit v_n) r;
  return jsonb_build_object('automation_id', p_automation_id, 'runs', v_rows,
           'next_cursor', case when v_count = v_n then v_next end);
end
$fn$;

comment on function custom.automation_runs(uuid, integer, timestamptz, uuid) is
  'AUTOMATION-DOOR: run history, newest first: status (ran, failed, stopped, waiting), the sentence, and every step with its own status and the store''s own words. next_cursor continues the list.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- the run path — one statement trigger on the store's own change feed
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom._automation_fire()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  c_depth_max constant integer := 3;
  r         record;
  v_doc     jsonb;
  v_a       jsonb;
  v_spec    jsonb;
  v_trig    jsonb;
  v_on      text;
  v_kind    text;
  v_via     text;
  v_depth   integer := coalesce(nullif(current_setting('custom.automation_depth', true), '')::integer, 0);
  v_match   boolean;
  v_values  jsonb;
  v_byid    jsonb;
  v_ctx     jsonb;
  v_fields  jsonb;
  v_tfields jsonb;
  v_act     jsonb;
  v_n       integer;
  v_steps   jsonb;
  v_status  text;
  v_says    text;
  v_stepsay text;
  v_started timestamptz;
  v_me      uuid := custom.query_principal();
  v_patch   jsonb;
  k         text;
  v         jsonb;
  v_field   jsonb;
  v_rid     uuid;
  v_cand    uuid;
  v_cnt     integer;
  v_scan    integer;
  v_to      uuid;
  v_text    text;
  v_msg     text;
  v_hint    text;
  v_body    text;
  v_res     jsonb;
  v_run     uuid;
begin
  for r in select o.* from new_rows o
            where o.event_key = 'records.changed' and o.table_id is not null
              and o.operation in ('created', 'updated') and o.deleted_at is null loop
    select t.data -> 'automations' into v_doc from custom.record t
     where t.organization_id = r.organization_id and t.id = r.table_id and t.data_class = 'table';
    continue when v_doc is null or jsonb_typeof(v_doc) <> 'array';

    -- NO AUTOMATION MAY REFUSE A PERSON'S WRITE: anything unforeseen below is a warning, and only this change's
    -- automations are rolled back with it. (Only a Table that HAS automations pays for the sub-transaction.)
    begin
    v_kind := r.metadata -> 'change' ->> 'kind';
    v_via  := r.metadata -> 'change' ->> 'via';
    v_values := null;

    for v_a in select e from jsonb_array_elements(v_doc) e loop
      continue when (v_a ->> 'archived_at') is not null or not coalesce((v_a ->> 'enabled')::boolean, false);
      v_spec := v_a -> 'spec';
      v_trig := v_spec -> 'trigger';
      v_on := v_trig ->> 'on';
      v_match := case
        when v_on = 'row_added' then r.operation = 'created' and coalesce(v_kind, 'create') = 'create'
        when v_on = 'form_answered' then r.operation = 'created' and coalesce(v_kind, 'create') = 'create' and v_via = 'form'
        when v_on = 'property_edited' then r.operation = 'updated' and r.changed_field_ids ? (v_trig ->> 'field')
        else false end;
      continue when not v_match;

      if v_values is null then
        v_values := custom.record_values(r.organization_id, r.record_id);
        v_ctx := coalesce(custom.rule_context(r.organization_id, r.record_id), '{}'::jsonb)
                 || jsonb_build_object('fx_self_id', r.record_id, 'fx_table_id', r.table_id);
        -- record_values is keyed by the Field's KEY; a spec names Fields by ID (REC-17), so read it both ways.
        if v_values is not null then
          v_fields := custom._automation_fields(r.organization_id, r.table_id);
          select coalesce(jsonb_object_agg(f.key, coalesce(v_values -> (f.value ->> 'key'), 'null'::jsonb)), '{}'::jsonb)
            into v_byid from jsonb_each(v_fields) f;
        end if;
      end if;
      continue when v_values is null;

      if v_on = 'property_edited' and v_trig ? 'to'
         and lower(btrim(coalesce((v_byid -> (v_trig ->> 'field')) #>> '{}', '')))
             is distinct from lower(btrim(coalesce((v_trig -> 'to') #>> '{}', ''))) then
        continue;
      end if;
      if v_spec -> 'condition' is not null and jsonb_typeof(v_spec -> 'condition') = 'object' then
        begin
          continue when not custom._fx_truthy(custom.rule_eval(r.organization_id,
                           custom._automation_bind(v_spec -> 'condition', v_byid), v_values, v_ctx));
        exception when others then
          null;  -- a condition that cannot be worked out is a failed run, written below
        end;
      end if;

      v_started := clock_timestamp();
      v_steps := '[]'::jsonb;
      v_status := 'ran';
      v_says := 'Every step finished.';
      v_n := 0;

      if v_depth >= c_depth_max then
        v_status := 'stopped';
        v_says := format('Stopped after %s rounds: this automation keeps changing the record that starts it.', c_depth_max);
      else
        perform set_config('custom.automation_depth', (v_depth + 1)::text, true);
        for v_act in select e from jsonb_array_elements(v_spec -> 'actions') e loop
          v_n := v_n + 1;
          v_stepsay := null;
          begin
            if v_act ->> 'do' = 'set' then
              v_patch := '{}'::jsonb;
              for k, v in select key, value from jsonb_each(v_act -> 'values') loop
                v_field := v_fields -> k;
                if v_field is null then
                  raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
                end if;
                v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                             custom._action_coerce(v_field, custom._automation_value(v, v_byid, v_me)));
              end loop;
              perform custom.record_update(r.organization_id, r.record_id, v_patch);
              v_stepsay := 'Set ' || (select string_agg(f.value ->> 'label', ', ') from jsonb_each(v_fields) f
                                       where (v_act -> 'values') ? f.key) || ' on this row.';

            elsif v_act ->> 'do' = 'add_row' then
              v_tfields := custom._automation_fields(r.organization_id, (v_act ->> 'table_id')::uuid);
              v_patch := '{}'::jsonb;
              for k, v in select key, value from jsonb_each(v_act -> 'values') loop
                v_field := v_tfields -> k;
                if v_field is null then
                  raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
                end if;
                v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                             custom._action_coerce(v_field, custom._automation_value(v, v_byid, v_me)));
              end loop;
              v_rid := custom.record_write(r.organization_id, (v_act ->> 'table_id')::uuid, v_patch);
              v_stepsay := 'Added a row to the other table.';
              v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'add_row', 'status', 'done',
                           'says', v_stepsay, 'record_id', v_rid));
              continue;

            elsif v_act ->> 'do' = 'edit_rows' then
              v_tfields := custom._automation_fields(r.organization_id, (v_act ->> 'table_id')::uuid);
              v_cnt := 0;
              v_scan := 0;
              for v_cand in select x.id from custom.record x
                             where x.organization_id = r.organization_id and x.table_id = (v_act ->> 'table_id')::uuid
                               and x.data_class = 'record' and x.deleted_at is null
                             order by x.created_at limit 2000 loop
                v_scan := v_scan + 1;
                exit when v_cnt >= coalesce((v_act ->> 'limit')::integer, 100);
                v_res := custom.record_values(r.organization_id, v_cand);
                if custom._fx_truthy(custom.rule_eval(r.organization_id,
                     custom._automation_bind(v_act -> 'where', v_byid), v_res,
                     coalesce(custom.rule_context(r.organization_id, v_cand), '{}'::jsonb)
                       || jsonb_build_object('fx_self_id', v_cand, 'fx_table_id', (v_act ->> 'table_id')::uuid))) then
                  v_patch := '{}'::jsonb;
                  for k, v in select key, value from jsonb_each(v_act -> 'values') loop
                    v_field := v_tfields -> k;
                    if v_field is null then
                      raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
                    end if;
                    v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                                 custom._action_coerce(v_field, custom._automation_value(v, v_byid, v_me)));
                  end loop;
                  perform custom.record_update(r.organization_id, v_cand, v_patch);
                  v_cnt := v_cnt + 1;
                end if;
              end loop;
              v_stepsay := format('Edited %s row%s in the other table.', v_cnt, case when v_cnt = 1 then '' else 's' end);
              v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'edit_rows', 'status', 'done',
                           'says', v_stepsay, 'edited', v_cnt));
              continue;

            elsif v_act ->> 'do' = 'notify' then
              v_to := case
                when v_act -> 'to' ? 'person' then (v_act -> 'to' ->> 'person')::uuid
                when v_act -> 'to' ? 'field' then case when (v_byid ->> (v_act -> 'to' ->> 'field'))
                       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then (v_byid ->> (v_act -> 'to' ->> 'field'))::uuid end
                else nullif(v_a ->> 'created_by', '')::uuid end;
              if v_to is null then
                raise exception 'There is no person to tell: the property is empty on this row.' using errcode = '22023';
              end if;
              if not iam.is_org_member(v_to, r.organization_id) then
                raise exception 'That person is not a member of this organization.' using errcode = '22023';
              end if;
              v_text := v_act ->> 'text';
              for k, v in select key, value from jsonb_each(v_byid) loop
                v_text := replace(v_text, '{{' || k || '}}',
                            case when jsonb_typeof(v) = 'string' then v #>> '{}' when v is null or jsonb_typeof(v) = 'null' then '' else v::text end);
              end loop;
              v_res := communication.notify_from_sql(r.organization_id, 'records.changed', v_to, null, null,
                         jsonb_build_object('notice', jsonb_build_object('body', v_text, 'subject', v_spec ->> 'name')),
                         null, 'custom.record', r.record_id,
                         'automation:' || (v_a ->> 'id') || ':' || r.id::text || ':' || v_n::text);
              v_stepsay := coalesce(v_res ->> 'say', 'Told them.');

            elsif v_act ->> 'do' = 'webhook' then
              if not coalesce(files.is_safe_webhook_url(v_act ->> 'url'), false) then
                raise exception 'That webhook address is not a public https address any more, so nothing was sent.' using errcode = '22023';
              end if;
              perform net.http_post(url := v_act ->> 'url',
                        body := jsonb_build_object('event', 'automation.fired', 'automation_id', v_a ->> 'id',
                                  'automation', v_spec ->> 'name', 'table_id', r.table_id, 'record_id', r.record_id,
                                  'operation', r.operation, 'changed_field_ids', r.changed_field_ids),
                        headers := '{"Content-Type": "application/json"}'::jsonb);
              v_stepsay := 'Sent the webhook.';

            elsif v_act ->> 'do' = 'agent' then
              v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'agent', 'status', 'waiting',
                           'says', 'Waiting for a person: an agent''s changes are confirmed by a person. Open this record''s chat to ask it.',
                           'prompt', v_act ->> 'prompt'));
              if v_status = 'ran' then
                v_status := 'waiting';
                v_says := 'Waiting for a person to run the agent step.';
              end if;
              continue;
            end if;
            v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', v_act ->> 'do', 'status', 'done', 'says', v_stepsay));
          exception when others then
            get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
            v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', v_act ->> 'do', 'status', 'failed',
                         'says', v_msg, 'hint', v_hint));
            v_status := 'failed';
            v_says := format('Step %s did not run: %s', v_n, v_msg);
            exit;
          end;
        end loop;
        perform set_config('custom.automation_depth', v_depth::text, true);
      end if;

      insert into custom.record (organization_id, table_id, data_class, data)
      values (r.organization_id, null, 'automation_run', jsonb_build_object(
                'automation_id', v_a ->> 'id', 'automation', v_spec ->> 'name', 'table_id', r.table_id,
                'record_id', r.record_id, 'change_id', r.id, 'status', v_status, 'says', v_says,
                'trigger', jsonb_build_object('on', v_on, 'operation', r.operation, 'via', v_via,
                                              'changed_field_ids', r.changed_field_ids),
                'steps', v_steps, 'ran_by', v_me,
                'started_at', v_started, 'finished_at', clock_timestamp()))
      returning id into v_run;
    end loop;
    exception when others then
      perform set_config('custom.automation_depth', v_depth::text, true);
      raise warning 'custom._automation_fire: % (%): %', r.table_id, sqlstate, sqlerrm;
    end;
  end loop;
  return null;
end
$fn$;

comment on function custom._automation_fire() is
  'AUTOMATION-DOOR: the run path. Statement trigger on custom.io_outbox: for each records.changed row, one primary-key read of the Table record; a matching, enabled automation runs in the writer''s transaction as the writer, through the store''s own doors, and writes an automation_run record. A failing step is caught and named; loops stop at three rounds.';

create trigger zzzz_automations_fire_s_i
  after insert on custom.io_outbox
  referencing new table as new_rows
  for each statement execute function custom._automation_fire();

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- the doors' registry rows (a client-callable SECURITY DEFINER function needs one before its GRANT)
-- ─────────────────────────────────────────────────────────────────────────────────────────

do $reg$
declare
  d record;
  v_rules jsonb;
  v_org_check constant text := 'this body decides it with custom.assert_store_door(arg1) and custom.assert_client_may_reach(arg1), the organization wall, before anything is read, and that call stands before every other use of this argument in the body.';
begin
  for d in
    select * from (values
      ('automation_declare', 'p_organization_id uuid, p_table_id uuid, p_spec jsonb, p_automation_id uuid',
         array['uuid','uuid','jsonb','uuid'], true),
      ('automations', 'p_table_id uuid, p_organization_id uuid, p_include_archived boolean',
         array['uuid','uuid','boolean'], false),
      ('automation_archive', 'p_organization_id uuid, p_automation_id uuid', array['uuid','uuid'], true),
      ('automation_restore', 'p_organization_id uuid, p_automation_id uuid', array['uuid','uuid'], true),
      ('automation_set_enabled', 'p_organization_id uuid, p_automation_id uuid, p_enabled boolean',
         array['uuid','uuid','boolean'], true),
      ('automation_runs', 'p_automation_id uuid, p_limit integer, p_cursor timestamp with time zone, p_organization_id uuid',
         array['uuid','integer','timestamptz','uuid'], false)
    ) as t(fn, args, types, writes)
  loop
    v_rules := jsonb_build_object('version', 1,
      'declared_by', 'automation_door_a_table_declares_what_happens_when_a_row_changes.sql',
      'declared_at', '2026-10-07 lane AUTOMATION-DOOR',
      'arguments', jsonb_build_object(
        'p_organization_id', jsonb_build_object('type', 'uuid', 'position', array_position(string_to_array(replace(d.args, ', ', ','), ','), 'p_organization_id uuid'), 'entity', 'organization',
          'check', v_org_check,
          'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
          'verified', '2026-10-07 lane AUTOMATION-DOOR: written with this body')));
    if d.fn in ('automation_declare', 'automations') then
      v_rules := jsonb_set(v_rules, '{arguments,p_table_id}', jsonb_build_object('type', 'uuid',
        'position', array_position(string_to_array(replace(d.args, ', ', ','), ','), 'p_table_id uuid'), 'entity', 'table',
        'check', case when d.fn = 'automation_declare'
                      then 'custom.assert_client_may_change(arg1, arg2, editor, table) before the Table row is read.'
                      else 'custom.assert_may_know_table(org, arg1) before anything of the Table is read; the organization is derived from the Table itself when none is sent, then walled.' end,
        'foreign', jsonb_build_object('sqlstate', case when d.fn = 'automation_declare' then '42501' else '23503' end, 'same_as_invented', true),
        'verified', '2026-10-07 lane AUTOMATION-DOOR: written with this body'));
    end if;
    if d.fn <> 'automation_declare' and d.fn <> 'automations' then
      v_rules := jsonb_set(v_rules, '{arguments,p_automation_id}', jsonb_build_object('type', 'uuid',
        'position', array_position(string_to_array(replace(d.args, ', ', ','), ','), 'p_automation_id uuid'), 'entity', 'automation',
        'check', 'read only among the Tables of the organization the caller reached, then the holding Table is asked editor (or may-know for runs); anything else raises the same 23503 an invented id does.',
        'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
        'verified', '2026-10-07 lane AUTOMATION-DOOR: written with this body'));
    end if;
    if d.fn = 'automation_declare' then
      v_rules := jsonb_set(v_rules, '{arguments,p_automation_id}', jsonb_build_object('type', 'uuid', 'position', 4, 'entity', 'automation',
        'check', 'looked up only inside the locked Table record the caller may edit; an id that is not in it raises the same 23503 an invented id does.',
        'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
        'verified', '2026-10-07 lane AUTOMATION-DOOR: written with this body'));
    end if;
    if d.fn = 'automations' then
      v_rules := v_rules - 'arguments' || jsonb_build_object('arguments', (v_rules -> 'arguments') - 'p_organization_id');
      v_rules := jsonb_set(v_rules, '{arguments,p_organization_id}', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'organization',
        'check', 'custom.assert_client_may_reach(arg2) before anything else is read; when null it is derived from the Table and then walled.',
        'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
        'verified', '2026-10-07 lane AUTOMATION-DOOR: written with this body'));
    end if;
    if d.fn = 'automation_runs' then
      v_rules := jsonb_set(v_rules, '{arguments,p_organization_id}', jsonb_build_object('type', 'uuid', 'position', 4, 'entity', 'organization',
        'check', 'custom.assert_client_may_reach(arg4) before any run is read; when null it is derived from the automation itself and then walled.',
        'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
        'verified', '2026-10-07 lane AUTOMATION-DOOR: written with this body'));
    end if;

    insert into platform.client_callable_door
      (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
       non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
    values ('custom', d.fn, d.args,
            array(select u.x::regtype::oid from unnest(d.types) with ordinality as u(x, n) order by u.n),
            'A person asks the store about, or changes, the automations of a Table. The organization is walled by custom.assert_client_may_reach, the Table by custom.assert_client_may_change (editor) or custom.assert_may_know_table, and every write the automation later makes goes through the store''s own doors as the person whose change started it, so it can never do what that person could not do by hand.',
            'automation_door_a_table_declares_what_happens_when_a_row_changes.sql', null, true, false, v_rules)
    on conflict do nothing;
  end loop;
end
$reg$;

-- A signed-in person calls the six doors; every one decides for itself (organization wall, then Table).
grant execute on function custom.automation_declare(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function custom.automations(uuid, uuid, boolean) to authenticated;
grant execute on function custom.automation_archive(uuid, uuid) to authenticated;
grant execute on function custom.automation_restore(uuid, uuid) to authenticated;
grant execute on function custom.automation_set_enabled(uuid, uuid, boolean) to authenticated;
grant execute on function custom.automation_runs(uuid, integer, timestamp with time zone, uuid) to authenticated;
