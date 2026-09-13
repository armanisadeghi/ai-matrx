-- hr_l9_05_org_rule_edit_advisory_contract.sql
--
-- A candidate organization rule is checked against the statutory baseline,
-- never against an older version of that same organization rule. Previously
-- an edit from CA rounding 15 to 10 resolved the persisted 15 row first; the
-- candidate therefore looked inside its own envelope and skipped the advisory
-- acknowledgement that the identical create path requires.

do $migration$
declare
  v_definition text;
  v_from text := E"  v_action text; v_bound_rule jsonb;\n";
  v_to text := E"  v_action text; v_bound_rule jsonb;\n  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';\n";
  v_call_from text := E"    v_res := hr.resolve_rules(null, null, p_as_of, array[p_class], '{}'::jsonb,\n                              p_organization_id, v_key);";
  v_call_to text := E"    v_res := hr.resolve_rules(null, null, p_as_of, array[p_class], '{}'::jsonb,\n                              v_sys, v_key);";
begin
  select pg_get_functiondef('hr.validate_org_config(uuid,text,jsonb,text[],date)'::regprocedure)
    into v_definition;
  if position(v_call_to in v_definition) = 0 then
    if position(v_from in v_definition) = 0 or position(v_call_from in v_definition) = 0 then
      raise exception 'hr_l9_05: validate_org_config no longer has the expected statutory-resolution seam';
    end if;
    v_definition := replace(replace(v_definition, v_from, v_to), v_call_from, v_call_to);
    execute v_definition;
  end if;
end
$migration$;

-- Source proof: both create and edit enter this one validator through the
-- save door, and this validator must resolve legal bounds as the system rather
-- than allowing a persisted org row to dilute its own acknowledgement gate.
do $proof$
declare
  v_definition text;
  v_save text;
begin
  select lower(pg_get_functiondef('hr.validate_org_config(uuid,text,jsonb,text[],date)'::regprocedure))
    into v_definition;
  select lower(pg_get_functiondef('hr.org_jurisdiction_rule_save(uuid,jsonb,boolean)'::regprocedure))
    into v_save;
  if v_definition not like '%v_sys constant uuid := ''39c38960-d30c-4840-b0c1-c9960de95582''%'
     or v_definition not like '%v_sys, v_key%'
     or v_definition like '%p_organization_id, v_key%'
     or v_save not like '%validate_org_config(p_organization_id, v_class.slug, v_validation_params%'
     or v_save not like '%warnings_unacknowledged%' then
    raise exception 'hr_l9_05: create and edit no longer share statutory advisory validation';
  end if;
end
$proof$;
