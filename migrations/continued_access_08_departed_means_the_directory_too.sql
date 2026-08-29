-- continued_access_08 — DEPARTED MEANS THE DIRECTORY TOO (and the return actually runs).
--
-- RECORD of a live change applied on 2026-08-29. Two fixes, both found by WALKING
-- continued_access_06 as the departed person rather than reading its result as the HR admin.
--
-- 1. 🚨 `public.hr_directory_list` granted standing from the EMPLOYEE ROW, not the membership:
--
--        if v_org_role is null
--           and not exists (select 1 from hr.employee e
--                            where e.organization_id = p_organization_id
--                              and e.login_user_id = v_uid and e.deleted_at is null) then
--          raise ... 'no standing in this employer'
--
--    A terminated, departed person still has that employee row -- that is the whole point of a
--    personnel file -- so the door kept answering them with the live roster (name, job title,
--    department, location, timezone for every current colleague) long after every table-level
--    grant was gone. SPEC-EMPLOYEES §2.1: "every HR surface goes dark for them". This closes the
--    one surface that did not. Measured before the fix on a live fixture: a departed person's own
--    token got HTTP 200 and the full directory payload.
--
--    The `hr.employee` half of the test is KEPT, because it is what lets a kiosk-linked employee
--    with no org role read the directory; it now additionally requires that the person still be an
--    active member -- which every login-bearing employee is (hr_employee_create's link-completion
--    block calls mbr_add), and which a departed person by construction is not.
--
-- 2. `platform.continued_access_return_apply` could not restore anybody: it read the recorded
--    sub-container membership ids with `(e ->> 0)::uuid` over `jsonb_array_elements_text`, whose
--    elements are already text -- `operator does not exist: text ->> integer`. A rehire therefore
--    failed at the trigger with a 42883, so no second spell could be written at all. Corrected
--    here rather than by editing continued_access_06 in place, which would have made that file
--    read DRIFTED forever against the bytes that actually ran.

create or replace function platform.continued_access_return_apply(
  p_organization_id uuid,
  p_subject_user_id uuid,
  p_actor uuid,
  p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, iam, pg_temp
as $fn$
-- The person is a member again. Restore the org membership, restore the sub-container
-- memberships THIS feature closed (by their recorded ids — never every soft-deleted row, which
-- would resurrect memberships someone removed on purpose), and close the departure record.
declare v_mid uuid; v_row platform.continued_access%rowtype; v_ids uuid[]; v_back int := 0;
begin
  select m.id into v_mid from iam.memberships m
   where m.container_type = 'organization' and m.container_id = p_organization_id
     and m.user_id = p_subject_user_id and m.deleted_at is null;
  if v_mid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_membership');
  end if;

  update iam.memberships
     set status = 'active', updated_at = now(), updated_by = p_actor
   where id = v_mid and status = 'departed';

  select * into v_row from platform.continued_access c
   where c.organization_id = p_organization_id and c.subject_user_id = p_subject_user_id
     and c.deleted_at is null;

  if found then
    select array_agg(e::uuid) into v_ids
      from jsonb_array_elements_text(
             coalesce(v_row.metadata -> 'closed_sub_membership_ids', '[]'::jsonb)) e;
    if v_ids is not null then
      with back as (
        update iam.memberships m set deleted_at = null, updated_at = now(), updated_by = p_actor
         where m.id = any(v_ids) and m.deleted_at is not null
        returning 1)
      select count(*) into v_back from back;
    end if;

    update platform.continued_access
       set deleted_at = now(), updated_at = now(), updated_by = p_actor,
           metadata = metadata || jsonb_build_object('returned_at', now(),
                                                     'returned_reason', coalesce(p_reason, 'membership restored'))
     where id = v_row.id;
  end if;

  return jsonb_build_object('ok', true, 'membership_id', v_mid,
    'sub_container_memberships_restored', v_back,
    'membership_status', (select m.status from iam.memberships m where m.id = v_mid),
    'state', platform.continued_access_state(p_organization_id, p_subject_user_id));
end
$fn$;

revoke execute on function platform.continued_access_return_apply(uuid,uuid,uuid,text) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- The directory door's standing test, patched surgically (the body is large and carries a dozen
-- rulings; see continued_access_07 for why this shape rather than a rewrite).

do $patch$
declare
  v_def text;
  v_old text := 'and not exists (select 1 from hr.employee e
                      where e.organization_id = p_organization_id and e.login_user_id = v_uid
                        and e.deleted_at is null) then';
  v_new text := 'and not exists (select 1 from hr.employee e
                      join iam.organization_member om
                        on om.organization_id = e.organization_id and om.user_id = e.login_user_id
                      where e.organization_id = p_organization_id and e.login_user_id = v_uid
                        and e.deleted_at is null) then';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_directory_list';
  if v_def is null then
    raise exception 'continued_access_08: public.hr_directory_list is missing';
  end if;
  if position('iam.organization_member om' in v_def) > 0 then
    raise notice 'continued_access_08: already applied';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'continued_access_08: the directory standing test has changed shape; refusing to patch blind';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end
$patch$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_directory_list','continued_access_08_departed_means_the_directory_too.sql',
       array['iam.organization_member om'], array[]::text[],
       'SPEC-EMPLOYEES §2.1: a terminated person''s membership becomes departed and every HR '
       || 'surface goes dark. Standing in the directory must come from a live membership — an '
       || 'employee ROW survives termination on purpose, and gating on it alone served the live '
       || 'roster to people who had left.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_directory_list'
                     and c.home_migration = 'continued_access_08_departed_means_the_directory_too.sql');

do $chk$
declare v_broken int; v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_directory_list';
  if position('iam.organization_member om' in v_def) = 0 then
    raise exception 'continued_access_08: the directory standing fix did not land';
  end if;
  if position('v_strip' in v_def) = 0 then
    raise exception 'continued_access_08: the hr_l1_65 narrowing was lost';
  end if;
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname in ('public.hr_directory_list');
  if v_broken > 0 then
    raise exception 'continued_access_08: % contract clause(s) broken on hr_directory_list', v_broken;
  end if;
  if not exists (select 1 from information_schema.routine_privileges
                  where routine_name = 'hr_directory_list' and grantee = 'authenticated'
                    and privilege_type = 'EXECUTE') then
    raise exception 'continued_access_08: authenticated lost EXECUTE on the directory door';
  end if;
  raise notice 'continued_access_08: the directory is dark for a departed person; the return works';
end
$chk$;
