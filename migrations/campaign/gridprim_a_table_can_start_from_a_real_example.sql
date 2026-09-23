-- target: branch,production
-- additive: yes
--   It ADDS `custom.table_from_example`, `custom.autonumber_backfill`, their helper
--   `custom._example_placeholder`, two `platform.client_callable_door` rows and one knob row
--   (`custom/example_rows_max`). Nothing existing is replaced, dropped or revoked; no table,
--   column, trigger, policy or grant is touched; no row of anybody's data is rewritten except the
--   records custom.autonumber_backfill is asked to number (through the store's own write path).
--   Needs gridprim_a_formula_is_typed_and_the_store_works_it_out.sql (fx.autonumber) first.
--   The inverse is `migrations/inverse/gridprim_a_table_can_start_from_a_real_example_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES, gap G5 — the small ones (GRID-REBUILD.md).
--
-- 1. EXAMPLE TABLES. The older grid offers "start from an example" (public.udt_list_example_tables).
--    The store had no door. The examples themselves already exist, once: the real use cases of
--    `@ai-matrx/records/use-cases` (Harbor Dental's new-patient intake, Ridgeline Physical
--    Therapy's plan of care, …) — validated in that package's own suite against the owner's law
--    (a real business, the practitioner's words, values true to each other, never a real person,
--    never a placeholder). `custom.table_from_example(org, home, example)` builds the tables of
--    one use case — every table, every column, every row, relations resolved between them — in
--    ONE transaction, through custom.table_declare / field_declare / record_write / record_update,
--    so every guard a person's own table passes, these pass. It refuses a name that reads like
--    placeholder junk by name, as a second line behind the package's validator.
-- 2. AUTONUMBER BACKFILL. An autonumber column numbers every record written after it exists
--    (fx.autonumber, assigned by the store). A table that already had records gets them numbered
--    in the order they were created by `custom.autonumber_backfill(org, field)` — the older
--    grid's public.udt_backfill_autonumber, same order, same never-reuse rule.
-- 3. EXCEL is the client's: `@ai-matrx/records` builds the .xlsx from custom.io_export's own
--    page (the existing export door, unchanged), so a spreadsheet holds exactly the rows and
--    columns the read door serves this person, and names what it withheld.
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'example_rows_max', '500'::jsonb, '500'::jsonb, 'integer',
   'Most rows one example table may seed',
   'The ceiling on the rows custom.table_from_example writes into one table of an example. The use cases carry dozens; the ceiling keeps a mis-built example from writing thousands.',
   'agent', 'Lane GRID-PRIMITIVES 2026-09-22: the use-case README says up to about 50 rows per table; ten times that is plenty.',
   date '2026-12-22', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create function custom._example_placeholder(p_text text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- The owner's law (2026-09-21), the shapes that read as fake on a screen. The package's
  -- validator (use-cases/placeholders.ts) is the full list; this is the store's second line.
  select case
    when p_text is null then null
    when p_text ~* '\m(acme|foo|foobar|lorem|ipsum|dummy|placeholder|asdf|qwerty)\M' then 'a stand-in word'
    when p_text ~* '\mzzz+' then 'a "zzz" throwaway name'
    when p_text ~* '\mtest (table|record|row|org|organization|company)\M' then '"test …"'
    when p_text ~* '^\s*(item|row|record|job|entry|thing|sample)\s*#?\s*0*\d+\s*$' then 'a counter name ("Item 1")'
    when p_text ~* '@[^@\s]*\.example(\.|$|\s)' or p_text ~* '\mexample\.(com|org|net)\M' then 'an .example address'
    else null end
$fn$;

create function custom.table_from_example(p_organization_id uuid, p_home_id uuid, p_example jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_t       jsonb;
  v_f       jsonb;
  v_r       jsonb;
  v_tables  jsonb := '{}'::jsonb;     -- token -> table id
  v_rows    jsonb := '{}'::jsonb;     -- token.rowkey -> record id
  v_out     jsonb := '[]'::jsonb;
  v_id      uuid;
  v_rid     uuid;
  v_spec    jsonb;
  v_vals    jsonb;
  v_rel     jsonb;
  v_n       integer;
  v_nf      integer;
  v_max     integer := coalesce((platform.knob_resolve('custom', 'example_rows_max', p_organization_id) #>> '{}')::integer, 500);
  v_why     text;
  v_type    text;
  v_note    text;
  v_key     text;
  v_val     jsonb;
  v_target  text;
  v_done    text[];
  v_pass    integer;
  v_progress boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_from_example');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_from_example');
  -- Making a table is what custom.table_declare decides; every call below goes through it, so
  -- the right to make tables in this organization is asked there, table by table.

  if jsonb_typeof(p_example -> 'tables') is distinct from 'array' or jsonb_array_length(p_example -> 'tables') = 0 then
    raise exception 'An example is a business''s tables, and this one has none.'
      using errcode = '22023', hint = 'Send one use case from @ai-matrx/records/use-cases (the client method tableFromExample does). Nothing was created.';
  end if;
  v_why := custom._example_placeholder(p_example ->> 'business');
  if v_why is not null then
    raise exception 'This example''s business is called "%", which is % — examples are real businesses.', p_example ->> 'business', v_why
      using errcode = '23514', hint = 'The owner''s law, 2026-09-21: no placeholder data. Nothing was created.';
  end if;

  -- ── 1. every table and every column but the relations ─────────────────────────────────
  for v_t in select e from jsonb_array_elements(p_example -> 'tables') e loop
    v_why := coalesce(custom._example_placeholder(v_t ->> 'name'), custom._example_placeholder(v_t ->> 'token'));
    if v_why is not null then
      raise exception 'The example table "%" has % for a name.', v_t ->> 'name', v_why using errcode = '23514';
    end if;
    if jsonb_array_length(coalesce(v_t -> 'rows', '[]'::jsonb)) > v_max then
      raise exception 'The example table "%" carries % rows; an example seeds at most %.', v_t ->> 'name',
                      jsonb_array_length(v_t -> 'rows'), v_max
        using errcode = '54000', hint = 'The ceiling is the organization knob custom/example_rows_max. Nothing was created.';
    end if;
    v_type := coalesce(nullif(v_t ->> 'type', ''), 'entity');
    v_note := null;
    if v_type not in ('entity', 'detail') then
      v_note := format('The example calls this a %s table; the store makes it an entity table, which holds the same records.', v_type);
      v_type := 'entity';
    elsif v_type = 'detail' then
      -- A detail table is contained in its parent Table's records. An example says so with its
      -- relation column, which is built below; the table itself is made an entity table and the
      -- link is that column, so every record lands exactly where the example put it.
      v_note := 'The example keeps this table as a detail of another; here its records are linked to their parent by the relation column.';
      v_type := 'entity';
    end if;
    -- A use case names the VIEW it opens in (grid, board, calendar); the store's `display` is
    -- list or page. The view is kept, said, and becomes the table's default view word.
    if coalesce(v_t ->> 'display', 'list') not in ('list', 'page') then
      v_note := concat_ws(' ', v_note, format('The example opens this table as a %s; it is a list table here, and %s is how its view opens.',
                                               v_t ->> 'display', v_t ->> 'display'));
    end if;
    v_spec := jsonb_build_object(
      'name', v_t ->> 'name', 'slug', v_t ->> 'token', 'type', v_type,
      'label_singular', coalesce(v_t ->> 'labelSingular', v_t ->> 'name'),
      'label_plural', coalesce(v_t ->> 'labelPlural', v_t ->> 'name'),
      'title_field', v_t ->> 'titleField',
      'display', case when v_t ->> 'display' in ('list', 'page') then v_t ->> 'display' else 'list' end,
      'weight', coalesce(nullif(v_t ->> 'weight', ''), 'light'),
      'ordered', coalesce((v_t ->> 'ordered')::boolean, false),
      'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
      'default_sort', jsonb_build_array(jsonb_build_object('field', v_t ->> 'titleField', 'direction', 'asc')),
      'parent_id', p_home_id::text,
      'fields', (select jsonb_agg(jsonb_build_object('name', f ->> 'key')) from jsonb_array_elements(v_t -> 'fields') f));
    if nullif(v_t ->> 'describes', '') is not null then
      v_spec := v_spec || jsonb_build_object('description', v_t ->> 'describes');
    end if;
    v_id := custom.table_declare(p_organization_id, v_spec);
    v_tables := v_tables || jsonb_build_object(v_t ->> 'token', v_id);
    v_nf := 0;
    for v_f in select e from jsonb_array_elements(v_t -> 'fields') e loop
      continue when coalesce(v_f ->> 'parityType', v_f ->> 'type') = 'relation';
      perform custom.field_declare(p_organization_id, v_id, jsonb_strip_nulls(jsonb_build_object(
        'key', v_f ->> 'key', 'label', v_f ->> 'label',
        'type', coalesce(v_f ->> 'parityType', v_f ->> 'type', 'text'),
        'multi', (v_f ->> 'multi')::boolean, 'dated', (v_f ->> 'dated')::boolean,
        'required', (v_f ->> 'required')::boolean, 'unit', v_f ->> 'unit',
        'rules', v_f -> 'rules', 'options', v_f -> 'choices',
        'source', v_f ->> 'source', 'compute_on', v_f ->> 'computeOn',
        'sensitivity', v_f ->> 'sensitivity', 'context_policy', v_f ->> 'contextPolicy',
        'formula_text', v_f ->> 'formulaText', 'display_format', v_f -> 'displayFormat',
        'sort', (v_nf + 1) * 10)));
      v_nf := v_nf + 1;
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'token', v_t ->> 'token', 'table_id', v_id, 'name', v_t ->> 'name', 'note', v_note)));
  end loop;

  -- ── 2. the relations, now that every table they may point at exists ────────────────────
  for v_t in select e from jsonb_array_elements(p_example -> 'tables') e loop
    v_nf := 100;
    for v_f in select e from jsonb_array_elements(v_t -> 'fields') e loop
      continue when coalesce(v_f ->> 'parityType', v_f ->> 'type') <> 'relation';
      v_target := v_tables ->> (v_f ->> 'relationTarget');
      if v_target is null then
        raise exception 'The example column "%" of "%" points at a table "%" the example does not have.',
                        v_f ->> 'label', v_t ->> 'name', coalesce(v_f ->> 'relationTarget', 'nothing')
          using errcode = '23503', hint = 'A relation points at another table of the same example, by its token. Nothing was created.';
      end if;
      perform custom.field_declare(p_organization_id, (v_tables ->> (v_t ->> 'token'))::uuid, jsonb_strip_nulls(jsonb_build_object(
        'key', v_f ->> 'key', 'label', v_f ->> 'label', 'type', 'relation', 'relation_target', v_target,
        'multi', (v_f ->> 'multi')::boolean, 'relation_max', (v_f ->> 'relationMax')::integer,
        'required', (v_f ->> 'required')::boolean,
        'sensitivity', v_f ->> 'sensitivity', 'context_policy', v_f ->> 'contextPolicy', 'sort', v_nf)));
      v_nf := v_nf + 10;
    end loop;
  end loop;

  -- ── 3. the rows, a table only after every table its relation columns point at ───────────
  -- so a required relation ("every visit belongs to a patient") is written WITH the record, as a
  -- person would, never filled in afterwards. A cycle between two tables is refused by name.
  v_done := '{}'::text[];
  for v_pass in 1 .. jsonb_array_length(p_example -> 'tables') + 1 loop
    v_progress := false;
    for v_t in select e from jsonb_array_elements(p_example -> 'tables') e loop
      continue when (v_t ->> 'token') = any (v_done);
      continue when exists (select 1 from jsonb_array_elements(v_t -> 'fields') f
                             where coalesce(f ->> 'parityType', f ->> 'type') = 'relation'
                               and (f ->> 'relationTarget') is distinct from (v_t ->> 'token')
                               and not ((f ->> 'relationTarget') = any (v_done)));
      v_n := 0;
      for v_r in select e from jsonb_array_elements(coalesce(v_t -> 'rows', '[]'::jsonb)) e loop
        v_vals := '{}'::jsonb;
        for v_key, v_val in select k, v from jsonb_each(coalesce(v_r -> 'values', '{}'::jsonb)) x(k, v) loop
          select f into v_f from jsonb_array_elements(v_t -> 'fields') f where f ->> 'key' = v_key;
          if coalesce(v_f ->> 'parityType', v_f ->> 'type') = 'relation' then
            continue when v_val is null or jsonb_typeof(v_val) = 'null';
            continue when (v_f ->> 'relationTarget') = (v_t ->> 'token');   -- a self-link is set after
            select coalesce(jsonb_agg(v_rows -> ((v_f ->> 'relationTarget') || '.' || (x #>> '{}'))), '[]'::jsonb) into v_rel
              from jsonb_array_elements(case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end) x;
            if exists (select 1 from jsonb_array_elements(v_rel) x where jsonb_typeof(x) = 'null') then
              raise exception 'Row "%" of "%" points at a % row the example does not have.', v_r ->> 'key', v_t ->> 'name', v_f ->> 'relationTarget'
                using errcode = '23503', hint = 'A relation value is the key of a row of the target table. Nothing was created.';
            end if;
            v_val := case when coalesce((v_f ->> 'multi')::boolean, false) or jsonb_typeof(v_val) = 'array' then v_rel else v_rel -> 0 end;
          else
            v_why := case when jsonb_typeof(v_val) = 'string' then custom._example_placeholder(v_val #>> '{}') end;
            if v_why is not null then
              raise exception 'Row "%" of the example table "%" holds "%" in %, which is %.', v_r ->> 'key', v_t ->> 'name', v_val #>> '{}', v_key, v_why
                using errcode = '23514', hint = 'The owner''s law, 2026-09-21: no placeholder data. Nothing was created.';
            end if;
          end if;
          v_vals := v_vals || jsonb_build_object(v_key, v_val);
        end loop;
        v_rid := custom.record_write(p_organization_id, (v_tables ->> (v_t ->> 'token'))::uuid, v_vals);
        v_rows := v_rows || jsonb_build_object((v_t ->> 'token') || '.' || (v_r ->> 'key'), v_rid);
        v_n := v_n + 1;
      end loop;
      v_out := (select jsonb_agg(case when o ->> 'token' = v_t ->> 'token' then o || jsonb_build_object('records', v_n) else o end)
                  from jsonb_array_elements(v_out) o);
      v_done := v_done || (v_t ->> 'token');
      v_progress := true;
    end loop;
    exit when not v_progress;
  end loop;
  if cardinality(v_done) < jsonb_array_length(p_example -> 'tables') then
    raise exception 'The example''s tables point at each other in a circle (%), so no table''s records can be written first.',
      (select string_agg(e ->> 'name', ', ') from jsonb_array_elements(p_example -> 'tables') e where not ((e ->> 'token') = any (v_done)))
      using errcode = '23514', hint = 'Make one side of the circle optional in the use case. Nothing was created.';
  end if;

  -- ── 4. a table's links to its OWN records, now that they all exist ──────────────────────
  for v_t in select e from jsonb_array_elements(p_example -> 'tables') e loop
    for v_f in select e from jsonb_array_elements(v_t -> 'fields') e
                where coalesce(e ->> 'parityType', e ->> 'type') = 'relation' and (e ->> 'relationTarget') = (v_t ->> 'token') loop
      for v_r in select e from jsonb_array_elements(coalesce(v_t -> 'rows', '[]'::jsonb)) e loop
        v_val := v_r -> 'values' -> (v_f ->> 'key');
        continue when v_val is null or jsonb_typeof(v_val) = 'null';
        select coalesce(jsonb_agg(v_rows -> ((v_t ->> 'token') || '.' || (x #>> '{}'))), '[]'::jsonb) into v_rel
          from jsonb_array_elements(case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end) x;
        perform custom.record_update(p_organization_id, (v_rows ->> ((v_t ->> 'token') || '.' || (v_r ->> 'key')))::uuid,
          jsonb_build_object(v_f ->> 'key',
            case when coalesce((v_f ->> 'multi')::boolean, false) or jsonb_typeof(v_val) = 'array' then v_rel else v_rel -> 0 end));
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('business', p_example ->> 'business', 'tables', v_out,
    'says', format('%s is ready: %s table(s) with their real rows. Every one is an ordinary table of this organization now — rename, change or archive it like any other.',
                   coalesce(p_example ->> 'business', 'The example'), jsonb_array_length(v_out)));
end
$fn$;

comment on function custom.table_from_example(uuid, uuid, jsonb) is
  'GRID-PRIMITIVES G5: build one real use case''s tables (from @ai-matrx/records/use-cases) in this organization — every table, column and row, relations resolved between them — in one transaction through the store''s own doors. Refuses placeholder names by name. The older grid''s example tables, on the store.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_from_example',
        'p_organization_id uuid, p_home_id uuid, p_example jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach before anything is read. Every table, column and row is then made through custom.table_declare, custom.field_declare, custom.record_write and custom.record_update, which each decide the caller''s right to that act themselves (p_home_id is judged by custom.table_declare as the parent the caller may put a table in). It writes nothing any of those doors would refuse.',
        'gridprim_a_table_can_start_from_a_real_example.sql', null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_table_can_start_from_a_real_example.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_home_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'passed only to custom.table_declare as parent_id, which decides whether the caller may place a table there.',
              'foreign', jsonb_build_object('sqlstate', '23514', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;

create function custom.autonumber_backfill(p_organization_id uuid, p_field_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_field jsonb;
  v_table uuid;
  v_key   text;
  v_id    uuid;
  v_n     integer := 0;
  v_last  numeric;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.autonumber_backfill');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.autonumber_backfill');
  select f.data, (f.data ->> 'entity_definition_id')::uuid into v_field, v_table
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if v_field is null or coalesce(v_field -> 'config' ->> 'system', '') <> 'autonumber' then
    raise exception 'That column is not an autonumber column of this organization.'
      using errcode = '23503', hint = 'Declare one with type "autonumber" first. Nothing was changed.';
  end if;
  -- The older door's rung: editor on the Table (public.udt_backfill_autonumber).
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.autonumber_backfill',
                                          'editor'::public.permission_level, 'table');
  v_key := v_field ->> 'key';
  -- In the order they were created, each record is saved once through the write path, and the
  -- store's own fx.autonumber gives it the next number — the same rule a new record gets.
  for v_id in
    select r.id from custom.record r
     where r.organization_id = p_organization_id and r.table_id = v_table
       and r.data_class = 'record' and r.deleted_at is null
       and not coalesce((r.data -> '_derived' -> v_key ->> 'value') ~ '^[0-9]{1,18}$', false)
     order by r.created_at, r.id
  loop
    update custom.record set updated_at = now()
     where organization_id = p_organization_id and id = v_id;
    v_n := v_n + 1;
  end loop;
  select max(nullif(r.data -> '_derived' -> v_key ->> 'value', '')::numeric) into v_last
    from custom.record r where r.organization_id = p_organization_id and r.table_id = v_table;
  return jsonb_build_object('field_id', p_field_id, 'numbered', v_n, 'highest', v_last,
    'says', format('%s record(s) were numbered in the order they were created; the next new record gets %s.', v_n, coalesce(v_last, 0) + 1));
end
$fn$;

comment on function custom.autonumber_backfill(uuid, uuid) is
  'GRID-PRIMITIVES G5: number the records an autonumber column found already there, in the order they were created, through the store''s write path (fx.autonumber). Editor on the Table. The older grid''s public.udt_backfill_autonumber.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'autonumber_backfill',
        'p_organization_id uuid, p_field_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach first; p_field_id is read only inside this organization and only as an autonumber Field, and its Table is then asked custom.assert_client_may_change at editor before any record is touched. It saves only that Table''s records, through the ordinary write path, so the only value it adds is the number fx.autonumber assigns.',
        'gridprim_a_table_can_start_from_a_real_example.sql', null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'gridprim_a_table_can_start_from_a_real_example.sql',
          'declared_at', '2026-09-22 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'),
            'p_field_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'read only where organization_id = arg1 as an autonumber Field; its Table is then asked custom.assert_client_may_change at editor; outside that it raises the same 23503 an invented id does.',
              'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
              'verified', '2026-09-22 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;
