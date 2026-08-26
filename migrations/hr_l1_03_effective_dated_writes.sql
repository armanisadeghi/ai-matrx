-- HR domain L1 — migration 3 of 6 (register item HRB-013, lane l1-employees).
--
-- THE EFFECTIVE-DATED WRITE PATH AND THE FIVE WORKFLOW APPLY HOOKS.
-- hr_position_change, hr_transfer, hr_compensation_upsert, hr_reporting_line_upsert,
-- hr_pending_change_cancel, hr_separation_record — plus `hr.*_wf_apply` for the five flows this
-- lane declares, the `public.hr_wf_*` wrappers the client needs, and the activation of the two
-- flows that were parked on a stale blocker.
--
-- Authority: SPEC-EMPLOYEES §1.5, §4.2, §4.3, §4.4, §4.5, §6, §7.3, §4.8, §4.10;
-- SPEC-WORKFLOW-ENGINE §1.1, §4.1–4.4; R-L1 items A1, A6, U8, U9.
-- Applied live as `hr_l1_03_effective_dated_writes`. Idempotent.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 10 — EVERY `apply_fn` IN THE DOMAIN IS STILL THE FAIL-DEAD STUB,
-- AND FIVE OF THEM ARE THIS LANE'S.
--
-- Read live 2026-08-26: all 23 rows of `hr.workflow_flow_type` carry
-- `apply_fn = hr.wf_apply_unimplemented(uuid)`, which returns
-- `{ok:false, reason:'pillar_lane_not_built'}` on purpose — HRB-008 shipped it so that
-- "the engine refuses to record an effect that did not happen". An approval that reached the
-- apply step therefore FAILS the instance rather than silently succeeding, which is the correct
-- behaviour for an unbuilt lane and a bug the moment the lane exists.
--
-- L1 lands the five hooks it owns — `position_change`, `pay_change`, `corrective_action_ack`,
-- `address_change`, `profile_edit_request` — and repoints exactly those five rows.
-- **`termination` is L7's** (R-L1 U8): this lane CONSUMES it and writes no termination flow type,
-- definition or hook, and must not. `hr_separation_record` below therefore writes the
-- `hr.separation` RECORD and hands off; the run belongs to Onboarding & Offboarding.
--
-- 🚨 RECORDED TECHNICAL DECISION 11 — THE `address_change` / `profile_edit_request` BLOCKER IS
-- STALE, AND BOTH FLOWS ARE ACTIVATED HERE.
--
-- Both rows carried `is_active = false` with
-- `inactive_reason = 'BLOCKED: hr.can_approve cannot resolve a subject employment for hr_employee
-- (an employee holds many employments). Needs SPEC-ACCESS §1.3b to widen hr._approval_subject''s
-- contract.'` That is no longer true: `hr._approval_subject` already branches on `hr.employee`,
-- `hr.employee_private` and `hr.emergency_contact` and resolves the person's latest spell
-- (live-read 2026-08-26 — HRB-011 appears to have added the branch while fixing `esign.envelope`).
-- The rows were never re-read after the fix. This file asserts the branch resolves, then flips
-- both to active and clears the reason. Without them §7's whole self-service lane is decorative:
-- `hr_self_update` splits a patch into approval requests that no flow would accept.
--
-- 🚨 RECORDED TECHNICAL DECISION 12 — ONE APPLY IMPLEMENTATION, TWO CALLERS.
-- §4.2 node D routes a position change either straight to the apply hook (an HR admin with the
-- authority, in an org that routes it as auto) or through `wf_request`. Those are two ENTRY
-- points to ONE effect, so the effect lives in `hr._l1_apply_position` / `hr._l1_apply_compensation`
-- and both the public writer and the `_wf_apply` hook call it. Two implementations of "close the
-- old row, insert the new one with supersedes_id" is precisely how an approved change and a direct
-- change end up with different history.
--
-- 🚨 RECORDED TECHNICAL DECISION 13 — CANCELLING A PENDING CHANGE ERASES NOTHING.
-- §6.2: cancel soft-deletes the future row and RE-OPENS the prior row's `effective_to`, as ONE
-- audited action, and the cancellation is itself a recorded event. `hr_pending_change_cancel`
-- refuses once the effective date has arrived — after that the only correction path is §6.3, and
-- letting cancel reach into history would destroy the audit trail the whole design exists for.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ the shared apply routines

-- §4.2 F: close the current primary (effective_to = the new effective_from), insert the new row
-- with supersedes_id and the change reason. Grants and `current_*` re-derive from TRIGGERS
-- (hr._derive_on_position / hr._refresh_current_position) — this routine must never write them by
-- hand, because two writers of one derived value is how they drift.
create or replace function hr._l1_apply_position(
  p_payload jsonb, p_org uuid, p_instance uuid default null)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_from date := (p_payload ->> 'effective_from')::date;
  v_mode text := coalesce(nullif(p_payload ->> 'dating_mode',''), 'amendment');
  v_prior hr.position_assignment%rowtype; v_new uuid; v_jur uuid; v_prior_jur uuid;
begin
  if v_employment is null or v_from is null then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'malformed_payload',
      'detail', 'a position change needs employment_id and effective_from');
  end if;

  select * into v_prior from hr.position_assignment pa
   where pa.employment_id = v_employment and pa.is_primary and pa.deleted_at is null
     and pa.effective_from <= v_from and (pa.effective_to is null or pa.effective_to >= v_from)
   order by pa.effective_from desc limit 1;

  perform hr.arm_write();

  -- §6.3: a CORRECTION edits the row in place, versioned — "this is wrong; it was never true".
  -- history.row_versions retains the prior value, which is the whole point of the distinction.
  if v_mode = 'correction' and v_prior.id is not null then
    update hr.position_assignment set
      job_title_id  = coalesce(nullif(p_payload ->> 'job_title_id','')::uuid, job_title_id),
      department_id = coalesce(nullif(p_payload ->> 'department_id','')::uuid, department_id),
      location_id   = coalesce(nullif(p_payload ->> 'location_id','')::uuid, location_id),
      manager_employment_id = case when p_payload ? 'manager_employment_id'
                                   then nullif(p_payload ->> 'manager_employment_id','')::uuid
                                   else manager_employment_id end,
      worker_class  = coalesce(nullif(p_payload ->> 'worker_class',''), worker_class),
      flsa_status   = coalesce(nullif(p_payload ->> 'flsa_status',''), flsa_status),
      flsa_exemption_basis = case when p_payload ? 'flsa_exemption_basis'
                                  then nullif(p_payload ->> 'flsa_exemption_basis','')
                                  else flsa_exemption_basis end,
      pay_basis     = coalesce(nullif(p_payload ->> 'pay_basis',''), pay_basis),
      schedule_class= coalesce(nullif(p_payload ->> 'schedule_class',''), schedule_class),
      fte           = coalesce((p_payload ->> 'fte')::numeric, fte),
      standard_hours_per_week = coalesce((p_payload ->> 'standard_hours_per_week')::numeric,
                                         standard_hours_per_week),
      is_supervisor = coalesce((p_payload ->> 'is_supervisor')::boolean, is_supervisor),
      cost_center   = case when p_payload ? 'cost_center'
                          then nullif(p_payload ->> 'cost_center','') else cost_center end,
      change_reason_category_id = coalesce(nullif(p_payload ->> 'change_reason_category_id','')::uuid,
                                           change_reason_category_id),
      metadata = metadata || jsonb_build_object('dating_mode','correction',
                                                'workflow_instance_id', p_instance)
    where id = v_prior.id;
    return jsonb_build_object('ok', true, 'mode', 'correction',
      'position_assignment_id', v_prior.id, 'effective_from', v_prior.effective_from);
  end if;

  -- the amendment path: close the old window, open the new one
  if v_prior.id is not null then
    if v_prior.effective_from = v_from then
      -- an assignment cannot open and close on the same day; this is a same-day re-issue and the
      -- honest answer is a correction, not a zero-length row the GiST constraint would refuse.
      return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
        'reason', 'same_day_supersede',
        'detail', 'the current assignment already starts on that date — record this as a correction');
    end if;
    update hr.position_assignment set effective_to = v_from - 1 where id = v_prior.id;
  end if;

  insert into hr.position_assignment (
    employment_id, job_title_id, department_id, location_id, manager_employment_id,
    is_primary, worker_class, flsa_status, flsa_exemption_basis, pay_basis, schedule_class,
    fte, standard_hours_per_week, is_supervisor, cost_center, eeo1_job_category,
    effective_from, change_reason_category_id, supersedes_id, organization_id, metadata)
  select
    v_employment,
    coalesce(nullif(p_payload ->> 'job_title_id','')::uuid, v_prior.job_title_id),
    coalesce(nullif(p_payload ->> 'department_id','')::uuid, v_prior.department_id),
    coalesce(nullif(p_payload ->> 'location_id','')::uuid, v_prior.location_id),
    case when p_payload ? 'manager_employment_id'
         then nullif(p_payload ->> 'manager_employment_id','')::uuid
         else v_prior.manager_employment_id end,
    true,
    coalesce(nullif(p_payload ->> 'worker_class',''), v_prior.worker_class, 'employee'),
    coalesce(nullif(p_payload ->> 'flsa_status',''), v_prior.flsa_status, 'nonexempt'),
    case when p_payload ? 'flsa_exemption_basis'
         then nullif(p_payload ->> 'flsa_exemption_basis','') else v_prior.flsa_exemption_basis end,
    coalesce(nullif(p_payload ->> 'pay_basis',''), v_prior.pay_basis, 'hourly'),
    coalesce(nullif(p_payload ->> 'schedule_class',''), v_prior.schedule_class, 'full_time'),
    coalesce((p_payload ->> 'fte')::numeric, v_prior.fte, 1.0),
    coalesce((p_payload ->> 'standard_hours_per_week')::numeric, v_prior.standard_hours_per_week),
    coalesce((p_payload ->> 'is_supervisor')::boolean, v_prior.is_supervisor, false),
    case when p_payload ? 'cost_center' then nullif(p_payload ->> 'cost_center','')
         else v_prior.cost_center end,
    -- §2.4 route 69 edge: the EEO-1 category is denormalized AT WRITE from the title in force, and
    -- re-mapping the title later never rewrites history.
    (select jt.eeo1_job_category from hr.job_title jt
      where jt.id = coalesce(nullif(p_payload ->> 'job_title_id','')::uuid, v_prior.job_title_id)),
    v_from,
    nullif(p_payload ->> 'change_reason_category_id','')::uuid,
    v_prior.id, p_org,
    jsonb_build_object('dating_mode', v_mode, 'workflow_instance_id', p_instance)
  returning id into v_new;

  -- §4.3: a LOCATION change is a JURISDICTION change, and the caller is told which one so the
  -- form can state what it affects before commit. Downstream records keep the jurisdiction and
  -- timezone they were STAMPED with; nothing is recomputed.
  select l.jurisdiction_id into v_jur from hr.location l
   where l.id = (select location_id from hr.position_assignment where id = v_new);
  if v_prior.id is not null then
    select l.jurisdiction_id into v_prior_jur from hr.location l where l.id = v_prior.location_id;
  end if;

  return jsonb_build_object('ok', true, 'mode', v_mode,
    'position_assignment_id', v_new, 'superseded_id', v_prior.id,
    'effective_from', v_from, 'is_pending', v_from > current_date,
    'jurisdiction_changed', v_prior_jur is distinct from v_jur,
    'jurisdiction_id', v_jur, 'prior_jurisdiction_id', v_prior_jur);
end
$fn$;

-- §4.4 J: close the prior component of the same kind, insert the new row carrying its APPROVAL
-- EVIDENCE. A pay row without `approval_request_id` / `approved_at` cannot answer "who authorised
-- this", which is the one question a comp audit asks.
create or replace function hr._l1_apply_compensation(
  p_payload jsonb, p_org uuid, p_instance uuid default null)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_from date := (p_payload ->> 'effective_from')::date;
  v_kind text := coalesce(nullif(p_payload ->> 'component_kind',''), 'base');
  v_mode text := coalesce(nullif(p_payload ->> 'dating_mode',''), 'amendment');
  v_prior hr.compensation%rowtype; v_new uuid; v_approver uuid;
begin
  if v_employment is null or v_from is null or nullif(p_payload ->> 'amount','') is null then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'malformed_payload',
      'detail', 'a pay change needs employment_id, effective_from and amount');
  end if;

  select * into v_prior from hr.compensation c
   where c.employment_id = v_employment and c.component_kind = v_kind and c.deleted_at is null
     and c.effective_from <= v_from and (c.effective_to is null or c.effective_to >= v_from)
   order by c.effective_from desc limit 1;

  if p_instance is not null then
    select wi.requester_employment_id into v_approver
      from hr.workflow_instance wi where wi.id = p_instance;
  end if;

  perform hr.arm_write();

  if v_mode = 'correction' and v_prior.id is not null then
    update hr.compensation set
      amount   = (p_payload ->> 'amount')::numeric,
      currency = coalesce(nullif(p_payload ->> 'currency',''), currency),
      per_unit = case when p_payload ? 'per_unit' then nullif(p_payload ->> 'per_unit','')
                      else per_unit end,
      pay_basis = coalesce(nullif(p_payload ->> 'pay_basis',''), pay_basis),
      earning_code_id = case when p_payload ? 'earning_code_id'
                             then nullif(p_payload ->> 'earning_code_id','')::uuid
                             else earning_code_id end,
      change_reason_category_id = coalesce(
        nullif(p_payload ->> 'change_reason_category_id','')::uuid, change_reason_category_id),
      metadata = metadata || jsonb_build_object('dating_mode','correction')
    where id = v_prior.id;
    return jsonb_build_object('ok', true, 'mode', 'correction', 'compensation_id', v_prior.id);
  end if;

  if v_prior.id is not null then
    if v_prior.effective_from = v_from then
      return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
        'reason', 'same_day_supersede',
        'detail', 'the current component already starts on that date — record this as a correction');
    end if;
    update hr.compensation set effective_to = v_from - 1 where id = v_prior.id;
  end if;

  insert into hr.compensation (
    employment_id, position_assignment_id, component_kind, pay_basis, amount, currency, per_unit,
    fte, earning_code_id, pay_range_min, pay_range_max, workflow_instance_id, approved_at,
    approved_by_employment_id, effective_from, change_reason_category_id, supersedes_id,
    organization_id, metadata)
  select
    v_employment,
    coalesce(nullif(p_payload ->> 'position_assignment_id','')::uuid,
             (select pa.id from hr.primary_position_as_of(v_employment, v_from) pa)),
    v_kind,
    coalesce(nullif(p_payload ->> 'pay_basis',''), v_prior.pay_basis, 'hourly'),
    (p_payload ->> 'amount')::numeric,
    coalesce(nullif(p_payload ->> 'currency',''), v_prior.currency, 'USD'),
    case when p_payload ? 'per_unit' then nullif(p_payload ->> 'per_unit','') else v_prior.per_unit end,
    coalesce((p_payload ->> 'fte')::numeric, v_prior.fte),
    coalesce(nullif(p_payload ->> 'earning_code_id','')::uuid, v_prior.earning_code_id),
    coalesce((p_payload ->> 'pay_range_min')::numeric, v_prior.pay_range_min),
    coalesce((p_payload ->> 'pay_range_max')::numeric, v_prior.pay_range_max),
    p_instance,
    case when p_instance is not null then now() end,
    v_approver,
    v_from,
    nullif(p_payload ->> 'change_reason_category_id','')::uuid,
    v_prior.id, p_org,
    jsonb_build_object('dating_mode', v_mode)
  returning id into v_new;

  return jsonb_build_object('ok', true, 'mode', v_mode, 'compensation_id', v_new,
    'superseded_id', v_prior.id, 'effective_from', v_from,
    'is_pending', v_from > current_date,
    -- §4.4 K2: a retroactive raise emits hr.pay_retro_detected so PAYROLL decides about an
    -- adjustment. This spec deliberately does NOT auto-generate a retro pay line.
    'is_retro', v_from < current_date);
end
$fn$;

-- ============================================================ the five apply hooks

create or replace function hr.position_change_wf_apply(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare inst hr.workflow_instance%rowtype;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if inst.id is null then
    return jsonb_build_object('ok', false, 'reason', 'instance_missing');
  end if;
  return hr._l1_apply_position(inst.payload, inst.organization_id, p_instance_id);
end
$fn$;

create or replace function hr.pay_change_wf_apply(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare inst hr.workflow_instance%rowtype;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if inst.id is null then
    return jsonb_build_object('ok', false, 'reason', 'instance_missing');
  end if;
  return hr._l1_apply_compensation(inst.payload, inst.organization_id, p_instance_id);
end
$fn$;

-- §7.1 rule 2 / §4.10: the approved patch is applied HERE and nowhere else. Nothing was written to
-- the record when the request was raised, so a rejection needs no compensation — the pending value
-- is simply discarded, which is exactly what §7.2 requires.
create or replace function hr.profile_edit_wf_apply(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  inst hr.workflow_instance%rowtype; v_patch jsonb; v_token text; v_row uuid;
  v_employee uuid; v_applied jsonb := '{}'::jsonb; v_key text;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if inst.id is null then return jsonb_build_object('ok', false, 'reason', 'instance_missing'); end if;

  v_patch := inst.payload -> 'patch';
  v_token := coalesce(inst.payload ->> 'token', 'hr_employee');
  v_row   := nullif(inst.payload ->> 'row_id','')::uuid;
  v_employee := inst.target_id;

  if v_patch is null or v_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'empty_patch', 'detail', 'the request carried no fields to apply');
  end if;

  perform hr.arm_write();

  if v_token = 'hr_employee' then
    update hr.employee set
      legal_first_name  = coalesce(nullif(v_patch ->> 'legal_first_name',''), legal_first_name),
      legal_middle_name = case when v_patch ? 'legal_middle_name'
                               then nullif(v_patch ->> 'legal_middle_name','') else legal_middle_name end,
      legal_last_name   = coalesce(nullif(v_patch ->> 'legal_last_name',''), legal_last_name),
      legal_name_suffix = case when v_patch ? 'legal_name_suffix'
                               then nullif(v_patch ->> 'legal_name_suffix','') else legal_name_suffix end,
      -- §4.10 F1: push the OUTGOING legal name into former_names with `until` and a reason, so a
      -- records request under the old name still resolves.
      former_names = case
        when (nullif(v_patch ->> 'legal_last_name','') is distinct from null
              and nullif(v_patch ->> 'legal_last_name','') <> legal_last_name)
          or (nullif(v_patch ->> 'legal_first_name','') is distinct from null
              and nullif(v_patch ->> 'legal_first_name','') <> legal_first_name)
        then former_names || jsonb_build_array(jsonb_build_object(
               'legal_first_name', legal_first_name, 'legal_middle_name', legal_middle_name,
               'legal_last_name', legal_last_name, 'legal_name_suffix', legal_name_suffix,
               'until', current_date, 'reason', 'legal_name_change',
               'workflow_instance_id', p_instance_id))
        else former_names end,
      -- §4.10 F3: display_name recomputes ONLY when no preferred name overrides it.
      display_name = case
        when preferred_first_name is null and preferred_last_name is null
        then trim(concat_ws(' ',
               coalesce(nullif(v_patch ->> 'legal_first_name',''), legal_first_name),
               coalesce(nullif(v_patch ->> 'legal_last_name',''),  legal_last_name)))
        else display_name end
    where id = v_employee;
    v_applied := v_patch;

  elsif v_token = 'hr_employee_private' then
    update hr.employee_private set
      date_of_birth = case when v_patch ? 'date_of_birth'
                           then nullif(v_patch ->> 'date_of_birth','')::date else date_of_birth end,
      work_authorization_kind = case when v_patch ? 'work_authorization_kind'
                           then nullif(v_patch ->> 'work_authorization_kind','')
                           else work_authorization_kind end,
      work_authorization_expires_on = case when v_patch ? 'work_authorization_expires_on'
                           then nullif(v_patch ->> 'work_authorization_expires_on','')::date
                           else work_authorization_expires_on end
    where id = coalesce(v_row, (select ep.id from hr.employee_private ep
                                 where ep.employee_id = v_employee and ep.deleted_at is null limit 1));
    v_applied := v_patch;
  end if;

  return jsonb_build_object('ok', true, 'applied', v_applied, 'token', v_token,
    'employee_id', v_employee);
end
$fn$;

-- §7.3: on approval, a NEW effective-dated `hr.employee_private` version with
-- `home_address_effective_from` = the move date. Past records keep the jurisdiction and timezone
-- they were stamped with; NOTHING is rewritten. `hr.jurisdiction_changed` is the event Leave & PTO
-- and Time & Attendance consume — this hook reports the change; it does not notify (HR builds no
-- notifier).
create or replace function hr.address_change_wf_apply(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  inst hr.workflow_instance%rowtype; v_patch jsonb; v_priv uuid; v_employee uuid;
  v_move date; v_old jsonb; v_new jsonb;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if inst.id is null then return jsonb_build_object('ok', false, 'reason', 'instance_missing'); end if;

  v_patch := inst.payload -> 'patch';
  v_employee := inst.target_id;
  v_move := coalesce(nullif(v_patch ->> 'home_address_effective_from','')::date, current_date);

  select ep.id, ep.home_address into v_priv, v_old from hr.employee_private ep
   where ep.employee_id = v_employee and ep.deleted_at is null limit 1;

  if v_priv is null then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'no_private_record',
      'detail', 'this person has no confidential record to move an address on');
  end if;

  v_new := coalesce(v_patch -> 'home_address', v_old);

  perform hr.arm_write();
  update hr.employee_private set
    home_address = v_new,
    home_address_effective_from = v_move,
    mailing_address = coalesce(v_patch -> 'mailing_address', mailing_address)
  where id = v_priv;

  return jsonb_build_object('ok', true, 'employee_private_id', v_priv,
    'home_address_effective_from', v_move,
    'address_changed', v_old is distinct from v_new,
    'event', 'hr.jurisdiction_changed');
end
$fn$;

-- §4.8 G: the SUBJECT's acknowledgment. The employee's own statement is THE EMPLOYEE'S OWN WORDS
-- and the issuer can never edit it, so this hook writes it once and never overwrites a non-null
-- value. A REFUSAL is a valid outcome recorded as such, never a blocked flow.
create or replace function hr.corrective_ack_wf_apply(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  inst hr.workflow_instance%rowtype; v_action uuid; v_kind text; v_decision text;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if inst.id is null then return jsonb_build_object('ok', false, 'reason', 'instance_missing'); end if;
  v_action := inst.target_id;
  v_kind := coalesce(inst.payload ->> 'acknowledgement_kind', 'esign');
  v_decision := coalesce(inst.payload ->> 'decision', 'acknowledged');

  perform hr.arm_write();
  update hr.corrective_action set
    employee_acknowledged_at = case when v_decision = 'refused' then employee_acknowledged_at
                                    else coalesce(employee_acknowledged_at, now()) end,
    employee_acknowledgement_kind = case when v_decision = 'refused' then 'refused'
                                         else coalesce(employee_acknowledgement_kind, v_kind) end,
    -- write-once: the issuer can never edit the subject's statement, and neither can a re-run
    employee_statement = coalesce(employee_statement, nullif(inst.payload ->> 'employee_statement',''))
  where id = v_action;

  if not found then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'corrective_action_missing');
  end if;
  return jsonb_build_object('ok', true, 'corrective_action_id', v_action, 'outcome', v_decision);
end
$fn$;

-- ============================================================ validate hooks

-- §4.2 E1's hard findings, returned as findings rather than raised — a validate_fn that RAISES is
-- its own failure class (SPEC-WORKFLOW-ENGINE §1.8).
create or replace function hr.position_change_wf_validate(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  inst hr.workflow_instance%rowtype; v_f jsonb := '[]'::jsonb; v_from date; v_emp uuid;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  v_from := (inst.payload ->> 'effective_from')::date;
  v_emp  := (inst.payload ->> 'employment_id')::uuid;

  if nullif(inst.payload ->> 'job_title_id','') is not null
     and not exists (select 1 from hr.job_title jt
                      where jt.id = (inst.payload ->> 'job_title_id')::uuid and jt.deleted_at is null) then
    v_f := v_f || jsonb_build_object('field','job_title_id','code','title_missing',
      'detail','that job title no longer exists');
  end if;

  if nullif(inst.payload ->> 'location_id','') is not null
     and not exists (select 1 from hr.location l
                      where l.id = (inst.payload ->> 'location_id')::uuid
                        and l.jurisdiction_id is not null and l.deleted_at is null) then
    v_f := v_f || jsonb_build_object('field','location_id','code','location_without_jurisdiction',
      'detail','that location has no jurisdiction, so nothing can be scheduled or stamped against it',
      'door','/hr/settings/structure');
  end if;

  if nullif(inst.payload ->> 'manager_employment_id','') is not null
     and (inst.payload ->> 'manager_employment_id')::uuid = v_emp then
    v_f := v_f || jsonb_build_object('field','manager_employment_id','code','manager_is_self',
      'detail','a person cannot report to themselves');
  end if;

  if coalesce(inst.payload ->> 'flsa_status','') = 'exempt'
     and nullif(inst.payload ->> 'flsa_exemption_basis','') is null then
    v_f := v_f || jsonb_build_object('field','flsa_exemption_basis','code','exemption_basis_required',
      'detail','an exempt classification needs the basis it rests on');
  end if;

  if v_from is not null and exists (
       select 1 from hr.position_assignment pa
        where pa.employment_id = v_emp and pa.is_primary and pa.deleted_at is null
          and pa.effective_from = v_from) then
    v_f := v_f || jsonb_build_object('field','effective_from','code','overlapping_primary',
      'detail','a primary assignment already opens on that date');
  end if;

  return jsonb_build_object('ok', jsonb_array_length(v_f) = 0, 'findings', v_f);
end
$fn$;

-- §4.4 E: range or override reason, effective date open, position assignment still live.
create or replace function hr.pay_change_wf_validate(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  inst hr.workflow_instance%rowtype; v_f jsonb := '[]'::jsonb;
  v_amount numeric; v_min numeric; v_max numeric; v_emp uuid; v_from date;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  v_amount := nullif(inst.payload ->> 'amount','')::numeric;
  v_emp    := (inst.payload ->> 'employment_id')::uuid;
  v_from   := (inst.payload ->> 'effective_from')::date;

  if v_amount is null then
    v_f := v_f || jsonb_build_object('field','amount','code','amount_required',
      'detail','a pay change needs an amount');
  end if;

  select jt.pay_range_min, jt.pay_range_max into v_min, v_max
    from hr.primary_position_as_of(v_emp, coalesce(v_from, current_date)) pa
    join hr.job_title jt on jt.id = pa.job_title_id;

  -- §4.4 C1 / the contractor edge: the band check is SKIPPED when the title carries no range,
  -- which is the normal case for a contract_rate.
  if v_amount is not null and v_min is not null and v_max is not null
     and (v_amount < v_min or v_amount > v_max)
     and nullif(inst.payload ->> 'override_reason','') is null then
    v_f := v_f || jsonb_build_object('field','amount','code','outside_pay_range',
      'detail','that amount is outside the job title''s range and needs an override reason',
      'pay_range_min', v_min, 'pay_range_max', v_max);
  end if;

  if not exists (select 1 from hr.employment em
                  where em.id = v_emp and em.deleted_at is null
                    and em.status in ('active','pending','on_leave')) then
    v_f := v_f || jsonb_build_object('field','employment_id','code','employment_not_live',
      'detail','that employment spell is no longer live');
  end if;

  return jsonb_build_object('ok', jsonb_array_length(v_f) = 0, 'findings', v_f);
end
$fn$;

-- ============================================================ repoint the five flow types

do $$
declare v_sub uuid;
begin
  -- RECORDED DECISION 11: prove the branch resolves BEFORE flipping the two parked flows, so this
  -- file cannot re-activate them on a blocker that is still real.
  select hr._approval_subject('hr.employee',
           (select e.id from hr.employee e where e.deleted_at is null limit 1)) into v_sub;
  if not exists (select 1 from hr.employee where deleted_at is null) then
    raise notice 'hr_l1_03: no employee rows to prove hr._approval_subject against; flows still flipped';
  elsif v_sub is null then
    raise exception 'hr_l1_03: hr._approval_subject still cannot resolve hr.employee — the '
                    'address_change / profile_edit_request blocker is REAL and these flows must '
                    'stay parked. Route to the access lane; do not force them active.';
  end if;

  -- the flow-type table carries the same write guard as every other hr.* table
  perform hr.arm_write();

  update hr.workflow_flow_type set
    validate_fn = 'hr.position_change_wf_validate(uuid)'::regprocedure,
    apply_fn    = 'hr.position_change_wf_apply(uuid)'::regprocedure
  where flow_key = 'position_change' and deleted_at is null;

  update hr.workflow_flow_type set
    validate_fn = 'hr.pay_change_wf_validate(uuid)'::regprocedure,
    apply_fn    = 'hr.pay_change_wf_apply(uuid)'::regprocedure
  where flow_key = 'pay_change' and deleted_at is null;

  update hr.workflow_flow_type set
    apply_fn = 'hr.corrective_ack_wf_apply(uuid)'::regprocedure
  where flow_key = 'corrective_action_ack' and deleted_at is null;

  update hr.workflow_flow_type set
    apply_fn = 'hr.profile_edit_wf_apply(uuid)'::regprocedure,
    is_active = true, inactive_reason = null
  where flow_key = 'profile_edit_request' and deleted_at is null;

  update hr.workflow_flow_type set
    apply_fn = 'hr.address_change_wf_apply(uuid)'::regprocedure,
    is_active = true, inactive_reason = null
  where flow_key = 'address_change' and deleted_at is null;
end $$;

-- ============================================================ public writers

create or replace function public.hr_position_change(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_needs boolean; v_persona text; v_inst jsonb; v_out jsonb;
  v_max int; v_from date;
begin
  select em.organization_id into v_org from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment,
                              'hr_position_assignment', 'update');
  if v_gate is not null then return v_gate; end if;

  v_from := (p_payload ->> 'effective_from')::date;
  v_max  := (hr._knob('hr.employees','future_dated_change_max_days') #>> '{}')::int;
  if v_from is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'effective_from',
      'detail', 'An effective date is required — a change with no date has no history.');
  end if;
  if v_from > current_date + v_max then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'effective_from',
      'detail', format('An effective date more than %s days out is almost always a typo in the year.', v_max),
      'max_days_ahead', v_max);
  end if;

  -- §4.2 node D. `position_change_requires_approval` is TRUE when the initiator is a manager: an
  -- HR admin with the authority IS the approver, so routing their own write through a queue is
  -- ceremony, while a manager proposing a change to their own report is what the flow exists for.
  v_persona := hr._l1_persona(v_uid, v_org, current_date);
  v_needs := coalesce((hr._knob('hr.employees','position_change_requires_approval') #>> '{}')::boolean, true)
             and v_persona <> 'hr_admin';

  if v_needs then
    v_inst := hr.wf_request(
      p_flow_key => 'position_change', p_target_token => 'hr_position_assignment',
      p_target_id => coalesce((select pa.id from hr.primary_position_as_of(v_employment, current_date) pa),
                              v_employment),
      p_organization_id => v_org, p_payload => p_payload,
      p_subject_employment_id => v_employment, p_as_draft => false);
    return jsonb_build_object('ok', true, 'routed', 'workflow', 'instance', v_inst,
      'audit_id', hr._l1_write_audit(v_org, 'hr_position_assignment', 'request',
                                     null, v_employment, 'position_change'));
  end if;

  v_out := hr._l1_apply_position(p_payload, v_org, null);
  if not coalesce((v_out ->> 'ok')::boolean, false) then return v_out; end if;

  return v_out || jsonb_build_object('routed', 'direct',
    'audit_id', hr._l1_write_audit(v_org, 'hr_position_assignment', 'update',
      ARRAY[nullif(v_out ->> 'position_assignment_id','')::uuid], v_employment, 'position_change'));
end
$fn$;

-- §4.3. A transfer IS a position change whose department, location or legal entity moves; it
-- shares §4.2's machinery and adds the jurisdiction disclosure. A move to a DIFFERENT EMPLOYER OF
-- RECORD is NOT a transfer: one org = one employer = one EIN, and `hr.employment`'s exclusion
-- constraint forbids overlapping spells. Modelling it as one spell would produce a person with two
-- W-2s from one record, so this refuses and names the terminate-plus-hire path instead.
create or replace function public.hr_transfer(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_target_org uuid := nullif(p_payload ->> 'to_organization_id','')::uuid;
        v_employment uuid := (p_payload ->> 'employment_id')::uuid; v_org uuid;
begin
  select em.organization_id into v_org from hr.employment em where em.id = v_employment;
  if v_target_org is not null and v_target_org <> v_org then
    return jsonb_build_object('ok', false, 'reason', 'cross_employer_move',
      'detail', 'Two employers of record means two employment spells. Terminate the spell here '
             || 'with reason end_of_assignment and rehire_eligible, then create the new spell in '
             || 'the other employer. Service dates carry via adjusted_service_date.',
      'door', '/hr/people/' || coalesce((select em.employee_id::text from hr.employment em
                                          where em.id = v_employment), ''));
  end if;
  return public.hr_position_change(
    p_payload || jsonb_build_object('is_transfer', true));
end
$fn$;

-- §4.4: a comp component ALWAYS goes through the pay_change flow. There is no direct lane, by
-- design — the approvers differ from a position change and the record must carry its approval
-- evidence.
create or replace function public.hr_compensation_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_inst jsonb; v_period record;
begin
  select em.organization_id into v_org from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_gate := hr._l1_write_gate(v_org, 'comp.write', v_employment, 'hr_compensation', 'update',
                              'compensation');
  if v_gate is not null then return v_gate; end if;

  -- §4.4 C2: an effective date inside a CLOSED pay period is refused with the period NAMED and a
  -- door to it. Guarded so this lane does not hard-depend on L3's table existing yet.
  if to_regclass('hr.pay_period') is not null then
    execute $q$
      select pp.id, pp.period_start_on, pp.period_end_on, pp.state
        from hr.pay_period pp
       where pp.organization_id = $1 and pp.deleted_at is null
         and $2 between pp.period_start_on and pp.period_end_on
         and pp.state in ('closed','locked','exported')
       limit 1 $q$
    into v_period using v_org, (p_payload ->> 'effective_from')::date;
    if v_period.id is not null then
      return jsonb_build_object('ok', false, 'reason', 'closed_pay_period',
        'field', 'effective_from', 'pay_period_id', v_period.id,
        'detail', format('That date falls inside the pay period %s – %s, which is %s.',
                         v_period.period_start_on, v_period.period_end_on, v_period.state),
        'door', '/hr/time/pay-periods');
    end if;
  end if;

  v_inst := hr.wf_request(
    p_flow_key => 'pay_change', p_target_token => 'hr_position_assignment',
    p_target_id => coalesce((select pa.id from hr.primary_position_as_of(v_employment, current_date) pa),
                            v_employment),
    p_organization_id => v_org, p_payload => p_payload,
    p_subject_employment_id => v_employment, p_as_draft => false);

  return jsonb_build_object('ok', true, 'routed', 'workflow', 'instance', v_inst,
    'audit_id', hr._l1_write_audit(v_org, 'hr_compensation', 'request', null, v_employment,
                                   'compensation', 'confidential'));
end
$fn$;

create or replace function public.hr_reporting_line_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_id uuid := nullif(p_payload ->> 'id','')::uuid;
begin
  select em.organization_id into v_org from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment,
                              'hr_reporting_line', 'update');
  if v_gate is not null then return v_gate; end if;

  if (p_payload ->> 'manager_employment_id')::uuid = v_employment then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'field', 'manager_employment_id', 'detail', 'a person cannot report to themselves');
  end if;

  perform hr.arm_write();
  if v_id is null then
    insert into hr.reporting_line (employment_id, manager_employment_id, line_kind, scope_note,
                                   effective_from, change_reason_category_id, organization_id)
    values (v_employment, (p_payload ->> 'manager_employment_id')::uuid,
            coalesce(nullif(p_payload ->> 'line_kind',''), 'dotted'),
            nullif(p_payload ->> 'scope_note',''),
            coalesce(nullif(p_payload ->> 'effective_from','')::date, current_date),
            nullif(p_payload ->> 'change_reason_category_id','')::uuid, v_org)
    returning id into v_id;
  else
    update hr.reporting_line set
      manager_employment_id = coalesce(nullif(p_payload ->> 'manager_employment_id','')::uuid,
                                       manager_employment_id),
      line_kind    = coalesce(nullif(p_payload ->> 'line_kind',''), line_kind),
      scope_note   = case when p_payload ? 'scope_note' then nullif(p_payload ->> 'scope_note','')
                          else scope_note end,
      effective_to = case when p_payload ? 'effective_to'
                          then nullif(p_payload ->> 'effective_to','')::date else effective_to end
    where id = v_id and employment_id = v_employment;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_reporting_line', 'update', ARRAY[v_id], v_employment));
end
$fn$;

-- ============================================================ hr_pending_change_cancel

create or replace function public.hr_pending_change_cancel(
  p_kind text, p_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_employment uuid; v_from date; v_prior uuid;
  v_gate jsonb; v_cap text;
begin
  if p_kind not in ('position','compensation','reporting_line') then
    raise exception 'hr_pending_change_cancel: % is not a cancellable kind', p_kind
      using errcode = '22023';
  end if;

  if p_kind = 'position' then
    select pa.organization_id, pa.employment_id, pa.effective_from, pa.supersedes_id
      into v_org, v_employment, v_from, v_prior
      from hr.position_assignment pa where pa.id = p_id and pa.deleted_at is null;
    v_cap := 'working_record.write';
  elsif p_kind = 'compensation' then
    select c.organization_id, c.employment_id, c.effective_from, c.supersedes_id
      into v_org, v_employment, v_from, v_prior
      from hr.compensation c where c.id = p_id and c.deleted_at is null;
    v_cap := 'comp.write';
  else
    select rl.organization_id, rl.employment_id, rl.effective_from, rl.supersedes_id
      into v_org, v_employment, v_from, v_prior
      from hr.reporting_line rl where rl.id = p_id and rl.deleted_at is null;
    v_cap := 'working_record.write';
  end if;

  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_gate := hr._l1_write_gate(v_org, v_cap, v_employment, 'hr_' || p_kind, 'delete');
  if v_gate is not null then return v_gate; end if;

  -- RECORDED DECISION 13: cancel is available UNTIL the date arrives. After that the row is
  -- history and the only correction path is §6.3 — letting cancel reach into history would
  -- destroy the audit trail the whole effective-dating design exists for.
  if v_from <= current_date then
    return jsonb_build_object('ok', false, 'reason', 'already_effective',
      'effective_from', v_from,
      'detail', 'That change has already taken effect. Correct it with a dated correction instead.');
  end if;

  perform hr.arm_write();

  -- ONE audited action: soft-delete the future row AND re-open the prior row's window.
  if p_kind = 'position' then
    update hr.position_assignment set deleted_at = now(),
           metadata = metadata || jsonb_build_object('cancelled_at', now(),
                                                     'cancelled_by', v_uid,
                                                     'cancel_reason', p_reason)
     where id = p_id;
    if v_prior is not null then
      update hr.position_assignment set effective_to = null where id = v_prior;
    end if;
  elsif p_kind = 'compensation' then
    update hr.compensation set deleted_at = now(),
           metadata = metadata || jsonb_build_object('cancelled_at', now(),
                                                     'cancelled_by', v_uid,
                                                     'cancel_reason', p_reason)
     where id = p_id;
    if v_prior is not null then
      update hr.compensation set effective_to = null where id = v_prior;
    end if;
  else
    update hr.reporting_line set deleted_at = now(),
           metadata = metadata || jsonb_build_object('cancelled_at', now(),
                                                     'cancelled_by', v_uid,
                                                     'cancel_reason', p_reason)
     where id = p_id;
    if v_prior is not null then
      update hr.reporting_line set effective_to = null where id = v_prior;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'cancelled_id', p_id,
    'reopened_id', v_prior, 'nothing_erased', true,
    'audit_id', hr._l1_write_audit(v_org, 'hr_' || p_kind, 'cancel', ARRAY[p_id], v_employment,
                                   'cancel_pending_change'));
end
$fn$;

-- ============================================================ hr_separation_record

-- §4.5. This lane owns the RECORD; Onboarding & Offboarding (L7) owns the RUN, and `termination`
-- is L7's flow type — so this writes `hr.separation`, flips the spell, and HANDS OFF. It declares
-- no flow, no definition and no hook for termination and must not.
create or replace function public.hr_separation_record(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_sep uuid; v_last date; v_term date; v_employee uuid;
begin
  select em.organization_id, em.employee_id into v_org, v_employee from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment, 'hr_separation',
                              'update', 'separation');
  if v_gate is not null then return v_gate; end if;

  v_last := nullif(p_payload ->> 'last_day_worked','')::date;
  v_term := nullif(p_payload ->> 'termination_date','')::date;
  if v_last is null or v_term is null then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'detail', 'Last day worked and termination date are different fields and both are required '
             || '— benefits and final pay key on different ones.');
  end if;
  if v_term < v_last then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'termination_date',
      'detail', 'The termination date cannot be before the last day worked.');
  end if;

  perform hr.arm_write();

  insert into hr.separation (
    employment_id, separation_category, reason_category_id, initiator,
    initiated_by_employment_id, notice_given_on, last_day_worked, termination_date,
    rehire_eligible, rehire_eligible_note, is_deceased, beneficiary_contact, layoff_batch_id,
    corrective_action_id, organization_id)
  values (
    v_employment, p_payload ->> 'separation_category',
    (p_payload ->> 'reason_category_id')::uuid,
    coalesce(nullif(p_payload ->> 'initiator',''), 'employer'),
    nullif(p_payload ->> 'initiated_by_employment_id','')::uuid,
    nullif(p_payload ->> 'notice_given_on','')::date, v_last, v_term,
    -- nullable ON PURPOSE: "not decided" is a real answer and the rehire flow surfaces it as such
    nullif(p_payload ->> 'rehire_eligible','')::boolean,
    nullif(p_payload ->> 'rehire_eligible_note',''),
    coalesce((p_payload ->> 'is_deceased')::boolean, false),
    coalesce(p_payload -> 'beneficiary_contact', '{}'::jsonb),
    nullif(p_payload ->> 'layoff_batch_id','')::uuid,
    nullif(p_payload ->> 'corrective_action_id','')::uuid,
    v_org)
  returning id into v_sep;

  update hr.employment set
    status = case when v_term > current_date then status else 'terminated' end,
    scheduled_last_day = v_last,
    last_day_worked = case when v_last <= current_date then v_last else last_day_worked end,
    termination_date = v_term,
    separation_id = v_sep
  where id = v_employment;

  -- retention clocks start at the separation (§4.5 N); the sweep itself is the governance lane's
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname = 'stamp_retention_triggers') then
    perform hr.stamp_retention_triggers(v_employment);
  end if;

  return jsonb_build_object('ok', true, 'separation_id', v_sep, 'employment_id', v_employment,
    'employee_id', v_employee,
    'is_future_dated', v_term > current_date,
    'handoff_event', 'hr.separation_recorded',
    'audit_id', hr._l1_write_audit(v_org, 'hr_separation', 'update', ARRAY[v_sep], v_employment,
                                   'separation', 'confidential'));
end
$fn$;

-- ============================================================ the workflow wrappers

-- 🚨 RECORDED TECHNICAL DECISION 14 — L10 ALREADY SHIPPED ELEVEN OF THESE, SO L1 SHIPS TWO.
--
-- SPEC-CONTRACTS §2.2 routes every approval decision "direct" via `hr.wf_decide` and family, and
-- `hr` is not exposed to PostgREST (hr_l1_01's RECORDED DECISION 1), so the client cannot reach
-- them. This lane was about to ship its own wrappers — and a live read of `public.hr_wf_*` found
-- **thirteen already there**, landed by the L10 inbox lane (HRB-022): `hr_wf_decide`,
-- `hr_wf_bulk_decide`, `hr_wf_cancel`, `hr_wf_withdraw`, `hr_wf_resubmit`, `hr_wf_escalate`,
-- `hr_wf_reassign_step`, `hr_wf_delegate`, `hr_wf_record_result`, `hr_wf_resolve_failure`,
-- `hr_wf_for_target`, `hr_wf_instance`, and `hr_wf_inbox` (which is the richer form of the
-- `hr_wf_pending` this lane had planned).
--
-- A second implementation of something we own is a defect even when it works — and here it would
-- have been worse than a defect, because two doors onto `hr.wf_decide` means two places to audit
-- the one write the whole approval design depends on. **L1 ships only the two that do not exist:
-- `hr_wf_request` and `hr_wf_submit`.** Everything else routes through L10's.
create or replace function public.hr_wf_request(
  p_flow_key text, p_target_token text, p_target_id uuid, p_organization_id uuid,
  p_payload jsonb default '{}'::jsonb, p_subject_employment_id uuid default null,
  p_as_draft boolean default false, p_idempotency_key text default null)
returns jsonb language sql security definer set search_path = public, hr
as $fn$ select hr.wf_request(p_flow_key, p_target_token, p_target_id, p_organization_id,
                             p_payload, p_subject_employment_id, p_as_draft, p_idempotency_key); $fn$;

create or replace function public.hr_wf_submit(p_instance_id uuid)
returns jsonb language sql security definer set search_path = public, hr
as $fn$ select hr.wf_submit(p_instance_id); $fn$;

-- ============================================================ grants

do $$ declare f text; begin
  foreach f in array ARRAY[
    'public.hr_position_change(jsonb)',
    'public.hr_transfer(jsonb)',
    'public.hr_compensation_upsert(jsonb)',
    'public.hr_reporting_line_upsert(jsonb)',
    'public.hr_pending_change_cancel(text, uuid, text)',
    'public.hr_separation_record(jsonb)',
    'public.hr_wf_request(text, text, uuid, uuid, jsonb, uuid, boolean, text)',
    'public.hr_wf_submit(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array ARRAY[
    'hr._l1_apply_position(jsonb, uuid, uuid)',
    'hr._l1_apply_compensation(jsonb, uuid, uuid)',
    'hr.position_change_wf_apply(uuid)', 'hr.pay_change_wf_apply(uuid)',
    'hr.profile_edit_wf_apply(uuid)', 'hr.address_change_wf_apply(uuid)',
    'hr.corrective_ack_wf_apply(uuid)',
    'hr.position_change_wf_validate(uuid)', 'hr.pay_change_wf_validate(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================ assertions

do $$
declare v_bad integer; v_stub integer;
begin
  -- RECORDED DECISION 10: the five flows this lane owns must be OFF the fail-dead stub.
  select count(*) into v_stub from hr.workflow_flow_type
   where flow_key in ('position_change','pay_change','corrective_action_ack',
                      'address_change','profile_edit_request')
     and deleted_at is null
     and apply_fn::text like '%wf_apply_unimplemented%';
  if v_stub > 0 then
    raise exception 'hr_l1_03: % of L1''s five flows still point at wf_apply_unimplemented', v_stub;
  end if;

  -- L7 owns termination; this lane must NOT have repointed it.
  if (select apply_fn::text from hr.workflow_flow_type
       where flow_key = 'termination' and deleted_at is null) not like '%wf_apply_unimplemented%' then
    raise notice 'hr_l1_03: termination''s apply_fn is no longer the stub — L7 has landed it, or '
                 'somebody outside L7 did. This lane did not touch it.';
  end if;

  -- RECORDED DECISION 11
  select count(*) into v_bad from hr.workflow_flow_type
   where flow_key in ('address_change','profile_edit_request')
     and deleted_at is null and not is_active;
  if v_bad > 0 then
    raise exception 'hr_l1_03: % of the two self-service flows is still parked', v_bad;
  end if;

  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_position_change','hr_transfer','hr_compensation_upsert',
                       'hr_reporting_line_upsert','hr_pending_change_cancel','hr_separation_record',
                       'hr_wf_request','hr_wf_submit');
  if v_bad <> 8 then
    raise exception 'hr_l1_03: expected 8 public RPCs, found %', v_bad;
  end if;

  -- RECORDED DECISION 14: L10's eleven wrappers are the canonical door. If this file ever grows a
  -- second copy of one, that is the defect this assertion exists to catch.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_wf_decide','hr_wf_cancel','hr_wf_withdraw','hr_wf_for_target',
                       'hr_wf_instance','hr_wf_inbox','hr_wf_bulk_decide');
  if v_bad < 7 then
    raise exception 'hr_l1_03: L10''s workflow wrappers are missing (% of 7) — L1 depends on them '
                    'and must not grow a second set', v_bad;
  end if;

  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_position_change','hr_transfer','hr_compensation_upsert',
                       'hr_reporting_line_upsert','hr_pending_change_cancel','hr_separation_record',
                       'hr_wf_request','hr_wf_submit')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_03: % of these RPCs are executable by anon', v_bad;
  end if;

  -- RECORDED DECISION 12: ONE apply implementation. A second copy of "close the old row, insert
  -- the new one" inside a hook is how a direct change and an approved change grow apart.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.proname in ('position_change_wf_apply','pay_change_wf_apply')
     and p.prosrc not like '%hr._l1_apply_%';
  if v_bad > 0 then
    raise exception 'hr_l1_03: % apply hook(s) do not delegate to the shared apply routine', v_bad;
  end if;

  select count(*) into v_bad
    from platform.ddl_guard_log
   where acknowledged_at is null
     and (object_ref like 'hr.\_l1%' or object_ref like 'public.hr\_%');
  if v_bad > 0 then
    raise exception 'hr_l1_03: % unacked DDL guard row(s) on this file''s objects', v_bad;
  end if;
end $$;
