-- HR domain L3 — migration 8 of 8 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE OVERTIME PRE-APPROVAL FLOW (D24a, SPEC-TIME §4.4). The `hr.overtime_preapproval` TABLE
-- existed; no `hr.workflow_flow_type` row did, so the object was unreachable through the only
-- approval engine this product has. This adds the flow type, the platform-default definition and
-- its one manager step, the four hooks, the decision handler, and the creator the client already
-- names (`hr_overtime_preapproval_create`).
--
-- ===================================================================================
-- 🚨 THE LAW THIS OBEYS BEFORE ANY PRODUCT CONSIDERATION, WRITTEN HERE BECAUSE EVERY FUTURE READER
-- OF THIS FILE MUST HIT IT FIRST:
--
--     UNAPPROVED OVERTIME IS STILL PAID. HOURS WORKED ARE HOURS OWED.
--
-- Nothing in this migration gates, delays, reduces or conditions payment on an approval. A DENIAL
-- DOES NOT WITHHOLD PAY. Pre-approval is a management control over whether overtime is INCURRED,
-- never a payroll control over whether it is PAID. There is no held state, no pending category, no
-- zero-amount placeholder and no configuration that changes this. **Any implementation in which a
-- missing pre-approval suppresses, withholds or zeroes an OT line is a wage violation and a
-- defect** — and grep this file: it writes to `hr.overtime_preapproval` and to nothing else. It
-- never touches `hr.work_interval`, `hr.workweek`, `hr.pay_period_employment` or any amount.
-- ===================================================================================
--
-- Authority: SPEC-TIME §1.5, §4.4, §4.6, §4.8; SPEC-WORKFLOW-ENGINE §4.1–§4.4 (not restated);
-- R-L3 D24a. Applied live as `hr_l3_27_ot_preapproval_flow`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 `on_expiry` IS `escalate` AND `autonomy_mode` IS 4, SO THE DEADLINE CAN NEITHER APPROVE NOR
--    DENY. §4.4: "no action by the deadline → tick reminders, then escalate up the arbitrary-depth
--    chain. NEVER auto-approves and NEVER auto-denies." Read against the live engine that means two
--    specific settings, and the assertions at the foot of this file pin both: `on_expiry` must not
--    be `auto_approve` (which `hr.wf_tick` PASS 6 turns into an approval plus an apply), and the
--    step's `autonomy_mode` must not be 3 (which PASS 3 turns into an `auto_approved` close when
--    `timeout_action = 'apply'`). Mode 4 is human-decides, and `timeout_action` is `escalate`.
--    Escalation is the ONLY thing a deadline does here.
--
-- 2. 🚨 AN FLSA-EXEMPT ASSIGNMENT IS REFUSED AT VALIDATE WITH THE REASON NAMED, NOT SILENTLY
--    IGNORED. §4.4: "Exempt employees never enter this lane … refused at validate with the reason
--    named, because there is no overtime to pre-approve." `flsa_status` is read from the
--    `hr.position_assignment` in force ON THE DATE THE OVERTIME WOULD BE WORKED, not today — a
--    person who was exempt last month and is non-exempt now is non-exempt for next week's request.
--
-- 3. `hr.ot_preapproval_wf_conflict` RE-RUNS AT EVERY DECISION AND CHECKS FOUR THINGS §4.4 NAMES:
--    the employment may have terminated, the date may have entered a locked period, the workweek's
--    hours may already have crossed the threshold on their own, and a competing approval may already
--    cover the window. It raises `WF_CONFLICT` through the engine with the specifics attached and
--    NEVER silently rejects.
--    The threshold check reads `hr.workweek.hours_worked` against the resolved threshold and is
--    ADVISORY-SHAPED — it reports, it does not refuse, because "the hours already happened" is a
--    reason to record the decision, not to block it. Only the first two are hard conflicts.
--
-- 4. `hr.ot_preapproval_wf_apply` WRITES A WINDOW AND NOTHING ELSE. `state = 'approved'`,
--    `approved_hours`, `decided_at`, `decided_by_employment_id`. The approve-with-a-cap case is the
--    same write with `approved_hours` taken from the decision payload's `approved_hours` — the
--    engine already carries a decision payload (`hr.workflow_decision.client_context`), so no second
--    channel is invented for it. Later `hr.work_interval` rows are matched against this window by
--    the recompute engine; **this hook writes no interval, no rate and no amount.**
--
-- 5. 🚨 A DENIAL IS A TRIGGER, AND ITS RECORDED TEXT SAYS THE HOURS ARE STILL PAID. The engine has
--    no reject hook (`compensate_fn` is only called by `hr.wf_cancel`, verified live), so
--    `hr._ot_preapproval_decided` fires on the instance reaching `rejected`/`returned` and sets
--    `state = 'denied'` with `decided_at`. It writes, into `calc.denial_notice`, the sentence the
--    surface renders to the manager at decision time and to the employee on the notification:
--    working the overtime anyway is still paid. The trigger touches `hr.overtime_preapproval` only.
--
-- 6. `request_kind = 'retroactive'` IS REFUSED IN v1, AND THE REASON IS LAW 5, NOT LAZINESS.
--    `overtime_preapproval_retroactive_decided` CHECKs that a retroactive row is never in state
--    `requested`, so a retroactive request cannot ride the workflow at all — it would have to be
--    written already-decided, which means a second approval path, which Law 5 forbids outright
--    ("the approval engine is the only approval engine"). §4.6's third door (a manager converting an
--    `unapproved_overtime` exception into a retroactive authorisation) therefore needs a design
--    decision, not a quiet implementation.
--    **OWED, owner SPEC-TIME §4.6 / SPEC-DATA-MODEL §7.x:** either relax the CHECK so a retroactive
--    request can be `requested` and be decided by the engine like every other request, or state
--    explicitly that a retroactive authorisation is a manager act recorded without a workflow — and
--    if the latter, say what makes it different from the approvals Law 5 abolished.
--
-- 7. THE MANAGER MAY RAISE AND DECIDE, AND `requester_is_interested_party` IS THEREFORE FALSE.
--    §4.4: the request "is raised by the employee or by their manager on their behalf". Setting
--    `requester_is_interested_party = true` would strike a manager who raised coverage for their own
--    team off the only rung holding `overtime_approve`, leaving the request unroutable — the exact
--    over-tightening the engine's own RECORDED DECISION on `pay_change` warns about. Never-approve-
--    yourself still applies unconditionally through `allows_self = false`: a manager can never decide
--    a request whose SUBJECT is themselves.
--
-- 8. `hr.overtime_preapproval_create` IS INCLUDED BECAUSE A FLOW WITH NO REACHABLE TARGET IS NOT A
--    FLOW. `hr.wf_request` requires the target row to already exist, and `hr` is not exposed to
--    PostgREST, so without a creator the flow type would be live and unusable. The name and argument
--    names match `features/hr/time/api/rpc.ts`'s declared `hr_overtime_preapproval_create`.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. the digest
create or replace function hr.ot_preapproval_wf_digest(p_target_token text, p_target_id uuid)
returns text language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare v_material jsonb;
begin
  select jsonb_build_object(
           'preapproval_id', op.id,
           'employment_id', op.employment_id,
           'request_kind', op.request_kind,
           'covers_from', op.covers_from,
           'covers_to', op.covers_to,
           'requested_hours', op.requested_hours,
           'shift_ids', to_jsonb(op.shift_ids),
           'reason_category_id', op.reason_category_id)
    into v_material
    from hr.overtime_preapproval op where op.id = p_target_id;
  if v_material is null then return null; end if;
  return encode(sha256(convert_to(jsonb_pretty(v_material), 'UTF8')), 'hex');
end $fn$;

comment on function hr.ot_preapproval_wf_digest is
  'SPEC-TIME §4.4 — the OT pre-approval target digest: the employment, the window, the requested hours, the request kind and the shifts. Deliberately excludes approved_hours and state, which the decision itself writes.';

-- ============================================================ 2. validate (RD 2)
create or replace function hr.ot_preapproval_wf_validate(p_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  inst   hr.workflow_instance%rowtype;
  v_op   hr.overtime_preapproval%rowtype;
  v_emp  hr.employment%rowtype;
  v_pa   hr.position_assignment%rowtype;
  v_at   date;
  v_lock jsonb;
  v_hard jsonb := '[]'::jsonb;
  v_adv  jsonb := '[]'::jsonb;
  v_classes text[];
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  select * into v_op from hr.overtime_preapproval where id = inst.target_id and deleted_at is null;
  if not found then
    return jsonb_build_object('hard', jsonb_build_array(jsonb_build_object(
      'code','preapproval_missing','detail','there is no pre-approval row for this instance')),
      'advisory','[]'::jsonb);
  end if;

  -- RD 2: as of the date the OVERTIME WOULD BE WORKED, never now()
  v_at := (v_op.covers_from at time zone 'UTC')::date;

  select * into v_emp from hr.employment where id = v_op.employment_id and deleted_at is null;
  if not found or v_emp.status not in ('active','on_leave','suspended') then
    v_hard := v_hard || jsonb_build_object(
      'code','employment_not_active',
      'detail', format('This employment is %s. Overtime cannot be pre-approved for somebody who is not employed on the date it would be worked.',
                       coalesce(v_emp.status, 'not found')),
      'employment_id', v_op.employment_id, 'as_of', v_at);
  end if;

  select pa.* into v_pa from hr.position_assignment pa
   where pa.employment_id = v_op.employment_id and pa.deleted_at is null
     and pa.effective_from <= v_at
     and (pa.effective_to is null or pa.effective_to >= v_at)
   order by pa.is_primary desc, pa.effective_from desc limit 1;

  if v_pa.id is null then
    v_hard := v_hard || jsonb_build_object(
      'code','no_position_assignment',
      'detail', format('There is no position assignment in force on %s, so neither the FLSA status nor the worker class can be read. Overtime is never pre-approved against an unknown assignment.', v_at),
      'as_of', v_at);
  else
    -- 🚨 RD 2 / §4.4: exempt employees never enter this lane, and the reason is NAMED.
    if v_pa.flsa_status = 'exempt' then
      v_hard := v_hard || jsonb_build_object(
        'code','flsa_exempt_assignment',
        'detail', format('This assignment is FLSA-exempt%s as of %s, so there is no overtime to pre-approve. An exempt salary is not increased by hours, and this lane has nothing to decide.',
                         case when v_pa.flsa_exemption_basis is not null
                              then ' (' || v_pa.flsa_exemption_basis || ')' else '' end, v_at),
        'flsa_status', v_pa.flsa_status,
        'flsa_exemption_basis', v_pa.flsa_exemption_basis,
        'position_assignment_id', v_pa.id, 'as_of', v_at);
    end if;

    v_classes := hr._time_punch_enabled_worker_classes();
    if not (v_pa.worker_class = any (v_classes)) then
      v_hard := v_hard || jsonb_build_object(
        'code','worker_class_not_enabled',
        'detail', format('The worker class %s is not enabled for time in this organization, so it has no timecard to book overtime against.', v_pa.worker_class),
        'worker_class', v_pa.worker_class,
        'enabled_worker_classes', to_jsonb(v_classes));
    end if;
  end if;

  v_lock := hr._punch_period_lock(v_op.employment_id, v_at);
  if coalesce((v_lock ->> 'locked')::boolean, false) then
    v_hard := v_hard || jsonb_build_object(
      'code','period_locked',
      'detail', format('The pay period covering %s is %s. Overtime inside a locked period is not pre-approved after the fact — the hours are already paid, and anything else that needs fixing is a correction.',
                       v_at, v_lock ->> 'state'),
      'pay_period_id', v_lock -> 'pay_period_id', 'door', 'hr_time_adjustment_create');
  end if;

  if coalesce(v_op.requested_hours, 0) <= 0 then
    v_hard := v_hard || jsonb_build_object(
      'code','no_estimated_hours',
      'detail','A pre-approval with no estimated hours gives the approver nothing to decide. Enter how much overtime is expected.',
      'requested_hours', v_op.requested_hours);
  end if;

  -- advisory: what the approver should see, and the law they must see with it
  v_adv := v_adv || jsonb_build_object(
    'code','overtime_is_paid_regardless',
    'detail','Whatever you decide, overtime that is actually worked is PAID. Denying this request is a management instruction not to work the hours; it does not withhold pay if they are worked anyway.',
    'is_a_knob', false);

  if v_op.request_kind = 'standing' then
    v_adv := v_adv || jsonb_build_object(
      'code','standing_request',
      'detail','This is a standing authorisation covering a window rather than a single occasion. Every interval inside the window matches it until it expires.');
  end if;

  return jsonb_build_object('hard', v_hard, 'advisory', v_adv);
end $fn$;

comment on function hr.ot_preapproval_wf_validate is
  'SPEC-TIME §4.4 / D24a — the OT pre-approval validate hook. Hard: the employment is not active, there is no position assignment in force, the assignment is FLSA-EXEMPT (refused with the reason named — there is no overtime to pre-approve), the worker class is not enabled for time, the date is inside a locked period, or the estimated hours are not above zero. Every check reads the assignment in force ON THE DATE THE OVERTIME WOULD BE WORKED, never today. An advisory finding tells the approver, in words, that the hours are paid whatever they decide.';

-- ============================================================ 3. conflict (RD 3)
create or replace function hr.ot_preapproval_wf_conflict(p_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  inst    hr.workflow_instance%rowtype;
  v_op    hr.overtime_preapproval%rowtype;
  v_emp   hr.employment%rowtype;
  v_at    date;
  v_lock  jsonb;
  v_other jsonb;
  v_wk    jsonb;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  select * into v_op from hr.overtime_preapproval where id = inst.target_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code','preapproval_missing',
      'detail','the pre-approval row no longer exists');
  end if;
  v_at := (v_op.covers_from at time zone 'UTC')::date;

  if v_op.state <> 'requested' then
    return jsonb_build_object('ok', false, 'code','already_decided',
      'detail', format('This request is already %s. It cannot be decided twice.', v_op.state),
      'state', v_op.state);
  end if;

  -- HARD CONFLICT 1: the employment terminated while the request sat in a queue
  select * into v_emp from hr.employment where id = v_op.employment_id and deleted_at is null;
  if not found or v_emp.status not in ('active','on_leave','suspended') then
    return jsonb_build_object('ok', false, 'code','employment_ended',
      'detail', format('This employment is now %s. There is no future overtime to authorise.',
                       coalesce(v_emp.status,'deleted')),
      'employment_status', coalesce(v_emp.status,'deleted'));
  end if;

  -- HARD CONFLICT 2: the window entered a locked period while the request sat in a queue
  v_lock := hr._punch_period_lock(v_op.employment_id, v_at);
  if coalesce((v_lock ->> 'locked')::boolean, false) then
    return jsonb_build_object('ok', false, 'code','period_locked_since_submit',
      'detail', format('The pay period covering %s has been %s since this request was raised. Any hours actually worked are already paid; there is nothing left to authorise in advance.',
                       v_at, v_lock ->> 'state'),
      'pay_period_id', v_lock -> 'pay_period_id', 'state', v_lock -> 'state',
      'hours_already_paid', true);
  end if;

  -- HARD CONFLICT 3: a competing approval already covers this window
  select jsonb_agg(jsonb_build_object('preapproval_id', o.id, 'covers_from', o.covers_from,
                                      'covers_to', o.covers_to, 'approved_hours', o.approved_hours))
    into v_other
    from hr.overtime_preapproval o
   where o.employment_id = v_op.employment_id and o.id <> v_op.id
     and o.deleted_at is null and o.state = 'approved'
     and o.covers_from < v_op.covers_to and o.covers_to > v_op.covers_from;
  if v_other is not null then
    return jsonb_build_object('ok', false, 'code','window_already_covered',
      'detail','An approved pre-approval already covers part of this window. Deciding this one as well would leave two authorisations matching the same hours.',
      'competing', v_other);
  end if;

  -- RD 3: REPORTED, NOT REFUSED — the hours having already happened is a reason to record the
  -- decision, never a reason to block it. And they are paid either way.
  select jsonb_build_object('workweek_id', ww.id, 'hours_worked', ww.hours_worked,
                            'hours_overtime', ww.hours_overtime,
                            'week_start_local_date', ww.week_start_local_date)
    into v_wk
    from hr.workweek ww
   where ww.employment_id = v_op.employment_id
     and v_at between ww.week_start_local_date and (ww.week_start_local_date + 6)
   order by ww.week_start_local_date desc limit 1;

  return jsonb_build_object('ok', true,
    'workweek_so_far', coalesce(v_wk, 'null'::jsonb),
    'note', 'Overtime already crossed in this workweek is computed and owed regardless of this decision.');
end $fn$;

comment on function hr.ot_preapproval_wf_conflict is
  'SPEC-TIME §4.4 — re-runs at EVERY decision, not just at submit. Hard conflicts: the request is already decided, the employment ended, the window entered a locked period, or a competing approval already covers it. The workweek''s hours so far are REPORTED, never used to refuse — hours already worked are owed whatever this decision says. It never silently rejects.';

-- ============================================================ 4. apply (RD 4)
create or replace function hr.ot_preapproval_wf_apply(p_instance_id uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst  hr.workflow_instance%rowtype;
  v_op  hr.overtime_preapproval%rowtype;
  v_dec hr.workflow_decision%rowtype;
  v_cap numeric;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  select * into v_op from hr.overtime_preapproval where id = inst.target_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'failure_class','apply_failed',
      'reason','preapproval_missing',
      'detail','there is no pre-approval row to authorise; nothing was recorded');
  end if;

  select * into v_dec from hr.workflow_decision d
   where d.workflow_instance_id = p_instance_id and not d.superseded_by_target_change
     and d.decision in ('approved','auto_approved')
   order by d.created_at desc limit 1;

  -- RD 4: the approve-with-a-cap case rides the engine's own decision payload. No second channel.
  v_cap := coalesce(nullif(v_dec.client_context ->> 'approved_hours','')::numeric,
                    v_op.requested_hours);

  perform hr.arm_write();
  update hr.overtime_preapproval
     set state = 'approved',
         approved_hours = v_cap,
         decided_at = now(),
         decided_by_employment_id = v_dec.actor_employment_id,
         workflow_instance_id = p_instance_id,
         calc = coalesce(calc,'{}'::jsonb) || jsonb_build_object(
           'decision', 'approved',
           'approved_hours', v_cap,
           'requested_hours', v_op.requested_hours,
           'capped', v_cap < coalesce(v_op.requested_hours, v_cap),
           'window', jsonb_build_object('from', v_op.covers_from, 'to', v_op.covers_to),
           'matching_note', 'Later work_interval rows are matched to this window by employment, work date and position assignment. Hours beyond approved_hours are STILL PAID and open a review (SPEC-TIME §4.6).',
           'payment_note', 'This authorisation controls whether overtime is INCURRED. It has no effect whatsoever on whether overtime is PAID.')
   where id = v_op.id;

  return jsonb_build_object('ok', true,
    'preapproval_id', v_op.id,
    'state', 'approved',
    'approved_hours', v_cap,
    'requested_hours', v_op.requested_hours,
    'capped', v_cap < coalesce(v_op.requested_hours, v_cap),
    'covers_from', v_op.covers_from, 'covers_to', v_op.covers_to,
    -- 🚨 nothing about pay was written, and nothing here could write it
    'work_intervals_touched', 0,
    'amounts_touched', 0,
    'note', 'The approval window is written. Later intervals are matched against it. Overtime beyond the cap, and overtime with no approval at all, is PAID exactly the same and opens a review instead.');
end $fn$;

comment on function hr.ot_preapproval_wf_apply is
  'SPEC-TIME §4.4 / D24a — the OT pre-approval apply hook. Writes state=approved, the approved window and approved_hours (the cap comes from the decision payload, which the engine already carries). It writes to hr.overtime_preapproval and to NOTHING else: no work_interval, no rate, no amount. Unapproved and over-cap overtime is paid identically and opens a review.';

-- ============================================================ 5. the denial handler (RD 5)
create or replace function hr._ot_preapproval_decided()
returns trigger language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_op hr.overtime_preapproval%rowtype;
begin
  if new.flow_key <> 'overtime_preapproval' then return new; end if;
  if new.target_token <> 'hr_overtime_preapproval' then return new; end if;
  if old.state = new.state then return new; end if;

  select * into v_op from hr.overtime_preapproval where id = new.target_id and deleted_at is null;
  if not found then return new; end if;
  if v_op.state <> 'requested' then return new; end if;

  perform hr.arm_write();

  if new.state in ('rejected','returned') then
    update hr.overtime_preapproval
       set state = 'denied',
           decided_at = now(),
           workflow_instance_id = new.id,
           calc = coalesce(calc,'{}'::jsonb) || jsonb_build_object(
             'decision', 'denied',
             'reason', new.state_reason,
             -- 🚨 THE SENTENCE THE SURFACE RENDERS, VERBATIM, TO BOTH SIDES.
             'denial_notice', 'This request was denied. That is an instruction not to work the overtime. It does NOT withhold pay: overtime that is actually worked is computed and paid at the correct rate whether or not it was approved, and it opens a management review instead.',
             'payment_withheld', false)
     where id = v_op.id;

  elsif new.state in ('withdrawn','cancelled') then
    update hr.overtime_preapproval
       set state = 'withdrawn', decided_at = now(), workflow_instance_id = new.id,
           calc = coalesce(calc,'{}'::jsonb) || jsonb_build_object(
             'decision', 'withdrawn', 'reason', new.state_reason, 'payment_withheld', false)
     where id = v_op.id;

  elsif new.state in ('expired','rejected_at_intake') then
    update hr.overtime_preapproval
       set state = case when new.state = 'expired' then 'expired' else 'denied' end,
           decided_at = now(), workflow_instance_id = new.id,
           calc = coalesce(calc,'{}'::jsonb) || jsonb_build_object(
             'decision', new.state,
             'findings', (select validation_findings from hr.workflow_instance where id = new.id),
             'payment_withheld', false)
     where id = v_op.id;
  end if;

  return new;
end $fn$;

comment on function hr._ot_preapproval_decided is
  'SPEC-TIME §4.4 — the OT pre-approval outcome handler. The engine has no reject hook, so a rejected, returned, withdrawn, cancelled, expired or intake-rejected instance is reflected onto hr.overtime_preapproval.state here. Every branch records payment_withheld=false and the denial branch records, verbatim, the sentence both sides are shown: a denial is an instruction not to work the hours and never a withholding of pay.';

drop trigger if exists _zz_ot_preapproval_decided on hr.workflow_instance;
create trigger _zz_ot_preapproval_decided
  after update of state on hr.workflow_instance
  for each row execute function hr._ot_preapproval_decided();

-- ============================================================ 6. the flow type + definition (D24a)
select set_config('hr.privileged_write', 'on', false);

insert into hr.workflow_flow_type
  (organization_id, flow_key, label, description, target_token, requester_kind, sensitivity_tier,
   ai_ceiling, validate_fn, digest_fn, conflict_fn, apply_fn, result_fn, compensate_fn,
   on_target_change, on_reject, allows_withdraw, allows_resubmit, requires_reason_on_approve,
   requester_is_interested_party, is_active, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'overtime_preapproval', 'Overtime pre-approval',
       'A request to work specified overtime, decided by a manager holding overtime_approve. It controls whether overtime is INCURRED and never whether it is PAID: hours worked are hours owed, and a denial does not withhold pay.',
       'hr_overtime_preapproval', 'employment', 'internal', 'advisory',
       'hr.ot_preapproval_wf_validate(uuid)'::regprocedure,
       'hr.ot_preapproval_wf_digest(text,uuid)'::regprocedure,
       'hr.ot_preapproval_wf_conflict(uuid)'::regprocedure,
       'hr.ot_preapproval_wf_apply(uuid)'::regprocedure,
       null, null,
       'restart', 'terminate', true, true, false,
       -- RD 7: a manager raising coverage for their own team must still be able to decide it
       false, true, 'public'::platform.visibility
where not exists (select 1 from hr.workflow_flow_type
                   where flow_key = 'overtime_preapproval'
                     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

-- re-apply the hooks on a second run (create-or-replace semantics for the row)
update hr.workflow_flow_type
   set validate_fn = 'hr.ot_preapproval_wf_validate(uuid)'::regprocedure,
       digest_fn   = 'hr.ot_preapproval_wf_digest(text,uuid)'::regprocedure,
       conflict_fn = 'hr.ot_preapproval_wf_conflict(uuid)'::regprocedure,
       apply_fn    = 'hr.ot_preapproval_wf_apply(uuid)'::regprocedure,
       target_token = 'hr_overtime_preapproval',
       is_active = true
 where flow_key = 'overtime_preapproval'
   and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;

insert into hr.workflow_definition
  (organization_id, flow_key, name, definition_version, status, published_at, sla_hours,
   reminder_cadence_hours, reminder_max, on_expiry, skip_absent_approver, allow_bulk_decide,
   notes, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'overtime_preapproval',
       'Overtime pre-approval — platform default', 1, 'published', now(),
       4, 1, 3,
       -- 🚨 RD 1: escalate. NEVER auto_approve, and there is no deny-on-timeout in the vocabulary.
       'escalate', true, true,
       'D24a. The decision deadline escalates up the reporting chain and NEVER auto-approves or auto-denies. The step runs at autonomy_mode 4 (a human decides) so hr.wf_tick''s mode-3 timeout path cannot reach it.',
       'internal'::platform.visibility
where not exists (select 1 from hr.workflow_definition
                   where flow_key = 'overtime_preapproval'
                     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

update hr.workflow_definition
   set status = 'published', published_at = coalesce(published_at, now()),
       sla_hours = 4, reminder_cadence_hours = 1, reminder_max = 3, on_expiry = 'escalate'
 where flow_key = 'overtime_preapproval'
   and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;

insert into hr.workflow_step_definition
  (organization_id, workflow_definition_id, step_key, label, step_order, quorum_kind,
   condition, is_optional, allows_self, requires_reason, resolver_kind, authority_action,
   resolver_config, sla_hours, escalate_after_hours, escalation_resolver_kind,
   autonomy_mode, timeout_action)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, d.id, 'manager_decision',
       'Manager decision on overtime', 10, 'all',
       '{}'::jsonb, false, false, false, 'authority', 'overtime_approve',
       '{}'::jsonb, 4, 4, 'reporting_line',
       -- 🚨 RD 1: mode 4 = a human decides. Mode 3 would let hr.wf_tick close it automatically.
       4, 'escalate'
  from hr.workflow_definition d
 where d.flow_key = 'overtime_preapproval'
   and d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and not exists (select 1 from hr.workflow_step_definition sd
                    where sd.workflow_definition_id = d.id and sd.step_key = 'manager_decision');

update hr.workflow_step_definition sd
   set resolver_kind = 'authority', authority_action = 'overtime_approve',
       allows_self = false, autonomy_mode = 4, timeout_action = 'escalate',
       escalate_after_hours = 4, escalation_resolver_kind = 'reporting_line'
  from hr.workflow_definition d
 where d.id = sd.workflow_definition_id and d.flow_key = 'overtime_preapproval'
   and sd.step_key = 'manager_decision';

update hr.workflow_flow_type ft
   set default_definition_id = d.id
  from hr.workflow_definition d
 where d.flow_key = 'overtime_preapproval'
   and d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and ft.flow_key = 'overtime_preapproval'
   and ft.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;

-- ============================================================ 7. the creator (RD 8)
create or replace function hr.overtime_preapproval_create(p_employment_id uuid,
                                                          p_covers_from timestamptz,
                                                          p_covers_to timestamptz,
                                                          p_requested_hours numeric,
                                                          p_request_kind text default 'advance',
                                                          p_reason_category_id uuid default null,
                                                          p_reason_note text default null,
                                                          p_shift_ids uuid[] default '{}'::uuid[])
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_uid   uuid := auth.uid();
  v_emp   hr.employment%rowtype;
  v_mine  uuid[];
  v_self  boolean;
  v_actor uuid;
  v_at    date;
  v_id    uuid;
  v_req   jsonb;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'An overtime request is always raised by somebody. Sign in and try again.');
  end if;
  if p_employment_id is null or p_covers_from is null or p_covers_to is null then
    return hr._time_refusal('hr_arguments_incomplete',
      'An overtime request needs the employment and the window it covers.');
  end if;
  if p_covers_to <= p_covers_from then
    return hr._time_refusal('hr_window_not_ordered',
      'The window this request covers must end after it starts.');
  end if;
  -- RD 6: Law 5 forbids a second approval path, and the live CHECK forbids a retroactive request
  -- from sitting in `requested`. So it is refused rather than quietly written already-decided.
  if p_request_kind not in ('advance','standing') then
    return hr._time_refusal('hr_retroactive_preapproval_not_built',
      'A retroactive overtime authorisation is not built in v1. The hours are already computed and PAID; what is missing is only the management record. Resolve the unapproved-overtime exception instead — that is the review lane, and it never affects pay.',
      jsonb_build_object('request_kind', p_request_kind,
                         'allowed', to_jsonb(ARRAY['advance','standing']),
                         'door', 'hr_attendance_exception_resolve',
                         'hours_already_paid', true));
  end if;

  select * into v_emp from hr.employment where id = p_employment_id and deleted_at is null;
  if not found then
    return hr._time_refusal('hr_employment_not_found',
      'No employment with that id is readable.');
  end if;

  v_at := (p_covers_from at time zone 'UTC')::date;
  v_mine := hr.employments_of(v_uid, v_at);
  v_self := p_employment_id = any (coalesce(v_mine, '{}'::uuid[]));
  if not v_self and not hr.capability(v_uid, 'time.read', p_employment_id, v_at) then
    return hr._time_refusal('hr_no_ot_request_authority',
      'An overtime request is raised by the employee it is about or by their manager on their behalf. You are neither for this employment.',
      jsonb_build_object('capability_required','time.read',
                         'subject_employment_id', p_employment_id, 'as_of', v_at));
  end if;
  v_actor := hr._time_actor_employment(v_uid, v_emp.organization_id);
  if v_actor is null then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in this organization, so this request cannot be attributed to anybody.');
  end if;

  perform hr.arm_write();
  insert into hr.overtime_preapproval
    (organization_id, employment_id, requested_by_employment_id, request_kind,
     covers_from, covers_to, requested_hours, reason_category_id, reason_note, shift_ids,
     state, rule_version_ids, engine_key, engine_version, calc,
     actor_type, actor_employment_id, actor_user_id)
  values (v_emp.organization_id, p_employment_id, v_actor, p_request_kind,
          p_covers_from, p_covers_to, p_requested_hours, p_reason_category_id,
          nullif(btrim(coalesce(p_reason_note,'')), ''), coalesce(p_shift_ids, '{}'::uuid[]),
          'requested', '{}'::uuid[], 'hr.time.ot_preapproval', 'l3.1',
          jsonb_build_object(
            'raised_by', case when v_self then 'employee' else 'manager_on_behalf' end,
            'payment_note', 'This request controls whether overtime is INCURRED. Overtime that is worked is paid at the correct rate whatever this request''s outcome.'),
          case when v_self then 'employee' else 'manager' end, v_actor, v_uid)
  returning id into v_id;

  v_req := hr.wf_request('overtime_preapproval', 'hr_overtime_preapproval', v_id,
             v_emp.organization_id,
             jsonb_build_object('employment_id', p_employment_id,
                                'covers_from', p_covers_from, 'covers_to', p_covers_to,
                                'requested_hours', p_requested_hours,
                                'request_kind', p_request_kind),
             p_employment_id, false, format('ot_preapproval:%s', v_id));

  if nullif(v_req ->> 'instance_id','') is not null then
    perform hr.arm_write();
    update hr.overtime_preapproval
       set workflow_instance_id = (v_req ->> 'instance_id')::uuid where id = v_id;
  end if;

  return hr._time_ok(jsonb_build_object(
    'preapprovalId', v_id,
    'employmentId', p_employment_id,
    'state', (select state from hr.overtime_preapproval where id = v_id),
    'coversFrom', p_covers_from, 'coversTo', p_covers_to,
    'requestedHours', p_requested_hours,
    'workflowInstanceId', nullif(v_req ->> 'instance_id','')::uuid,
    'workflow', v_req,
    'notice', 'Overtime that is worked is PAID whether or not this request is approved. A denial is an instruction not to work the hours, never a withholding of pay.'));
end $fn$;

comment on function hr.overtime_preapproval_create is
  'SPEC-TIME §4.4 / D24a — raises an overtime pre-approval and opens its workflow instance. Refuses a retroactive request in v1 (the live CHECK forbids it sitting in `requested`, and writing it already-decided would be a second approval path, which Law 5 forbids). Nothing here gates pay: overtime worked is overtime owed.';

create or replace function public.hr_overtime_preapproval_create(p_employment_id uuid,
                                                                 p_covers_from timestamptz,
                                                                 p_covers_to timestamptz,
                                                                 p_requested_hours numeric,
                                                                 p_request_kind text default 'advance',
                                                                 p_reason_category_id uuid default null,
                                                                 p_reason_note text default null,
                                                                 p_shift_ids uuid[] default '{}'::uuid[])
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.overtime_preapproval_create($1, $2, $3, $4, $5, $6, $7, $8);
$fn$;

comment on function public.hr_overtime_preapproval_create is
  'PostgREST-reachable wrapper for hr.overtime_preapproval_create. Thin delegate, no logic. `anon` holds nothing.';

do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr.ot_preapproval_wf_digest(text,uuid)',
    'hr.ot_preapproval_wf_validate(uuid)',
    'hr.ot_preapproval_wf_conflict(uuid)',
    'hr.ot_preapproval_wf_apply(uuid)',
    'hr.overtime_preapproval_create(uuid,timestamptz,timestamptz,numeric,text,uuid,text,uuid[])',
    'public.hr_overtime_preapproval_create(uuid,timestamptz,timestamptz,numeric,text,uuid,text,uuid[])'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_n integer; v_exp text; v_mode integer; v_act text; v_src text;
begin
  if not exists (select 1 from hr.workflow_flow_type
                  where flow_key = 'overtime_preapproval'
                    and target_token = 'hr_overtime_preapproval' and is_active) then
    raise exception 'hr_l3_27: the overtime_preapproval flow type is missing or inactive';
  end if;
  if exists (select 1 from hr.workflow_flow_type
              where flow_key = 'overtime_preapproval'
                and (apply_fn = 'hr.wf_apply_unimplemented(uuid)'::regprocedure
                     or validate_fn is null or conflict_fn is null or digest_fn is null)) then
    raise exception 'hr_l3_27: the overtime_preapproval flow type is not fully hooked';
  end if;

  -- 🚨 RD 1: the deadline NEVER approves and NEVER denies
  select on_expiry into v_exp from hr.workflow_definition
   where flow_key = 'overtime_preapproval'
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  if v_exp <> 'escalate' then
    raise exception 'hr_l3_27: the OT pre-approval on_expiry is %, and §4.4 says it escalates and nothing else', v_exp;
  end if;
  select sd.autonomy_mode, sd.authority_action into v_mode, v_act
    from hr.workflow_step_definition sd
    join hr.workflow_definition d on d.id = sd.workflow_definition_id
   where d.flow_key = 'overtime_preapproval' and sd.step_key = 'manager_decision';
  if v_mode = 3 then
    raise exception 'hr_l3_27: the OT decision step is at autonomy_mode 3, which lets hr.wf_tick close it automatically. §4.4 forbids auto-approval outright.';
  end if;
  if v_act <> 'overtime_approve' then
    raise exception 'hr_l3_27: the OT decision step uses % rather than the seeded overtime_approve action', v_act;
  end if;

  -- 🚨 THE WAGE LAW, ASSERTED STRUCTURALLY: no OT pre-approval function may write a pay row.
  for v_src in
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr'
       and p.proname in ('ot_preapproval_wf_validate','ot_preapproval_wf_conflict',
                         'ot_preapproval_wf_apply','_ot_preapproval_decided',
                         'overtime_preapproval_create')
  loop
    if v_src ~* '(update|insert into|delete from)\s+hr\.(work_interval|workweek|pay_period_employment|payroll_export)' then
      raise exception 'hr_l3_27: an OT pre-approval function writes to a PAY table. Unapproved overtime is still paid; nothing in this lane may touch a pay row.';
    end if;
  end loop;

  if has_function_privilege('anon',
       'public.hr_overtime_preapproval_create(uuid,timestamptz,timestamptz,numeric,text,uuid,text,uuid[])',
       'execute') then
    raise exception 'hr_l3_27: anon holds EXECUTE on hr_overtime_preapproval_create';
  end if;

  -- the flow points at its own published default
  select count(*) into v_n from hr.workflow_flow_type ft
    join hr.workflow_definition d on d.id = ft.default_definition_id
   where ft.flow_key = 'overtime_preapproval' and d.status = 'published';
  if v_n <> 1 then
    raise exception 'hr_l3_27: the OT flow type does not point at a published default definition';
  end if;
end $$;
