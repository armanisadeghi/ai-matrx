-- hr_l1_68a — THE `employee_archived` REFUSAL STOPS POINTING AT A DEAD END.
--
-- RECORD of a live change applied on 2026-08-29. Found by FALSIFYING hr_l1_68, not by review.
--
-- hr_l1_68's refusal handed back `door = /hr/people/<id>?org=…&archived=1`, and the client's
-- `RefusalNotice` renders any `door` as a "Go fix that" button. MEASURED LIVE: that page cannot
-- load an archived record — `hr_employee_profile` answers
-- `{granted: false, reason: 'not_reachable'}` for it, and `hr_directory_list` filters
-- `e.deleted_at is null`, so the archived person is on no list either. A refusal whose button
-- leads nowhere is the dead end SPEC-EMPLOYEES §4.1 forbids, and it is worse than no button
-- because it looks like a way out.
--
-- So the `door` is REMOVED, and the refusal instead carries what a surface needs to act on the
-- spot — the archived `employee_id`, its number, when it was archived, and the `remedy`. The
-- create form uses exactly that to offer the restore inline, the same way `rehire_required`'s
-- `existing` block opens the rehire panel rather than sending anybody anywhere. When an archived
-- view exists, the door can come back with a page behind it.

do $patch$
declare
  v_def text;
  v_old_a text := '      ''door'', ''/hr/people/'' || v_arch_id::text || ''?org='' || v_org::text || ''&archived=1'');';
  v_new_a text := '      ''restorable'', true);';
  v_old_b text := '            ''door'', ''/hr/people?org='' || v_org::text || ''&archived=1'');';
  v_new_b text := '            ''restorable'', true);';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if v_def is null then
    raise exception 'hr_l1_68a: public.hr_employee_create is missing';
  end if;

  if position('archived=1' in v_def) = 0 then
    raise notice 'hr_l1_68a: already applied — no archived door is emitted';
    return;
  end if;
  if position(v_old_a in v_def) = 0 or position(v_old_b in v_def) = 0 then
    raise exception 'hr_l1_68a: the archived refusals have changed shape; refusing to patch blind';
  end if;

  v_def := replace(v_def, v_old_a, v_new_a);
  v_def := replace(v_def, v_old_b, v_new_b);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if position('archived=1' in v_def) > 0 then
    raise exception 'hr_l1_68a: a dead-end archived door is still emitted';
  end if;
  if position('''reason'', ''employee_archived''' in v_def) = 0
     or position('''employee_id'', v_arch_id' in v_def) = 0
     or position('get stacked diagnostics v_constraint = constraint_name;' in v_def) = 0
     or position('employee_number_taken' in v_def) = 0
     or position('mbr_add' in v_def) > 0 then
    raise exception 'hr_l1_68a: the patched body lost machinery it must keep';
  end if;
  raise notice 'hr_l1_68a: the archived refusal no longer offers a button to nowhere';
end
$patch$;

update hr.function_contract
   set must_not_contain = array['archived=1'],
       reason = reason || ' AMENDED by hr_l1_68a (2026-08-29): the refusal originally carried a '
             || 'door at /hr/people/<id>?archived=1. Measured live, hr_employee_profile answers '
             || 'not_reachable for an archived record and hr_directory_list filters archived rows '
             || 'out, so the client''s "Go fix that" button led nowhere — the dead end §4.1 '
             || 'forbids. The refusal now carries employee_id, the number, archived_at and '
             || 'restorable=true instead, and the create form offers the restore inline the way '
             || 'rehire_required opens the rehire panel. A door may return when a page exists.'
 where schema_name = 'public' and function_name = 'hr_employee_create'
   and home_migration = 'hr_l1_68_an_archived_record_is_not_a_taken_number.sql'
   and 'archived=1' <> all(coalesce(must_not_contain, array[]::text[]));

do $chk$
declare v_broken int;
begin
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname = 'public.hr_employee_create';
  if v_broken > 0 then
    raise exception 'hr_l1_68a: % contract clause(s) broken on hr_employee_create', v_broken;
  end if;
end
$chk$;
