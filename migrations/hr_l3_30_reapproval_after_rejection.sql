-- HR domain L3 — migration 11 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- 🚨 A REJECTED TIMECARD COULD NEVER BE APPROVED AGAIN. Found by executing the flow, not by reading
-- it: §6.5's cycle is reject → row back to `open` → attestation reopens → employee re-attests →
-- manager approves. The last step failed silently.
--
-- `hr.timecard_wf_apply` opened the manager-approval instance with the idempotency key
-- `approval:<pay_period_employment_id>`. That key is stable for the LIFE OF THE ROW, so the second
-- time it was used — after a rejection had closed the first approval instance —
-- `hr.wf_request` correctly treated it as a replay and handed back the ALREADY-REJECTED instance
-- instead of opening a new one. No step was active on it, so `hr.wf_decide` refused with
-- `WF_STEP_CLOSED`, and the timecard sat `attested` forever with nobody able to act on it. A
-- returned timecard is the ordinary case, not an edge one, so this would have stranded real
-- timecards on a real pay group.
--
-- The key is now scoped to the ATTESTATION CYCLE that produced it: `approval:<ppe>:<attestation
-- instance>`. One attestation instance can open at most one approval instance — which is the
-- property idempotency was there to guarantee — while a fresh attestation after a rejection gets a
-- fresh approval. The rejection trigger already keyed its re-attestation on the rejected instance's
-- id (`reattest:<ppe>:<rejected instance>`) and was correct; this makes the two symmetric.
--
-- Authority: SPEC-TIME §6.5, §7.1, §14 D7; SPEC-WORKFLOW-ENGINE §4.2 (idempotency replay returns
-- the existing instance and does not error — which is exactly why a stale key fails quietly).
-- Applied live as `hr_l3_30_reapproval_after_rejection`. Idempotent.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

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

  if inst.flow_key = 'timecard_attestation' then
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
      v_state := v_ppe.state;
    elsif v_dec.decision = 'attested_with_exception' then
      v_out := 'disputed';
      v_state := 'disputed';
      update hr.pay_period_employment
         set state = 'disputed',
             attested_at = now(),
             attestation_response = coalesce(v_dec.client_context, '{}'::jsonb),
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
               jsonb_build_object('pay_period_id', v_ppe.pay_period_id,
                                  'employment_id', v_ppe.employment_id,
                                  'exception_count', v_exc,
                                  'ot_hours', v_ot,
                                  'attestation_outcome', v_out,
                                  'attestation_instance_id', p_instance_id,
                                  'has_dispute', v_ppe.disputed_at is not null or v_out = 'disputed'),
               v_ppe.employment_id, false,
               -- 🚨 SCOPED TO THIS ATTESTATION CYCLE. `approval:<ppe>` alone is stable for the life
               -- of the row, so after a rejection hr.wf_request replayed the CLOSED instance and the
               -- timecard could never be approved again (found by executing §6.5's cycle).
               format('approval:%s:%s', v_ppe.id, p_instance_id));

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
  'SPEC-WORKFLOW-ENGINE §4.3 / SPEC-TIME §6.4 / §6.5 / L3-36 — the timecard apply hook. On timecard_attestation it READS the decision row: attested → attested; attested_with_exception → disputed with the employee''s reason as dispute_note verbatim; NO decision → the row STAYS open, attested_at stays NULL and not_attested is recorded. It then opens the manager approval instance in all three cases, keyed to THIS attestation cycle so a timecard returned under §6.5 can be re-attested and approved (a key scoped only to the row replayed the closed instance and stranded it). On timecard_approval it flips THIS EMPLOYMENT''S row to approved and never touches hr.pay_period.';

do $$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_wf_apply';
  -- strpos, not LIKE: the literal being searched for contains `%s`, which LIKE would read as a
  -- wildcard and match anything at all — an assertion that always passes is worse than none.
  if strpos(v_src, 'format(''approval:%s:%s'', v_ppe.id, p_instance_id)') = 0 then
    raise exception 'hr_l3_30: the approval idempotency key must be scoped to the attestation instance, or a returned timecard can never be approved again';
  end if;
  if strpos(v_src, 'format(''approval:%s'', v_ppe.id)') > 0 then
    raise exception 'hr_l3_30: the row-scoped approval idempotency key is still present';
  end if;
end $$;
