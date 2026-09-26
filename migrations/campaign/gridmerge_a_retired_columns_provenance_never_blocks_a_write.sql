-- target: branch,production
-- additive: yes
--   REPLACES one body — `custom.validate_value_envelope(uuid, custom.record[], jsonb)`, byte for byte
--   plus ONE exemption: an envelope (`_values -> key`) whose key is a RETIRED Field of the same table
--   is history, not a claim, and is no longer refused. An envelope for a key that never was a Field
--   of this table is still refused by the same sentence (VAL-1). No table, trigger, policy, index,
--   grant or stored row changes. Inverse:
--   migrations/inverse/gridmerge_a_retired_columns_provenance_never_blocks_a_write_down.sql.
-- guard: custom/system_enabled
-- lock: custom
-- lane: data-tables-grid-overhaul (merged grid — data paths)
-- based-on: custom.validate_value_envelope(uuid, custom.record[], jsonb) aa75202a64871992ede0f853b94a1c000a6eeca93b7e6896fe0f44e835786d90
--
-- A RETIRED COLUMN'S PROVENANCE NEVER BLOCKS A WRITE.
--
-- MEASURED 2026-09-26 on the 1,000-row table 3260bbbe: a walk added a number column, typed into three
-- rows, and retired the column. `field_retire` keeps the stored words (nothing is destroyed — the
-- history reads them), including each row's value envelope under `_values`. From that moment EVERY
-- write to those three records — a cell edit, a bulk change, an undo — was refused by VAL-1: "This
-- record carries where "crew_rating_walk" came from, and this table has no field called ...".
-- Retiring a column silently froze every record that had ever held a value in it. The envelope of
-- a retired Field is the column's history; it is kept and it is no longer judged.
--
-- LOCKS. create or replace function x1. Not window-class.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.validate_value_envelope(p_organization_id uuid, p_fields custom.record[], p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_keys  text[];
  v_key   text;
  v_alt   jsonb;
  v_table text;
  f       custom.record;
begin
  if coalesce(jsonb_typeof(p_data -> '_values'), '') <> 'object' then
    return;
  end if;
  select array_agg(x.data ->> 'key') into v_keys from unnest(p_fields) x;
  select min(x.data ->> 'entity_definition_id') into v_table from unnest(p_fields) x;

  for v_key in select k from jsonb_object_keys(p_data -> '_values') k loop
    if not (v_key = any (coalesce(v_keys, array[]::text[]))) then
      -- A RETIRED Field of this table: its envelope is the column's history, kept, never judged.
      if v_table is not null and exists (
           select 1 from custom.record r
            where r.organization_id = p_organization_id
              and r.table_id = custom.field_kernel_id()
              and r.deleted_at is not null
              and r.data ->> 'entity_definition_id' = v_table
              and r.data ->> 'key' = v_key) then
        continue;
      end if;
      raise exception 'This record carries where "%" came from, and this table has no field called "%". Provenance nobody can read is worse than none.', v_key, v_key
        using errcode = '23514', hint = 'VAL-1: every value envelope belongs to a declared Field of this table.';
    end if;
    -- VAL-3: an alternate is a candidate for the SAME field, so it is the same kind of
    -- value. An alternate nobody could promote is not an alternate.
    -- `select * into`, never `select x into`: `unnest()` over an array of a composite type
    -- EXPANDS it into columns, so `x` is the whole row and plpgsql would assign it to the
    -- first field — `id uuid` — and refuse the composite's text as a uuid.
    select * into f from unnest(p_fields) x where x.data ->> 'key' = v_key limit 1;
    for v_alt in select value from jsonb_array_elements(
                   coalesce(p_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb)) loop
      if jsonb_typeof(v_alt -> 'value') is not null and jsonb_typeof(v_alt -> 'value') <> 'null' then
        perform custom.validate_values(p_organization_id, array[f],
                                       jsonb_build_object(v_key, v_alt -> 'value'), null);
      end if;
    end loop;
  end loop;
end;
$function$;
