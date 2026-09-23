-- target: branch,production
-- additive: yes
--   It ADDS new functions — `custom.decoration_colors`, `custom.decoration_rule_ops`,
--   `custom._decorations_check`, `custom.table_decorate`, `custom.table_decorations`,
--   `custom.grid_layout_check`, `custom.grid_layout` — their `platform.client_callable_door`
--   rows, and three `platform.feature_knob` rows (`custom/grid_layout`,
--   `custom/decorations_max_bytes`, `custom/decoration_rules_max`). It REPLACES three bodies,
--   each declared below with the body it was written against: `custom.agg_operations` and
--   `custom.agg_sql` gain four measures (median, filled, empty, unique) and keep every
--   existing one byte-for-byte; `custom.view_declare` now refuses a saved view's `layout`
--   that the grid could not honour, and writes every other view exactly as before. No
--   table, column, trigger, policy or grant is touched; no row of anybody's data is
--   rewritten. The inverse is `migrations/inverse/gridprim_a_table_wears_its_colors_and_its_layout_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
-- based-on: custom.view_declare(uuid, uuid, jsonb) 20b7acf59bbc60da16603cb7b585e31558e3e1c1230361a4b8bf568072c9354b
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) e3453979d514f6305adcbf8716973216203934cb0c84db8e1427310d888ab13d
-- based-on: custom.agg_operations() 36d3528e759f6d7d2555216df79c190383566ddbb1da8b7a389239e5ea00f356
--
-- LANE GRID-PRIMITIVES, gap G1 — the /data grid, unchanged, on the new store (GRID-REBUILD.md).
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THE OLDER GRID DOES THAT THE STORE COULD NOT SAY
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. COLORS. `features/data-tables/table-style.ts` paints a row or a cell four ways: by the
--    color of a choice column's option (`colorBy`), by an ordered list of rules (`rules` —
--    "Status is Overdue → red row"), by a hand highlight on one row (`rows`), on one cell
--    (`cells`) and on one column (`columns`). It is ONE document per table, everyone who
--    opens the table sees the same colors, and `public.udt_set_table_style(table, path,
--    value)` writes one leaf of it at a time so two people highlighting two rows never
--    overwrite each other. The store had nowhere to put any of it.
--
--    HERE: the document lives on the Table record itself, under `decorations`, exactly where
--    `custom.pipeline_declare` already keeps a Table's `stage_field`. It points at Fields BY
--    ID and at records BY ID (REC-17): a column renamed keeps its color, a column removed
--    stops painting and the read door SAYS so under `stale` instead of silently dropping it.
--    `custom.table_decorate(org, table, path, value)` is the same one-leaf write the older
--    door does, so the port swaps a call and changes no behaviour; it asks EDITOR on the
--    Table, as the older door does. Because the document is on the Table record, every write
--    already goes out on the existing realtime port — `custom.io_record_changed_stmt_update`
--    puts a `records.changed` line in `custom.io_outbox` for the Table record — so a
--    highlight appears on every open screen with nothing new to subscribe to.
--
-- 2. LAYOUT. Row height, freeze the first column, wrap, and how the grid uses horizontal
--    space (auto / fit / scroll, with the "fit up to N columns" threshold). The older grid
--    reads three knobs (`extensibility/user_tables.*`) for the organization's default and
--    lets a saved view override each. HERE: ONE json knob `custom/grid_layout` carries the
--    organization's default (an organization overrides it like any knob), a saved view
--    carries its own `definition.layout`, and `custom.grid_layout(org, table, view)` answers
--    the resolved layout AND where each value came from — platform, organization or view —
--    so a screen never has to guess why a row is tall. `custom.view_declare` refuses a
--    layout key the grid would ignore, by name, instead of storing it to be ignored forever.
--
-- 3. SUMMARIES. The summary bar under the older grid offers sum / avg / min / max / median /
--    count / filled / empty / unique (`features/data-tables/column-summaries.ts`).
--    `custom.record_aggregate` offered the first four and count. It now offers all nine,
--    computed inside the read door's own query, so a summary is over exactly the rows this
--    person may see. "Blank" means what the older grid means: no value, JSON null, or the
--    empty string — an empty list is a value.
--
-- LOCKS. Only `create function`, `create or replace function`, `insert` and `comment on`:
-- ACCESS SHARE on catalogue relations, nothing on `custom.record` (ddl-lock-footprint.json).
-- Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The knobs. Every ceiling is a knob with a dated review (limits-are-knobs-agents-set-them).
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'grid_layout',
   '{"mode":"auto","fit_max_columns":8,"row_height":"normal","freeze_first_column":false,"wrap":false}'::jsonb,
   '{"mode":"auto","fit_max_columns":8,"row_height":"normal","freeze_first_column":false,"wrap":false}'::jsonb,
   'json',
   'How a table''s grid is laid out when a view has not chosen',
   'The organization''s default grid layout for every table in the record store. mode: auto '
   '(share the width up to fit_max_columns visible columns, then scroll sideways), fit (always '
   'share the width) or scroll (natural widths). row_height: compact, normal or tall. '
   'freeze_first_column keeps the first column on screen while scrolling sideways. wrap shows a '
   'cell''s whole text on as many lines as it needs. A saved view overrides any of these in its '
   'own definition.layout; custom.grid_layout answers the result and where each value came from. '
   'Starting values are the older grid''s own (extensibility/user_tables.default_layout, '
   'fit_max_columns, default_row_height).',
   'agent',
   'Lane GRID-PRIMITIVES 2026-09-22: the older /data grid''s defaults, carried over unchanged so the rebuilt grid looks the same.',
   date '2026-12-22', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('custom', 'decorations_max_bytes', '262144'::jsonb, '262144'::jsonb, 'integer',
   'Largest a table''s colors may grow',
   'The ceiling on one Table''s decorations document (choice coloring, color rules and every '
   'hand highlight on rows, cells and columns). 256 KB holds roughly five thousand hand '
   'highlights; custom.table_decorate refuses a write that would pass it, by name, and says '
   'how to make room (clear highlights nobody needs).',
   'agent',
   'Lane GRID-PRIMITIVES 2026-09-22: sized to five thousand highlighted rows, far past any table a person colors by hand.',
   date '2026-12-22', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('custom', 'decoration_rules_max', '50'::jsonb, '50'::jsonb, 'integer',
   'Most color rules one table may carry',
   'The ceiling on a Table''s ordered color rules ("Status is Overdue → red row"). The first '
   'rule that matches paints, so a list past this is one nobody can reason about.',
   'agent',
   'Lane GRID-PRIMITIVES 2026-09-22: the older grid never showed more than a handful; fifty leaves room.',
   date '2026-12-22', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The two closed vocabularies. Asked by a screen, never typed into a picker.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.decoration_colors()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- The choice-chip palette minus "neutral", which is "no color" (lib/field-formats/choices.ts,
  -- features/data-tables/table-style.ts STYLE_COLORS). Order is the order a choice column's
  -- options take when an option declares no color of its own.
  select array['slate', 'green', 'amber', 'red', 'blue', 'violet', 'teal']::text[]
$fn$;

comment on function custom.decoration_colors() is
  'GRID-PRIMITIVES G1: the colors a row, a cell or a column may wear. The older grid''s STYLE_COLORS, in the same order.';

create function custom.decoration_rule_ops()
returns table(op text, takes_value boolean, label text)
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select * from (values
    ('is',        true,  'is'),
    ('is_not',    true,  'is not'),
    ('contains',  true,  'contains'),
    ('is_empty',  false, 'is empty'),
    ('not_empty', false, 'is not empty'),
    ('is_true',   false, 'is checked'),
    ('is_false',  false, 'is unchecked'),
    ('gt',        true,  'is greater than'),
    ('gte',       true,  'is at least'),
    ('lt',        true,  'is less than'),
    ('lte',       true,  'is at most')
  ) as t(op, takes_value, label)
$fn$;

comment on function custom.decoration_rule_ops() is
  'GRID-PRIMITIVES G1: the tests a color rule may ask, with whether each compares against a value and the words a person reads. The older grid''s COLOR_RULE_OPS and COLOR_RULE_OP_LABELS.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom._decorations_check — one leaf of a Table's decorations, judged before it is stored.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom._decoration_field_ok(p_organization_id uuid, p_table_id uuid, p_field text)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select p_field ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from custom.record f
                  where f.organization_id = p_organization_id
                    and f.table_id = custom.field_kernel_id()
                    and f.data_class = 'field'
                    and f.deleted_at is null
                    and f.id = p_field::uuid
                    and f.data ->> 'entity_definition_id' = p_table_id::text)
$fn$;

create function custom._decorations_check(p_organization_id uuid, p_table_id uuid,
                                          p_path text[], p_value jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_head  text := p_path[1];
  v_depth integer := coalesce(array_length(p_path, 1), 0);
  v_rule  jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_ids   text[] := '{}';
  v_max   integer;
  v_op    text;
  v_takes boolean;
  v_n     integer := 0;
begin
  if v_head is null or v_head not in ('color_by', 'rules', 'rows', 'cells', 'columns') then
    raise exception 'A table''s colors are kept as color_by, rules, rows, cells or columns, and "%" is none of them.',
                    coalesce(v_head, 'nothing')
      using errcode = '22023',
            hint = 'GRID-PRIMITIVES G1: color_by and rules are written whole; rows take [rows, <record id>], columns take [columns, <field id>], cells take [cells, <record id>, <field id>]. Nothing was written.';
  end if;
  if (v_head in ('color_by', 'rules') and v_depth <> 1)
     or (v_head in ('rows', 'columns') and v_depth <> 2)
     or (v_head = 'cells' and v_depth <> 3) then
    raise exception 'The % part of a table''s colors does not take a path of % steps.', v_head, v_depth
      using errcode = '22023',
            hint = 'color_by and rules: [key]. rows: [rows, <record id>]. columns: [columns, <field id>]. cells: [cells, <record id>, <field id>]. Nothing was written.';
  end if;

  -- The record a row or a cell highlight is on: a live record OF THIS TABLE.
  if v_head in ('rows', 'cells') then
    if p_path[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from custom.record r
                       where r.organization_id = p_organization_id
                         and r.id = p_path[2]::uuid
                         and r.table_id = p_table_id
                         and r.data_class = 'record') then
      raise exception 'That highlight is on a record that is not in this table.'
        using errcode = '23503',
              hint = 'REC-17: a highlight points at a record of this Table by its id. Nothing was written.';
    end if;
  end if;
  -- The column a column or a cell highlight is on: a live Field OF THIS TABLE.
  if (v_head = 'columns' and not custom._decoration_field_ok(p_organization_id, p_table_id, p_path[2]))
     or (v_head = 'cells' and not custom._decoration_field_ok(p_organization_id, p_table_id, p_path[3])) then
    raise exception 'That highlight is on a column that is not in this table.'
      using errcode = '23503',
            hint = 'REC-17: a highlight points at a Field of this Table by its id, never by its name. Nothing was written.';
  end if;

  -- A delete is always legal once the path is: clearing a highlight nobody can see is fine.
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return 'null'::jsonb;
  end if;

  if v_head in ('rows', 'cells', 'columns') then
    if jsonb_typeof(p_value) <> 'string' or not ((p_value #>> '{}') = any (custom.decoration_colors())) then
      raise exception 'A highlight is one of the table colors, and "%" is not one of them.', p_value #>> '{}'
        using errcode = '22023',
              hint = format('The colors are %s (select custom.decoration_colors()). Clear a highlight by writing null. Nothing was written.',
                            array_to_string(custom.decoration_colors(), ', '));
    end if;
    return p_value;
  end if;

  if v_head = 'color_by' then
    if jsonb_typeof(p_value) <> 'object'
       or not custom._decoration_field_ok(p_organization_id, p_table_id, p_value ->> 'field')
       or coalesce(p_value ->> 'target', '') not in ('row', 'cell') then
      raise exception 'Coloring by a column needs the column (a field of this table, by id) and whether it tints the whole row or only the cell.'
        using errcode = '22023',
              hint = '{"field": "<field id>", "target": "row" | "cell"}. The color comes from the choice the record holds, or green for a ticked box. Nothing was written.';
    end if;
    return jsonb_build_object('field', p_value ->> 'field', 'target', p_value ->> 'target');
  end if;

  -- rules — the whole ordered list, judged rule by rule.
  if jsonb_typeof(p_value) <> 'array' then
    raise exception 'Color rules are a list, first match wins, and what was sent is a %.', jsonb_typeof(p_value)
      using errcode = '22023', hint = 'Send the whole list in order; an empty list removes every rule. Nothing was written.';
  end if;
  v_max := coalesce((platform.knob_resolve('custom', 'decoration_rules_max', p_organization_id) #>> '{}')::integer, 50);
  if jsonb_array_length(p_value) > v_max then
    raise exception 'This table may carry at most % color rules, and % were sent.', v_max, jsonb_array_length(p_value)
      using errcode = '22023',
            hint = 'The first rule that matches paints, so a longer list is one nobody can follow. The ceiling is the organization knob custom/decoration_rules_max. Nothing was written.';
  end if;
  for v_rule in select e from jsonb_array_elements(p_value) e loop
    v_n := v_n + 1;
    if jsonb_typeof(v_rule) <> 'object' then
      raise exception 'Color rule % is not a rule.', v_n using errcode = '22023';
    end if;
    if not custom._decoration_field_ok(p_organization_id, p_table_id, v_rule ->> 'field') then
      raise exception 'Color rule % reads a column that is not in this table.', v_n
        using errcode = '23503', hint = 'REC-17: {"field": "<field id of this table>"}. Nothing was written.';
    end if;
    v_op := v_rule ->> 'op';
    select o.takes_value into v_takes from custom.decoration_rule_ops() o where o.op = v_op;
    if v_takes is null then
      raise exception 'Color rule % asks "%", and a color rule can ask: %.', v_n, coalesce(v_op, 'nothing'),
                      (select string_agg(o.label, ', ') from custom.decoration_rule_ops() o)
        using errcode = '22023', hint = 'select * from custom.decoration_rule_ops(). Nothing was written.';
    end if;
    if v_takes and (v_rule -> 'value' is null or jsonb_typeof(v_rule -> 'value') not in ('string', 'number')
                    or btrim(v_rule ->> 'value') = '') then
      raise exception 'Color rule % asks whether the column %, and does not say what to compare it with.',
                      v_n, (select o.label from custom.decoration_rule_ops() o where o.op = v_op)
        using errcode = '22023', hint = 'Give the rule a value. Nothing was written.';
    end if;
    if not coalesce((v_rule ->> 'color') = any (custom.decoration_colors()), false) then
      raise exception 'Color rule % paints "%", which is not one of the table colors.', v_n, coalesce(v_rule ->> 'color', 'nothing')
        using errcode = '22023',
              hint = format('The colors are %s. Nothing was written.', array_to_string(custom.decoration_colors(), ', '));
    end if;
    if coalesce(v_rule ->> 'target', '') not in ('row', 'cell') then
      raise exception 'Color rule % does not say whether it tints the whole row or only the cell.', v_n
        using errcode = '22023', hint = '"target": "row" or "cell". Nothing was written.';
    end if;
    if nullif(v_rule ->> 'id', '') is not null and (v_rule ->> 'id') = any (v_ids) then
      raise exception 'Two color rules share the id "%".', v_rule ->> 'id' using errcode = '22023';
    end if;
    v_rule := jsonb_strip_nulls(jsonb_build_object(
      'id',     coalesce(nullif(v_rule ->> 'id', ''), gen_random_uuid()::text),
      'field',  v_rule ->> 'field',
      'op',     v_op,
      'value',  case when v_takes then to_jsonb(v_rule ->> 'value') end,
      'color',  v_rule ->> 'color',
      'target', v_rule ->> 'target'));
    v_ids := v_ids || (v_rule ->> 'id');
    v_out := v_out || jsonb_build_array(v_rule);
  end loop;
  return v_out;
end;
$fn$;

comment on function custom._decorations_check(uuid, uuid, text[], jsonb) is
  'GRID-PRIMITIVES G1: one leaf of a Table''s decorations judged before custom.table_decorate stores it — the path, the record and Field it points at (this Table''s, by id), the palette, the rule tests. Returns the value to store; null means clear.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.table_decorate — THE WRITE. One leaf at a time, like the older door.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.table_decorate(p_organization_id uuid, p_table_id uuid,
                                      p_path text[], p_value jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc    jsonb;
  v_value  jsonb;
  v_depth  integer := coalesce(array_length(p_path, 1), 0);
  v_parent text[];
  v_max    integer;
  i        integer;
begin
  -- The decision first: the organization's off switch, the organization wall, then EDITOR on
  -- the Table — the older door's own rung (udt_set_table_style: editor access required).
  perform custom.assert_store_door(p_organization_id, 'custom.table_decorate');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_decorate');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_decorate',
                                          'editor'::public.permission_level, 'table');

  select coalesce(t.data -> 'decorations', '{}'::jsonb) into v_doc
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
   for update;
  if v_doc is null then
    raise exception 'That table is not in this organization, so it has no colors to change.'
      using errcode = '23503',
            hint = 'REC-29: organizations are hard walls. Open the table you meant. Nothing was written.';
  end if;
  if jsonb_typeof(v_doc) <> 'object' then
    v_doc := '{}'::jsonb;
  end if;

  v_value := custom._decorations_check(p_organization_id, p_table_id, p_path, p_value);

  if v_value = 'null'::jsonb then
    -- Delete the leaf, then prune the parents it leaves empty, so the document never grows
    -- `{"cells": {"<record>": {}}}` husks (the older door's own rule).
    v_doc := v_doc #- p_path;
    for i in reverse (v_depth - 1)..1 loop
      v_parent := p_path[1:i];
      if v_doc #> v_parent = '{}'::jsonb then
        v_doc := v_doc #- v_parent;
      end if;
    end loop;
  else
    for i in 1..(v_depth - 1) loop
      v_parent := p_path[1:i];
      if v_doc #> v_parent is null or jsonb_typeof(v_doc #> v_parent) <> 'object' then
        v_doc := jsonb_set(v_doc, v_parent, '{}'::jsonb, true);
      end if;
    end loop;
    v_doc := jsonb_set(v_doc, p_path, v_value, true);
  end if;
  v_doc := v_doc || jsonb_build_object('version', 1);

  v_max := coalesce((platform.knob_resolve('custom', 'decorations_max_bytes', p_organization_id) #>> '{}')::integer, 262144);
  if octet_length(v_doc::text) > v_max then
    raise exception 'This table''s colors would grow past % KB, so this highlight was not added.', v_max / 1024
      using errcode = '54000',
            hint = 'Clear highlights nobody needs any more (write null to them), or color by a column or a rule instead of by hand. The ceiling is the organization knob custom/decorations_max_bytes. Nothing was written.';
  end if;

  update custom.record
     set data = jsonb_set(data, '{decorations}', v_doc, true)
   where organization_id = p_organization_id
     and id = p_table_id
     and table_id = custom.table_kernel_id();

  return v_doc;
end;
$fn$;

comment on function custom.table_decorate(uuid, uuid, text[], jsonb) is
  'GRID-PRIMITIVES G1: write ONE leaf of a Table''s colors — [color_by], [rules], [rows, record id], [columns, field id] or [cells, record id, field id] — or clear it with null. Editor on the Table. Fields and records by id (REC-17). Kept on the Table record under `decorations`, so every open screen hears it on the existing realtime port. The older door this replaces: public.udt_set_table_style.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_decorate',
        'p_organization_id uuid, p_table_id uuid, p_path text[], p_value jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'text[]'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach before anything is read; p_table_id by custom.assert_client_may_change at editor on the Table, before the Table row is read. Every record id and Field id inside p_path and p_value is judged by custom._decorations_check to be a live record or Field OF THIS TABLE, so a highlight can never point into another table or another organization. It writes one key of the Table record''s own document and nothing else.',
        'gridprim_a_table_wears_its_colors_and_its_layout.sql',
        null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_table_wears_its_colors_and_its_layout.sql',
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
-- custom.table_decorations — THE READ, with what went stale said out loud.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.table_decorations(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc   jsonb;
  v_out   jsonb;
  v_stale jsonb := '[]'::jsonb;
  v_rules jsonb := '[]'::jsonb;
  v_rule  jsonb;
  v_rows  jsonb := '{}'::jsonb;
  v_cols  jsonb := '{}'::jsonb;
  v_cells jsonb := '{}'::jsonb;
  v_one   jsonb;
  e       record;
  c       record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_decorations');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.table_decorations');

  select coalesce(t.data -> 'decorations', '{}'::jsonb) into v_doc
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_doc is null or jsonb_typeof(v_doc) <> 'object' then
    v_doc := '{}'::jsonb;
  end if;
  -- The palette and the rule tests ride on the read, so a picker never types either list.
  v_out := jsonb_build_object('version', 1, 'colors', to_jsonb(custom.decoration_colors()),
             'rule_ops', (select jsonb_agg(jsonb_build_object('op', o.op, 'takes_value', o.takes_value,
                                                             'label', o.label))
                            from custom.decoration_rule_ops() o));

  -- A reference to a column that is gone does not paint, and the read SAYS it does not —
  -- never a rule that silently stopped working.
  if jsonb_typeof(v_doc -> 'color_by') = 'object' then
    if custom._decoration_field_ok(p_organization_id, p_table_id, v_doc -> 'color_by' ->> 'field') then
      v_out := v_out || jsonb_build_object('color_by', v_doc -> 'color_by');
    else
      v_stale := v_stale || jsonb_build_array(jsonb_build_object('part', 'color_by',
                   'field', v_doc -> 'color_by' ->> 'field', 'says', 'The column this table was colored by is gone, so nothing is colored by it.'));
    end if;
  end if;

  for v_rule in select x from jsonb_array_elements(case when jsonb_typeof(v_doc -> 'rules') = 'array' then v_doc -> 'rules' else '[]'::jsonb end) x loop
    if custom._decoration_field_ok(p_organization_id, p_table_id, v_rule ->> 'field') then
      v_rules := v_rules || jsonb_build_array(v_rule);
    else
      v_stale := v_stale || jsonb_build_array(jsonb_build_object('part', 'rules', 'rule_id', v_rule ->> 'id',
                   'field', v_rule ->> 'field', 'says', 'This color rule reads a column that is gone, so it paints nothing.'));
    end if;
  end loop;
  v_out := v_out || jsonb_build_object('rules', v_rules);

  for e in select key, value from jsonb_each(case when jsonb_typeof(v_doc -> 'columns') = 'object' then v_doc -> 'columns' else '{}'::jsonb end) loop
    if custom._decoration_field_ok(p_organization_id, p_table_id, e.key) then
      v_cols := v_cols || jsonb_build_object(e.key, e.value);
    else
      v_stale := v_stale || jsonb_build_array(jsonb_build_object('part', 'columns', 'field', e.key,
                   'says', 'A highlighted column is gone.'));
    end if;
  end loop;

  -- Rows and cells: a highlight on a record that is archived stays (restoring the record
  -- brings its color back); one on a record that is not this table's never shows.
  for e in select key, value from jsonb_each(case when jsonb_typeof(v_doc -> 'rows') = 'object' then v_doc -> 'rows' else '{}'::jsonb end) loop
    v_rows := v_rows || jsonb_build_object(e.key, e.value);
  end loop;
  for e in select key, value from jsonb_each(case when jsonb_typeof(v_doc -> 'cells') = 'object' then v_doc -> 'cells' else '{}'::jsonb end) loop
    v_one := '{}'::jsonb;
    for c in select key, value from jsonb_each(case when jsonb_typeof(e.value) = 'object' then e.value else '{}'::jsonb end) loop
      if custom._decoration_field_ok(p_organization_id, p_table_id, c.key) then
        v_one := v_one || jsonb_build_object(c.key, c.value);
      else
        v_stale := v_stale || jsonb_build_array(jsonb_build_object('part', 'cells', 'record_id', e.key,
                     'field', c.key, 'says', 'A highlighted cell is in a column that is gone.'));
      end if;
    end loop;
    if v_one <> '{}'::jsonb then
      v_cells := v_cells || jsonb_build_object(e.key, v_one);
    end if;
  end loop;

  return v_out || jsonb_build_object('rows', v_rows, 'columns', v_cols, 'cells', v_cells, 'stale', v_stale);
end;
$fn$;

comment on function custom.table_decorations(uuid, uuid) is
  'GRID-PRIMITIVES G1: a Table''s colors as a screen paints them — color_by, the ordered rules, the hand highlights on rows, cells and columns, the palette and the rule tests — for anybody who may know the Table. A reference to a column that is gone is left out AND named under `stale`, so a rule that stopped painting says so.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_decorations',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach and p_table_id by custom.assert_may_know_table before the Table row is read, so a Table this caller may not know answers exactly as an invented one. It returns only the Table''s own colors document — Field ids, record ids and palette words — and writes nothing.',
        'gridprim_a_table_wears_its_colors_and_its_layout.sql',
        null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_table_wears_its_colors_and_its_layout.sql',
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
-- LAYOUT: the check, the resolver.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.grid_layout_check(p_layout jsonb, p_scope text default 'view')
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  e       record;
  w       record;
  v_out   jsonb := '{}'::jsonb;
  v_keys  text[] := case when p_scope = 'organization'
                         then array['mode', 'fit_max_columns', 'row_height', 'freeze_first_column', 'wrap']
                         else array['mode', 'row_height', 'freeze_first_column', 'wrap', 'widths'] end;
  v_n     numeric;
begin
  if p_layout is null or jsonb_typeof(p_layout) = 'null' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p_layout) <> 'object' then
    raise exception 'A grid layout is a set of choices, and what was sent is a %.', jsonb_typeof(p_layout)
      using errcode = '22023', hint = format('The choices are %s. Nothing was written.', array_to_string(v_keys, ', '));
  end if;
  for e in select key, value from jsonb_each(p_layout) loop
    if not (e.key = any (v_keys)) then
      raise exception 'A % layout has no choice called "%", so the grid would never honour it.',
                      case when p_scope = 'organization' then 'default' else 'view''s' end, e.key
        using errcode = '22023', hint = format('The choices are %s. Nothing was written.', array_to_string(v_keys, ', '));
    end if;
    if e.key = 'mode' and (jsonb_typeof(e.value) <> 'string' or (e.value #>> '{}') not in ('auto', 'fit', 'scroll')) then
      raise exception 'The grid shares its width auto, fit or scroll, and "%" is none of them.', e.value #>> '{}'
        using errcode = '22023';
    elsif e.key = 'row_height' and (jsonb_typeof(e.value) <> 'string' or (e.value #>> '{}') not in ('compact', 'normal', 'tall')) then
      raise exception 'A row is compact, normal or tall, and "%" is none of them.', e.value #>> '{}'
        using errcode = '22023';
    elsif e.key in ('freeze_first_column', 'wrap') and jsonb_typeof(e.value) <> 'boolean' then
      raise exception '% is on or off (true or false), and "%" is neither.', e.key, e.value #>> '{}'
        using errcode = '22023';
    elsif e.key = 'fit_max_columns' then
      if jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric not between 1 and 50 then
        raise exception 'The grid fits at most 1 to 50 columns before it scrolls, and "%" is not that.', e.value #>> '{}'
          using errcode = '22023';
      end if;
      e.value := to_jsonb(trunc((e.value #>> '{}')::numeric)::integer);
    elsif e.key = 'widths' then
      if jsonb_typeof(e.value) <> 'object' then
        raise exception 'Column widths are a width in pixels for each column, by the column''s id.'
          using errcode = '22023';
      end if;
      for w in select key, value from jsonb_each(e.value) loop
        if w.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'A column width is kept by the column''s id, and "%" is a name.', w.key
            using errcode = '22023', hint = 'REC-17: a view points at a Field by its id, so a rename keeps its width. Nothing was written.';
        end if;
        if jsonb_typeof(w.value) <> 'number' then
          raise exception 'A column width is a number of pixels.' using errcode = '22023';
        end if;
        v_n := (w.value #>> '{}')::numeric;
        if v_n < 60 or v_n > 1200 then
          raise exception 'A column is 60 to 1200 pixels wide, and % was asked.', v_n
            using errcode = '22023', hint = 'Narrower hides the column''s menu; wider is a slip of the mouse. Nothing was written.';
        end if;
      end loop;
    end if;
    v_out := v_out || jsonb_build_object(e.key, e.value);
  end loop;
  return v_out;
end;
$fn$;

comment on function custom.grid_layout_check(jsonb, text) is
  'GRID-PRIMITIVES G1: a grid layout judged before it is kept — the organization default (scope organization: mode, fit_max_columns, row_height, freeze_first_column, wrap) or a saved view''s own (scope view: mode, row_height, freeze_first_column, wrap, widths by Field id). A choice the grid would ignore is refused by name.';

create function custom.grid_layout(p_organization_id uuid, p_table_id uuid, p_view_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_platform jsonb;
  v_org      jsonb;
  v_view     jsonb := '{}'::jsonb;
  v_layout   jsonb;
  v_source   jsonb := '{}'::jsonb;
  v_refused  jsonb := '[]'::jsonb;
  e          record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.grid_layout');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.grid_layout');

  select k.value into v_platform from platform.feature_knob k where k.feature = 'custom' and k.key = 'grid_layout';
  v_platform := coalesce(v_platform,
    '{"mode":"auto","fit_max_columns":8,"row_height":"normal","freeze_first_column":false,"wrap":false}'::jsonb);
  v_org := platform.knob_resolve('custom', 'grid_layout', p_organization_id);

  v_layout := v_platform;
  for e in select key from jsonb_object_keys(v_platform) key loop
    v_source := v_source || jsonb_build_object(e.key, 'platform');
  end loop;

  -- The organization's own default, choice by choice. A choice that is not one the grid can
  -- honour is left at the platform's and NAMED — an organization's setting is never
  -- silently ignored.
  if jsonb_typeof(v_org) = 'object' then
    for e in select key, value from jsonb_each(v_org) loop
      begin
        v_layout := v_layout || custom.grid_layout_check(jsonb_build_object(e.key, e.value), 'organization');
        if (v_platform -> e.key) is distinct from e.value then
          v_source := v_source || jsonb_build_object(e.key, 'organization');
        end if;
      exception when invalid_parameter_value then
        v_refused := v_refused || jsonb_build_array(jsonb_build_object('from', 'organization', 'choice', e.key,
                       'value', e.value, 'says', sqlerrm));
      end;
    end loop;
  end if;

  if p_view_id is not null then
    select coalesce(v.definition -> 'layout', '{}'::jsonb) into v_view
      from platform.saved_view v
     where v.id = p_view_id
       and v.organization_id = p_organization_id
       and v.subject_id = p_table_id
       and v.deleted_at is null;
    if v_view is null then
      raise exception 'There is no saved view % of this table.', p_view_id
        using errcode = '23503',
              hint = 'It may have been removed, or it is a view of another table. The organization''s own layout still applies.';
    end if;
    if jsonb_typeof(v_view) = 'object' then
      for e in select key, value from jsonb_each(v_view) loop
        begin
          v_layout := v_layout || custom.grid_layout_check(jsonb_build_object(e.key, e.value), 'view');
          v_source := v_source || jsonb_build_object(e.key, 'view');
        exception when invalid_parameter_value then
          v_refused := v_refused || jsonb_build_array(jsonb_build_object('from', 'view', 'choice', e.key,
                         'value', e.value, 'says', sqlerrm));
        end;
      end loop;
    end if;
  end if;

  return jsonb_build_object('layout', v_layout, 'source', v_source, 'view_id', p_view_id,
                            'refused', v_refused);
end;
$fn$;

comment on function custom.grid_layout(uuid, uuid, uuid) is
  'GRID-PRIMITIVES G1: the layout a Table''s grid opens with — the platform default, the organization''s custom/grid_layout knob over it, and the saved view''s own definition.layout over that — with `source` naming where each choice came from and `refused` naming any stored choice the grid cannot honour.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'grid_layout',
        'p_organization_id uuid, p_table_id uuid, p_view_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach and p_table_id by custom.assert_may_know_table before anything is read. p_view_id is read only inside this organization and only as a view OF this Table (subject_id), so another table''s or another organization''s view answers exactly as an invented one. It returns layout choices only — mode, row height, freeze, wrap, widths by Field id — and writes nothing.',
        'gridprim_a_table_wears_its_colors_and_its_layout.sql',
        null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_table_wears_its_colors_and_its_layout.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'this body decides it with custom.assert_may_know_table(arg2) — the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_view_id', jsonb_build_object('type', 'uuid', 'position', 3, 'entity', 'saved_view',
              'check', 'read only where organization_id = arg1 and subject_id = arg2, after both are decided; a view outside that pair raises the same 23503 an invented id does.',
              'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.view_declare — a saved view's layout is judged before it is kept. Every other part
-- of the body is the body declared in `-- based-on:` above, unchanged.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom.view_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid := nullif(p_spec ->> 'view_id', '')::uuid;
  v_name    text := coalesce(nullif(btrim(p_spec ->> 'name'), ''), 'Saved view');
  v_filters jsonb := case when jsonb_typeof(p_spec -> 'filters') = 'object'
                          then p_spec -> 'filters' else '{}'::jsonb end;
  v_def     jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.view_declare');
  -- VIEWER, not editor. Writing down a question about a Table is not changing it.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_declare');

  if p_table_id is null then
    raise exception 'A saved view is a view OF something — name the table.'
      using errcode = '22004';
  end if;

  -- THE ONE SHAPE THE NOTIFIER READS. `custom.agg_view_admits` and
  -- `custom.agg_view_admits_state` both take `{"table_id": …, "filters": {…}}`, so a
  -- view saved here needs no translation before a subscription can be written over it.
  -- THE CASTS ARE NOT DECORATION. Without them PostgreSQL cannot choose between
  -- `jsonb - text` and `jsonb - text[]` for a bare literal and refuses the whole
  -- function at RUN time with 42725 — which is exactly how the first seat suite found
  -- this: every call to this door raised `operator is not unique: unknown - unknown`,
  -- so no saved view could be written by anybody.
  v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters)
           || coalesce(case when jsonb_typeof(p_spec -> 'definition') = 'object'
                            then (p_spec -> 'definition') - 'table_id'::text - 'filters'::text
                       end, '{}'::jsonb);

  -- ── GRID-PRIMITIVES G1, 2026-09-22: A VIEW'S LAYOUT IS ONE THE GRID CAN HONOUR. ──────────
  -- `custom.grid_layout` reads `definition.layout` when the view is opened. A choice it does
  -- not know would be stored and then ignored on every opening, which is a setting that
  -- silently does nothing — so it is refused here, by name, before the view is kept.
  if v_def ? 'layout' then
    v_def := jsonb_set(v_def, '{layout}', custom.grid_layout_check(v_def -> 'layout', 'view'));
  end if;

  if v_id is not null then
    update platform.saved_view
       set name = v_name, definition = v_def, updated_at = now(), version = version + 1
     where id = v_id and organization_id = p_organization_id and deleted_at is null;
    if not found then
      raise exception 'There is no saved view % here.', v_id
        using errcode = '23503',
              hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
    end if;
    return v_id;
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (v_name, 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- SUMMARIES: four more measures, the same query.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom.agg_operations()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$ select array['count', 'sum', 'avg', 'min', 'max', 'median', 'filled', 'empty', 'unique']::text[] $function$;

CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
  v_val        text;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
  end loop;

  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    if v_key = 'created_at' then
      v_group_sel := array_append(v_group_sel, format('date_trunc(%L, r.created_at)::text', v_by));
    else
      v_group_sel := array_append(v_group_sel,
        format('date_trunc(%L, (nullif(%s, '''')::timestamptz))::text', v_by, custom.agg_value_sql(v_key)));
    end if;
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  for m in select e from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.record_aggregate: "%" is not a measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_meas_sel := array_append(v_meas_sel, quote_literal('count') || ', count(*)::numeric');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_val := custom.agg_value_sql(v_key);
      -- ── GRID-PRIMITIVES G1: THE SUMMARY BAR'S OTHER FOUR. ────────────────────────────
      -- BLANK is what the older grid's summary bar means by it (column-summaries.ts
      -- isBlank): no value, JSON null, or the empty string. An empty list is a value.
      if v_op = 'median' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(percentile_cont(0.5) within group (order by nullif(%s, '''')::numeric))::numeric', v_val));
      elsif v_op = 'filled' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is not null))::numeric', v_val));
      elsif v_op = 'empty' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is null))::numeric', v_val));
      elsif v_op = 'unique' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(distinct nullif(%s, '''')))::numeric', v_val));
      else
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('%s(nullif(%s, '''')::numeric)::numeric', v_op, v_val));
      end if;
    end if;
  end loop;
  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
     %s
     order by count(*) desc
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    custom.record_filter_sql(p_filter),
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;
