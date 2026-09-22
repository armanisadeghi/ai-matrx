-- additive: yes
--
-- chair-step: it CREATES `workbench.udt_relation_cells_take_ids()` and one BEFORE-ROW trigger
--   that calls it on `workbench.udt_dataset_rows`, and REPLACES one live body,
--   `public.create_user_table_with_fields`, adding a `metadata` column to the field rows it
--   writes (it writes none today, which is the defect). Nothing is dropped, granted or revoked
--   and no row of anybody's data is written. The inverse is
--   `migrations/inverse/oldtables_w3_a_relation_column_takes_an_id_not_a_name_down.sql`.
--
-- based-on: public.create_user_table_with_fields(text, text, boolean, uuid, uuid, uuid, jsonb) a9d89ad0e4cd42c3d100cb68f2b0792a174b2424123853896ebf0614247bda4b
--
-- OLD-TABLES-CUTOVER rev 2, W3 — THE WRITE SIDE IS AN INTEGRITY BOUNDARY, AND IT LANDS FIRST.
--
-- W1 gives the older estate a `relation` column whose cell holds a RECORD'S ID. Six doors write
-- cells into `workbench.udt_dataset_rows.data` and not one of them knows a `relation` column
-- from a `text` column, so each would happily store a customer's NAME where an id belongs —
-- quietly, because `udt_validate_row` checks the STORAGE TYPE and never the format, and because
-- `validation_mode` is `permissive` on all 155 live datasets. A name in an id column does not
-- fail; it renders as an unresolvable reference forever.
--
-- THE FOUR DATABASE DOORS ARE ONE FIX, NOT FOUR. `append_rows_to_user_table` (matrx-extend
-- appending scraped rows), the agent tools `usertable_add_rows` and `usertable_update_row`, and
-- the workflow node `data.table.upsert` all reach the same table by the same road: an INSERT or
-- an UPDATE of `udt_dataset_rows.data`. Writing the same check into four bodies is four places
-- to forget it and a fifth door away from being wrong again. ONE BEFORE-ROW trigger on the
-- table is where the class actually lives, and every one of the four inherits it — including
-- the ones nobody has written yet.
--
-- WHAT IT REFUSES, AND HOW IT SAYS SO. A `relation` cell takes a uuid, or an array of uuids
-- when the field's `relation_max` is greater than one. Anything else is refused by NAME — the
-- table, the column, the value it was handed and what it expected — never coerced, never
-- silently stored, never truncated to something that parses. `allowOther` has no meaning here:
-- a `choice` column with `allowOther` stores a label a human can still read, and an
-- unrecognisable id is not a label, it is a pointer to nothing.
--
-- WHAT IT DOES NOT TOUCH. `choice`, `multi_choice`, `structuredList`, `allowOther`, and every
-- one of the 90 other formats in the estate are outside its WHERE clause by construction: the
-- trigger reads only the table's `relation` fields, and a table with none — all 155 of them
-- today — pays one memoised lookup and returns.
--
-- THE COST, AND THE MEMO. The field rows are read once per (table, transaction) through
-- `platform.memo_s_get` / `_put`, the same per-statement memo the unified store's own hot path
-- uses, so a 200-row bulk append asks `udt_dataset_fields` ONCE rather than 200 times.
--
-- AND THE DOOR THAT CANNOT DECLARE THE COLUMN AT ALL. `create_user_table_with_fields` — one of
-- the two RPCs matrx-extend still depends on — writes `field_name`, `display_name`, `data_type`,
-- `field_order`, `is_required`, `default_value` and `validation_rules`, and DROPS `metadata` on
-- the floor. `metadata.format` is where a column's format lives, so through that door no table
-- has ever been able to carry a currency column, a formula column, or a relation column: every
-- format a caller asked for arrived as a bare string. It now carries `metadata`, which is
-- additive to its contract — a caller that sends none gets exactly what it got before.

create or replace function workbench.udt_relation_cells_take_ids()
returns trigger
language plpgsql
set search_path to ''
as $fn$
declare
  v_key    text;
  v_json   jsonb;
  v_fields jsonb;
  v_val    jsonb;
  v_max    int;
  v_elem   text;
  v_bad    text;
begin
  -- THE TABLE'S RELATION FIELDS, READ ONCE PER (table, transaction).
  v_key  := 'udtrel:' || new.table_id::text;
  v_json := platform.memo_s_get(v_key)::jsonb;
  if v_json is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'field_name',    f.field_name,
             'display_name',  f.display_name,
             'relation_max',  coalesce((f.metadata -> 'format' -> 'options' ->> 'relation_max')::int, 1))
             order by f.field_order, f.field_name), '[]'::jsonb)
      into v_json
      from workbench.udt_dataset_fields f
     where f.table_id = new.table_id
       and f.deleted_at is null
       and f.metadata -> 'format' ->> 'id' = 'relation';
    perform platform.memo_s_put(v_key, v_json::text);
  end if;

  if v_json = '[]'::jsonb then
    return new;   -- the ordinary case today: 155 of 155 datasets carry no relation column
  end if;

  for v_fields in select * from pg_catalog.jsonb_array_elements(v_json)
  loop
    v_key := v_fields ->> 'field_name';
    if not (new.data ? v_key) then
      continue;
    end if;
    v_val := new.data -> v_key;
    v_max := coalesce((v_fields ->> 'relation_max')::int, 1);

    if pg_catalog.jsonb_typeof(v_val) = 'null' then
      continue;                               -- an empty cell is a legal empty cell
    end if;

    if pg_catalog.jsonb_typeof(v_val) = 'array' then
      if v_max <= 1 and pg_catalog.jsonb_array_length(v_val) > 1 then
        raise exception
          using errcode = '22P02',
                message = format(
                  '%s takes one record, and it was given %s',
                  v_fields ->> 'display_name', pg_catalog.jsonb_array_length(v_val)),
                hint = format('The column %L on this table is a relation with relation_max %s.',
                              v_key, v_max);
      end if;
      for v_elem in select pg_catalog.jsonb_array_elements_text(v_val)
      loop
        if v_elem is not null
           and v_elem <> ''
           and v_elem !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_bad := v_elem;
        end if;
      end loop;
    elsif pg_catalog.jsonb_typeof(v_val) = 'string' then
      v_elem := v_val #>> '{}';
      if v_elem <> ''
         and v_elem !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_bad := v_elem;
      end if;
    else
      v_bad := v_val #>> '{}';
    end if;

    if v_bad is not null then
      raise exception
        using errcode = '22P02',
              message = format(
                '%s points at a record, and it was given the text %L',
                v_fields ->> 'display_name', left(v_bad, 80)),
              detail  = format(
                'Column %L of this table is a relation: its cell holds the identifier of the '
                || 'record it points at, not that record''s name.', v_key),
              hint    = 'Look the record up first and write its id. A name that happens to be '
                     || 'unique today is not an identifier, and a cell holding one renders as an '
                     || 'unresolvable reference for as long as it is there.';
    end if;
  end loop;

  return new;
end;
$fn$;

comment on function workbench.udt_relation_cells_take_ids() is
  'OLD-TABLES-CUTOVER W3. A relation cell in the older user-data estate takes an identifier, '
  'never a name. One trigger on udt_dataset_rows so that append_rows_to_user_table, the '
  'usertable_* agent tools, data.table.upsert and every door written after them inherit the same '
  'refusal instead of each carrying its own copy of it.';

create trigger udt_dataset_rows_relation_cells_take_ids
  before insert or update of data on workbench.udt_dataset_rows
  for each row
  execute function workbench.udt_relation_cells_take_ids();

-- ── THE DOOR THAT COULD NOT DECLARE A FORMAT ────────────────────────────────────────────────
-- Identical to the live body except for the two `metadata` lines. `coalesce(..., '{}')` keeps
-- the contract additive: a caller sending no metadata gets exactly what it got before.

create or replace function public.create_user_table_with_fields(
  p_table_name text,
  p_description text default null::text,
  p_is_public boolean default false,
  p_organization_id uuid default null::uuid,
  p_project_id uuid default null::uuid,
  p_task_id uuid default null::uuid,
  p_fields jsonb default '[]'::jsonb)
returns uuid
language plpgsql
as $function$
DECLARE
  v_table_id uuid;
  v_field    jsonb;
BEGIN
  INSERT INTO workbench.udt_datasets (
    table_name, description, is_public,
    organization_id, project_id, task_id, user_id
  )
  VALUES (
    p_table_name, p_description, p_is_public,
    p_organization_id, p_project_id, p_task_id, (select auth.uid())
  )
  RETURNING id INTO v_table_id;

  FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
  LOOP
    INSERT INTO workbench.udt_dataset_fields (
      table_id, user_id,
      field_name, display_name,
      data_type, field_order, is_required,
      default_value, validation_rules,
      metadata
    )
    VALUES (
      v_table_id,
      (select auth.uid()),
      v_field->>'field_name',
      COALESCE(v_field->>'display_name', v_field->>'field_name'),
      COALESCE((v_field->>'data_type')::public.field_data_type, 'string'::public.field_data_type),
      COALESCE((v_field->>'field_order')::int, 0),
      COALESCE((v_field->>'is_required')::boolean, false),
      v_field->'default_value',
      v_field->'validation_rules',
      COALESCE(v_field->'metadata', '{}'::jsonb)
    );
  END LOOP;

  RETURN v_table_id;
END;
$function$;
