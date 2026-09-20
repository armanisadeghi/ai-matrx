-- chair-step: it puts back the custom.derived_value body in which ONE malformed worked-out
-- column (a formula, lookup or rollup pointing at a Field by name) raised out of
-- custom.record_values and closed a whole Table to every read door for every member.
--
-- THE INVERSE of migrations/campaign/leakt10_one_broken_formula_does_not_close_a_table.sql.
-- Run it and census 13 names four "unmeasured: custom.read_record raised 22023" rows again.

CREATE OR REPLACE FUNCTION custom.derived_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_parity text := custom.parity_type(p_field_data);
begin
  return case v_parity
    when 'lookup'  then custom.lookup_value(p_organization_id, p_record_id, p_field_data)
    when 'rollup'  then custom.rollup_value(p_organization_id, p_record_id, p_field_data)
    when 'formula' then custom.formula_value(p_organization_id, p_record_id, p_field_data, p_values)
    else null
  end;
end;
$function$
;
