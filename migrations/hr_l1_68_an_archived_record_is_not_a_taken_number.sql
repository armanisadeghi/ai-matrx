-- hr_l1_68 — AN ARCHIVED EMPLOYEE RECORD IS NOT A TAKEN EMPLOYEE NUMBER.
--
-- RECORD of a live change applied on 2026-08-29.
--
-- 🚨 THE DEFECT: THE DOOR REFUSED WITH A LIE. `hr.employee` carries
-- `employee_party_unique_per_org UNIQUE (organization_id, party_id)`, which counts ARCHIVED rows.
-- `hr_employee_create`'s duplicate scan (`v_prior`) filters `deleted_at is null`, so a person with
-- an ARCHIVED record in this employer sailed past `rehire_required`, fell into the employee-row
-- INSERT, and raised `employee_party_unique_per_org` — which was caught by the employee-number
-- retry handler and reported as `employee_number_taken`: *"That employee number is already in use
-- in this employer."* Measured live before this migration, with a number free everywhere in the
-- employer. The HR admin is sent to fix a number that is not broken, and the actual fact — this
-- person already has a record here, it is archived — is never said.
--
-- 🚨 THE CONSTRAINT STAYS TOTAL, AND THAT IS AN ARGUMENT FROM THE SPEC, NOT A DEFAULT.
-- SPEC-EMPLOYEES §1.1: "`hr.employee` (the person in this org, 1:1 with `crm.party`)" → §4.6:
-- "a rehire is a second spell, never a second record". Making the key PARTIAL
-- (`where deleted_at is null`) would permit a SECOND employee record for one person in one
-- employer the moment the first is archived — precisely what §1.1 forbids and what the
-- `rehire_required` refusal exists to prevent — and it would split one person's spells, documents,
-- credentials and audit trail across two records with no merge path. The identity model is the
-- reason the constraint counts archived rows, so the constraint is right and the SENTENCE was
-- wrong. Both halves of the defect are fixed here: the honest refusal, and a real door behind it.
--
-- 🚨 THE REFUSAL NAMES A DOOR THAT NOW EXISTS. Before this migration NOTHING in the system could
-- un-archive an `hr.employee` row — no door, no RPC — so "restore it" would have been advice with
-- no way to follow it. `public.hr_employee_restore` is created below: same `identity.write`
-- capability as the hire it unblocks, audited, idempotent, and it brings back the rows that were
-- archived in the SAME act (matching `deleted_at`) so the restored person's spells come back with
-- them and the follow-up hire is a real rehire (spell 2), not a fresh spell 1 beside orphaned
-- history.

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 1 — the door that was missing.
--
-- DECLARED FIRST, ON PURPOSE. `platform.enforce_definer_client_grants` runs at ddl_command_end and
-- takes client EXECUTE straight back off any SECURITY DEFINER function in `public` that is not
-- declared in `platform.client_callable_door` — measured live while writing this migration: the
-- grant below landed as `{postgres=X,service_role=X}` and the door was unreachable from a browser.
-- The declaration is the door's registration, so it goes in before the function exists.
-- ──────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
select 'public', 'hr_employee_restore', 'p_payload jsonb', 'hr-l1 (hr_l1_68)',
       'The refusal hr_l1_68 puts in hr_employee_create names this door: an archived employee '
       || 'record blocks re-creation because hr.employee is 1:1 with crm.party per employer '
       || '(SPEC-EMPLOYEES §1.1), and until now nothing in the system could un-archive one. It is a '
       || 'client door for the same reason hr_employee_create is: an HR admin performs it from '
       || '/hr/people, and it authorizes on the same identity.write capability through '
       || 'hr._l1_write_gate before it writes anything.'
where not exists (select 1 from platform.client_callable_door c
                   where c.schema_name = 'public' and c.function_name = 'hr_employee_restore'
                     and c.identity_args = 'p_payload jsonb');

create or replace function public.hr_employee_restore(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid();
  v_employee uuid := nullif(p_payload ->> 'employee_id','')::uuid;
  v_org uuid; v_gate jsonb; v_at timestamptz; v_audit uuid;
  v_employments int := 0; v_positions int := 0; v_comp int := 0; v_private int := 0;
  v_engage int := 0; v_reporting int := 0; v_other int := 0; v_n int;
begin
  if v_employee is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'employee_id',
      'detail', 'Which archived record should be restored?');
  end if;

  -- deliberately NOT filtered on deleted_at: this door exists to reach the archived row.
  select e.organization_id, e.deleted_at into v_org, v_at
    from hr.employee e where e.id = v_employee;
  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;

  v_gate := hr._l1_write_gate(v_org, 'identity.write', null, 'hr_employee', 'update', 'restore');
  if v_gate is not null then return v_gate; end if;

  if v_at is null then
    -- Idempotent and honest: saying "restored" about a row that was never archived is a lie of
    -- the same family this migration removes.
    return jsonb_build_object('ok', true, 'employee_id', v_employee, 'was_archived', false,
      'detail', 'That record is not archived.',
      'door', '/hr/people/' || v_employee::text || '?org=' || v_org::text);
  end if;

  perform hr.arm_write();

  update hr.employee set deleted_at = null, updated_by = v_uid where id = v_employee;

  -- Everything archived in the SAME ACT comes back with the person. Matching on the exact
  -- timestamp is what keeps this from resurrecting a spell somebody deleted for its own reasons
  -- on a different day.
  update hr.employment set deleted_at = null, updated_by = v_uid
   where employee_id = v_employee and deleted_at = v_at;
  get diagnostics v_employments = row_count;

  update hr.position_assignment pa set deleted_at = null, updated_by = v_uid
   where pa.deleted_at = v_at
     and exists (select 1 from hr.employment em where em.id = pa.employment_id
                  and em.employee_id = v_employee);
  get diagnostics v_positions = row_count;

  update hr.compensation cp set deleted_at = null, updated_by = v_uid
   where cp.deleted_at = v_at
     and exists (select 1 from hr.employment em where em.id = cp.employment_id
                  and em.employee_id = v_employee);
  get diagnostics v_comp = row_count;

  update hr.engagement g set deleted_at = null, updated_by = v_uid
   where g.deleted_at = v_at
     and exists (select 1 from hr.employment em where em.id = g.employment_id
                  and em.employee_id = v_employee);
  get diagnostics v_engage = row_count;

  update hr.reporting_line rl set deleted_at = null, updated_by = v_uid
   where rl.deleted_at = v_at
     and exists (select 1 from hr.employment em where em.id = rl.employment_id
                  and em.employee_id = v_employee);
  get diagnostics v_reporting = row_count;

  update hr.employee_private set deleted_at = null, updated_by = v_uid
   where employee_id = v_employee and deleted_at = v_at;
  get diagnostics v_private = row_count;

  update hr.emergency_contact set deleted_at = null, updated_by = v_uid
   where employee_id = v_employee and deleted_at = v_at;
  get diagnostics v_n = row_count; v_other := v_other + v_n;

  update hr.credential set deleted_at = null, updated_by = v_uid
   where employee_id = v_employee and deleted_at = v_at;
  get diagnostics v_n = row_count; v_other := v_other + v_n;

  update hr.external_identity set deleted_at = null, updated_by = v_uid
   where employee_id = v_employee and deleted_at = v_at;
  get diagnostics v_n = row_count; v_other := v_other + v_n;

  v_audit := hr._l1_write_audit(v_org, 'hr_employee', 'update', ARRAY[v_employee], null, 'restore');

  return jsonb_build_object('ok', true, 'employee_id', v_employee, 'was_archived', true,
    'archived_at', v_at,
    'restored', jsonb_build_object('employments', v_employments, 'position_assignments', v_positions,
                                   'compensation', v_comp, 'engagements', v_engage,
                                   'reporting_lines', v_reporting, 'private', v_private,
                                   'other_person_rows', v_other),
    'directory_status', hr.employee_directory_status(v_employee, current_date),
    'audit_id', v_audit,
    'door', '/hr/people/' || v_employee::text || '?org=' || v_org::text);
end
$function$;

revoke all on function public.hr_employee_restore(jsonb) from public;
grant execute on function public.hr_employee_restore(jsonb) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 — the create door stops lying about which fact collided.
-- ──────────────────────────────────────────────────────────────────────────────────────────
do $patch$
declare
  v_def text;
  v_old_decl text := '  v_enrolled integer := 0; v_membership jsonb := ''{}''::jsonb;';
  v_new_decl text := '  v_enrolled integer := 0; v_membership jsonb := ''{}''::jsonb;' || E'\n' ||
                     '  v_arch_id uuid; v_arch_at timestamptz; v_arch_number text; v_constraint text;';
  v_old_prior text :=
    '      ''existing'', v_prior, ''door'', ''/hr/people/'' || (v_prior ->> ''employee_id'') || ''?org='' || v_org::text);' || E'\n' ||
    '  end if;';
  v_new_prior text;
  v_old_exc text;
  v_new_exc text;
begin
  v_new_prior :=
    '      ''existing'', v_prior, ''door'', ''/hr/people/'' || (v_prior ->> ''employee_id'') || ''?org='' || v_org::text);' || E'\n' ||
    '  end if;' || E'\n' ||
    E'\n' ||
    '  -- 🚨 AN ARCHIVED RECORD IS NOT A TAKEN EMPLOYEE NUMBER (hr_l1_68).' || E'\n' ||
    '  -- employee_party_unique_per_org counts ARCHIVED rows and is TOTAL on purpose: SPEC-EMPLOYEES' || E'\n' ||
    '  -- §1.1 makes hr.employee 1:1 with crm.party inside an employer, and §4.6 makes a return a' || E'\n' ||
    '  -- SECOND SPELL, never a second record. A partial key would let one person hold two records' || E'\n' ||
    '  -- here and split their history with no merge path. v_prior above only sees LIVE rows, so an' || E'\n' ||
    '  -- archived record used to fall through to the insert and surface as employee_number_taken —' || E'\n' ||
    '  -- a number sentence about a number that was free everywhere. Say the real fact, and name the' || E'\n' ||
    '  -- door that actually resolves it.' || E'\n' ||
    '  select e.id, e.deleted_at, e.employee_number into v_arch_id, v_arch_at, v_arch_number' || E'\n' ||
    '    from hr.employee e' || E'\n' ||
    '   where e.organization_id = v_org and e.party_id = v_party and e.deleted_at is not null;' || E'\n' ||
    '  if v_arch_id is not null then' || E'\n' ||
    '    return jsonb_build_object(''ok'', false, ''reason'', ''employee_archived'',' || E'\n' ||
    '      ''employee_id'', v_arch_id, ''archived_at'', v_arch_at,' || E'\n' ||
    '      ''archived_employee_number'', v_arch_number,' || E'\n' ||
    '      ''detail'', ''This person already has an employee record in this employer and it is ''' || E'\n' ||
    '             || ''archived (on '' || to_char(v_arch_at, ''FMMon FMDD, YYYY'') || ''). A person has ''' || E'\n' ||
    '             || ''ONE record per employer, for life — a return to work is a second spell on it, ''' || E'\n' ||
    '             || ''never a second record — so a new record cannot be created beside it.'',' || E'\n' ||
    '      ''remedy'', ''Restore the archived record (hr_employee_restore), then hire on it with ''' || E'\n' ||
    '             || ''is_rehire = true.'',' || E'\n' ||
    '      ''door'', ''/hr/people/'' || v_arch_id::text || ''?org='' || v_org::text || ''&archived=1'');' || E'\n' ||
    '  end if;';

  v_old_exc :=
    '      exception when unique_violation then' || E'\n' ||
    '        -- §4.1: a duplicate employee_number re-generates from the format knob and retries ONCE,';
  v_new_exc :=
    '      exception when unique_violation then' || E'\n' ||
    '        -- WHICH unique key actually fired. Assuming it was the employee number is the defect' || E'\n' ||
    '        -- hr_l1_68 removed: employee_party_unique_per_org reaches here too (a record archived' || E'\n' ||
    '        -- between the check above and this insert), and it is not a number problem at all.' || E'\n' ||
    '        get stacked diagnostics v_constraint = constraint_name;' || E'\n' ||
    '        if v_constraint = ''employee_party_unique_per_org'' then' || E'\n' ||
    '          return jsonb_build_object(''ok'', false, ''reason'', ''employee_archived'',' || E'\n' ||
    '            ''detail'', ''This person already has an employee record in this employer and it is ''' || E'\n' ||
    '                   || ''archived. A person has ONE record per employer, for life; restore that ''' || E'\n' ||
    '                   || ''record instead of creating a second one beside it.'',' || E'\n' ||
    '            ''remedy'', ''Restore the archived record (hr_employee_restore), then hire on it ''' || E'\n' ||
    '                   || ''with is_rehire = true.'',' || E'\n' ||
    '            ''door'', ''/hr/people?org='' || v_org::text || ''&archived=1'');' || E'\n' ||
    '        end if;' || E'\n' ||
    '        -- §4.1: a duplicate employee_number re-generates from the format knob and retries ONCE,';

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if v_def is null then
    raise exception 'hr_l1_68: public.hr_employee_create is missing';
  end if;

  if position('employee_archived' in v_def) > 0 then
    raise notice 'hr_l1_68: already applied';
    return;
  end if;
  if position(v_old_decl in v_def) = 0 then
    raise exception 'hr_l1_68: the declare anchor has changed shape (hr_l1_67 must be applied first)';
  end if;
  if position(v_old_prior in v_def) = 0 then
    raise exception 'hr_l1_68: the rehire_required anchor has changed shape; refusing to patch blind';
  end if;
  if position(v_old_exc in v_def) = 0 then
    raise exception 'hr_l1_68: the unique_violation handler has changed shape; refusing to patch blind';
  end if;

  v_def := replace(v_def, v_old_decl,  v_new_decl);
  v_def := replace(v_def, v_old_prior, v_new_prior);
  v_def := replace(v_def, v_old_exc,   v_new_exc);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if position('''reason'', ''employee_archived''' in v_def) = 0
     or position('get stacked diagnostics v_constraint = constraint_name;' in v_def) = 0 then
    raise exception 'hr_l1_68: the replacements did not land';
  end if;
  if position('employee_number_taken' in v_def) = 0
     or position('rehire_required' in v_def) = 0
     or position('link_without_membership' in v_def) = 0
     or position('mbr_add' in v_def) > 0
     or position('A position needs a department' in v_def) = 0 then
    raise exception 'hr_l1_68: the patched body lost machinery it must keep';
  end if;
  raise notice 'hr_l1_68: the create door names the real collision and the door that resolves it';
end
$patch$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_employee_create','hr_l1_68_an_archived_record_is_not_a_taken_number.sql',
       array['''reason'', ''employee_archived''',
             'get stacked diagnostics v_constraint = constraint_name;',
             'employee_number_taken'],
       array[]::text[],
       'SPEC-EMPLOYEES §1.1/§4.6: hr.employee is 1:1 with crm.party inside an employer, so '
       || 'employee_party_unique_per_org is TOTAL and counts archived rows — a partial key would let '
       || 'one person hold two records here and split their history. Because the key is total, an '
       || 'archived record collides on the person, NOT on the number; reporting it as '
       || 'employee_number_taken told an HR admin to fix a number that was free everywhere. This '
       || 'door must name the real fact before the insert AND branch on constraint_name if the race '
       || 'reaches the handler. Both refusals must keep pointing at hr_employee_restore.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_employee_create'
                     and c.home_migration = 'hr_l1_68_an_archived_record_is_not_a_taken_number.sql');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_employee_restore','hr_l1_68_an_archived_record_is_not_a_taken_number.sql',
       array['hr._l1_write_gate(v_org, ''identity.write''', 'deleted_at = v_at'],
       array[]::text[],
       'The refusal hr_l1_68 put in the create door names this one. It authorizes on the same '
       || 'identity.write capability as the hire it unblocks, and it restores only what was archived '
       || 'in the SAME act (deleted_at = v_at) so it cannot resurrect a spell somebody deleted on a '
       || 'different day for its own reasons.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_employee_restore');

do $chk$
declare v_broken int;
begin
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname in ('public.hr_employee_create','public.hr_employee_restore');
  if v_broken > 0 then
    raise exception 'hr_l1_68: % contract clause(s) broken', v_broken;
  end if;
  if not exists (select 1 from information_schema.routine_privileges
                  where routine_name = 'hr_employee_restore' and grantee = 'authenticated'
                    and privilege_type = 'EXECUTE') then
    raise exception 'hr_l1_68: authenticated cannot reach the restore door';
  end if;
  -- the constraint this migration argues for must still be TOTAL
  if not exists (select 1 from pg_constraint
                  where conrelid = 'hr.employee'::regclass
                    and conname = 'employee_party_unique_per_org' and contype = 'u') then
    raise exception 'hr_l1_68: employee_party_unique_per_org is no longer a total unique constraint';
  end if;
end
$chk$;
