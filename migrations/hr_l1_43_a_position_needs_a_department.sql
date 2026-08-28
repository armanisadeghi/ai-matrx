-- hr_l1_43_a_position_needs_a_department.sql
--
-- Found while proving hr_l1_42 through the door. `hr.position_assignment.department_id`
-- is NOT NULL, but `hr_employee_create` validated only the location — so a hire with no
-- department returned a raw 23502 naming an internal table and printing every column of
-- the failing row, where an HR admin needed one sentence telling them what to fill in.
--
-- SPEC-ACCESS §4.1: the door names the refusal. A Postgres error reaching a person is the
-- door failing to do its job — the same class as the crm source that raised straight
-- through this function untouched.
--
-- Applied live 2026-08-28 and ledgered. Proven: a hire with no department now returns
-- {"ok":false,"reason":"validation","field":"department_id",
--  "detail":"A position needs a department."}

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_employee_create(jsonb)'::regprocedure);
  if position('A POSITION NEEDS A DEPARTMENT TOO' in v_def) > 0 then
    raise notice 'hr_l1_43: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$      'detail', 'A position needs a location.');
  end if;$a1$,
$r1$      'detail', 'A position needs a location.');
  end if;

  -- 🚨 A POSITION NEEDS A DEPARTMENT TOO, AND SAYING SO IS THIS DOOR'S JOB.
  if nullif(p_payload ->> 'department_id','') is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'department_id',
      'detail', 'A position needs a department.');
  end if;$r1$);
  if v_new = v_def then raise exception 'hr_l1_43: location-validation anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if v_src !~ 'A POSITION NEEDS A DEPARTMENT TOO' then raise exception 'hr_l1_43: did not land'; end if;
  if v_src !~ 'A position needs a location' then raise exception 'hr_l1_43: location check lost'; end if;
end $verify$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('public', 'hr_employee_create', 'hr_l1_43_a_position_needs_a_department.sql',
        array['A position needs a location', 'A position needs a department', 'hr.employee_create'],
        array[]::text[],
        'Both NOT NULL position columns are validated BY NAME before the insert, and the crm '
        || 'source string stays ''hr.employee_create'' — see the crm.ensure_user_party row.')
on conflict do nothing;
