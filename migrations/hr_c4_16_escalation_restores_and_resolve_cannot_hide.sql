-- HR domain C4 — migration 16 (register item HRB-008 follow-up, lane workflow-engine; round-5 T1).
--
-- 🚨 THREE DEFECTS THAT COMBINED, LIVE, TO KILL A REAL TIMECARD WHILE MAKING IT INVISIBLE.
--
-- Reconstructed from the G2V instance's own event ledger, 2026-08-27, not reasoned about:
--
--   10:45  routed        failed → active   the step recovers, routed to the employee (hr_c4_11)
--   11:23  failed        approver_ineligible, refused: [{"why": "excluded_by_caller"}]
--   11:29  failure_resolved  action=resolve  "…employee has no platform login… handled on paper"
--
-- Somebody pressed **Escalate** on the employee's own attestation. `hr.wf_escalate` re-resolves
-- while EXCLUDING the current holders — so on a self-step it excludes the only person who may ever
-- take it, the rung empties, and the step lands `unroutable`. Then `resolve` on the resulting
-- failure row closed the last thing that was surfacing the problem. Net effect: a dead step, a
-- stuck instance, an empty failure queue, and a pay period that can never be approved — with
-- nothing anywhere to look at.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 A SELF-STEP CANNOT BE ESCALATED, AND THE REFUSAL SAYS WHAT TO DO INSTEAD.
--    Escalation means "give this to somebody else". On an `allows_self` step that is the employee's
--    own signature, and hr_l3_26 RD 2 already ruled it out in the automated lane for exactly this
--    reason — *"escalating an attestation hands somebody else the employee's signature"* — by
--    setting the definition's `on_expiry` to `hold`. The MANUAL door had no such guard, so the one
--    control the task page actually wires up was the one control this step must never take. §8.2
--    node G is the deadline path for a self-step: reminders, then `not_attested`. Never escalate.
--
-- 2. 🚨 A REFUSED ESCALATION RESTORES THE PRIOR APPROVER SET. RULED against §1.9 pass 4, which says
--    *"If escalation itself resolves to nobody → `unroutable` failure row."* That sentence is about
--    the FAILURE ROW, and it is obeyed — the row is still raised, and this migration does not touch
--    it. The spec says **nothing** about what happens to the step, and leaving it dead turns a
--    failed *improvement* into a regression: before the click the request was actionable by its
--    original approver; after it, by nobody, and the operator now has a second problem to resolve.
--    So the step returns to `active` with its original `resolved_approver_ids`, `resolved_user_ids`,
--    `resolution_path`, `due_at` and grants, and the attempt is recorded in
--    `resolution_evidence.escalation_refused` plus an `escalated` event marked `refused`. An
--    escalation that finds nobody better leaves the request exactly as actionable as it was, with
--    the attempt on the record. (Coordinator steer 2026-08-27; spec silent, so the steer stands.)
--
-- 3. 🚨 `resolve` MAY NOT BE A WAY TO MAKE A DEAD STEP DISAPPEAR. Marking a failure row resolved
--    while its step is still `unroutable` closes the only thing surfacing the problem. It is
--    refused, by name, listing what the operator can actually do — retry it, close it
--    `not_attested`, reassign it, or abandon the instance. This is the same tombstone class as
--    hr_c4_12's binding: a queue that looks clean because the evidence was swept up, not fixed.
--
-- 4. `not_attested` NOW ACCEPTS AN `unroutable` STEP, AND SO DOES THE SWEEP. "Active but nobody
--    took it" and "never routable in the first place" are the same fact from the employee's side:
--    nothing was attested. Both are closable, and both must be, or a step that died the way this
--    one did has no honest ending at all.
--
-- 5. EVERY `hr.wf_resolve_failure` ENVELOPE NOW CARRIES `outcome`. L10 wired the task page's
--    Resolve terminal to read `outcome` off the returned envelope; it was dark because nothing
--    emitted the key. Emitting it on every branch — including the refusals above — makes that
--    terminal live with no client change.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.9 pass 4, §8.2 node G, §2.2; hr_l3_26 RD 2.
-- Applied live as `hr_c4_16_escalation_restores_and_resolve_cannot_hide`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_16_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. escalation: guard + restore
do $mig$
declare
  v_oid oid; v_def text; v_new text;

  v_guard_old constant text := $o$  v_from  := st.resolved_approver_ids[1];$o$;
  v_guard_new constant text := $o$  -- 🚨 RD 1: A SELF-STEP CANNOT BE ESCALATED. Escalation re-resolves while EXCLUDING the current
  -- holders, so on an `allows_self` step it excludes the only person who may ever take it and the
  -- rung empties by construction. hr_l3_26 RD 2 already ruled this out in the automated lane —
  -- "escalating an attestation hands somebody else the employee's signature" — via on_expiry=hold.
  -- §8.2 node G is the deadline path here: reminders, then not_attested.
  if sd.allows_self then
    return jsonb_build_object('granted', false, 'reason', 'WF_SELF_STEP_NOT_ESCALATABLE',
      'detail', 'this step is the subject''s own to take, so there is nobody to escalate it to. Close it as not_attested through its failure row, or reassign the step if somebody else should now hold it.',
      'available_actions', jsonb_build_array('not_attested','reassign'));
  end if;

  v_from  := st.resolved_approver_ids[1];$o$;

  v_ref_old constant text := $o$  if not (v_res ->> 'granted')::boolean then
    -- §1.9 pass 4: if escalation itself resolves to nobody, that is an `unroutable` failure row,
    -- which the activation already opened. The step stays visible, never silently parked.
    return v_res;
  end if;$o$;
  v_ref_new constant text := $o$  if not (v_res ->> 'granted')::boolean then
    -- 🚨 RD 2: §1.9 pass 4 requires the FAILURE ROW ("if escalation itself resolves to nobody ->
    -- `unroutable` failure row") and the activation has already opened it — that is untouched. The
    -- spec says nothing about the STEP, and leaving it dead turns a failed improvement into a
    -- regression: before the attempt the request was actionable by its original approver, after it
    -- by nobody. The prior approver set is restored exactly, and the attempt goes on the record.
    update hr.workflow_step
       set state                 = 'active',
           state_reason          = null,
           resolved_approver_ids = st.resolved_approver_ids,
           resolved_user_ids     = st.resolved_user_ids,
           resolution_path       = st.resolution_path,
           activated_at          = st.activated_at,
           due_at                = st.due_at,
           resolution_evidence   = coalesce(st.resolution_evidence, '{}'::jsonb)
                                   || jsonb_build_object('escalation_refused',
                                        jsonb_build_object('at', now(),
                                                           'reason', v_res ->> 'reason',
                                                           'detail', v_res ->> 'detail'))
     where id = p_step_id;
    perform hr._wf_grant_step(p_step_id);
    perform hr._wf_project_step(p_step_id);
    perform hr._wf_event(inst.id, p_step_id, 'escalated', 'active', 'active', 'hr_admin',
                         auth.uid(), null,
                         jsonb_build_object('escalation', 'refused',
                                            'reason', v_res ->> 'reason',
                                            'restored_approver_ids', to_jsonb(st.resolved_approver_ids),
                                            'note', 'escalation found nobody better; the request is exactly as actionable as it was and the failure row records the attempt'));
    return v_res || jsonb_build_object('restored', true,
                                       'restored_approver_ids', to_jsonb(st.resolved_approver_ids));
  end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_escalate';
  if v_oid is null then raise exception 'hr_c4_16: hr.wf_escalate does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$WF_SELF_STEP_NOT_ESCALATABLE$chk$ in v_def) > 0 then
    raise notice 'hr_c4_16: hr.wf_escalate already guards self-steps and restores on refusal';
  else
    if position(v_guard_old in v_def) = 0 or position(v_ref_old in v_def) = 0 then
      raise exception 'hr_c4_16: hr.wf_escalate does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_guard_old, v_guard_new);
    v_new := replace(v_new, v_ref_old,   v_ref_new);
    execute v_new;
    raise notice 'hr_c4_16: hr.wf_escalate refuses self-steps and restores the prior approvers on a refused escalation';
  end if;
end
$mig$;

-- ============================================================ 2. `resolve` cannot hide a dead step
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  if p_action = 'not_attested' then$o$;
  v_rep constant text := $o$  -- 🚨 RD 3: `resolve` MAY NOT MAKE A DEAD STEP DISAPPEAR. Marking the row resolved while its step
  -- is still `unroutable` closes the only thing that was surfacing the problem — the step stays
  -- dead, the instance stays stuck, and nothing anywhere shows it. Measured live: an escalation on
  -- a self-step killed a step, and `resolve` then swept the evidence away.
  if p_action = 'resolve' and f.workflow_step_id is not null
     and (select s.state from hr.workflow_step s where s.id = f.workflow_step_id) = 'unroutable' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_STILL_UNROUTABLE',
      'outcome', 'refused',
      'detail', 'this failure''s step is still unroutable, so resolving the row would hide a dead step instead of fixing it. Retry it, close it as not_attested, reassign it, or abandon the instance.',
      'workflow_step_id', f.workflow_step_id,
      'available_actions', v_actions - 'resolve');
  end if;

  if p_action = 'not_attested' then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$WF_STEP_STILL_UNROUTABLE$chk$ in v_def) > 0 then
    raise notice 'hr_c4_16: hr.wf_resolve_failure already refuses to hide a dead step';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_16: hr.wf_resolve_failure does not carry hr_c4_15''s not_attested branch — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_16: hr.wf_resolve_failure refuses `resolve` while the step is unroutable';
  end if;
end
$mig$;

-- ============================================================ 3. `outcome` on every envelope (RD 5)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_a_old constant text := $o$    return jsonb_build_object('granted', true, 'action', p_action, 'not_attested', v_res);$o$;
  v_a_new constant text := $o$    return jsonb_build_object('granted', true, 'action', p_action, 'outcome', 'not_attested',
                              'not_attested', v_res);$o$;
  v_b_old constant text := $o$    return jsonb_build_object('granted', true, 'action', p_action, 'retry', v_res,
                              'failure_state', (select state from hr.workflow_failure
                                                 where id = p_failure_id));$o$;
  v_b_new constant text := $o$    return jsonb_build_object('granted', true, 'action', p_action, 'retry', v_res,
                              'outcome', case when coalesce((v_res ->> 'granted')::boolean, false)
                                              then 'retried' else 'retry_failed' end,
                              'failure_state', (select state from hr.workflow_failure
                                                 where id = p_failure_id));$o$;
  v_c_old constant text := $o$    return jsonb_build_object('granted', true, 'action', p_action, 'step', v_res);$o$;
  v_c_new constant text := $o$    return jsonb_build_object('granted', true, 'action', p_action, 'outcome', 'resolved',
                              'step', v_res);$o$;
  v_d_old constant text := $o$  return jsonb_build_object('granted', true, 'action', p_action, 'failure_id', p_failure_id);$o$;
  v_d_new constant text := $o$  -- RD 5: the task page's Resolve terminal reads `outcome` off this envelope.
  return jsonb_build_object('granted', true, 'action', p_action, 'failure_id', p_failure_id,
                            'outcome', case p_action when 'abandon' then 'abandoned'
                                                     when 'reassign' then 'reassigned'
                                                     else 'resolved' end);$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  v_def := pg_get_functiondef(v_oid);
  if position(v_d_new in v_def) > 0 then
    raise notice 'hr_c4_16: hr.wf_resolve_failure already emits outcome on every branch';
  else
    if position(v_a_old in v_def) = 0 or position(v_b_old in v_def) = 0
       or position(v_c_old in v_def) = 0 or position(v_d_old in v_def) = 0 then
      raise exception 'hr_c4_16: hr.wf_resolve_failure does not carry the expected returns — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_a_old, v_a_new);
    v_new := replace(v_new, v_b_old, v_b_new);
    v_new := replace(v_new, v_c_old, v_c_new);
    v_new := replace(v_new, v_d_old, v_d_new);
    execute v_new;
    raise notice 'hr_c4_16: every hr.wf_resolve_failure envelope now carries `outcome`';
  end if;
end
$mig$;

-- ============================================================ 4. an unroutable step can still end
do $mig$
declare
  v_oid oid; v_def text;
  v_h_old constant text := $o$  if st.state <> 'active' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('this step is %s and can no longer be closed as not_attested', st.state));
  end if;$o$;
  v_h_new constant text := $o$  -- RD 4: "active but nobody took it" and "never routable in the first place" are the same fact
  -- from the employee's side — nothing was attested. Both must be closable, or a step that died
  -- the way the G2V one did has no honest ending at all.
  if st.state not in ('active','unroutable') then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('this step is %s and can no longer be closed as not_attested', st.state));
  end if;$o$;
  v_s_old constant text := $o$       and ws.state = 'active'$o$;
  v_s_new constant text := $o$       and ws.state in ('active','unroutable')$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  v_def := pg_get_functiondef(v_oid);
  if position(v_h_new in v_def) > 0 then
    raise notice 'hr_c4_16: hr._wf_not_attested already accepts an unroutable step';
  else
    if position(v_h_old in v_def) = 0 then
      raise exception 'hr_c4_16: hr._wf_not_attested does not carry the expected state guard';
    end if;
    execute replace(v_def, v_h_old, v_h_new);
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_attestation_sweep';
  v_def := pg_get_functiondef(v_oid);
  if position(v_s_new in v_def) > 0 then
    raise notice 'hr_c4_16: the sweep already sees unroutable attestations';
  else
    if position(v_s_old in v_def) = 0 then
      raise exception 'hr_c4_16: hr.timecard_attestation_sweep does not carry the expected state predicate';
    end if;
    execute replace(v_def, v_s_old, v_s_new);
    raise notice 'hr_c4_16: the sweep now also sees attestations that never routed';
  end if;
end
$mig$;

-- ============================================================ 5. post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_escalate';
  if v_src !~ 'WF_SELF_STEP_NOT_ESCALATABLE' then
    raise exception 'hr_c4_16: hr.wf_escalate can still escalate a self-step';
  end if;
  if v_src !~ 'restored_approver_ids' then
    raise exception 'hr_c4_16: a refused escalation still leaves the step dead';
  end if;
  -- §1.9 pass 4's failure row is NOT suppressed: the activation path that opens it is untouched
  if v_src !~ 'hr\.wf_activate_step\(p_step_id, st\.resolved_approver_ids\)' then
    raise exception 'hr_c4_16: hr.wf_escalate no longer re-resolves through wf_activate_step, so §1.9''s failure row would not be raised';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  if v_src !~ 'WF_STEP_STILL_UNROUTABLE' then
    raise exception 'hr_c4_16: `resolve` can still hide an unroutable step';
  end if;
  -- RD 5: every non-refusal branch emits `outcome`
  select count(*) into v_bad from regexp_matches(v_src, '''outcome''', 'g');
  if v_bad < 5 then
    raise exception 'hr_c4_16: only % outcome emission(s) in hr.wf_resolve_failure; expected at least 5', v_bad;
  end if;
  if v_src !~ 'available_actions' or v_src !~ 'retry_succeeded_at' then
    raise exception 'hr_c4_16: hr_c4_15''s vocabulary validation or retry close was lost';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  if v_src !~ 'st\.state not in \(''active'',''unroutable''\)' then
    raise exception 'hr_c4_16: hr._wf_not_attested still refuses an unroutable step';
  end if;
  if v_src !~ '_wf_close_step\(p_step, ''skipped'', ''not_attested''\)' then
    raise exception 'hr_c4_16: hr_c4_15''s RD 12 close was lost';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_attestation_sweep';
  if v_src !~ 'ws\.state in \(''active'',''unroutable''\)' then
    raise exception 'hr_c4_16: the sweep still ignores attestations that never routed';
  end if;
  if v_src !~ 'hr\._wf_not_attested\(r\.step_id' then
    raise exception 'hr_c4_16: the sweep stopped delegating to the one transition';
  end if;

  -- hr_c4_11..15 all still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') !~ 'no_reach' then
    raise exception 'hr_c4_16: hr_c4_11''s self-step lane was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_activate_step') !~ 'unactionable_no_reach' then
    raise exception 'hr_c4_16: hr_c4_15''s unactionable failure was lost';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_16: % engine function(s) went back to the legacy write-guard arm', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_16: % hr CONFORMANCE finding(s)', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_16_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_16: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
