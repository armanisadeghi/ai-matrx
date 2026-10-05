-- chair-step: functions only. Creates hr.custom_fields_write_gate (SECURITY DEFINER) and edits one live body by
-- asserted fragment: custom.entity_row_write (an HR row's custom values are changed through HR's own edit rule).
-- GRANT NAMED: EXECUTE on hr.custom_fields_write_gate to authenticated (declared in platform.client_callable_door;
-- it admits only a person HR's own write gate admits, and arms only the statement that asked).
-- No table DDL, no policy change, no new lock: the HR write guard and every HR row rule stand as they are.
-- lock: custom, hr
--
-- LANE FINISH-THE-SWITCH · FTS-2 · WAVE 4b (a) — THE HR FOLD, THE CAPABILITY ONLY.
-- Design: common-docs/projects/data-doctrine-adoption/v6/DESIGN-STANDARD-TABLES-W45.md § Wave 4b, table "HR's readers
-- and editors today" — Edit row: the same hr._l1_subject_write_gate(org, 'identity.write', subject employee, token,
-- 'update', 'operational') that gates hr_employee_update today. HR's tables already carry custom_fields and the store's
-- guard; what refused every change was HR's own write guard (hr_write_forbidden), which needs hr.arm_write(). This door
-- asks HR's gate as the signed-in person and, when HR admits her, arms the one statement that is writing.
-- A row with no subject employee (a requisition, a candidate before hire) is not armed: HR's guard refuses it exactly
-- as today. Not in this file (Needs, chair): the default-protected knob per HR token, the renames of the old tables and
-- columns (strong locks), and retiring the old registry readers.
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION hr.custom_fields_write_gate(p_organization_id uuid, p_token text, p_row_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_emp  uuid;
  v_org  uuid;
  v_gate jsonb;
  v_semp uuid;
begin
  if auth.uid() is null then
    return false;   -- no person to ask; HR's guard decides as it always has
  end if;
  select s.employee_id, s.organization_id into v_emp, v_org from hr.custom_field_subject(p_token, p_row_id) s;
  if v_emp is null or v_org is distinct from p_organization_id then
    return false;   -- no subject employee: HR's guard refuses the write as today
  end if;
  select g.gate, g.subject_employment into v_gate, v_semp
    from hr._l1_subject_write_gate(v_org, 'identity.write', v_emp, p_token, 'update', 'operational') g;
  if v_gate is not null then
    raise exception 'Changing this record''s fields takes HR''s edit access for this employee. Nothing was written.'
      using errcode = '42501', hint = 'An HR admin for this employee can change them.';
  end if;
  perform hr.arm_write();
  return true;
end
$function$;

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
SELECT d.* FROM (VALUES
  ('hr', 'custom_fields_write_gate', 'p_organization_id uuid, p_token text, p_row_id uuid',
   ARRAY['uuid'::regtype,'text'::regtype,'uuid'::regtype]::oid[],
   'Called by custom.entity_row_write (SECURITY INVOKER, as the person) for an HR row: asks HR''s own write gate (hr._l1_subject_write_gate, identity.write, the row''s subject employee) for auth.uid() and arms only the calling statement; refuses in a sentence otherwise.',
   'migrations/campaign/lane7w4b_a_an_hr_rows_custom_fields_change_through_hrs_own_edit_rule.sql (FINISH-THE-SWITCH FTS-2 wave 4b)',
   NULL, true, false,
   '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "position": 1, "optional": false, "null_rule": {}, "foreign": {"bounded": true, "note": "Must be the subject row''s own organization, or nothing is armed."}}, "p_token": {"type": "text", "position": 2, "optional": false, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_row_id": {"type": "uuid", "position": 3, "optional": false, "null_rule": {}, "foreign": {"bounded": true, "note": "Resolved to its employee by hr.custom_field_subject; HR''s write gate judges auth.uid() on that employee."}}}}'::jsonb)
) d(schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door c WHERE c.schema_name = d.schema_name AND c.function_name = d.function_name);
GRANT EXECUTE ON FUNCTION hr.custom_fields_write_gate(uuid, text, uuid) TO authenticated, service_role;

do $do$
declare
  r     record;
  v_def text;
  v_n   integer;
begin
  for r in select * from (values
    ($w4b$custom.entity_row_write(uuid,text,uuid,jsonb,jsonb,integer,boolean)$w4b$,
     $w4b$  execute format('update %I.%I x set %s where %s'$w4b$,
     $w4b$  -- LANE7-W4B[h1]: AN HR ROW is changed through HR's own edit rule — the write gate that gates
  -- hr_employee_update today asks the signed-in person and arms this statement; with no subject
  -- employee nothing is armed and HR's guard refuses exactly as before.
  if t.schema_name = 'hr' then
    perform hr.custom_fields_write_gate(v_org, p_token, p_record_id);
  end if;
  execute format('update %I.%I x set %s where %s'$w4b$, $w4b$LANE7-W4B[h1]$w4b$)
  ) t(fn, old_frag, new_frag, mark)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.mark in v_def) > 0 then
      continue;
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.old_frag, ''))) / length(r.old_frag);
    if v_n <> 1 then
      raise exception 'LANE7-W4B: % carries the expected fragment % times, not once (edit %) — re-base this file', r.fn, v_n, r.mark;
    end if;
    execute replace(v_def, r.old_frag, r.new_frag);
  end loop;
end
$do$;
