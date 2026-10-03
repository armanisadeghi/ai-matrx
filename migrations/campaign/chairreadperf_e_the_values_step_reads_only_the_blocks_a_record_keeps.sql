-- chair-step: it REPLACES the body of custom.record_values_step (signature, STABLE, search_path and grants unchanged): custom.computed_block is asked about `_computed` and about `_derived` only when the record's document keeps that block; a record keeping neither asks nothing. custom.computed_block(null) answers {} , so the document handed back is the same bytes. No other function, no table, index, policy, grant, door row or data row is touched.
-- lane: CHAIR-READPERF
-- based-on: custom.record_values_step(custom.record, jsonb) 62b995d17decb9f9488b6ac8ad21d2b02a3ecad7d199cceec8df28e54207c186
-- lock: custom
--
-- Inverse: migrations/inverse/chairreadperf_e_the_values_step_reads_only_the_blocks_a_record_keeps_down.sql.
--
-- WHY (chair ruling, round 2 of CHAIR-READPERF, 2026-10-03). Profile of one hand-off on the clone
-- (test@test.com, a 627-scope type, 577 ms): custom.computed_block 93 ms over 1,254 calls — two a
-- record, one for `_computed` and one for `_derived`, 0.074 ms each (a SQL-language function with a
-- sub-select is not inlined; it is parsed and planned per call). A scope's record keeps neither block.
-- The two blocks are different facts, so "once" is not possible for a record that keeps both; a record
-- that keeps one asks once, and one that keeps neither asks nothing.
--
-- SAME ANSWER. custom.computed_block(p) = coalesce((select jsonb_object_agg(key, value -> 'value') from
-- jsonb_each(coalesce(p, '{}'))), '{}'): for p null (the key absent) that is '{}'. A key that IS
-- present, whatever it holds, is still handed to custom.computed_block exactly as before.
-- Re-based on production's body after CHAIR-MATH's 14:32Z files (they did not replace this function).

CREATE OR REPLACE FUNCTION custom.record_values_step(p_row custom.record, p_cache jsonb DEFAULT '{}'::jsonb, OUT o_doc jsonb, OUT o_cache jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_base  jsonb;
  v_out   jsonb;
  v_plain jsonb;
  v_tf    text;
  v_rtype text;
  v_tk    text;
  v_pk    text;
  v_plan  jsonb;
  f       jsonb;
begin
  o_cache := coalesce(p_cache, '{}'::jsonb);
  v_base := (p_row.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
            -- CHAIR-READPERF: asked only when the record keeps the block; custom.computed_block(null)
            -- answers {} and costs a parse and a plan of its body on every call (it is LANGUAGE sql).
            || case when p_row.data ? '_computed' then custom.computed_block(p_row.data -> '_computed')
                    else '{}'::jsonb end;

  -- custom.derived_values_of's own first line, exactly.
  if p_row.id is null or p_row.table_id is null
     or p_row.data_class in ('kernel', 'relation') then
    o_doc := v_base || '{}'::jsonb;
    return;
  end if;

  v_out := case when p_row.data ? '_derived' then custom.computed_block(p_row.data -> '_derived')
                else '{}'::jsonb end;
  v_plain := v_base || v_out;

  v_tk := 'tf:' || coalesce(p_row.organization_id::text, '-') || ':' || p_row.table_id::text;
  if not (o_cache ? v_tk) then
    o_cache := o_cache || jsonb_build_object(v_tk,
                 to_jsonb(custom.table_type_field(p_row.organization_id, p_row.table_id)));
  end if;
  v_tf := o_cache ->> v_tk;
  if v_tf is not null then
    v_rtype := p_row.data ->> v_tf;
  end if;

  v_pk := 'af:' || coalesce(p_row.organization_id::text, '-') || ':' || p_row.table_id::text || ':'
       || case when v_rtype is null then 'n' else 'v:' || v_rtype end;
  if not (o_cache ? v_pk) then
    select coalesce(jsonb_agg(a.data order by a.ordinality), '[]'::jsonb) into v_plan
      from custom.applicable_fields(p_row.organization_id, p_row.table_id, v_rtype) with ordinality as a
     where custom.parity_type(a.data) in ('lookup', 'rollup', 'formula')
       and coalesce(a.data ->> 'compute_on', '') = 'read';
    o_cache := o_cache || jsonb_build_object(v_pk, v_plan);
  end if;

  for f in select e from jsonb_array_elements(o_cache -> v_pk) e loop
    v_out := v_out || jsonb_build_object(f ->> 'key',
                        custom.derived_value(p_row.organization_id, p_row.id, f, v_plain));
  end loop;
  o_doc := v_base || coalesce(v_out, '{}'::jsonb);
end;
$function$;
