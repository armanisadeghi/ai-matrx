-- inverse of lane7w4b_a_an_hr_rows_custom_fields_change_through_hrs_own_edit_rule.sql — removes the fragment
-- (asserted) from custom.entity_row_write, then drops hr.custom_fields_write_gate and its declaration.
set local lock_timeout = '3s';
do $do$
declare
  v_def text;
  v_old text := $w4b$  -- LANE7-W4B[h1]: AN HR ROW is changed through HR's own edit rule — the write gate that gates
  -- hr_employee_update today asks the signed-in person and arms this statement; with no subject
  -- employee nothing is armed and HR's guard refuses exactly as before.
  if t.schema_name = 'hr' then
    perform hr.custom_fields_write_gate(v_org, p_token, p_record_id);
  end if;
$w4b$;
begin
  v_def := pg_get_functiondef('custom.entity_row_write(uuid,text,uuid,jsonb,jsonb,integer,boolean)'::regprocedure);
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, '');
  end if;
end
$do$;
DELETE FROM platform.client_callable_door WHERE schema_name = 'hr' AND function_name = 'custom_fields_write_gate';
DROP FUNCTION IF EXISTS hr.custom_fields_write_gate(uuid, text, uuid);
