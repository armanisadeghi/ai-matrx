-- chair-step: this puts custom.agg_field_value_sql back to the body visionreach_w3_formula_planned_once.sql was written against (every formula column is worked out per record by custom.formula_eval again, ~3.6 ms a record) and DROPs the helper that file added (custom.formula_compile_sql); nothing else calls it.
-- lane: VISION-REACH
-- guard: custom/system_enabled
-- based-on: custom.agg_field_value_sql(uuid, uuid, text) 2913f67eb9f0f9dfe4e622a87844d34e27eee4eb7672fad2f0de6f43c00bdcaf

CREATE OR REPLACE FUNCTION custom.agg_field_value_sql(p_organization_id uuid, p_table_id uuid, p_key text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field jsonb;
begin
  -- THE ONE QUESTION, asked once per call and never per row: is this key a WORKED-OUT column of this
  -- table (a formula, a lookup, a roll-up or a Rule-filled column — all of them Fields of type
  -- `formula`)? Then its value is the read path's own answer for the row `r`. Otherwise it is the
  -- stored value, read exactly as custom.agg_value_sql always read it.
  if p_table_id is not null then
    select f.data into v_field
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and f.data ->> 'key' = custom.agg_assert_key(p_key)
       and f.data ->> 'type' = 'formula'
     limit 1;
  end if;
  if v_field is null then
    return custom.agg_value_sql(p_key);
  end if;

  -- THE COMMON CASE, WITHOUT THE PER-ROW LOOK-UPS: a column worked out ON READ, on a table whose
  -- columns do not depend on a record's type, applying to every record. Its definition is the same
  -- for every row, so it is read here once and handed to custom.derived_value — the call
  -- custom.record_value_one makes — with the row's values assembled exactly as record_value_one
  -- assembles them (the document, the Rule layer's block, what was stamped at write time). Measured
  -- on the clone, 2026-10-02: record_value_one's own re-fetch and field look-up were ~1.5 ms of
  -- ~4.3 ms a row.
  if custom.parity_type(v_field) in ('formula', 'lookup', 'rollup')
     and coalesce(v_field ->> 'compute_on', '') = 'read'
     and jsonb_array_length(coalesce(v_field -> 'applies_to_types', '[]'::jsonb)) = 0
     and custom.table_type_field(p_organization_id, p_table_id) is null then
    return format(
      'custom.agg_value_text(custom.derived_value(%L::uuid, r.id, %L::jsonb, '
      '(r.data - ''_computed'' - ''_retired'' - ''_values'' - ''_sources'' - ''_derived'') '
      '|| custom.computed_block(r.data -> ''_computed'') || custom.computed_block(r.data -> ''_derived'')))',
      p_organization_id, v_field);
  end if;
  -- Everything else (a column stamped at write time, a Rule-filled column, a typed table) asks the
  -- read path's one-column answer itself.
  return format('custom.agg_value_text(custom.record_value_one(%L::uuid, r.id, %L))',
                p_organization_id, p_key);
end;
$function$

;

drop function custom.formula_compile_sql(uuid, jsonb, text);
