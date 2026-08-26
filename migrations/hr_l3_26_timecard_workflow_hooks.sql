-- HR domain L3 — migration 7 of 8 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE TIMECARD WORKFLOW HOOKS (L3-36), THE COMPLETED STEP DEFINITIONS (L3-35), THE REJECTION RULE
-- MADE STRUCTURAL (L3-37) AND THE ATTESTATION DEADLINE (L3-38).
--
-- All three timecard flow types were registered with the right targets and then left as STUBS:
-- `validate_fn`, `conflict_fn` and `result_fn` NULL, `apply_fn = hr.wf_apply_unimplemented`, which
-- refuses every apply with `pillar_lane_not_built`. This migration is the pillar lane. It adds no
-- approvals table, no approver column, no reminder job and no second inbox (Law 5): the engine
-- already owns all four, and everything below is a hook it calls.
--
-- Authority: SPEC-WORKFLOW-ENGINE §4.1–§4.4 and §8.2 (not restated); SPEC-TIME §1.5, §2.2, §6.4,
-- §6.5, §7.1, §14 D6/D7/D8; R-L3 L3-35…L3-38 and U-13.
-- Applied live as `hr_l3_26_timecard_workflow_hooks`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE ATTESTATION STEP'S RESOLVER MOVES FROM `requester` TO `fixed_user` WITH
--    `{"employment_source":"subject"}`, BECAUSE `requester` ROUTED THE EMPLOYEE'S ATTESTATION TO THE
--    HR ADMIN. Proven from the live engine, not guessed: `hr.wf_resolve_approvers`'s `requester`
--    rung returns `inst.requester_employment_id`, and `hr.wf_request` sets that to the CALLER's
--    employment. The attestation instance is opened by `hr.pay_period_transition`, i.e. by whoever
--    pressed Submit — an HR or payroll admin. The step would therefore resolve to that admin, and
--    `hr.can_approve('timecard_attest', …)` would then return `v_is_self` = FALSE for them, so every
--    attestation step in the product would have come back `predicate_refused` → `unroutable`. The
--    engine's own RECORDED DECISION 7 provides the fix inside its declared vocabulary:
--    `resolver_kind = 'fixed_user'` with `resolver_config = {"employment_source":"subject"}` "names
--    the SUBJECT of the instance … This is CONFIG, not a new rung". With `allows_self = true` and
--    `timecard_attest`'s `allows_self` metadata, `hr.can_approve` returns `v_is_self` = TRUE for the
--    employee and FALSE for everybody else — which is exactly a self-step.
--    **OWED, owner SPEC-WORKFLOW-ENGINE §8.2:** its flowchart says `resolver_kind=requester` for the
--    attestation step. That is correct only if the employee opens their own instance, which §7.1
--    says they do not. The node needs the one-word correction to `fixed_user (subject)`.
--
-- 2. 🚨 THE ATTESTATION DEFINITION'S `on_expiry` MOVES FROM `escalate` TO `hold`, BECAUSE ESCALATING
--    AN ATTESTATION HANDS SOMEBODY ELSE THE EMPLOYEE'S SIGNATURE. `hr.wf_tick` PASS 4 escalates any
--    active step whose `due_at` has passed when `on_expiry = 'escalate'`, and `hr.wf_escalate`
--    re-resolves the step to a DIFFERENT holder. On an attestation step that means a manager becomes
--    the person who can press "attested" on their report's timecard. §2.2 and §7.1 both say the
--    deadline behaviour is "reminders, then auto-close as not_attested and flag it to the manager —
--    NEVER silently attested", and a manager attesting on the employee's behalf is worse than silent.
--    `hold` parks the instance visibly (PASS 6 opens a failure row a human owns) and never approves.
--    `escalate_after_hours` is set NULL on the step for the same reason.
--
-- 3. 🚨 `hr.timecard_wf_apply` READS THE DECISION ROWS AND NEVER ASSUMES ONE. The engine calls
--    `apply_fn` when an instance reaches `approved` — including when its only step closed as
--    `expired`. So apply looks for an actual `hr.workflow_decision` on the attestation step:
--      • `attested` / `approved`  → the row becomes `attested`, `attested_at` is stamped.
--      • `attested_with_exception` → the row becomes `disputed`, `dispute_note` is the employee's
--        reason VERBATIM, and nothing ever overwrites it.
--      • NO decision at all      → the row STAYS `open`, `attested_at` stays NULL, and
--        `metadata.attestation_outcome = 'not_attested'` is recorded with the manager flagged.
--    There is no branch in which an unattested timecard becomes an attested one.
--
-- 4. 🚨 THE REJECTION RULE IS A TRIGGER, NOT A CONVENTION (§14 D7 / L3-37). The engine has no reject
--    hook — `compensate_fn` is only ever called by `hr.wf_cancel` (verified live). So
--    `hr._timecard_reject_reopen` fires AFTER UPDATE on `hr.workflow_instance` for
--    `flow_key = 'timecard_approval'` reaching `rejected`/`returned`: it moves THAT EMPLOYMENT's
--    `hr.pay_period_employment` row to `open`, clears `manager_approved_at`, and opens a fresh
--    `timecard_attestation` instance. **`hr.pay_period` is not touched, and the trigger has no
--    statement that could touch it.** One disputed timecard cannot un-submit a 400-person pay group,
--    and `submitted → open` is not even a legal pay-period transition (`hr._pay_period_transition`
--    would raise), so the structure and the machine agree.
--
-- 5. THERE IS NO ROW-LEVEL `reopened` AND THIS MIGRATION NEVER INVENTS ONE (R-L3 U-13).
--    `hr.pay_period_employment.state`'s CHECK is `open · attested · disputed · approved · exported ·
--    locked`. A reopened period leaves its rows `approved`; only the period header shows `reopened`.
--    `hr.timecard_wf_validate` therefore treats a `reopened` period as decidable, and nothing here
--    writes a row state the CHECK does not carry.
--
-- 6. THE DIGEST IS NARROW, AND DELIBERATELY NOT `hr.wf_digest_whole_row`. §4.4 names what it must
--    cover: "pay-period-employment id, total hours by earning code, adjustment ids". A whole-row
--    digest over `hr.pay_period_employment` would include `calc` and `computed_at`, so every
--    recompute — including one that changed no figure — would fire `on_target_change` and restart a
--    flow a manager was halfway through. `hr.timecard_wf_digest` hashes exactly the three things a
--    manager is actually approving, and it branches on `target_token` so `hr_time_adjustment`
--    (the correction flow's target) hashes the adjustment's own material fields instead.
--
-- 7. 🚨 `hr.timecard_wf_conflict` FIRES ON EVIDENCE THAT LANDED AFTER THE FIGURES WERE COMPUTED, NOT
--    ON "ANY PUNCH SINCE SUBMIT" — AND IT NEVER SILENTLY REJECTS. The engine already owns the
--    "hours changed" case: a new punch that changed a total changes the digest, and `hr.wf_decide`
--    returns `WF_TARGET_CHANGED` before `conflict_fn` is ever reached. Duplicating that here would
--    be two mechanisms on one fact. What the digest CANNOT see is a punch that landed or was voided
--    after the intervals were computed and has not been recomputed yet — the case where the numbers
--    on the approver's screen predate the evidence behind them. That is what this hook detects, and
--    it hands back the punch ids, the timestamps and the count so the approver is shown exactly what
--    changed. It clears itself the moment a recompute runs, so it can never park a timecard forever.
--
-- 8. VALIDATION IS HARD ONLY WHERE THE TIMECARD IS GENUINELY UN-DECIDABLE. §4.4's worked example
--    lists "no orphan punches" as a hard check, and it is implemented literally — an UNPAIRED open
--    punch inside the period, which is a timecard with no end time and therefore no total. Open
--    exceptions, disputes, auto-close estimates and OT are ADVISORY: they ride along and are shown
--    to every approver (§4.4), because the approver is the person who resolves them and refusing to
--    route the request to them helps nobody. Over-tightening is weighed exactly as heavily as a leak.
--
-- 9. THE PAYROLL EXCEPTION STEP KEEPS `timecard_approve`, AND THE DEBT IS NAMED. §8.2's third step
--    is an "HR/payroll admin step", but the live `hr_approval_action` vocabulary has no payroll
--    review token and adding one is Core C3's registry, not this lane's. The step condition
--    (`payload.exception_count > 0` or `payload.ot_hours > 0`) is what makes it a distinct gate; the
--    action is the same. **OWED, owner SPEC-ACCESS §1.3a / core-c3:** a `timecard_payroll_review`
--    action so the second gate resolves to a different population than the first.
--
-- 10. THE SWEEP IS A CALLABLE FUNCTION AND THERE IS NO SCHEDULE ROW. "No unapproved schedules —
--     callable functions only." `hr.timecard_attestation_sweep(p_pay_period_id, p_dry_run)` matches
--     `hr.punch_orphan_sweep`'s precedent exactly: an authenticated HR/payroll caller runs it, it
--     defaults to a DRY RUN, and it reports what it would do. The REMINDERS it waits on are the
--     engine's own (`hr.wf_tick` PASS 1, `reminder_max` on the definition) — this lane builds no
--     second reminder job, which Law 5 forbids outright.
--
-- 11. "THE ONLY v1 STEP THAT SETS `allows_self`" IS ALREADY FALSE, AND THE ASSERTION SAYS SO RATHER
--     THAN ENFORCING A CLAIM THAT WOULD DELETE ANOTHER LANE'S ROWS. R-L3 L3-35 and
--     SPEC-WORKFLOW-ENGINE §8.2 both call the attestation "the only v1 step that sets it". Live,
--     THREE platform step definitions do: `timecard_attestation.employee_attestation`,
--     `acknowledgment_campaign_item.acknowledge` and `corrective_action_ack.acknowledge` — and both
--     of the others are correct, because an acknowledgment IS inherently a self-act and both of their
--     authority actions carry `allows_self: true` in the vocabulary. So the assertion here is scoped
--     to the three TIMECARD flows, where the claim is true and this lane owns the rows.
--     **OWED, owner R-L3-READINESS L3-35 / SPEC-WORKFLOW-ENGINE §8.2:** restate as "the only
--     TIMECARD step that sets it"; acknowledgment steps are self-steps by nature.
--
-- 12. 🚨 THE OVERDUE ATTESTATION STEP CLOSES AS `skipped`, NOT `expired`, AND THAT IS FORCED BY THE
--     ENGINE, NOT PREFERRED. Read live: `hr._wf_join` treats any non-optional step whose state is
--     outside `('approved','auto_approved','skipped')` as an unfavourable step and returns WITHOUT
--     calling `hr._wf_apply`. Closing the attestation as `expired` would therefore park the instance
--     forever, `hr.timecard_wf_apply` would never run, `not_attested` would never be recorded, and
--     the manager approval instance would never open — the timecard would silently vanish from every
--     queue, which is worse than either failure mode the deadline rule is trying to prevent. §7.1
--     routes the no-action case straight to the manager (node H → node I), so the closure has to be
--     one the engine continues through. The fact that nobody attested is carried by the step's
--     `state_reason = 'not_attested'`, by the event log, by `hr.pay_period_employment.metadata
--     .attestation_outcome`, and above all by `attested_at` STAYING NULL.
--     **OWED, owner SPEC-WORKFLOW-ENGINE §1.4:** `hr.workflow_step.state` has no member meaning
--     "closed with no decision, flow continues". `skipped` is carrying it.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. hr.timecard_wf_digest (RD 6)
create or replace function hr.timecard_wf_digest(p_target_token text, p_target_id uuid)
returns text language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare v_material jsonb;
begin
  if p_target_token = 'hr_time_adjustment' then
    select jsonb_build_object(
             'adjustment_id', ta.id,
             'employment_id', ta.employment_id,
             'original_pay_period_id', ta.original_pay_period_id,
             'target_pay_period_id', ta.target_pay_period_id,
             'work_date', ta.work_date,
             'earning_code_id', ta.earning_code_id,
             'hours_delta', ta.hours_delta,
             'amount_delta', ta.amount_delta,
             'reason_note', ta.reason_note)
      into v_material
      from hr.time_adjustment ta where ta.id = p_target_id;

  elsif p_target_token = 'hr_pay_period_employment' then
    -- §4.4: the ppe id, the total hours BY EARNING CODE, and the adjustment ids. Nothing else —
    -- see RD 6 on why `calc` and `computed_at` are deliberately outside the digest.
    select jsonb_build_object(
             'pay_period_employment_id', ppe.id,
             'employment_id', ppe.employment_id,
             'pay_period_id', ppe.pay_period_id,
             'hours_by_earning_code', coalesce(h.by_code, '{}'::jsonb),
             'adjustment_ids', coalesce(a.ids, '[]'::jsonb))
      into v_material
      from hr.pay_period_employment ppe
      join hr.pay_period pp on pp.id = ppe.pay_period_id
      left join lateral (
        select jsonb_object_agg(z.code, z.h) by_code
          from (select ec.code, sum(wi.hours) h
                  from hr.work_interval wi
                  join hr.earning_code ec on ec.id = wi.earning_code_id
                 where wi.employment_id = ppe.employment_id and wi.is_current
                   and (wi.pay_period_id = ppe.pay_period_id
                        or (wi.pay_period_id is null
                            and wi.local_work_date between pp.period_start_on and pp.period_end_on))
                 group by ec.code) z
      ) h on true
      left join lateral (
        select jsonb_agg(ta.id order by ta.id) ids
          from hr.time_adjustment ta
         where ta.employment_id = ppe.employment_id
           and (ta.original_pay_period_id = ppe.pay_period_id
                or ta.target_pay_period_id = ppe.pay_period_id)
      ) a on true
     where ppe.id = p_target_id;
  else
    return hr.wf_digest_whole_row(p_target_token, p_target_id);
  end if;

  if v_material is null then return null; end if;
  return encode(sha256(convert_to(jsonb_pretty(v_material), 'UTF8')), 'hex');
end $fn$;

comment on function hr.timecard_wf_digest is
  'SPEC-WORKFLOW-ENGINE §4.4 — the timecard target digest. Covers the pay_period_employment id, total hours BY EARNING CODE and the adjustment ids, and nothing else: a whole-row digest would include `calc`/`computed_at` and restart a manager''s half-finished review on any recompute that changed no figure. Branches to the adjustment''s own material fields for hr_time_adjustment.';

-- ============================================================ 2. hr.timecard_wf_validate (RD 8)
create or replace function hr.timecard_wf_validate(p_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  inst   hr.workflow_instance%rowtype;
  v_ppe  hr.pay_period_employment%rowtype;
  v_per  hr.pay_period%rowtype;
  v_hard jsonb := '[]'::jsonb;
  v_adv  jsonb := '[]'::jsonb;
  v_n    integer;
  v_bad  text;
  v_open integer;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then
    return jsonb_build_object('hard', jsonb_build_array(jsonb_build_object(
      'code','instance_not_found','detail','the instance disappeared between request and validate')),
      'advisory', '[]'::jsonb);
  end if;

  select * into v_ppe from hr.pay_period_employment where id = inst.target_id;
  if not found then
    return jsonb_build_object('hard', jsonb_build_array(jsonb_build_object(
      'code','timecard_row_missing',
      'detail','there is no hr.pay_period_employment row for this instance to decide')),
      'advisory', '[]'::jsonb);
  end if;
  select * into v_per from hr.pay_period where id = v_ppe.pay_period_id;

  -- ---------------------------------------------------------------- HARD: is it decidable at all?
  -- RD 5: `reopened` IS decidable — a reopened period leaves its rows approved and reopens the steps.
  if v_per.state not in ('submitted','approved','reopened') then
    v_hard := v_hard || jsonb_build_object(
      'code','period_not_submitted',
      'detail', format('The pay period is %s. A timecard is decided after the period is submitted, not before.', v_per.state),
      'pay_period_id', v_per.id, 'period_state', v_per.state);
  end if;

  if inst.flow_key = 'timecard_approval' and v_ppe.state = 'approved' then
    v_hard := v_hard || jsonb_build_object(
      'code','timecard_already_approved',
      'detail','This timecard is already approved. Re-approving it would record a second decision on one fact.',
      'row_state', v_ppe.state);
  end if;

  -- HARD (§4.4 literally): an UNPAIRED open punch — a day with no end time has no total to approve.
  select count(*) into v_n
    from hr.punch p
   where p.employment_id = v_ppe.employment_id
     and p.voided_at is null
     and p.local_work_date between v_per.period_start_on and v_per.period_end_on
     and p.punch_kind in ('clock_in','break_start','meal_start')
     and not exists (
       select 1 from hr.punch q
        where q.employment_id = p.employment_id and q.voided_at is null
          and q.occurred_at > p.occurred_at
          and q.punch_kind in ('clock_out','break_end','meal_end'));
  if v_n > 0 then
    v_hard := v_hard || jsonb_build_object(
      'code','unpaired_punch',
      'detail', format('%s punch(es) in this period were never closed, so those days have no end time and no total. Close or correct them first — auto-close writes a marked estimate, it does not invent a measurement.', v_n),
      'unpaired_count', v_n, 'door', 'hr_punch_correct');
  end if;

  -- HARD: an interval categorised against a code that is no longer usable
  select string_agg(distinct ec.code, ', ') into v_bad
    from hr.work_interval wi
    join hr.earning_code ec on ec.id = wi.earning_code_id
   where wi.employment_id = v_ppe.employment_id and wi.is_current
     and (wi.pay_period_id = v_ppe.pay_period_id
          or (wi.pay_period_id is null
              and wi.local_work_date between v_per.period_start_on and v_per.period_end_on))
     and not ec.is_active;
  if v_bad is not null then
    v_hard := v_hard || jsonb_build_object(
      'code','inactive_earning_code',
      'detail', format('Hours in this period are categorised against earning code(s) that are no longer active: %s. Recategorise them before approving — an export line on an inactive code is rejected downstream.', v_bad),
      'codes', v_bad);
  end if;

  -- ---------------------------------------------------------------- ADVISORY (RD 8): ride along
  select count(*) into v_open
    from hr.attendance_exception ae
   where ae.employment_id = v_ppe.employment_id
     and ae.local_work_date between v_per.period_start_on and v_per.period_end_on
     and ae.resolution_state in ('open','acknowledged','escalated');
  if v_open > 0 then
    v_adv := v_adv || jsonb_build_object(
      'code','open_exceptions',
      'detail', format('%s attendance exception(s) in this period are unresolved. They do not block this decision, but a row with an open exception is excluded from BULK approve.', v_open),
      'open_exception_count', v_open, 'door', 'hr_attendance_exception_resolve');
  end if;

  if v_ppe.disputed_at is not null and v_ppe.dispute_resolved_at is null then
    v_adv := v_adv || jsonb_build_object(
      'code','open_disagreement',
      'detail','The employee attested with exception and their disagreement is unresolved. Approving over it is legitimate and is recorded; the disagreement travels to the export and is never overwritten.',
      'dispute_note', v_ppe.dispute_note, 'disputed_at', v_ppe.disputed_at);
  end if;

  select count(*) into v_n
    from hr.work_interval wi
   where wi.employment_id = v_ppe.employment_id and wi.is_current
     and (wi.pay_period_id = v_ppe.pay_period_id
          or (wi.pay_period_id is null
              and wi.local_work_date between v_per.period_start_on and v_per.period_end_on))
     and coalesce((wi.calc ->> 'auto_close_estimate')::boolean, false);
  if v_n > 0 then
    v_adv := v_adv || jsonb_build_object(
      'code','auto_close_estimate_present',
      'detail', format('%s interval(s) in this period rest on an auto-closed punch and are ESTIMATES. An estimate never becomes a measurement — resolve it before payroll rather than approving around it.', v_n),
      'estimate_interval_count', v_n);
  end if;

  select count(*) into v_n
    from hr.work_interval wi
   where wi.employment_id = v_ppe.employment_id and wi.is_current and wi.is_overtime
     and (wi.pay_period_id = v_ppe.pay_period_id
          or (wi.pay_period_id is null
              and wi.local_work_date between v_per.period_start_on and v_per.period_end_on));
  if v_n > 0 then
    v_adv := v_adv || jsonb_build_object(
      'code','overtime_present',
      'detail', format('%s overtime interval(s) are in this period. Overtime is PAID whether or not it was pre-approved; this note opens the review and gates nothing about payment.', v_n),
      'overtime_interval_count', v_n);
  end if;

  return jsonb_build_object('hard', v_hard, 'advisory', v_adv);
end $fn$;

comment on function hr.timecard_wf_validate is
  'SPEC-WORKFLOW-ENGINE §4.4 / SPEC-TIME §1.5 — the timecard validate hook, run once at submit. HARD only where the timecard is genuinely un-decidable: the period is not submitted, the row is already approved, a punch is unpaired, or hours sit on an inactive earning code. Open exceptions, an unresolved disagreement, auto-close estimates and overtime are ADVISORY and ride along to every approver — the approver is the person who resolves them.';

-- ============================================================ 3. hr.timecard_wf_conflict (RD 7)
create or replace function hr.timecard_wf_conflict(p_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  inst    hr.workflow_instance%rowtype;
  v_ppe   hr.pay_period_employment%rowtype;
  v_per   hr.pay_period%rowtype;
  v_ta    hr.time_adjustment%rowtype;
  v_last  timestamptz;
  v_punch jsonb;
  v_adj   jsonb;
  v_n     integer;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then
    return jsonb_build_object('ok', false, 'detail', 'the instance no longer exists');
  end if;

  -- ---------------------------------------------------------------- the correction flow's target
  if inst.target_token = 'hr_time_adjustment' then
    select * into v_ta from hr.time_adjustment where id = inst.target_id;
    if not found then
      return jsonb_build_object('ok', false, 'detail', 'the adjustment row no longer exists');
    end if;
    select * into v_per from hr.pay_period where id = v_ta.original_pay_period_id;
    if v_per.state not in ('locked','closed') then
      return jsonb_build_object('ok', false,
        'code', 'original_period_unlocked',
        'detail', format('The period this correction targets is now %s rather than locked. An unlocked period is corrected by fixing the punch; approving this adjustment would create a second record of the same fact.', v_per.state),
        'pay_period_id', v_per.id, 'state', v_per.state);
    end if;
    if v_ta.approved_at is not null then
      return jsonb_build_object('ok', false, 'code', 'already_approved',
        'detail', 'This correction has already been approved once.');
    end if;
    return jsonb_build_object('ok', true);
  end if;

  -- ---------------------------------------------------------------- the timecard flows' target
  select * into v_ppe from hr.pay_period_employment where id = inst.target_id;
  if not found then
    return jsonb_build_object('ok', false, 'detail', 'the timecard row no longer exists');
  end if;
  select * into v_per from hr.pay_period where id = v_ppe.pay_period_id;

  if v_per.state not in ('submitted','approved','reopened') then
    return jsonb_build_object('ok', false, 'code', 'period_state_changed',
      'detail', format('The pay period moved to %s while this decision was open.', v_per.state),
      'period_state', v_per.state);
  end if;

  -- 🚨 RD 7: the figures on screen must not predate the evidence behind them. The "hours changed"
  -- case is the ENGINE's (the digest fires WF_TARGET_CHANGED before this hook is reached); this is
  -- the case the digest cannot see.
  select max(wi.computed_at) into v_last
    from hr.work_interval wi
   where wi.employment_id = v_ppe.employment_id and wi.is_current
     and (wi.pay_period_id = v_ppe.pay_period_id
          or (wi.pay_period_id is null
              and wi.local_work_date between v_per.period_start_on and v_per.period_end_on));
  v_last := coalesce(v_last, inst.submitted_at, inst.created_at);

  select jsonb_agg(jsonb_build_object(
           'punch_id', p.id, 'punch_kind', p.punch_kind, 'local_work_date', p.local_work_date,
           'occurred_at', p.occurred_at, 'created_at', p.created_at,
           'voided_at', p.voided_at, 'voided_reason', p.voided_reason,
           'what_changed', case when p.voided_at is not null and p.voided_at > v_last
                                then 'voided after these figures were computed'
                                else 'recorded after these figures were computed' end)
           order by p.occurred_at) into v_punch
    from hr.punch p
   where p.employment_id = v_ppe.employment_id
     and p.local_work_date between v_per.period_start_on and v_per.period_end_on
     and (p.created_at > v_last or (p.voided_at is not null and p.voided_at > v_last));

  select jsonb_agg(jsonb_build_object(
           'adjustment_id', ta.id, 'work_date', ta.work_date,
           'hours_delta', ta.hours_delta, 'amount_delta', ta.amount_delta,
           'reason_note', ta.reason_note, 'created_at', ta.created_at)
           order by ta.created_at) into v_adj
    from hr.time_adjustment ta
   where ta.employment_id = v_ppe.employment_id
     and (ta.original_pay_period_id = v_ppe.pay_period_id
          or ta.target_pay_period_id = v_ppe.pay_period_id)
     and ta.created_at > coalesce(inst.submitted_at, inst.created_at);

  v_n := coalesce(jsonb_array_length(v_punch), 0) + coalesce(jsonb_array_length(v_adj), 0);
  if v_n > 0 then
    -- IT NEVER SILENTLY REJECTS: the engine turns this into WF_CONFLICT and shows the approver the
    -- exact rows below, and it clears itself as soon as a recompute runs.
    return jsonb_build_object(
      'ok', false,
      'code', 'evidence_newer_than_figures',
      'detail', format('%s punch or correction record(s) landed after the hours on this timecard were computed. The totals you are looking at do not yet include them. Run the recompute for this period, then decide.', v_n),
      'figures_computed_at', v_last,
      'punches_since', coalesce(v_punch, '[]'::jsonb),
      'adjustments_since', coalesce(v_adj, '[]'::jsonb),
      'door', 'E-11 POST /hr/time/recompute',
      'clears_itself', true);
  end if;

  return jsonb_build_object('ok', true, 'figures_computed_at', v_last);
end $fn$;

comment on function hr.timecard_wf_conflict is
  'SPEC-WORKFLOW-ENGINE §4.4 — re-runs at EVERY decision. Detects punches and corrections that landed after the hours on the timecard were computed, i.e. the case the target digest cannot see, and hands the approver the exact rows and timestamps. It never silently rejects, and it clears itself once a recompute runs.';

-- ============================================================ 4. hr.timecard_wf_apply (RD 3)
create or replace function hr.timecard_wf_apply(p_instance_id uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst    hr.workflow_instance%rowtype;
  v_ppe   hr.pay_period_employment%rowtype;
  v_per   hr.pay_period%rowtype;
  v_dec   hr.workflow_decision%rowtype;
  v_state text;
  v_req   jsonb;
  v_exc   integer;
  v_ot    numeric;
  v_appr  integer;
  v_tot   integer;
  v_out   text;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'instance_not_found', 'detail', 'the instance disappeared before apply');
  end if;

  select * into v_ppe from hr.pay_period_employment where id = inst.target_id;
  if not found then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'timecard_row_missing',
      'detail', 'there is no hr.pay_period_employment row to flip; nothing was recorded');
  end if;
  select * into v_per from hr.pay_period where id = v_ppe.pay_period_id;

  -- ---------------------------------------------------------------- the attestation flow
  if inst.flow_key = 'timecard_attestation' then
    -- 🚨 RD 3: read the DECISION. An absent decision is `not_attested`, never `attested`.
    select * into v_dec from hr.workflow_decision d
     where d.workflow_instance_id = p_instance_id
       and not d.superseded_by_target_change
       and d.decision in ('attested','attested_with_exception','approved')
     order by d.created_at desc limit 1;

    perform hr.arm_write();
    -- NOTE: `perform` clobbers FOUND, so the branch keys off the decision row itself.
    if v_dec.id is null then
      v_out := 'not_attested';
      update hr.pay_period_employment
         set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
               'attestation_outcome', 'not_attested',
               'attestation_closed_at', now(),
               'attestation_note', 'The attestation deadline passed with no action from the employee. The step was closed as not_attested and flagged to the manager. NOTHING here attested on their behalf.')
       where id = v_ppe.id;
      -- the row STAYS `open`. attested_at is untouched.
      v_state := v_ppe.state;
    elsif v_dec.decision = 'attested_with_exception' then
      v_out := 'disputed';
      v_state := 'disputed';
      update hr.pay_period_employment
         set state = 'disputed',
             attested_at = now(),
             attestation_response = coalesce(v_dec.client_context, '{}'::jsonb),
             -- 🚨 the employee's words, verbatim. Nothing ever overwrites dispute_note.
             disputed_at = now(),
             dispute_note = v_dec.reason
       where id = v_ppe.id;
    else
      v_out := 'attested';
      v_state := 'attested';
      update hr.pay_period_employment
         set state = 'attested',
             attested_at = now(),
             attestation_response = coalesce(v_dec.client_context, '{}'::jsonb)
       where id = v_ppe.id;
    end if;

    -- the row is now decidable by the manager in every one of the three cases (§7.1: F, G and H
    -- all lead to I). Open the approval instance.
    select count(*) into v_exc
      from hr.attendance_exception ae
     where ae.employment_id = v_ppe.employment_id
       and ae.local_work_date between v_per.period_start_on and v_per.period_end_on
       and ae.resolution_state in ('open','acknowledged','escalated');
    select coalesce(sum(wi.hours), 0) into v_ot
      from hr.work_interval wi
     where wi.employment_id = v_ppe.employment_id and wi.is_current and wi.is_overtime
       and (wi.pay_period_id = v_ppe.pay_period_id
            or (wi.pay_period_id is null
                and wi.local_work_date between v_per.period_start_on and v_per.period_end_on));

    v_req := hr.wf_request('timecard_approval', 'hr_pay_period_employment', v_ppe.id,
               v_ppe.organization_id,
               -- the payroll-exception step's condition reads these two keys
               jsonb_build_object('pay_period_id', v_ppe.pay_period_id,
                                  'employment_id', v_ppe.employment_id,
                                  'exception_count', v_exc,
                                  'ot_hours', v_ot,
                                  'attestation_outcome', v_out,
                                  'has_dispute', v_ppe.disputed_at is not null or v_out = 'disputed'),
               v_ppe.employment_id, false,
               format('approval:%s', v_ppe.id));

    return jsonb_build_object('ok', true,
      'flow', 'timecard_attestation',
      'pay_period_employment_id', v_ppe.id,
      'attestation_outcome', v_out,
      'row_state', v_state,
      'attested_at_written', v_out <> 'not_attested',
      'approval_instance', v_req,
      'note', case when v_out = 'not_attested'
        then 'The deadline passed. The step closed as not_attested and the manager is flagged. The timecard was NOT attested and no signature was recorded on the employee''s behalf.'
        else null end);
  end if;

  -- ---------------------------------------------------------------- the manager-approval flow
  if inst.flow_key = 'timecard_approval' then
    select * into v_dec from hr.workflow_decision d
     where d.workflow_instance_id = p_instance_id and not d.superseded_by_target_change
       and d.decision in ('approved','auto_approved')
     order by d.created_at desc limit 1;

    perform hr.arm_write();
    -- 🚨 THIS EMPLOYMENT'S ROW, AND ONLY THIS ONE. hr.pay_period is not touched here, ever.
    update hr.pay_period_employment
       set state = 'approved',
           manager_approved_at = now(),
           manager_approved_by_employment_id = v_dec.actor_employment_id
     where id = v_ppe.id;

    select count(*) filter (where state = 'approved'), count(*)
      into v_appr, v_tot
      from hr.pay_period_employment where pay_period_id = v_ppe.pay_period_id;

    return jsonb_build_object('ok', true,
      'flow', 'timecard_approval',
      'pay_period_employment_id', v_ppe.id,
      'row_state', 'approved',
      'approved_by_employment_id', v_dec.actor_employment_id,
      'period_state_unchanged', v_per.state,
      'progress', jsonb_build_object('approved', v_appr, 'total', v_tot),
      'note', 'Approving one timecard moves that employment''s row only. The pay period itself transitions on the periods screen as a separate deliberate act (SPEC-TIME §6.4).');
  end if;

  return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
    'reason', 'unexpected_flow_key',
    'detail', format('hr.timecard_wf_apply was called for flow %s, which it does not own. Nothing was recorded.', inst.flow_key));
end $fn$;

comment on function hr.timecard_wf_apply is
  'SPEC-WORKFLOW-ENGINE §4.3 / SPEC-TIME §6.4 / L3-36 — the timecard apply hook. On timecard_attestation it READS the decision row: attested → the row becomes attested; attested_with_exception → disputed with the employee''s reason as dispute_note verbatim; NO decision (the deadline closed the step) → the row STAYS open, attested_at stays NULL and not_attested is recorded. It then opens the manager approval instance in all three cases. On timecard_approval it flips THIS EMPLOYMENT''S row to approved and never touches hr.pay_period.';

-- ============================================================ 5. the correction hooks
create or replace function hr.time_adjustment_wf_validate(p_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  inst   hr.workflow_instance%rowtype;
  v_ta   hr.time_adjustment%rowtype;
  v_per  hr.pay_period%rowtype;
  v_ec   hr.earning_code%rowtype;
  v_hard jsonb := '[]'::jsonb;
  v_adv  jsonb := '[]'::jsonb;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  select * into v_ta from hr.time_adjustment where id = inst.target_id;
  if not found then
    return jsonb_build_object('hard', jsonb_build_array(jsonb_build_object(
      'code','adjustment_missing','detail','there is no adjustment row for this instance')),
      'advisory', '[]'::jsonb);
  end if;
  select * into v_per from hr.pay_period where id = v_ta.original_pay_period_id;
  select * into v_ec  from hr.earning_code where id = v_ta.earning_code_id;

  if v_per.state not in ('locked','closed') then
    v_hard := v_hard || jsonb_build_object(
      'code','original_period_not_locked',
      'detail', format('The period this corrects is %s, not locked. An unlocked period is corrected by fixing the punch — an adjustment there would be a second record of one fact.', v_per.state),
      'pay_period_id', v_per.id, 'state', v_per.state, 'door', 'hr_punch_correct');
  end if;
  if coalesce(btrim(v_ta.reason_note), '') = '' then
    v_hard := v_hard || jsonb_build_object(
      'code','reason_note_missing',
      'detail','A post-lock correction with no written reason cannot be approved. The reason rides the export.');
  end if;
  if v_ec.id is null or not v_ec.is_active then
    v_hard := v_hard || jsonb_build_object(
      'code','earning_code_inactive',
      'detail','This correction is categorised against an earning code that is not active. An export line on an inactive code is rejected downstream.',
      'earning_code_id', v_ta.earning_code_id);
  end if;
  if coalesce(v_ta.hours_delta, 0) = 0 and coalesce(v_ta.amount_delta, 0) = 0 then
    v_hard := v_hard || jsonb_build_object(
      'code','empty_correction',
      'detail','This correction changes neither hours nor money, so there is nothing to approve.');
  end if;

  if v_ta.target_pay_period_id is null then
    v_adv := v_adv || jsonb_build_object(
      'code','no_target_period',
      'detail','No open pay period follows the one this corrects, so it is not yet tagged to an export. Approving it is fine; it rides the next export once payroll opens a period.');
  end if;
  if coalesce(v_ta.amount_delta, 0) = 0 and coalesce(v_ta.hours_delta, 0) <> 0 then
    v_adv := v_adv || jsonb_build_object(
      'code','amount_not_priced',
      'detail','This correction carries hours but no money figure. The amount is absent, not zero — the export prices it from the rate of record.');
  end if;

  return jsonb_build_object('hard', v_hard, 'advisory', v_adv);
end $fn$;

comment on function hr.time_adjustment_wf_validate is
  'SPEC-TIME §1.5 / §7.1 / L3-36 — the timecard_correction validate hook. Hard: the original period is not locked, the reason note is empty, the earning code is inactive, or the correction changes nothing. Advisory: no target period yet, or hours with no money figure (absent, not zero).';

create or replace function hr.time_adjustment_wf_apply(p_instance_id uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst  hr.workflow_instance%rowtype;
  v_ta  hr.time_adjustment%rowtype;
  v_dec hr.workflow_decision%rowtype;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  select * into v_ta from hr.time_adjustment where id = inst.target_id;
  if not found then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'adjustment_missing',
      'detail', 'there is no adjustment row to approve; nothing was recorded');
  end if;

  select * into v_dec from hr.workflow_decision d
   where d.workflow_instance_id = p_instance_id and not d.superseded_by_target_change
     and d.decision in ('approved','auto_approved')
   order by d.created_at desc limit 1;

  perform hr.arm_write();
  update hr.time_adjustment
     set approved_at = now(),
         approved_by_employment_id = v_dec.actor_employment_id
   where id = v_ta.id;

  return jsonb_build_object('ok', true,
    'flow', 'timecard_correction',
    'adjustment_id', v_ta.id,
    'original_pay_period_id', v_ta.original_pay_period_id,
    'target_pay_period_id', v_ta.target_pay_period_id,
    'approved_by_employment_id', v_dec.actor_employment_id,
    -- 🚨 THE LOCKED PERIOD IS NOT TOUCHED, AND THIS HOOK HAS NO STATEMENT THAT COULD TOUCH IT.
    'locked_period_rewritten', false,
    'note', 'The approved adjustment rides the NEXT export, tagged to the original period. The locked period is never rewritten and its delivered export is never regenerated. This hook records the approval; the export lane writes the line.');
end $fn$;

comment on function hr.time_adjustment_wf_apply is
  'SPEC-TIME §7.1 / L3-36 — the timecard_correction apply hook. Records the approval on hr.time_adjustment and nothing else: the locked period is never rewritten, and the export lane writes the line the adjustment rides on.';

-- ============================================================ 6. the flow-type wiring (L3-36)
select set_config('hr.privileged_write', 'on', false);

update hr.workflow_flow_type
   set validate_fn = 'hr.timecard_wf_validate(uuid)'::regprocedure,
       conflict_fn = 'hr.timecard_wf_conflict(uuid)'::regprocedure,
       apply_fn    = 'hr.timecard_wf_apply(uuid)'::regprocedure,
       digest_fn   = 'hr.timecard_wf_digest(text,uuid)'::regprocedure,
       on_target_change = 'restart',
       result_fn   = null,
       compensate_fn = null
 where flow_key in ('timecard_attestation','timecard_approval')
   and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;

-- §6.5: a rejection returns the timecard to the EMPLOYEE, who is the requester of the approval
-- instance. `hr._timecard_reject_reopen` handles both `rejected` and `returned`.
update hr.workflow_flow_type
   set on_reject = 'return_to_requester'
 where flow_key = 'timecard_approval'
   and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;

update hr.workflow_flow_type
   set validate_fn = 'hr.time_adjustment_wf_validate(uuid)'::regprocedure,
       conflict_fn = 'hr.timecard_wf_conflict(uuid)'::regprocedure,
       apply_fn    = 'hr.time_adjustment_wf_apply(uuid)'::regprocedure,
       digest_fn   = 'hr.timecard_wf_digest(text,uuid)'::regprocedure,
       on_target_change = 'restart',
       result_fn   = null,
       compensate_fn = null
 where flow_key = 'timecard_correction'
   and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;

-- ============================================================ 7. the step definitions (L3-35, RD 1-2)
-- 🚨 RD 1: the attestation self-step resolves to the SUBJECT, not the requester.
update hr.workflow_step_definition sd
   set resolver_kind = 'fixed_user',
       resolver_config = jsonb_build_object('employment_source', 'subject'),
       allows_self = true,
       authority_action = 'timecard_attest',
       -- the deadline is the knob's own default; the definition is the D13 override rung
       sla_hours = 24,
       -- 🚨 RD 2: NEVER escalate an attestation. It closes as not_attested or not at all.
       escalate_after_hours = null,
       autonomy_mode = 4,
       is_optional = false
  from hr.workflow_definition d
 where d.id = sd.workflow_definition_id
   and d.flow_key = 'timecard_attestation'
   and sd.step_key = 'employee_attestation';

-- 🚨 RD 2: `escalate` would hand a manager the employee's signature. `hold` parks it visibly.
update hr.workflow_definition
   set on_expiry = 'hold',
       reminder_cadence_hours = 12,
       reminder_max = 3,
       sla_hours = 24,
       notes = 'The attestation deadline: reminders (hr.wf_tick pass 1), then hr.timecard_attestation_sweep closes the step as not_attested and flags the manager. on_expiry is `hold`, never `escalate` and never `auto_approve` — escalating an attestation would let somebody else sign the employee''s timecard, and auto-approving would attest on their behalf. Neither is a knob.'
 where flow_key = 'timecard_attestation'
   and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;

-- the manager step and the conditional payroll step (RD 9)
update hr.workflow_step_definition sd
   set resolver_kind = 'authority',
       authority_action = 'timecard_approve',
       allows_self = false,
       escalate_after_hours = 96,
       autonomy_mode = 4
  from hr.workflow_definition d
 where d.id = sd.workflow_definition_id
   and d.flow_key = 'timecard_approval' and sd.step_key = 'manager_approval';

update hr.workflow_step_definition sd
   set resolver_kind = 'authority',
       authority_action = 'timecard_approve',
       allows_self = false,
       -- §8.2: exception_count above zero OR ot_hours above zero. Both keys are written into the
       -- instance payload by hr.timecard_wf_apply, so the condition can actually evaluate.
       condition = '{"any":[{"op":">","field":"payload.exception_count","value":0},
                            {"op":">","field":"payload.ot_hours","value":0}]}'::jsonb,
       autonomy_mode = 4
  from hr.workflow_definition d
 where d.id = sd.workflow_definition_id
   and d.flow_key = 'timecard_approval' and sd.step_key = 'payroll_exception_review';

-- the correction's manager + payroll steps
update hr.workflow_step_definition sd
   set resolver_kind = 'authority',
       authority_action = 'timecard_correction_approve',
       allows_self = false,
       requires_reason = true,
       autonomy_mode = 4
  from hr.workflow_definition d
 where d.id = sd.workflow_definition_id
   and d.flow_key = 'timecard_correction'
   and sd.step_key in ('manager_approval','payroll_approval');

-- ============================================================ 8. the rejection rule (L3-37, RD 4)
create or replace function hr._timecard_reject_reopen()
returns trigger language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_ppe hr.pay_period_employment%rowtype;
  v_stmt text;
begin
  -- 🚨 §14 D7. A rejection moves the EMPLOYMENT'S row and reopens its attestation. It does NOT move
  -- hr.pay_period, and there is deliberately no statement in this function that could.
  if new.flow_key <> 'timecard_approval' then return new; end if;
  if new.state not in ('rejected','returned') then return new; end if;
  if old.state = new.state then return new; end if;
  if new.target_token <> 'hr_pay_period_employment' then return new; end if;

  select * into v_ppe from hr.pay_period_employment where id = new.target_id;
  if not found then return new; end if;

  perform hr.arm_write();
  update hr.pay_period_employment
     set state = 'open',
         manager_approved_at = null,
         manager_approved_by_employment_id = null,
         -- the employee's disagreement, if any, is NOT cleared: a rejection is the manager's act,
         -- and it never erases what the employee said.
         metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
           'last_rejected_at', now(),
           'last_rejection_reason', new.state_reason,
           'rejection_note', 'The pay period itself was not moved. One returned timecard never un-submits a pay group (SPEC-TIME §14 D7).')
   where id = v_ppe.id;

  -- reopen the attestation: a new instance, because the previous one is closed and its binding with it
  v_stmt := hr._knob('hr.time_and_attendance','attestation_statement') #>> '{}';
  perform hr.wf_request('timecard_attestation', 'hr_pay_period_employment', v_ppe.id,
            v_ppe.organization_id,
            jsonb_build_object('pay_period_id', v_ppe.pay_period_id,
                               'employment_id', v_ppe.employment_id,
                               'reopened_after_rejection', true,
                               'rejection_reason', new.state_reason,
                               'attestation_statement', v_stmt),
            v_ppe.employment_id, false,
            format('reattest:%s:%s', v_ppe.id, new.id));

  return new;
end $fn$;

comment on function hr._timecard_reject_reopen is
  'SPEC-TIME §6.5 / §14 D7 / L3-37 — the rejection rule made structural. A rejected or returned timecard_approval instance moves THAT EMPLOYMENT''S hr.pay_period_employment row to `open`, clears the manager approval, and reopens the attestation as a fresh instance. hr.pay_period is untouched: one disputed timecard must never un-submit a 400-person pay group, and submitted → open is not even a legal period transition.';

drop trigger if exists _zz_timecard_reject_reopen on hr.workflow_instance;
create trigger _zz_timecard_reject_reopen
  after update of state on hr.workflow_instance
  for each row execute function hr._timecard_reject_reopen();

-- ============================================================ 9. the attestation deadline (L3-38, RD 10)
create or replace function hr.timecard_attestation_sweep(p_pay_period_id uuid,
                                                         p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_uid   uuid := auth.uid();
  v_per   hr.pay_period%rowtype;
  v_due   integer;
  v_rows  jsonb := '[]'::jsonb;
  v_n     integer := 0;
  r       record;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'The attestation sweep is run by a person, on purpose. There is no schedule behind it.');
  end if;
  select * into v_per from hr.pay_period where id = p_pay_period_id;
  if not found then
    return hr._time_refusal('hr_pay_period_not_found', 'No pay period with that id exists.');
  end if;
  if not hr.capability(v_uid, 'payroll.read', null, v_per.period_end_on) then
    return hr._time_refusal('hr_no_sweep_authority',
      'Closing overdue attestations is an HR or payroll admin act.',
      jsonb_build_object('capability_required', 'payroll.read', 'as_of', v_per.period_end_on));
  end if;

  v_due := coalesce((hr._knob('hr.time_and_attendance','attestation_due_hours_after_period_end')
                       #>> '{}')::integer, 24);

  for r in
    select ws.id step_id, ws.workflow_instance_id, ws.activated_at, ws.reminders_sent,
           d.reminder_max, ppe.id ppe_id, ppe.employment_id, e.display_name
      from hr.workflow_step ws
      join hr.workflow_instance wi on wi.id = ws.workflow_instance_id
      join hr.workflow_definition d on d.id = wi.workflow_definition_id
      join hr.pay_period_employment ppe on ppe.id = wi.target_id
      join hr.employment em on em.id = ppe.employment_id
      join hr.employee e on e.id = em.employee_id
     where wi.flow_key = 'timecard_attestation'
       and wi.target_token = 'hr_pay_period_employment'
       and ppe.pay_period_id = p_pay_period_id
       and ws.step_key = 'employee_attestation'
       and ws.state = 'active'
       and now() >= (v_per.period_end_on::timestamptz + make_interval(hours => v_due))
       -- 🚨 the reminders are the ENGINE's (hr.wf_tick pass 1). This lane builds no second reminder
       -- job, and it will not close a step the employee was never reminded about.
       and ws.reminders_sent >= d.reminder_max
  loop
    v_n := v_n + 1;
    v_rows := v_rows || jsonb_build_object(
      'workflow_step_id', r.step_id,
      'workflow_instance_id', r.workflow_instance_id,
      'pay_period_employment_id', r.ppe_id,
      'employment_id', r.employment_id,
      'employee', r.display_name,
      'reminders_sent', r.reminders_sent,
      'reminder_max', r.reminder_max,
      'action', case when p_dry_run then 'would close as not_attested'
                     else 'closed as not_attested' end);

    if not p_dry_run then
      -- 🚨 RD 12: `skipped`, NOT `expired`. `hr._wf_join` treats a non-optional step that closed
      -- outside ('approved','auto_approved','skipped') as an unfavourable step and PARKS the
      -- instance without applying — which would strand the timecard with no manager step at all.
      -- §7.1 routes the not-attested case straight on to the manager (node H → node I), so the
      -- closure must be one the engine continues through. The fact that nobody attested is carried
      -- by `state_reason`, by the event log, and by attested_at staying NULL.
      perform hr._wf_close_step(r.step_id, 'skipped', 'not_attested');
      perform hr._wf_notify(r.workflow_instance_id, r.step_id, 'hr.time.attestation_overdue',
                            'timeout_warning', null, r.employment_id,
                            jsonb_build_object('outcome', 'not_attested',
                                               'flagged_to', 'manager',
                                               'attested', false));
    end if;
  end loop;

  return hr._time_ok(jsonb_build_object(
    'payPeriodId', p_pay_period_id,
    'dryRun', p_dry_run,
    'dueHoursAfterPeriodEnd', v_due,
    'candidates', v_n,
    'rows', v_rows,
    'notice', 'An attestation is NEVER auto-attested. This sweep closes an overdue step as not_attested and flags the manager; the timecard stays open and unsigned. The reminders that precede it are the workflow engine''s own — this lane runs no reminder job of its own.'));
end $fn$;

comment on function hr.timecard_attestation_sweep is
  'SPEC-TIME §2.2 / §7.1 / L3-38 — the attestation deadline. After the engine has sent its reminders (hr.wf_tick pass 1, up to reminder_max), this closes an overdue employee_attestation step as `expired`/not_attested and flags the manager. It NEVER auto-attests: hr.timecard_wf_apply then finds no decision row and leaves the timecard open with attested_at NULL. Callable, defaults to a dry run, and there is no schedule row behind it.';

-- ============================================================ 10. grants
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr.timecard_wf_digest(text,uuid)',
    'hr.timecard_wf_validate(uuid)',
    'hr.timecard_wf_conflict(uuid)',
    'hr.timecard_wf_apply(uuid)',
    'hr.time_adjustment_wf_validate(uuid)',
    'hr.time_adjustment_wf_apply(uuid)',
    'hr.timecard_attestation_sweep(uuid,boolean)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_n integer; v_bad text; v_res text; v_cfg jsonb; v_exp text;
begin
  -- 🚨 no timecard flow may still point at the stub
  select string_agg(flow_key, ', ') into v_bad from hr.workflow_flow_type
   where flow_key in ('timecard_attestation','timecard_approval','timecard_correction')
     and (apply_fn = 'hr.wf_apply_unimplemented(uuid)'::regprocedure
          or validate_fn is null or conflict_fn is null);
  if v_bad is not null then
    raise exception 'hr_l3_26: timecard flow types still unimplemented or unhooked: %', v_bad;
  end if;

  -- RD 1: the attestation step resolves to the SUBJECT and allows self
  select sd.resolver_kind, sd.resolver_config, sd.allows_self::text
    into v_res, v_cfg, v_bad
    from hr.workflow_step_definition sd
    join hr.workflow_definition d on d.id = sd.workflow_definition_id
   where d.flow_key = 'timecard_attestation' and sd.step_key = 'employee_attestation';
  if v_res <> 'fixed_user' or coalesce(v_cfg ->> 'employment_source','') <> 'subject'
     or v_bad <> 'true' then
    raise exception 'hr_l3_26: the attestation step must resolve to the SUBJECT with allows_self=true; got % / % / %',
      v_res, v_cfg, v_bad;
  end if;

  -- 🚨 RD 2: the attestation NEVER auto-approves and NEVER escalates
  select on_expiry into v_exp from hr.workflow_definition
   where flow_key = 'timecard_attestation'
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  if v_exp in ('auto_approve','escalate') then
    raise exception 'hr_l3_26: the attestation definition on_expiry is %, which would attest or hand the signature to somebody else', v_exp;
  end if;
  if exists (select 1 from hr.workflow_step_definition sd
               join hr.workflow_definition d on d.id = sd.workflow_definition_id
              where d.flow_key = 'timecard_attestation' and sd.step_key = 'employee_attestation'
                and sd.escalate_after_hours is not null) then
    raise exception 'hr_l3_26: the attestation step must not escalate';
  end if;

  -- RD 11: the attestation is the only TIMECARD step that may set allows_self. It is NOT the only
  -- step in the product that does — two acknowledgment flows already do, and an acknowledgment is
  -- inherently a self-act. Asserting `= 1` here would be this lane asserting another lane's rows
  -- away, so the assertion is scoped to what this lane owns.
  select count(*) into v_n from hr.workflow_step_definition sd
    join hr.workflow_definition d on d.id = sd.workflow_definition_id
   where sd.allows_self and sd.deleted_at is null
     and d.flow_key in ('timecard_attestation','timecard_approval','timecard_correction');
  if v_n <> 1 then
    raise exception 'hr_l3_26: % timecard step definitions set allows_self; only employee_attestation may', v_n;
  end if;

  -- the payroll exception step is CONDITIONAL on the two keys the apply hook writes
  if not exists (select 1 from hr.workflow_step_definition sd
                   join hr.workflow_definition d on d.id = sd.workflow_definition_id
                  where d.flow_key = 'timecard_approval'
                    and sd.step_key = 'payroll_exception_review'
                    and sd.condition::text like '%payload.exception_count%'
                    and sd.condition::text like '%payload.ot_hours%') then
    raise exception 'hr_l3_26: the payroll exception step lost its condition';
  end if;

  -- the correction has BOTH steps
  select count(*) into v_n from hr.workflow_step_definition sd
    join hr.workflow_definition d on d.id = sd.workflow_definition_id
   where d.flow_key = 'timecard_correction' and sd.deleted_at is null;
  if v_n <> 2 then
    raise exception 'hr_l3_26: the correction flow has % steps, expected 2 (manager + payroll)', v_n;
  end if;

  -- the rejection trigger exists and is on the instance table
  if not exists (select 1 from pg_trigger t
                  where t.tgname = '_zz_timecard_reject_reopen'
                    and t.tgrelid = 'hr.workflow_instance'::regclass and not t.tgisinternal) then
    raise exception 'hr_l3_26: the D7 rejection trigger was not created';
  end if;

  -- the sweep refuses an unauthenticated caller rather than raising
  if coalesce((hr.timecard_attestation_sweep('00000000-0000-0000-0000-000000000000'::uuid, true)
                 ->> 'ok')::boolean, true) then
    raise exception 'hr_l3_26: the attestation sweep did not refuse an unauthenticated caller';
  end if;
end $$;
