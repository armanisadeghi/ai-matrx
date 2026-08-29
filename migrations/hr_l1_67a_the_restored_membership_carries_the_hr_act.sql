-- hr_l1_67a — THE RESTORED MEMBERSHIP CARRIES THE HR ACT THAT RESTORED IT.
--
-- RECORD of a live change applied on 2026-08-29. Found by FALSIFYING hr_l1_67, not by review.
--
-- hr_l1_67 replaced the mbr_add call with an `insert into iam.memberships ... on conflict
-- (container_type, container_id, user_id) do update`. The INSERT arm writes the metadata that
-- names the HR act (`granted_by`, `reason`, `hr_act`, `hr_employee_id`); the DO UPDATE arm — the
-- one that fires when a SOFT-DELETED membership row is brought back — did not, so the restored
-- row kept whatever metadata it carried before it was deleted, or none at all. Measured live: a
-- plain HR admin rehiring a former employee whose membership row had been soft-deleted got
-- `action = 'created'` and a row with `metadata = {}`.
--
-- That arm is not a corner: it is the ONLY way a hire meets an absent membership. A link to a
-- non-member is refused by name (`link_without_membership`), so the reachable case is a REHIRE,
-- where the login is read off the employee row and the membership may well have been deleted in
-- between. The hr.access_audit row (`iam_membership` / `hire`) is written either way and is the
-- real audit trail; the metadata is what a person reading the membership row itself sees, and it
-- should say the same thing.
--
-- `created_by` is deliberately NOT touched: it is the access key, and iam._guard_governance_columns
-- refuses ownership transfer through a column write. The restored row keeps its original creator.

do $patch$
declare
  v_def text;
  v_old text :=
    '        do update set status = ''active'', deleted_at = null,' || E'\n' ||
    '                      updated_by = v_uid, updated_at = now()';
  v_new text :=
    '        do update set status = ''active'', deleted_at = null,' || E'\n' ||
    '                      metadata = jsonb_build_object(''granted_by'', ''hr_employee_create'',' || E'\n' ||
    '                                   ''reason'', ''link_at_create_completes_access'',' || E'\n' ||
    '                                   ''hr_act'', ''hire'', ''hr_employee_id'', v_employee,' || E'\n' ||
    '                                   ''restored_from_deleted'', true),' || E'\n' ||
    '                      updated_by = v_uid, updated_at = now()';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if v_def is null then
    raise exception 'hr_l1_67a: public.hr_employee_create is missing';
  end if;

  if position('''restored_from_deleted'', true' in v_def) > 0 then
    raise notice 'hr_l1_67a: already applied';
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'hr_l1_67a: the conflict arm has changed shape; refusing to patch blind';
  end if;

  execute replace(v_def, v_old, v_new);

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if position('''restored_from_deleted'', true' in v_def) = 0 then
    raise exception 'hr_l1_67a: the replacement did not land';
  end if;
  if position('mbr_add' in v_def) > 0
     or position('link_without_membership' in v_def) = 0
     or position('THIS DOOR DOES NOT DEMAND A SECOND, UNRELATED PRIVILEGE' in v_def) = 0 then
    raise exception 'hr_l1_67a: the patched body lost machinery it must keep';
  end if;
  raise notice 'hr_l1_67a: a membership restored by a hire says which hire restored it';
end
$patch$;

do $chk$
declare v_broken int;
begin
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname = 'public.hr_employee_create';
  if v_broken > 0 then
    raise exception 'hr_l1_67a: % contract clause(s) broken on hr_employee_create', v_broken;
  end if;
end
$chk$;
