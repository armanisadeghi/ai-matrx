-- target: branch,production
-- additive: yes
--   It ADDS `custom.action_declare`, `custom.row_actions`, `custom.action_run` and their helpers
--   (`custom._action_check`, `custom._action_coerce`), three `platform.client_callable_door`
--   rows and three `platform.feature_knob` rows (`custom/row_actions_max`,
--   `custom/row_action_steps_max`, `custom/action_run_records_max`). Nothing existing is
--   replaced, dropped or revoked; no table, column, trigger, policy or grant is touched; no row
--   of anybody's data is rewritten. It needs `custom.formula_parse` / `custom.formula_eval`
--   (gridprim_a_formula_is_typed_and_the_store_works_it_out.sql) and the palette of
--   gridprim_a_table_wears_its_colors_and_its_layout.sql applied first.
--   The inverse is `migrations/inverse/gridprim_a_row_action_runs_the_whole_selection_at_once_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES, gap G2 — row actions (GRID-REBUILD.md).
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- "CHECK IN" ON TWELVE ARRIVALS IS ONE ACT, AND IT EITHER HAPPENS OR IT SAYS WHY NOT
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- The older grid's row actions (features/data-tables/row-actions.ts, stored by
-- public.udt_set_table_row_actions) are buttons a table's editors declare once — "Check in"
-- sets Visit status to Checked in and clears the reminder note; "Close out" works the balance
-- out with a formula — and anybody who may edit runs on one row or on a whole selection.
-- The older grid COMPILES the action in the browser and sends one bulk write: the formula is
-- evaluated on the screen, and a rule the store refuses on the ninth row leaves eight changed.
--
-- HERE:
--   custom.action_declare(org, table, actions) — the whole list, judged whole (the older door's
--     rules: ≤ 24 actions, unique names, ≤ 60 steps, each step a live column of THIS table by
--     id, never a worked-out column, never the same column twice, a value for "set", a formula
--     the store can parse for "compute"). A step's formula is the older grid's text language
--     (`formula_text`, parsed by custom.formula_parse and kept) or an expression.
--   custom.row_actions(org, table) — the list as a screen draws it, a step whose column is gone
--     named under `stale`.
--   custom.action_run(org, action, record_ids[]) — the whole selection in ONE transaction. Every
--     record is written through custom.record_update, so every rule, every validation, every
--     field-level permission and every history line is the store's own. A record that refuses is
--     tried again one column at a time, so the refusal names the RECORD and the FIELD; every
--     refusal of the selection is collected, and if there is even one, nothing is written and
--     the error carries them all (DETAIL is the JSON list). "Hand to an agent" is an action of
--     kind `agent` whose prompt the record-chat launcher opens with; action_run refuses it by
--     name and says so, because an agent is not a fixed change.
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'row_actions_max', '24'::jsonb, '24'::jsonb, 'integer',
   'Most row actions one table may carry',
   'The ceiling on a Table''s declared row actions (the buttons "Check in", "Close out", "Ask an agent"). The older grid''s own ceiling, carried over.',
   'agent', 'Lane GRID-PRIMITIVES 2026-09-22: public.udt_set_table_row_actions refuses more than 24.',
   date '2026-12-22', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('custom', 'row_action_steps_max', '60'::jsonb, '60'::jsonb, 'integer',
   'Most columns one row action may change',
   'The ceiling on the steps of one row action. The older grid''s own ceiling, carried over.',
   'agent', 'Lane GRID-PRIMITIVES 2026-09-22: public.udt_set_table_row_actions refuses more than 60.',
   date '2026-12-22', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('custom', 'action_run_records_max', '5000'::jsonb, '5000'::jsonb, 'integer',
   'Most records one row action runs on at once',
   'The ceiling on a selection one custom.action_run call changes in its one transaction. Every record is written through the store''s own write door, so a selection this size is a few seconds; past it, run the action on a filtered view in parts.',
   'agent', 'Lane GRID-PRIMITIVES 2026-09-22: sized to a full grid page of the largest tables a person selects by hand, times ten.',
   date '2026-12-22', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The value a step writes, in the shape its column holds (row-actions.ts coerceForColumn).
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom._action_coerce(p_field jsonb, p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_type text := p_field ->> 'type';
  v_kind text := p_field -> 'config' ->> 'kind';
  v_s    text;
  v_n    numeric;
begin
  if custom._fx_blank(p_value) then
    return 'null'::jsonb;
  end if;
  if v_type = 'range' and v_kind in ('date', 'datetime') then
    v_s := custom._fx_text(p_value);
    if v_kind = 'date' and v_s ~ '^\d{4}-\d{2}-\d{2}T' then v_s := left(v_s, 10); end if;
    return to_jsonb(v_s);
  elsif v_type = 'range' then
    v_n := custom._fx_loose(p_value);
    return case when v_n is null then 'null'::jsonb else to_jsonb(v_n) end;
  elsif v_type = 'boolean' then
    if jsonb_typeof(p_value) = 'boolean' then return p_value; end if;
    if jsonb_typeof(p_value) = 'string' then
      return to_jsonb(lower(btrim(p_value #>> '{}')) in ('true', 'yes', '1'));
    end if;
    return to_jsonb(custom._fx_truthy(p_value));
  elsif v_type in ('text', 'list') and jsonb_typeof(p_value) in ('number', 'boolean') then
    return to_jsonb(custom._fx_text(p_value));
  end if;
  return p_value;
end
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom._action_check — the whole list, judged whole. Returns the list to store.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom._action_check(p_organization_id uuid, p_table_id uuid, p_actions jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_a      jsonb;
  v_s      jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_steps  jsonb;
  v_names  text[] := '{}';
  v_ids    text[] := '{}';
  v_seen   text[];
  v_name   text;
  v_kind   text;
  v_set    text;
  v_field  jsonb;
  v_parsed jsonb;
  v_max_a  integer := coalesce((platform.knob_resolve('custom', 'row_actions_max', p_organization_id) #>> '{}')::integer, 24);
  v_max_s  integer := coalesce((platform.knob_resolve('custom', 'row_action_steps_max', p_organization_id) #>> '{}')::integer, 60);
  v_id     text;
begin
  if p_actions is null or jsonb_typeof(p_actions) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_actions) <> 'array' then
    raise exception 'A table''s row actions are a list, and what was sent is a %.', jsonb_typeof(p_actions)
      using errcode = '22023', hint = 'Send the whole list; an empty list removes every action. Nothing was written.';
  end if;
  if jsonb_array_length(p_actions) > v_max_a then
    raise exception 'A table can have at most % row actions, and % were sent.', v_max_a, jsonb_array_length(p_actions)
      using errcode = '22023', hint = 'The ceiling is the organization knob custom/row_actions_max. Nothing was written.';
  end if;

  for v_a in select e from jsonb_array_elements(p_actions) e loop
    if jsonb_typeof(v_a) <> 'object' then
      raise exception 'Each row action is a button with a name, and one of these is not.' using errcode = '22023';
    end if;
    v_name := btrim(coalesce(v_a ->> 'name', ''));
    if v_name = '' then
      raise exception 'A row action needs a name — it is the words on the button.' using errcode = '22023';
    end if;
    if char_length(v_name) > 80 then
      raise exception 'The row action "%…" has a name longer than 80 characters.', left(v_name, 20) using errcode = '22023';
    end if;
    if lower(v_name) = any (v_names) then
      raise exception 'Two row actions are called "%".', v_name
        using errcode = '22023', hint = 'Two buttons with the same words cannot be told apart. Nothing was written.';
    end if;
    v_names := v_names || lower(v_name);
    v_id := coalesce(nullif(v_a ->> 'id', ''), gen_random_uuid()::text);
    if v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'A row action is found by its id, and "%" is not one the store gave out.', v_id
        using errcode = '22023', hint = 'Leave id out for a new action; keep the id the store returned for an existing one.';
    end if;
    if v_id = any (v_ids) then
      raise exception 'Two row actions share the id %.', v_id using errcode = '22023';
    end if;
    v_ids := v_ids || v_id;
    if nullif(v_a ->> 'color', '') is not null and not ((v_a ->> 'color') = any (custom.decoration_colors())) then
      raise exception 'The button "%" is colored "%", which is not one of the table colors.', v_name, v_a ->> 'color'
        using errcode = '22023', hint = format('The colors are %s, or none. Nothing was written.', array_to_string(custom.decoration_colors(), ', '));
    end if;
    v_kind := coalesce(nullif(v_a ->> 'kind', ''), 'update');
    if v_kind not in ('update', 'agent') then
      raise exception 'The row action "%" is a "%", and an action either changes the record or asks an agent.', v_name, v_kind
        using errcode = '22023', hint = 'kind is "update" or "agent". Nothing was written.';
    end if;

    if v_kind = 'agent' then
      if btrim(coalesce(v_a ->> 'prompt', '')) = '' then
        raise exception 'The row action "%" asks an agent, and does not say what to ask.', v_name
          using errcode = '22023', hint = 'Say what the agent should do with the record — it opens the record''s chat with those words. Nothing was written.';
      end if;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', v_id, 'name', v_name, 'kind', 'agent', 'prompt', btrim(v_a ->> 'prompt'),
        'color', nullif(v_a ->> 'color', ''), 'icon', left(nullif(btrim(v_a ->> 'icon'), ''), 64),
        'confirm', coalesce((v_a ->> 'confirm')::boolean, false))));
      continue;
    end if;

    if jsonb_typeof(v_a -> 'steps') is distinct from 'array' or jsonb_array_length(v_a -> 'steps') = 0 then
      raise exception 'The row action "%" changes nothing yet — add at least one change.', v_name using errcode = '22023';
    end if;
    if jsonb_array_length(v_a -> 'steps') > v_max_s then
      raise exception 'The row action "%" changes more than % columns.', v_name, v_max_s
        using errcode = '22023', hint = 'The ceiling is the organization knob custom/row_action_steps_max. Nothing was written.';
    end if;
    v_steps := '[]'::jsonb;
    v_seen := '{}';
    for v_s in select e from jsonb_array_elements(v_a -> 'steps') e loop
      select jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                'type', f.data ->> 'type', 'source', f.data ->> 'source', 'config', f.data -> 'config')
        into v_field
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class = 'field'
         and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = p_table_id::text
         and (v_s ->> 'field') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and f.id = (v_s ->> 'field')::uuid;
      if v_field is null then
        raise exception 'The row action "%" changes a column that is not in this table.', v_name
          using errcode = '23503', hint = 'REC-17: a step names a column of this Table by its id. Nothing was written.';
      end if;
      if v_field ->> 'type' = 'formula' or v_field ->> 'source' = 'formula' then
        raise exception 'The row action "%" sets "%", which is worked out by the store and cannot be set.', v_name, v_field ->> 'label'
          using errcode = '22023', hint = 'FLD-9. Nothing was written.';
      end if;
      if (v_field ->> 'id') = any (v_seen) then
        raise exception 'The row action "%" changes "%" twice.', v_name, v_field ->> 'label' using errcode = '22023';
      end if;
      v_seen := v_seen || (v_field ->> 'id');
      v_set := coalesce(v_s ->> 'set', '');
      if v_set = 'value' then
        if custom._fx_blank(v_s -> 'value') then
          raise exception 'The row action "%" sets "%" to nothing — type the value, or choose Clear.', v_name, v_field ->> 'label'
            using errcode = '22023';
        end if;
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('field', v_field ->> 'id', 'set', 'value', 'value', v_s -> 'value'));
      elsif v_set = 'clear' then
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('field', v_field ->> 'id', 'set', 'clear'));
      elsif v_set in ('compute', 'formula') then
        if nullif(btrim(coalesce(v_s ->> 'formula_text', v_s ->> 'expression', '')), '') is not null then
          v_parsed := custom.formula_parse(p_organization_id, p_table_id, coalesce(v_s ->> 'formula_text', v_s ->> 'expression'));
          if not coalesce((v_parsed ->> 'ok')::boolean, false) then
            raise exception 'The row action "%" works "%" out with a formula that cannot be read: %', v_name, v_field ->> 'label', v_parsed ->> 'error'
              using errcode = '22023', hint = format('At character %s. Nothing was written.', coalesce((v_parsed ->> 'position')::integer, 0) + 1);
          end if;
          v_steps := v_steps || jsonb_build_array(jsonb_build_object('field', v_field ->> 'id', 'set', 'compute',
                       'formula_text', coalesce(v_s ->> 'formula_text', v_s ->> 'expression'), 'expr', v_parsed -> 'expr'));
        elsif jsonb_typeof(v_s -> 'expr') = 'object' then
          v_steps := v_steps || jsonb_build_array(jsonb_build_object('field', v_field ->> 'id', 'set', 'compute', 'expr', v_s -> 'expr'));
        else
          raise exception 'The row action "%" works "%" out, and does not say how.', v_name, v_field ->> 'label'
            using errcode = '22023', hint = 'Give the step formula_text (like {Visit fee} - {Deposit taken}) or an expr. Nothing was written.';
        end if;
      else
        raise exception 'A step of "%" says "%", and a step sets a value, clears, or computes.', v_name, coalesce(nullif(v_set, ''), 'nothing')
          using errcode = '22023';
      end if;
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'name', v_name, 'kind', 'update', 'steps', v_steps,
      'color', nullif(v_a ->> 'color', ''), 'icon', left(nullif(btrim(v_a ->> 'icon'), ''), 64),
      'confirm', coalesce((v_a ->> 'confirm')::boolean, false))));
  end loop;
  return v_out;
end
$fn$;

comment on function custom._action_check(uuid, uuid, jsonb) is
  'GRID-PRIMITIVES G2: a Table''s row actions judged whole before custom.action_declare stores them — the older door''s rules (public.udt_set_table_row_actions), columns by id, formulas parsed by custom.formula_parse.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.action_declare — THE WRITE: the whole list, like the older door.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.action_declare(p_organization_id uuid, p_table_id uuid, p_actions jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_list jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.action_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.action_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.action_declare',
                                          'editor'::public.permission_level, 'table');
  perform 1 from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null
   for update;
  if not found then
    raise exception 'That table is not in this organization, so it has no actions to change.'
      using errcode = '23503', hint = 'REC-29: organizations are hard walls. Nothing was written.';
  end if;
  v_list := custom._action_check(p_organization_id, p_table_id, p_actions);
  update custom.record
     set data = case when jsonb_array_length(v_list) = 0 then data - 'row_actions'
                     else jsonb_set(data, '{row_actions}', v_list, true) end
   where organization_id = p_organization_id and id = p_table_id and table_id = custom.table_kernel_id();
  return v_list;
end
$fn$;

comment on function custom.action_declare(uuid, uuid, jsonb) is
  'GRID-PRIMITIVES G2: declare a Table''s row actions — the whole list, judged whole, editor on the Table. update actions: steps that set a value, clear, or compute with a formula (formula_text kept); agent actions: a prompt the record-chat launcher opens with. Kept on the Table record, so every open screen hears it on the realtime port. Replaces public.udt_set_table_row_actions for the store.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'action_declare',
        'p_organization_id uuid, p_table_id uuid, p_actions jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach, p_table_id by custom.assert_client_may_change at editor on the Table, before the Table row is read. Every Field a step names is judged by custom._action_check to be a live Field OF THIS TABLE; a formula is parsed against this Table''s own columns. It writes one key of the Table record and nothing else.',
        'gridprim_a_row_action_runs_the_whole_selection_at_once.sql', null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_row_action_runs_the_whole_selection_at_once.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1), custom.assert_client_may_change(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'this body decides it with custom.assert_client_may_change(arg2) at editor on the Table — the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.row_actions — THE READ.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.row_actions(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_list  jsonb;
  v_a     jsonb;
  v_s     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_stale jsonb := '[]'::jsonb;
  v_ok    boolean;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.row_actions');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.row_actions');
  select coalesce(t.data -> 'row_actions', '[]'::jsonb) into v_list
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;
  for v_a in select e from jsonb_array_elements(case when jsonb_typeof(v_list) = 'array' then v_list else '[]'::jsonb end) e loop
    v_ok := true;
    for v_s in select e from jsonb_array_elements(coalesce(v_a -> 'steps', '[]'::jsonb)) e loop
      if not custom._decoration_field_ok(p_organization_id, p_table_id, v_s ->> 'field') then
        v_ok := false;
        v_stale := v_stale || jsonb_build_array(jsonb_build_object('action_id', v_a ->> 'id', 'action', v_a ->> 'name',
                     'field', v_s ->> 'field', 'says', format('"%s" changes a column that is gone, so it cannot run until it is edited.', v_a ->> 'name')));
      end if;
    end loop;
    v_out := v_out || jsonb_build_array(v_a || jsonb_build_object('runnable', v_ok and v_a ->> 'kind' = 'update'));
  end loop;
  return jsonb_build_object('actions', v_out, 'stale', v_stale);
end
$fn$;

comment on function custom.row_actions(uuid, uuid) is
  'GRID-PRIMITIVES G2: a Table''s row actions as a screen draws them, each saying whether custom.action_run can run it; a step over a column that is gone is named under `stale`.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'row_actions',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach and p_table_id by custom.assert_may_know_table before the Table row is read, so a Table this caller may not know answers exactly as an invented one. It returns the Table''s own action declarations and writes nothing.',
        'gridprim_a_row_action_runs_the_whole_selection_at_once.sql', null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_row_action_runs_the_whole_selection_at_once.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'this body decides it with custom.assert_may_know_table(arg2) — the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.action_run — THE RUN: the whole selection, one transaction, every refusal named.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.action_run(p_organization_id uuid, p_action_id uuid, p_record_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table    uuid;
  v_tdoc     jsonb;
  v_action   jsonb;
  v_step     jsonb;
  v_fields   jsonb;
  v_field    jsonb;
  v_rid      uuid;
  v_rec      custom.record;
  v_patch    jsonb;
  v_val      jsonb;
  v_values   jsonb;
  v_ctx      jsonb;
  v_refused  jsonb := '[]'::jsonb;
  v_one      jsonb;
  v_done     jsonb := '[]'::jsonb;
  v_ver      integer;
  v_msg      text;
  v_hint     text;
  v_state    text;
  v_whole    text;
  v_named    boolean;
  v_title    text;
  v_max      integer;
  v_n        integer;
  k          text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.action_run');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.action_run');

  -- The action is found inside THIS organization's Tables only, and only on a Table this
  -- person may know; any other id answers exactly as an invented one.
  select t.id, t.data into v_table, v_tdoc
    from custom.record t
   where t.organization_id = p_organization_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data -> 'row_actions' @> jsonb_build_array(jsonb_build_object('id', p_action_id::text))
   limit 1;
  if v_table is null then
    raise exception 'There is no row action % here.', p_action_id
      using errcode = '23503', hint = 'It may have been removed from its table, or it belongs to another organization. Nothing was changed.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.action_run');
  select a into v_action from jsonb_array_elements(v_tdoc -> 'row_actions') a where a ->> 'id' = p_action_id::text;

  if v_action ->> 'kind' = 'agent' then
    raise exception '"%" asks an agent, and an agent is not a fixed change, so it does not run here.', v_action ->> 'name'
      using errcode = '22023',
            hint = 'Open the record''s chat with the action''s prompt (the record-chat launcher does); the agent proposes its changes and a person confirms them. Nothing was changed.';
  end if;

  v_n := coalesce(cardinality(p_record_ids), 0);
  if v_n = 0 then
    raise exception '"%" was run on no records.', v_action ->> 'name'
      using errcode = '22023', hint = 'Select the records it should change. Nothing was changed.';
  end if;
  v_max := coalesce((platform.knob_resolve('custom', 'action_run_records_max', p_organization_id) #>> '{}')::integer, 5000);
  if v_n > v_max then
    raise exception '"%" can run on at most % records at once, and % were selected.', v_action ->> 'name', v_max, v_n
      using errcode = '54000',
            hint = 'Run it on a filtered view in parts. The ceiling is the organization knob custom/action_run_records_max. Nothing was changed.';
  end if;

  -- The columns the steps name, read once.
  select coalesce(jsonb_object_agg(f.id::text, jsonb_build_object('key', f.data ->> 'key', 'label', f.data ->> 'label',
                                   'type', f.data ->> 'type', 'config', f.data -> 'config')), '{}'::jsonb)
    into v_fields
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_table::text;
  for v_step in select e from jsonb_array_elements(v_action -> 'steps') e loop
    if not (v_fields ? (v_step ->> 'field')) then
      raise exception '"%" changes a column that is gone, so it cannot run until it is edited.', v_action ->> 'name'
        using errcode = '23503', hint = 'custom.row_actions names the step under stale. Nothing was changed.';
    end if;
  end loop;
  v_title := coalesce(nullif(v_tdoc ->> 'title_field', ''), 'name');

  foreach v_rid in array p_record_ids loop
    select * into v_rec from custom.record r
     where r.organization_id = p_organization_id and r.id = v_rid and r.table_id = v_table
       and r.data_class = 'record' and r.deleted_at is null;
    if v_rec.id is null then
      v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'record', null, 'field_id', null, 'field', null,
                     'says', format('This record is not a live record of %s.', coalesce(v_tdoc ->> 'name', 'this table'))));
      continue;
    end if;

    -- The patch, worked out against THIS record's own values (row-actions.ts compileRowAction).
    v_values := custom.record_values(p_organization_id, v_rid);
    v_ctx := coalesce(custom.rule_context(p_organization_id, v_rid), '{}'::jsonb)
             || jsonb_build_object('fx_self_id', v_rid, 'fx_table_id', v_table);
    v_patch := '{}'::jsonb;
    begin
      for v_step in select e from jsonb_array_elements(v_action -> 'steps') e loop
        v_field := v_fields -> (v_step ->> 'field');
        v_val := case v_step ->> 'set'
                   when 'clear' then 'null'::jsonb
                   when 'value' then v_step -> 'value'
                   else custom.formula_eval(p_organization_id, v_step -> 'expr', v_values, v_ctx) end;
        v_patch := v_patch || jsonb_build_object(v_field ->> 'key', custom._action_coerce(v_field, v_val));
      end loop;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                     'record', v_rec.data ->> v_title, 'field_id', v_step ->> 'field', 'field', v_field ->> 'label',
                     'says', format('"%s": %s', v_field ->> 'label', v_msg)));
      continue;
    end;

    -- The write, through the store's own door. A refusal is tried again one column at a time
    -- so it names the FIELD; only this record's attempt is rolled back.
    begin
      v_ver := custom.record_update(p_organization_id, v_rid, v_patch);
      v_done := v_done || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'version', v_ver));
    exception when others then
      get stacked diagnostics v_whole = message_text, v_hint = pg_exception_hint, v_state = returned_sqlstate;
      v_named := false;
      -- A record this person may not change is refused as a RECORD, not column by column.
      for k in select x from jsonb_object_keys(v_patch) x where v_state <> '42501' loop
        begin
          perform custom.record_update(p_organization_id, v_rid, jsonb_build_object(k, v_patch -> k));
          raise exception using errcode = 'P0001', message = 'gridprim action probe passed';
        exception when others then
          get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
          if v_msg <> 'gridprim action probe passed' then
            v_named := true;
            select value into v_field from jsonb_each(v_fields) where value ->> 'key' = k;
            v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                           'record', v_rec.data ->> v_title,
                           'field_id', (select key from jsonb_each(v_fields) where value ->> 'key' = k),
                           'field', v_field ->> 'label', 'code', v_state, 'says', v_msg));
          end if;
        end;
      end loop;
      if not v_named then
        -- The columns pass one by one and fail together (a rule that compares two of them).
        v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                       'record', v_rec.data ->> v_title, 'field_id', null, 'field', null, 'code', v_state, 'says', v_whole));
      end if;
    end;
  end loop;

  if jsonb_array_length(v_refused) > 0 then
    v_one := v_refused -> 0;
    raise exception '"%" changed nothing: % of the % selected records refused it. First: %',
      v_action ->> 'name', (select count(distinct r ->> 'record_id') from jsonb_array_elements(v_refused) r), v_n,
      case when v_one ->> 'record' is not null then (v_one ->> 'record') || ' — ' else '' end
      || case when v_one ->> 'field' is not null then (v_one ->> 'field') || ': ' || (v_one ->> 'says') else v_one ->> 'says' end
      using errcode = '23514',
            detail = v_refused::text,
            hint = 'The selection is one change: it happens for every record or for none. DETAIL lists every record and field that refused and why; fix those (or run the action on the others) and run it again.';
  end if;

  return jsonb_build_object('action_id', p_action_id, 'action', v_action ->> 'name', 'table_id', v_table,
                            'ran', jsonb_array_length(v_done), 'records', v_done);
end
$fn$;

comment on function custom.action_run(uuid, uuid, uuid[]) is
  'GRID-PRIMITIVES G2: run one row action on a selection, in ONE transaction. Each record is written through custom.record_update (every rule, validation, permission and history line is the store''s); a refusal is tried again column by column so it names the record and the field; if any record refuses, nothing is written and the error''s DETAIL lists every refusal. An agent action is refused by name — the record-chat launcher opens it.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'action_run',
        'p_organization_id uuid, p_action_id uuid, p_record_ids uuid[]',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid[]'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach before anything is read. p_action_id is looked up only among this organization''s own Tables and the Table that holds it is then asked custom.assert_may_know_table, so another organization''s action answers exactly as an invented one. Every id in p_record_ids is read only as a live record OF THAT TABLE and written only through custom.record_update, which decides editor on each record itself (custom.assert_client_may_change) — the selection can never write a record its caller could not write by hand.',
        'gridprim_a_row_action_runs_the_whole_selection_at_once.sql', null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_row_action_runs_the_whole_selection_at_once.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_action_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'row_action',
              'check', 'read only inside arg1''s own Tables, then the holding Table is asked custom.assert_may_know_table; outside that it raises the same 23503 an invented id does.',
              'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_record_ids', jsonb_build_object('type', 'uuid[]', 'position', 3, 'entity', 'custom_record',
              'check', 'each id is read only as a live record of the action''s own Table and written only through custom.record_update, which asks custom.assert_client_may_change on it; a record outside that set is named as a refusal and nothing is written.',
              'foreign', jsonb_build_object('sqlstate', '23514', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;
