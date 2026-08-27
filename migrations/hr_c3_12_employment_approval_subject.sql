-- HR domain C3 — migration 12 (register item HRB-007 follow-up, lane core-c3-access).
--
-- 🚨 `hr.employment` — THE ACCESS ROOT ITSELF — WAS MISSING FROM THE APPROVAL-SUBJECT ALLOWLIST,
-- and it is what made `hrb008_proof.py` red. Measured, not guessed: the C4 suite's first red is
--
--     approval_subject_unmapped: hr.can_approve cannot resolve a subject for hr.employment
--     (hr.can_approve: hr.employment is not an approvable target table)
--
-- and the other six FAILs cascade from it — the termination instance never opens, so every later
-- step reports `WF_STEP_CLOSED` and the parallel offboarding group never fans out. **One root
-- cause, seven red lines.**
--
-- This is the SAME class as the gap C4 raised earlier in this hardening batch, one table short.
-- That fix added the three PERSON-scoped targets (`hr.employee`, `hr.employee_private`,
-- `hr.emergency_contact`), each resolving through the employee's current spell. It did not add the
-- SPELL itself — and `termination_approve` targets exactly that: `hr.employment` IS the subject,
-- so the resolution is the row's own id. Missing it meant the one workflow every offboarding runs
-- could not route at all.
--
-- RECORDED TECHNICAL DECISION: the row is looked up rather than the argument returned blindly.
-- `hr._approval_subject` returning a non-existent id would hand `hr.can_approve` a phantom subject,
-- and rule 1 (never-approve-yourself) compares that subject against the caller's employments — a
-- phantom can never match, so the veto would silently pass for a target that does not exist. A
-- deleted or unknown employment resolves to NULL, which is the honest "there is no subject here".
--
-- Authority: SPEC-ACCESS §1.3a (`termination_approve`), §1.3b rule 1; SPEC-WORKFLOW-ENGINE §1.1.
-- Applied live as `hr_c3_12_employment_approval_subject`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

create or replace function hr._approval_subject(p_target_table text, p_target_id uuid)
returns uuid
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_col text; v_sub uuid; v_emp uuid;
begin
  -- 🚨 THE SPELL ITSELF. `termination_approve` targets hr.employment, so the subject IS the row.
  -- Looked up rather than echoed back: a phantom id would give hr.can_approve a subject that can
  -- never match any caller's employments, and never-approve-yourself would silently pass.
  if p_target_table = 'hr.employment' then
    select em.id into v_sub from hr.employment em
     where em.id = p_target_id and em.deleted_at is null;
    return v_sub;
  end if;

  -- the PERSON-scoped targets: resolve the employee, then their current spell
  if p_target_table in ('hr.employee','hr.employee_private','hr.emergency_contact') then
    if p_target_table = 'hr.employee' then
      v_emp := p_target_id;
    else
      execute format('select employee_id from %I.%I where id = $1',
                     'hr', split_part(p_target_table,'.',2)) into v_emp using p_target_id;
    end if;
    if v_emp is null then return null; end if;
    select em.id into v_sub
      from hr.employment em
     where em.employee_id = v_emp and em.deleted_at is null
     order by em.hire_date desc limit 1;
    return v_sub;
  end if;

  v_col := case p_target_table
    when 'hr.leave_request'         then 'employment_id'
    when 'hr.leave_case'            then 'employment_id'
    when 'hr.pay_period_employment' then 'employment_id'
    when 'hr.time_adjustment'       then 'employment_id'
    when 'hr.overtime_preapproval'  then 'employment_id'
    when 'hr.shift_claim'           then 'requester_employment_id'
    when 'hr.schedule_change'       then 'employment_id'
    when 'hr.availability'          then 'employment_id'
    when 'hr.compensation'          then 'employment_id'
    when 'hr.position_assignment'   then 'employment_id'
    when 'hr.corrective_action'     then 'employment_id'
    when 'hr.separation'            then 'employment_id'
    when 'hr.training_assignment'   then 'employment_id'
    when 'hr.checklist_item'        then 'assignee_employment_id'
    when 'hr.requisition'           then null
    when 'hr.offer'                 then null
    when 'hr.background_check'      then 'employment_id'
    when 'hr.tax_withholding'       then 'employment_id'
    when 'hr.schedule'              then null
    else '!unknown'
  end;

  if v_col = '!unknown' then
    raise exception 'hr.can_approve: % is not an approvable target table', p_target_table
      using errcode = '22023',
            hint = 'Add it to hr._approval_subject''s allowlist together with the column that names its subject employment.';
  end if;

  if v_col is null then
    -- a target with no subject employment at all (a requisition, a schedule, an offer to an
    -- outsider). There is nobody to be, so rule 1 cannot fire and the resolver returns NULL.
    return null;
  end if;

  execute format('select %I from %I.%I where id = $1',
                 v_col, split_part(p_target_table,'.',1), split_part(p_target_table,'.',2))
     into v_sub using p_target_id;
  return v_sub;
end
$fn$;

revoke all on function hr._approval_subject(text, uuid) from public;
revoke all on function hr._approval_subject(text, uuid) from anon;
grant execute on function hr._approval_subject(text, uuid) to authenticated, service_role;

-- ============================================================ assertions
do $$
declare v_bad int;
begin
  -- every target SPEC-WORKFLOW-ENGINE's 23 flows can name must resolve rather than raise
  begin
    perform hr._approval_subject('hr.employment', gen_random_uuid());
    perform hr._approval_subject('hr.employee', gen_random_uuid());
    perform hr._approval_subject('hr.employee_private', gen_random_uuid());
    perform hr._approval_subject('hr.emergency_contact', gen_random_uuid());
    perform hr._approval_subject('hr.separation', gen_random_uuid());
  exception when others then
    raise exception 'hr_c3_12: an approvable target still raises: %', sqlerrm;
  end;

  -- a phantom id resolves to NULL, never to itself — otherwise the never-self veto passes silently
  if hr._approval_subject('hr.employment', gen_random_uuid()) is not null then
    raise exception 'hr_c3_12: a non-existent employment resolved to a subject';
  end if;

  -- and an unknown table still raises, because that is a programming error and not a refusal
  begin
    perform hr._approval_subject('hr.not_a_table', gen_random_uuid());
    raise exception 'hr_c3_12: an unknown target table no longer raises';
  exception when sqlstate '22023' then null;
  end;

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_12: % hr tokens no longer certify', v_bad;
  end if;
end $$;
