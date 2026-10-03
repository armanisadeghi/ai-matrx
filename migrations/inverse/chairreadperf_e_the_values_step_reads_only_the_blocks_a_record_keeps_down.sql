-- chair-step: inverse of migrations/campaign/chairreadperf_e_the_values_step_reads_only_the_blocks_a_record_keeps.sql — puts back the custom.record_values_step body it replaced (signature, grants unchanged).
-- lane: CHAIR-READPERF
-- based-on: custom.record_values_step(custom.record, jsonb) ba6f6aaeccb17f9f3b59a2511b357953faa4990407dba7b11df3b9671688c4c2
-- lock: custom

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
            || custom.computed_block(p_row.data -> '_computed');

  -- custom.derived_values_of's own first line, exactly.
  if p_row.id is null or p_row.table_id is null
     or p_row.data_class in ('kernel', 'relation') then
    o_doc := v_base || '{}'::jsonb;
    return;
  end if;

  v_out := custom.computed_block(p_row.data -> '_derived');
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
