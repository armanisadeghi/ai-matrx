-- chair-step: withdraw the retired-column exemption from VAL-1 (inverse of gridmerge_a_retired_columns_provenance_never_blocks_a_write.sql)
-- Inverse of migrations/campaign/gridmerge_a_retired_columns_provenance_never_blocks_a_write.sql:
-- custom.validate_value_envelope back byte for byte. Records carrying a retired column's envelope are
-- refused on every write again.
-- lane: data-tables-grid-overhaul (merged grid — data paths)
-- based-on: custom.validate_value_envelope(uuid, custom.record[], jsonb) e1defeafba87841ebee2496ec9a5aab8b943fcc8cc0b4b2e48e46884f6a3926a
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
  f       custom.record;
begin
  if coalesce(jsonb_typeof(p_data -> '_values'), '') <> 'object' then
    return;
  end if;
  select array_agg(x.data ->> 'key') into v_keys from unnest(p_fields) x;

  for v_key in select k from jsonb_object_keys(p_data -> '_values') k loop
    if not (v_key = any (coalesce(v_keys, array[]::text[]))) then
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
