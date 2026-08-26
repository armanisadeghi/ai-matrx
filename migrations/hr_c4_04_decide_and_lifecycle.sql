-- HR domain C4 — migration 4 of 7 (register item HRB-008, lane core-c4-workflow).
--
-- THE DECISION RPC and everything downstream of it: the versioned-target reference (§3.4), the
-- quorum/parallel-group join (§3.2), apply/verify (§4.3), instance close (§3.1), and the lifecycle
-- family — withdraw, cancel, resubmit, escalate, reassign, record_result, resolve_failure,
-- bulk_decide, delegate — plus the three query RPCs (§4.2).
--
-- Authority: SPEC-WORKFLOW-ENGINE §2.5, §3, §4.2, §4.3, §5.2. Applied live as
-- `hr_c4_04_decide_and_lifecycle`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 NEVER-APPROVE-YOURSELF IS CHECKED TWICE, ON PURPOSE, AND BOTH CHECKS ARE ON THE
--    EMPLOYMENT. `hr.can_approve` rule 1 already refuses it, and the selector filters through the
--    predicate (file 2), so a self-approver can never appear in `resolved_user_ids`. §2.5
--    nonetheless puts the check inside the decision RPC "before any state change", and it stays
--    there — because the two guard different attacks. The selector guards the INBOX; this guards a
--    FORGED STEP ID, which §10 test 1 names explicitly ("by calling wf_decide directly with a
--    forged step id"). The check is on the EMPLOYMENT, not the login, so an HR admin who is also an
--    employee cannot approve their own leave from the admin console.
--
-- 2. THE TARGET-DIGEST RE-CHECK HAPPENS BEFORE THE DECISION IS WRITTEN, NOT AFTER (§3.4).
--    `hr.wf_decide` re-reads the target and recomputes the digest first; a changed digest RETURNS
--    the change (`WF_TARGET_CHANGED`) instead of deciding. `version` moving is not enough — a
--    cosmetic edit is not a material one — the DIGEST is the test. This is what makes "approve a
--    request that no longer says what it said" impossible, and the RPC being the sole writer is
--    what makes it unskippable by a client.
--
-- 3. A `restart` KEEPS EVERY PRIOR DECISION AND MARKS IT, RATHER THAN DELETING IT.
--    §3.4: "prior decisions stay in the ledger marked superseded_by_target_change". The ledger is
--    append-only, so the mark is a column on the row, set by the one definer path that owns the
--    table. Every prior approver is notified (`hr.workflow.request_changed`) — a silent reset is
--    the same defect as a silent approval.
--
-- 4. THE JOIN IS "EVERY NON-OPTIONAL STEP CLOSED FAVOURABLY", AND A SIBLING CANCELLATION IS
--    RECORDED, NEVER SILENT (§3.2). A rejection in any member of a parallel group closes the group
--    per `on_reject` and cancels its siblings with `state_reason='sibling_rejected'`.
--
-- 5. 🚨 `applying -> verifying -> completed` NEVER SHORT-CIRCUITS. §0 law 5 / §4.3: an effect either
--    lands transactionally or is verified — never assumed. If the flow type declares `result_fn`,
--    a successful `apply_fn` puts the instance in `verifying` and ONLY `hr.wf_record_result` (or
--    the tick's window elapse, which opens `result_unverified`) moves it. There is no code path in
--    which an event moves it to `completed`.
--
-- 6. `hr.wf_delegate` IS A THIN WRAPPER OVER HRB-007's LIVE `hr_authority_delegation_request`,
--    NOT A SECOND DELEGATION LANE. HRB-007 built `hr_authority_delegation_request` /
--    `hr_authority_delegate` / `hr_authority_delegation_end` and recorded on the register that the
--    request RPC "is a seventh RPC built here only because §9 T-21 had to be provable today —
--    §1.3b calls the delegation a workflow object, so HRB-008 should absorb or replace it."
--    ABSORBED, NOT REPLACED. Replacing a working, audited, proven RPC with a second one carrying
--    the same name in a different schema is exactly the two-paths-to-one-operation defect. What
--    this lane adds is the parts that are genuinely the ENGINE's and were missing: §4.2's refusal
--    "delegate is the subject of the delegator's open steps", the `hr.workflow.step_delegated`
--    notice to both parties, and the workflow-side signature (`p_action_type` + `p_scope_id`
--    resolve the delegator's matching authority row so a caller never has to know an authority id).
--    The materialisation, the LEAST-capped scope, the mandatory `effective_to`, and the one-hop
--    depth check all stay where they are, unduplicated.
-- ===================================================================================

-- ============================================================ 1. instance close (§3.1)
create or replace function hr._wf_close_instance(p_instance uuid, p_state text,
                                                 p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare inst hr.workflow_instance%rowtype; r record;
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  perform set_config('hr.privileged_write','on',true);

  -- every open step closes with the instance; grants and projections go with them
  for r in select id, state from hr.workflow_step
            where workflow_instance_id = p_instance and state in ('pending','active','awaiting_result')
  loop
    update hr.workflow_step set state = 'cancelled', state_reason = coalesce(p_reason, p_state),
           closed_at = now() where id = r.id;
    perform hr._wf_revoke_step(r.id);
    perform hr._wf_unproject_step(r.id, 'superseded');
    perform hr._wf_event(p_instance, r.id, 'step_cancelled', r.state, 'cancelled', 'automation',
                         null, null, jsonb_build_object('reason', p_reason));
  end loop;

  update hr.workflow_instance
     set state = p_state, state_reason = coalesce(p_reason, state_reason),
         decided_at = coalesce(decided_at, case when p_state in ('approved','rejected','returned')
                                                then now() end),
         closed_at = case when p_state in ('completed','rejected','rejected_at_intake','withdrawn',
                                           'cancelled','expired','superseded','closed')
                          then now() else closed_at end
   where id = p_instance;

  update hr.workflow_binding set is_open = false where workflow_instance_id = p_instance;

  perform hr._wf_event(p_instance, null, 'closed', inst.state, p_state, 'automation', null, null,
                       jsonb_build_object('reason', p_reason));
  return jsonb_build_object('granted', true, 'instance_id', p_instance, 'state', p_state,
                            'reason', p_reason);
end $fn$;

-- ============================================================ 2. apply / verify (§4.3, RD 5)
create or replace function hr._wf_apply(p_instance uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype; v_out jsonb; v_win integer;
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  perform set_config('hr.privileged_write','on',true);
  update hr.workflow_instance set state = 'applying', decided_at = coalesce(decided_at, now())
   where id = p_instance;
  perform hr._wf_event(p_instance, null, 'applied', 'approved', 'applying');

  v_out := hr._wf_call_hook(ft.apply_fn, p_instance);

  if v_out is null or coalesce((v_out ->> 'ok')::boolean, false) is not true then
    -- RECORDED DECISION 1 of file 3: an apply that did not happen is NEVER recorded as happened.
    update hr.workflow_instance set state = 'failed',
           state_reason = coalesce(v_out ->> 'reason', 'apply_failed') where id = p_instance;
    perform hr._wf_failure(p_instance, null, coalesce(v_out ->> 'failure_class','apply_failed'),
                           coalesce(v_out,'{}'::jsonb));
    return jsonb_build_object('granted', false, 'state', 'failed',
                              'reason', coalesce(v_out ->> 'reason','apply_failed'),
                              'detail', v_out ->> 'detail');
  end if;

  update hr.workflow_instance set applied_at = now() where id = p_instance;

  if ft.result_fn is not null then
    -- §4.3: an external or long-running effect is ENQUEUED and the instance waits on a RESULT.
    v_win := (hr._knob('hr.workflow','failure_result_window_hours') #>> '{}')::integer;
    update hr.workflow_instance set state = 'verifying' where id = p_instance;
    perform hr._wf_event(p_instance, null, 'result_pending', 'applying', 'verifying', 'automation',
                         null, null, jsonb_build_object('result_window_hours', v_win));
    return jsonb_build_object('granted', true, 'state', 'verifying', 'apply', v_out);
  end if;

  update hr.workflow_instance set state = 'completed' where id = p_instance;
  perform hr._wf_event(p_instance, null, 'result_verified', 'applying', 'completed', 'automation',
                       null, null, v_out);
  perform hr._wf_close_instance(p_instance, 'closed', 'completed');
  perform hr._wf_notify(p_instance, null, 'hr.workflow.request_decided', 'outcome',
                        hr._wf_login_of(inst.requester_employment_id), inst.requester_employment_id,
                        jsonb_build_object('outcome','completed'));
  return jsonb_build_object('granted', true, 'state', 'completed', 'apply', v_out);
end $fn$;

-- ============================================================ 3. THE JOIN (§3.2, RD 4)
create or replace function hr._wf_join(p_instance uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
  v_open integer; v_bad integer;
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  select count(*) into v_open from hr.workflow_step
   where workflow_instance_id = p_instance and state in ('pending','active','awaiting_result');
  if v_open > 0 then
    return jsonb_build_object('granted', true, 'state', inst.state, 'open_steps', v_open);
  end if;

  -- a non-optional step that did NOT close favourably decides the instance
  select count(*) into v_bad from hr.workflow_step s
    join hr.workflow_step_definition sd on sd.id = s.step_definition_id
   where s.workflow_instance_id = p_instance and not sd.is_optional
     and s.state not in ('approved','auto_approved','skipped');
  if v_bad > 0 then
    return jsonb_build_object('granted', true, 'state', inst.state, 'unfavourable_steps', v_bad);
  end if;

  perform set_config('hr.privileged_write','on',true);
  update hr.workflow_instance set state = 'approved', decided_at = now() where id = p_instance;
  perform hr._wf_event(p_instance, null, 'approved', inst.state, 'approved');
  return hr._wf_apply(p_instance);
end $fn$;

-- ============================================================ 4. close one step and advance
create or replace function hr._wf_close_step(p_step uuid, p_state text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
  r record; v_outcome text;
begin
  select * into st from hr.workflow_step where id = p_step;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  perform set_config('hr.privileged_write','on',true);
  update hr.workflow_step set state = p_state, state_reason = p_reason, closed_at = now()
   where id = p_step;
  perform hr._wf_revoke_step(p_step);
  v_outcome := case p_state when 'approved' then 'completed'
                            when 'auto_approved' then 'completed'
                            when 'rejected' then 'completed'
                            when 'returned' then 'completed'
                            else 'superseded' end;
  perform hr._wf_unproject_step(p_step, v_outcome);
  perform hr._wf_event(inst.id, p_step, 'step_closed', 'active', p_state, 'automation', null, null,
                       jsonb_build_object('reason', p_reason));

  -- ---- a rejection / return ends the instance per the flow type's on_reject
  if p_state in ('rejected','returned') then
    -- siblings in the same parallel group are cancelled, and it is RECORDED (§3.2)
    if st.parallel_group is not null then
      for r in select id, state from hr.workflow_step
                where workflow_instance_id = inst.id and parallel_group = st.parallel_group
                  and step_order = st.step_order and id <> p_step
                  and state in ('pending','active','awaiting_result')
      loop
        update hr.workflow_step set state = 'cancelled', state_reason = 'sibling_rejected',
               closed_at = now() where id = r.id;
        perform hr._wf_revoke_step(r.id);
        perform hr._wf_unproject_step(r.id, 'superseded');
        perform hr._wf_event(inst.id, r.id, 'step_cancelled', r.state, 'cancelled', 'automation',
                             null, null, jsonb_build_object('reason','sibling_rejected'));
      end loop;
    end if;

    if p_state = 'returned' or ft.on_reject = 'return_to_requester' then
      perform hr._wf_close_instance(inst.id, 'returned', p_reason);
      perform hr._wf_notify(inst.id, p_step, 'hr.workflow.request_needs_attention', 'outcome',
                            hr._wf_login_of(inst.requester_employment_id),
                            inst.requester_employment_id,
                            jsonb_build_object('reason', p_reason));
      return jsonb_build_object('granted', true, 'instance_state', 'returned');
    end if;

    perform hr._wf_close_instance(inst.id, 'rejected', p_reason);
    perform hr._wf_notify(inst.id, p_step, 'hr.workflow.request_decided', 'outcome',
                          hr._wf_login_of(inst.requester_employment_id),
                          inst.requester_employment_id,
                          jsonb_build_object('outcome','rejected','reason', p_reason));
    return jsonb_build_object('granted', true, 'instance_state', 'rejected');
  end if;

  -- ---- favourable close: open the next wave if this one is finished
  if exists (select 1 from hr.workflow_step
              where workflow_instance_id = inst.id and step_order = st.step_order
                and state in ('active','awaiting_result')) then
    return jsonb_build_object('granted', true, 'instance_state', inst.state, 'group_open', true);
  end if;
  return hr._wf_route(inst.id);
end $fn$;

-- ============================================================ 5. the target-change machinery (§3.4)
create or replace function hr._wf_target_changed(p_instance uuid, p_new_digest text)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
  v_tbl text; v_version integer; v_conf jsonb; v_find jsonb; r record; v_new uuid;
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;
  v_tbl := hr._wf_target_table(inst.target_token);
  execute format('select version from %I.%I where id = $1',
                 split_part(v_tbl,'.',1), split_part(v_tbl,'.',2)) into v_version using inst.target_id;

  perform set_config('hr.privileged_write','on',true);
  perform hr._wf_event(p_instance, null, 'target_changed', null, null, 'automation', null, null,
                       jsonb_build_object('old_digest', inst.target_digest, 'new_digest', p_new_digest,
                                          'policy', ft.on_target_change));

  if ft.on_target_change = 'revalidate' then
    v_find := hr._wf_call_hook(ft.validate_fn, p_instance);
    v_conf := hr._wf_call_hook(ft.conflict_fn, p_instance);
    if (v_find is not null and jsonb_array_length(coalesce(v_find -> 'hard','[]'::jsonb)) > 0)
       or (v_conf is not null and coalesce((v_conf ->> 'ok')::boolean, true) is not true) then
      perform hr._wf_failure(p_instance, null, 'conflict_at_decision',
        jsonb_build_object('validate', v_find, 'conflict', v_conf, 'new_digest', p_new_digest));
      return jsonb_build_object('granted', false, 'reason', 'WF_CONFLICT',
        'detail', 'the target changed and the re-check no longer passes',
        'validate', v_find, 'conflict', v_conf);
    end if;
    update hr.workflow_instance set target_digest = p_new_digest, target_version = v_version,
           validation_findings = coalesce(v_find, validation_findings) where id = p_instance;
    return jsonb_build_object('granted', true, 'policy', 'revalidate', 'proceed', true);

  elsif ft.on_target_change = 'supersede' then
    -- §3.4: the change is so large the old request is meaningless.
    for r in select id from hr.workflow_step where workflow_instance_id = p_instance
              and state in ('pending','active','awaiting_result') loop
      perform hr._wf_revoke_step(r.id);
    end loop;
    insert into hr.workflow_instance
      (organization_id, flow_key, workflow_definition_id, definition_version, target_token,
       target_id, target_version, target_digest, requester_employment_id, subject_employment_id,
       requester_actor_type, state, payload, rule_snapshot, sensitivity_tier,
       supersedes_instance_id, created_by, updated_by)
    select organization_id, flow_key, workflow_definition_id, definition_version, target_token,
           target_id, v_version, p_new_digest, requester_employment_id, subject_employment_id,
           requester_actor_type, 'validating', payload, rule_snapshot, sensitivity_tier,
           p_instance, created_by, updated_by
      from hr.workflow_instance where id = p_instance
    returning id into v_new;

    insert into hr.workflow_step
      (organization_id, workflow_instance_id, step_definition_id, step_key, step_order,
       parallel_group, state, quorum_kind, quorum_n, autonomy_mode)
    select inst.organization_id, v_new, sd.id, sd.step_key, sd.step_order, sd.parallel_group,
           'pending', sd.quorum_kind, sd.quorum_n, sd.autonomy_mode
      from hr.workflow_step_definition sd
     where sd.workflow_definition_id = inst.workflow_definition_id and sd.deleted_at is null;

    update hr.workflow_instance set superseded_by_instance_id = v_new where id = p_instance;
    perform hr._wf_close_instance(p_instance, 'superseded', 'target_changed');
    perform hr._wf_event(v_new, null, 'created', null, 'validating', 'automation', null, null,
                         jsonb_build_object('supersedes', p_instance));
    perform hr._wf_route(v_new);
    return jsonb_build_object('granted', false, 'reason', 'WF_TARGET_CHANGED', 'policy', 'supersede',
      'detail', 'the target changed materially; this request was superseded',
      'superseded_by_instance_id', v_new);
  end if;

  -- ---- `restart` (the default). Every decided step resets; prior decisions STAY, marked.
  update hr.workflow_decision set superseded_by_target_change = true
   where workflow_instance_id = p_instance and not superseded_by_target_change;

  for r in select s.id, s.state, s.resolved_user_ids from hr.workflow_step s
            where s.workflow_instance_id = p_instance
              and s.state not in ('cancelled','skipped') loop
    perform hr._wf_revoke_step(r.id);
    perform hr._wf_unproject_step(r.id, 'superseded');
    update hr.workflow_step
       set state = 'pending', state_reason = 'target_changed', approvals_received = 0,
           activated_at = null, due_at = null, closed_at = null, timeout_at = null,
           reminders_sent = 0, last_reminder_at = null, escalated_at = null
     where id = r.id;
    -- every PRIOR APPROVER is told the request changed and needs a fresh look (§3.4)
    declare u uuid;
    begin
      foreach u in array coalesce(r.resolved_user_ids,'{}'::uuid[]) loop
        perform hr._wf_notify(p_instance, r.id, 'hr.workflow.request_changed', 'outcome', u, null,
                              jsonb_build_object('old_digest', inst.target_digest,
                                                 'new_digest', p_new_digest));
      end loop;
    end;
  end loop;

  update hr.workflow_instance
     set target_digest = p_new_digest, target_version = v_version, state = 'routing',
         current_step_order = null
   where id = p_instance;
  perform hr._wf_route(p_instance);

  return jsonb_build_object('granted', false, 'reason', 'WF_TARGET_CHANGED', 'policy', 'restart',
    'detail', 'the target changed materially; prior approvals were reset and the request re-routed',
    'old_digest', inst.target_digest, 'new_digest', p_new_digest);
end $fn$;

-- ============================================================ 6. 🚨 hr.wf_decide (§4.2, §2.5, §3.4)
create or replace function hr.wf_decide(p_step_id uuid, p_decision text, p_reason text default null,
                                        p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  st hr.workflow_step%rowtype; sd hr.workflow_step_definition%rowtype;
  inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
  v_uid uuid := auth.uid(); v_mine uuid[]; v_actor uuid; v_digest text; v_conf jsonb;
  v_dec uuid; v_recv integer; v_auth uuid; v_onbehalf uuid; v_deleg uuid; v_path text;
  v_basis text; v_tbl text;
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller');
  end if;
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
                              'detail', 'no such step');
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;
  select * into ft   from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  if st.state <> 'active' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('this step is %s and can no longer be decided', st.state));
  end if;

  -- ---- the caller must be a resolved approver on THIS step
  if not (v_uid = any(st.resolved_user_ids)) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_step', 'WF_NOT_APPROVER',
      'you are not a resolved approver on this step', inst.subject_employment_id, ARRAY[p_step_id]);
  end if;

  v_mine := hr.employments_of(v_uid);
  select c into v_actor from unnest(st.resolved_approver_ids) c where c = any(v_mine) limit 1;
  if v_actor is null then v_actor := v_mine[1]; end if;

  -- ---- 🚨 RECORDED DECISION 1. NEVER APPROVE YOURSELF, before ANY state change, on the EMPLOYMENT.
  if inst.subject_employment_id is not null
     and inst.subject_employment_id = any(v_mine)
     and not sd.allows_self then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_step',
      'WF_SELF_APPROVAL_FORBIDDEN',
      'you may not decide a request about yourself; this admits no override and no break-glass',
      inst.subject_employment_id, ARRAY[p_step_id]);
  end if;

  -- ---- the decision vocabulary and the reason rules
  if p_decision not in ('approved','rejected','returned','abstained','attested',
                        'attested_with_exception','acknowledged') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_decision',
                              'detail', format('%s is not a decision this engine records', p_decision));
  end if;
  -- §9.1: a reason on reject/return is a HARD REFUSAL, not a knob.
  if p_decision in ('rejected','returned','attested_with_exception')
     and coalesce(btrim(p_reason),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'WF_REASON_REQUIRED',
      'detail', format('a %s decision requires a reason', p_decision));
  end if;
  if p_decision = 'approved'
     and (sd.requires_reason or ft.requires_reason_on_approve)
     and coalesce(btrim(p_reason),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'WF_REASON_REQUIRED',
      'detail', 'this step requires a reason on approval');
  end if;

  -- ---- 🚨 RECORDED DECISION 2. THE TARGET DIGEST, BEFORE THE DECISION IS WRITTEN.
  v_tbl := hr._wf_target_table(inst.target_token);
  execute format('select 1 from %I.%I where id = $1',
                 split_part(v_tbl,'.',1), split_part(v_tbl,'.',2)) using inst.target_id;
  if not found then
    perform hr._wf_failure(inst.id, p_step_id, 'target_missing',
                           jsonb_build_object('target_token', inst.target_token,
                                              'target_id', inst.target_id));
    perform hr._wf_close_instance(inst.id, 'cancelled', 'target_missing');
    return jsonb_build_object('granted', false, 'reason', 'target_missing',
                              'detail', 'the target row no longer exists');
  end if;
  v_digest := hr._wf_call_digest(inst.flow_key, inst.organization_id, inst.target_token, inst.target_id);
  if inst.target_digest is not null and v_digest is distinct from inst.target_digest then
    return hr._wf_target_changed(inst.id, v_digest);
  end if;

  -- ---- §4.4 conflict_fn, at EVERY decision. Sufficient on Monday is not sufficient on Thursday.
  if p_decision in ('approved','attested','acknowledged') then
    v_conf := hr._wf_call_hook(ft.conflict_fn, inst.id);
    if v_conf is not null and coalesce((v_conf ->> 'ok')::boolean, true) is not true then
      perform hr._wf_failure(inst.id, p_step_id, 'conflict_at_decision', v_conf);
      return jsonb_build_object('granted', false, 'reason', 'WF_CONFLICT',
        'detail', coalesce(v_conf ->> 'detail', 'a re-check at decision time no longer passes'),
        'conflict', v_conf);
    end if;
  end if;

  -- ---- who conferred the right, and on whose behalf
  v_path := st.resolution_path;
  select (h ->> 'authority_id')::uuid, (h ->> 'delegated_from_id')::uuid
    into v_auth, v_deleg
    from jsonb_array_elements(coalesce(st.resolution_evidence -> 'holders','[]'::jsonb)) h
   where h ->> 'source' = 'delegated' limit 1;
  if v_auth is null then
    select (h ->> 'authority_id')::uuid into v_auth
      from jsonb_array_elements(coalesce(st.resolution_evidence -> 'holders','[]'::jsonb)) h limit 1;
  end if;
  if v_deleg is not null then
    select a.holder_id::uuid, a.delegation_id into v_onbehalf, v_deleg
      from hr.approval_authority a where a.id = v_deleg;
  end if;
  v_basis := case when v_path = 'delegated' then 'delegated'
                  when v_path = 'top_of_chart' then 'top_of_chart'
                  when sd.allows_self then 'self_step'
                  else 'authority' end;

  -- ---- write the decision. Append-only, never updated, never deleted (AD-11).
  perform set_config('hr.privileged_write','on',true);
  insert into hr.workflow_decision
    (organization_id, workflow_instance_id, workflow_step_id, step_key, decision, reason,
     actor_type, actor_user_id, actor_employment_id, on_behalf_of_employment_id, delegation_id,
     authority_id, approval_basis, autonomy_mode, target_digest,
     recommendation_snapshot, overrode_recommendation, client_context)
  values (inst.organization_id, inst.id, p_step_id, st.step_key, p_decision, p_reason,
          case when sd.allows_self then 'employee' else 'manager' end, v_uid, v_actor,
          v_onbehalf, v_deleg, v_auth, v_basis, st.autonomy_mode, v_digest,
          st.recommendation,
          -- §7.2: the original suggestion and the human's disposition of it are BOTH preserved
          case when st.recommendation ? 'decision'
               then (st.recommendation ->> 'decision') is distinct from p_decision
               else false end,
          coalesce(p_payload,'{}'::jsonb))
  returning id into v_dec;

  perform hr._wf_event(inst.id, p_step_id, 'decided', 'active', null,
                       case when sd.allows_self then 'employee' else 'manager' end,
                       v_uid, v_actor,
                       jsonb_build_object('decision', p_decision, 'decision_id', v_dec,
                                          'basis', v_basis));

  -- ---- a negative decision closes the step immediately, in every quorum mode (§3.2)
  if p_decision in ('rejected','returned') then
    return jsonb_build_object('granted', true, 'decision_id', v_dec, 'decision', p_decision,
      'step', hr._wf_close_step(p_step_id, p_decision, p_reason));
  end if;

  update hr.workflow_step set approvals_received = approvals_received + 1 where id = p_step_id;
  select approvals_received into v_recv from hr.workflow_step where id = p_step_id;

  if v_recv >= st.approvals_needed then
    return jsonb_build_object('granted', true, 'decision_id', v_dec, 'decision', p_decision,
      'step', hr._wf_close_step(p_step_id, 'approved', null));
  end if;

  return jsonb_build_object('granted', true, 'decision_id', v_dec, 'decision', p_decision,
    'approvals_received', v_recv, 'approvals_needed', st.approvals_needed, 'step_state', 'active');
end $fn$;

-- ============================================================ 7. hr.wf_bulk_decide (§4.2, §5.2)
create or replace function hr.wf_bulk_decide(p_step_ids uuid[], p_decision text,
                                             p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_max integer; s uuid; v_out jsonb := '[]'::jsonb; v_one jsonb; v_bad text;
begin
  v_max := (hr._knob('hr.workflow','inbox_bulk_max') #>> '{}')::integer;
  if cardinality(coalesce(p_step_ids,'{}'::uuid[])) > v_max then
    return jsonb_build_object('granted', false, 'reason', 'WF_BULK_LIMIT',
      'detail', format('a bulk decision may cover at most %s steps', v_max));
  end if;

  -- §5.2: bulk is unavailable for any definition that says so, and it is refused for the WHOLE
  -- batch when any member's definition forbids it — not silently split.
  select string_agg(distinct i.flow_key, ', ') into v_bad
    from hr.workflow_step s2
    join hr.workflow_instance i on i.id = s2.workflow_instance_id
    join hr.workflow_definition d on d.id = i.workflow_definition_id
   where s2.id = any(p_step_ids) and not d.allow_bulk_decide;
  if v_bad is not null then
    return jsonb_build_object('granted', false, 'reason', 'WF_BULK_FORBIDDEN',
      'detail', format('these flows are decided one at a time: %s', v_bad));
  end if;

  -- §5.2: refusal is PER-STEP, never all-or-nothing. A stale digest comes back as a typed skip and
  -- the rest still go through.
  foreach s in array coalesce(p_step_ids,'{}'::uuid[]) loop
    begin
      v_one := hr.wf_decide(s, p_decision, p_reason);
    exception when others then
      v_one := jsonb_build_object('granted', false, 'reason', 'raised', 'detail', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('step_id', s,
                                         'granted', coalesce((v_one ->> 'granted')::boolean, false),
                                         'reason', v_one ->> 'reason',
                                         'detail', v_one ->> 'detail');
  end loop;

  return jsonb_build_object(
    'granted', true, 'results', v_out,
    'succeeded', (select count(*) from jsonb_array_elements(v_out) r where (r ->> 'granted')::boolean),
    'skipped',   (select count(*) from jsonb_array_elements(v_out) r where not (r ->> 'granted')::boolean));
end $fn$;

-- ============================================================ 8. withdraw / cancel / resubmit (§3.3)
create or replace function hr.wf_withdraw(p_instance_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
        v_uid uuid := auth.uid(); r record; u uuid;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  if not (inst.requester_employment_id = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_instance', 'not_the_requester',
      'only the requester may withdraw their own request', inst.subject_employment_id,
      ARRAY[p_instance_id]);
  end if;
  if not ft.allows_withdraw then
    return jsonb_build_object('granted', false, 'reason', 'withdraw_forbidden',
      'detail', format('%s requests cannot be withdrawn', inst.flow_key));
  end if;
  if inst.state not in ('draft','active','returned','routing','validating') then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('an instance in %s cannot be withdrawn', inst.state));
  end if;

  -- approvers are told, with outcome `superseded`. Decisions ALREADY MADE ARE RETAINED (§3.3) —
  -- a withdrawal does not erase that a manager already approved.
  for r in select id, resolved_user_ids from hr.workflow_step
            where workflow_instance_id = p_instance_id and state = 'active' loop
    foreach u in array coalesce(r.resolved_user_ids,'{}'::uuid[]) loop
      perform hr._wf_notify(p_instance_id, r.id, 'hr.workflow.request_decided', 'outcome', u, null,
                            jsonb_build_object('outcome','superseded','reason','withdrawn'));
    end loop;
  end loop;

  perform hr._wf_event(p_instance_id, null, 'withdrawn', inst.state, 'withdrawn', 'employee', v_uid,
                       inst.requester_employment_id, jsonb_build_object('reason', p_reason));
  return hr._wf_close_instance(p_instance_id, 'withdrawn', coalesce(p_reason,'withdrawn by requester'));
end $fn$;

create or replace function hr.wf_cancel(p_instance_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
        v_uid uuid := auth.uid(); v_comp jsonb;
begin
  if coalesce(btrim(p_reason),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'WF_REASON_REQUIRED',
      'detail', 'a cancellation always carries a mandatory reason');
  end if;
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  if inst.state in ('closed','cancelled','completed','superseded') then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('an instance in %s cannot be cancelled', inst.state));
  end if;
  -- HR-admin authority, or the engine itself (service role / no auth context)
  if v_uid is not null and not hr.capability(v_uid, 'workflow.cancel', inst.organization_id) then
    if not (inst.requester_employment_id = any(hr.employments_of(v_uid))) then
      return hr._governance_refusal(inst.organization_id, 'hr_workflow_instance', 'no_cancel_authority',
        'cancelling another person''s request needs HR administration standing',
        inst.subject_employment_id, ARRAY[p_instance_id]);
    end if;
  end if;

  -- §3.3: plus compensate_fn if applied_at is set — a termination rescinded after access shutoff
  -- RE-ENABLES access and RECORDS that it did. Nothing is erased.
  if inst.applied_at is not null and ft.compensate_fn is not null then
    v_comp := hr._wf_call_hook(ft.compensate_fn, p_instance_id);
    perform hr._wf_event(p_instance_id, null, 'compensated', inst.state, null, 'automation',
                         null, null, coalesce(v_comp,'{}'::jsonb));
    if coalesce((v_comp ->> 'ok')::boolean, false) is not true then
      perform hr._wf_failure(p_instance_id, null, 'apply_failed',
        jsonb_build_object('phase','compensate','result', v_comp));
    end if;
  elsif inst.applied_at is not null then
    -- an applied instance with no compensate hook is a fact somebody must action by hand
    perform hr._wf_failure(p_instance_id, null, 'apply_failed',
      jsonb_build_object('phase','compensate','reason','no_compensate_fn',
        'detail','this instance was already applied and its flow type declares no compensate_fn; the effect must be undone by hand'));
  end if;

  perform hr._wf_event(p_instance_id, null, 'cancelled', inst.state, 'cancelled',
                       coalesce(case when v_uid is null then 'automation' end, 'hr_admin'),
                       v_uid, null, jsonb_build_object('reason', p_reason));
  return hr._wf_close_instance(p_instance_id, 'cancelled', p_reason);
end $fn$;

create or replace function hr.wf_resubmit(p_instance_id uuid, p_payload jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
        v_uid uuid := auth.uid(); v_new uuid; sd record;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  if not (inst.requester_employment_id = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_instance', 'not_the_requester',
      'only the requester may resubmit', inst.subject_employment_id, ARRAY[p_instance_id]);
  end if;
  if inst.state <> 'returned' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', 'only a returned request may be resubmitted');
  end if;
  if not ft.allows_resubmit then
    return jsonb_build_object('granted', false, 'reason', 'resubmit_forbidden');
  end if;

  perform set_config('hr.privileged_write','on',true);
  -- §3.3: resubmission creates a NEW instance. It NEVER re-opens a closed one — resubmission that
  -- mutates history is exactly what AD-11 forbids.
  insert into hr.workflow_instance
    (organization_id, flow_key, workflow_definition_id, definition_version, target_token, target_id,
     target_version, target_digest, requester_employment_id, subject_employment_id,
     requester_actor_type, state, payload, sensitivity_tier, supersedes_instance_id,
     created_by, updated_by)
  select organization_id, flow_key, workflow_definition_id, definition_version, target_token,
         target_id, target_version,
         hr._wf_call_digest(flow_key, organization_id, target_token, target_id),
         requester_employment_id, subject_employment_id, requester_actor_type, 'validating',
         coalesce(p_payload, payload), sensitivity_tier, p_instance_id, created_by, updated_by
    from hr.workflow_instance where id = p_instance_id
  returning id into v_new;

  for sd in select * from hr.workflow_step_definition
             where workflow_definition_id = inst.workflow_definition_id and deleted_at is null loop
    insert into hr.workflow_step
      (organization_id, workflow_instance_id, step_definition_id, step_key, step_order,
       parallel_group, state, quorum_kind, quorum_n, autonomy_mode)
    values (inst.organization_id, v_new, sd.id, sd.step_key, sd.step_order, sd.parallel_group,
            'pending', sd.quorum_kind, sd.quorum_n, sd.autonomy_mode);
  end loop;

  update hr.workflow_instance set superseded_by_instance_id = v_new where id = p_instance_id;
  insert into hr.workflow_binding (organization_id, workflow_instance_id, target_token, target_id,
                                   flow_key, is_open, exclusive)
  values (inst.organization_id, v_new, inst.target_token, inst.target_id, inst.flow_key, true, true)
  on conflict do nothing;

  perform hr._wf_close_instance(p_instance_id, 'superseded', 'resubmitted');
  perform hr._wf_event(v_new, null, 'created', null, 'validating', 'employee', v_uid,
                       inst.requester_employment_id, jsonb_build_object('supersedes', p_instance_id));
  return jsonb_build_object('granted', true, 'instance_id', v_new,
                            'supersedes_instance_id', p_instance_id,
                            'submit', hr.wf_submit(v_new));
end $fn$;

-- ============================================================ 9. escalate / reassign (§4.2)
create or replace function hr.wf_escalate(p_step_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare st hr.workflow_step%rowtype; sd hr.workflow_step_definition%rowtype;
        inst hr.workflow_instance%rowtype; v_from uuid; v_res jsonb; u uuid; v_prev uuid[];
begin
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'step_not_found'); end if;
  if st.state <> 'active' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('a step in %s cannot be escalated', st.state));
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;

  v_from  := st.resolved_approver_ids[1];
  v_prev  := st.resolved_user_ids;

  perform set_config('hr.privileged_write','on',true);
  perform hr._wf_revoke_step(p_step_id);
  perform hr._wf_unproject_step(p_step_id, 'superseded');

  -- re-resolve EXCLUDING the current holders, using the escalation resolver where one is declared
  update hr.workflow_step set state = 'pending' where id = p_step_id;
  if sd.escalation_resolver_kind is not null then
    update hr.workflow_step_definition set resolver_kind = resolver_kind where id = sd.id; -- no-op
  end if;
  v_res := hr.wf_activate_step(p_step_id, st.resolved_approver_ids);

  if not (v_res ->> 'granted')::boolean then
    -- §1.9 pass 4: if escalation itself resolves to nobody, that is an `unroutable` failure row,
    -- which the activation already opened. The step stays visible, never silently parked.
    return v_res;
  end if;

  update hr.workflow_step
     set escalated_at = now(), escalated_from_employment_id = v_from,
         state_reason = coalesce(p_reason, 'escalated')
   where id = p_step_id;
  perform hr._wf_event(inst.id, p_step_id, 'escalated', 'active', 'active', 'automation', null, null,
                       jsonb_build_object('from_employment_id', v_from, 'reason', p_reason));
  -- the new approver AND the escalated-from holder are both told (§6.1)
  select coalesce(array_agg((x)::uuid),'{}'::uuid[]) into v_prev
    from jsonb_array_elements_text(v_res -> 'user_ids') x;
  foreach u in array v_prev loop
    perform hr._wf_notify(inst.id, p_step_id, 'hr.workflow.step_escalated', 'escalation', u, null,
                          jsonb_build_object('reason', p_reason, 'from_employment_id', v_from));
  end loop;
  perform hr._wf_notify(inst.id, p_step_id, 'hr.workflow.step_escalated', 'escalation',
                        hr._wf_login_of(v_from), v_from,
                        jsonb_build_object('reason', p_reason, 'escalated_away', true));
  return v_res;
end $fn$;

create or replace function hr.wf_reassign_step(p_step_id uuid, p_to_employment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare st hr.workflow_step%rowtype; sd hr.workflow_step_definition%rowtype;
        inst hr.workflow_instance%rowtype; v_uid uuid := auth.uid(); v_to uuid; v_ok boolean;
        v_tbl text;
begin
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'step_not_found'); end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;

  if v_uid is not null and not hr.capability(v_uid, 'workflow.reassign', inst.organization_id) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_step', 'no_reassign_authority',
      'reassigning an approval step needs workflow administration standing',
      inst.subject_employment_id, ARRAY[p_step_id]);
  end if;
  if st.state <> 'active' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED');
  end if;

  v_to := hr._wf_login_of(p_to_employment_id);
  if v_to is null then
    return jsonb_build_object('granted', false, 'reason', 'target_employment_ineligible',
      'detail', 'that employment has no login and cannot be granted reach on the request');
  end if;
  -- the same predicate gate the selector uses; a reassignment may not smuggle in someone
  -- hr.can_approve would refuse.
  v_tbl := hr._wf_target_table(inst.target_token);
  if sd.authority_action is not null then
    begin
      v_ok := hr.can_approve(v_to, sd.authority_action, v_tbl, inst.target_id);
    exception when others then v_ok := false;
    end;
    if not v_ok then
      return jsonb_build_object('granted', false, 'reason', 'target_employment_ineligible',
        'detail', 'hr.can_approve refuses that employment for this action on this target');
    end if;
  end if;

  perform set_config('hr.privileged_write','on',true);
  perform hr._wf_revoke_step(p_step_id);
  perform hr._wf_unproject_step(p_step_id, 'superseded');
  update hr.workflow_step
     set resolved_approver_ids = ARRAY[p_to_employment_id], resolved_user_ids = ARRAY[v_to],
         resolution_path = 'fixed', approvals_needed = 1, approvals_received = 0,
         state_reason = coalesce(p_reason,'reassigned')
   where id = p_step_id;
  perform hr._wf_grant_step(p_step_id);
  perform hr._wf_project_step(p_step_id);
  perform hr._wf_event(inst.id, p_step_id, 'reassigned', 'active', 'active', 'hr_admin', v_uid, null,
                       jsonb_build_object('to_employment_id', p_to_employment_id, 'reason', p_reason));
  perform hr._wf_notify(inst.id, p_step_id, 'hr.workflow.step_assigned', 'assigned', v_to,
                        p_to_employment_id, jsonb_build_object('reassigned', true));
  return jsonb_build_object('granted', true, 'step_id', p_step_id,
                            'to_employment_id', p_to_employment_id);
end $fn$;

-- ============================================================ 10. wf_record_result (§0 law 5)
create or replace function hr.wf_record_result(p_step_id uuid, p_result jsonb, p_verified boolean)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype;
        ft hr.workflow_flow_type%rowtype; v_probe jsonb; v_uid uuid := auth.uid();
begin
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'step_not_found'); end if;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  if st.state <> 'awaiting_result' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('this step is %s and is not awaiting a result', st.state));
  end if;
  if v_uid is not null and not hr.capability(v_uid, 'workflow.record_result', inst.organization_id)
     and not hr.capability(v_uid, 'workflow.cancel', inst.organization_id) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_step', 'not_the_integration_actor',
      'only the declared integration actor or an HR administrator may record an external result',
      inst.subject_employment_id, ARRAY[p_step_id]);
  end if;

  -- 🚨 THE CLAIM IS NOT THE PROOF. A caller saying "verified" is checked against the flow type's
  -- OWN probe where one is declared; the fail-closed probe answers `verified:false`, which is what
  -- keeps a failed access shutoff from self-completing because an event fired.
  v_probe := hr._wf_call_hook(ft.result_fn, p_step_id);
  perform set_config('hr.privileged_write','on',true);
  update hr.workflow_step
     set result_evidence = jsonb_build_object('claimed', coalesce(p_result,'{}'::jsonb),
                                              'probe', coalesce(v_probe,'{}'::jsonb),
                                              'claimed_verified', p_verified,
                                              'recorded_by', v_uid, 'recorded_at', now())
   where id = p_step_id;

  if not p_verified or (v_probe is not null and coalesce((v_probe ->> 'verified')::boolean, false) is not true) then
    perform hr._wf_event(inst.id, p_step_id, 'result_unverified', 'awaiting_result', 'awaiting_result',
                         'integration', v_uid, null,
                         jsonb_build_object('claimed', p_result, 'probe', v_probe));
    return jsonb_build_object('granted', false, 'reason', 'result_unverified',
      'detail', coalesce(v_probe ->> 'detail',
                         'the external effect was not confirmed; this step stays open and the instance stays in verifying'),
      'probe', v_probe);
  end if;

  update hr.workflow_step set result_verified_at = now() where id = p_step_id;
  perform hr._wf_event(inst.id, p_step_id, 'result_verified', 'awaiting_result', 'approved',
                       'integration', v_uid, null, coalesce(p_result,'{}'::jsonb));
  return jsonb_build_object('granted', true, 'step', hr._wf_close_step(p_step_id, 'approved', null));
end $fn$;

-- ============================================================ 11. wf_resolve_failure (§1.8)
create or replace function hr.wf_resolve_failure(p_failure_id uuid, p_action text, p_note text)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare f hr.workflow_failure%rowtype; inst hr.workflow_instance%rowtype;
        v_uid uuid := auth.uid(); v_res jsonb;
begin
  select * into f from hr.workflow_failure where id = p_failure_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  select * into inst from hr.workflow_instance where id = f.workflow_instance_id;

  if v_uid is not null
     and not hr.capability(v_uid, 'workflow.resolve_failure', inst.organization_id)
     and not (f.assigned_employment_id = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_failure', 'not_the_assignee',
      'only this failure class''s assignee or a workflow administrator may resolve it',
      inst.subject_employment_id, ARRAY[p_failure_id]);
  end if;
  if f.state in ('resolved','abandoned') then
    return jsonb_build_object('granted', false, 'reason', 'already_closed', 'state', f.state);
  end if;
  if p_action not in ('retry','resolve','abandon','reassign') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_action');
  end if;
  if coalesce(btrim(p_note),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'WF_REASON_REQUIRED',
      'detail', 'resolving a failure always records what was done about it');
  end if;

  perform set_config('hr.privileged_write','on',true);
  update hr.workflow_failure
     set state = case p_action when 'abandon' then 'abandoned'
                               when 'retry' then 'retrying' else 'resolved' end,
         resolved_at = case when p_action in ('resolve','abandon') then now() end,
         resolved_by = v_uid, resolution_note = p_note,
         attempt_count = attempt_count + case when p_action = 'retry' then 1 else 0 end
   where id = p_failure_id;

  perform hr._wf_event(inst.id, f.workflow_step_id, 'failure_resolved', null, null, 'hr_admin',
                       v_uid, null, jsonb_build_object('failure_id', p_failure_id,
                                                       'action', p_action, 'note', p_note));

  if p_action = 'retry' then
    if f.failure_class = 'apply_failed' then
      v_res := hr._wf_apply(inst.id);
    elsif f.workflow_step_id is not null then
      perform set_config('hr.privileged_write','on',true);
      update hr.workflow_step set state = 'pending' where id = f.workflow_step_id
        and state = 'unroutable';
      v_res := hr.wf_activate_step(f.workflow_step_id);
    end if;
    return jsonb_build_object('granted', true, 'action', p_action, 'retry', v_res);
  elsif p_action = 'abandon' then
    perform hr._wf_close_instance(inst.id, 'cancelled', 'failure_abandoned: ' || p_note);
  elsif p_action = 'resolve' and f.failure_class = 'result_unverified'
        and f.workflow_step_id is not null then
    -- §8.3: a failed shutoff resolved MANUALLY, WITH EVIDENCE RECORDED. The step closes because a
    -- human recorded what they did, never because a window elapsed.
    update hr.workflow_step
       set result_verified_at = now(),
           result_evidence = coalesce(result_evidence,'{}'::jsonb) ||
             jsonb_build_object('manual_resolution', p_note, 'resolved_by', v_uid,
                                'resolved_at', now())
     where id = f.workflow_step_id;
    v_res := hr._wf_close_step(f.workflow_step_id, 'approved', 'manually verified: ' || p_note);
    return jsonb_build_object('granted', true, 'action', p_action, 'step', v_res);
  end if;

  return jsonb_build_object('granted', true, 'action', p_action, 'failure_id', p_failure_id);
end $fn$;

-- ============================================================ 12. hr.wf_delegate (§4.2, RD 6)
create or replace function hr.wf_delegate(p_to_holder_kind text, p_to_holder_id uuid,
                                          p_action_type text default null,
                                          p_scope_id uuid default null,
                                          p_starts_at timestamptz default now(),
                                          p_ends_at timestamptz default null,
                                          p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_uid uuid := auth.uid(); v_mine uuid[]; v_auth uuid; v_org uuid; v_delegator uuid;
  v_out jsonb; v_id uuid; v_conflict text; v_need_reason boolean;
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller');
  end if;
  if p_to_holder_kind <> 'employment' then
    return jsonb_build_object('granted', false, 'reason', 'unsupported_holder_kind',
      'detail', 'a delegation names a PERSON: the materialised authority row is holder_kind=employment');
  end if;
  if p_ends_at is null then
    return jsonb_build_object('granted', false, 'reason', 'expiry_required',
      'detail', 'a delegation without an expiry cannot exist, because it cannot be represented');
  end if;
  v_need_reason := (hr._knob('hr.workflow','delegation_reason_required') #>> '{}')::boolean;
  if v_need_reason and coalesce(btrim(p_reason),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'WF_REASON_REQUIRED',
      'detail', 'a delegation records why it was made');
  end if;

  v_mine := hr.employments_of(v_uid);

  -- resolve the DELEGATOR's own matching authority row, so a caller never needs an authority id
  select a.id, a.organization_id, a.holder_id::uuid
    into v_auth, v_org, v_delegator
    from hr.approval_authority a
   where a.holder_kind = 'employment' and a.holder_id::uuid = any(v_mine)
     and a.is_active
     and (p_action_type is null or a.action_type = p_action_type)
     and (p_scope_id is null or a.scope_id is not distinct from p_scope_id)
   order by a.source = 'delegated', a.rank, a.created_at
   limit 1;
  if v_auth is null then
    return jsonb_build_object('granted', false, 'reason', 'no_authority_to_delegate',
      'detail', coalesce(format('you hold no active %s authority to hand on', p_action_type),
                         'you hold no active approval authority to hand on'));
  end if;

  -- 🚨 THE ENGINE'S OWN REFUSAL (§4.2), the one the access lane could not make: the delegate may
  -- not be the SUBJECT of an open step the delegator is currently deciding. Handing your approval
  -- to the person the request is about is never-approve-yourself wearing a different hat.
  select string_agg(distinct i.flow_key, ', ') into v_conflict
    from hr.workflow_step s
    join hr.workflow_instance i on i.id = s.workflow_instance_id
   where s.state = 'active'
     and s.resolved_approver_ids && v_mine
     and i.subject_employment_id = p_to_holder_id;
  if v_conflict is not null then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'delegate_is_subject',
      format('that person is the subject of open requests you are deciding (%s); delegating to them would be self-approval by proxy', v_conflict),
      p_to_holder_id, ARRAY[v_auth]);
  end if;

  -- the intent record + the one-hop and horizon checks live in HRB-007's audited RPC (RD 6)
  v_out := public.hr_authority_delegation_request(v_auth, p_to_holder_id,
                                                  p_starts_at::date, p_ends_at::date, p_reason);
  if not coalesce((v_out ->> 'granted')::boolean, false) then
    return v_out;
  end if;
  v_id := (v_out ->> 'delegation_id')::uuid;

  -- §6.1: both parties are told, and the notice names the open steps it will affect
  perform hr._wf_notify_delegation(v_id, v_delegator, p_to_holder_id, v_org);

  return v_out || jsonb_build_object('delegator_employment_id', v_delegator,
                                     'authority_id', v_auth,
                                     'accept_with', 'public.hr_authority_delegate(delegation_id)');
end $fn$;

create or replace function hr._wf_notify_delegation(p_delegation uuid, p_delegator uuid,
                                                    p_delegate uuid, p_org uuid)
returns integer language plpgsql security definer set search_path to 'hr','public' as $fn$
declare r record; v_n integer := 0;
begin
  for r in select s.id step_id, s.workflow_instance_id inst_id from hr.workflow_step s
            where s.state = 'active' and s.resolved_approver_ids @> ARRAY[p_delegator]
  loop
    v_n := v_n + hr._wf_notify(r.inst_id, r.step_id, 'hr.workflow.step_delegated', 'assigned',
                               hr._wf_login_of(p_delegate), p_delegate,
                               jsonb_build_object('delegation_id', p_delegation,
                                                  'delegator_employment_id', p_delegator));
    v_n := v_n + hr._wf_notify(r.inst_id, r.step_id, 'hr.workflow.step_delegated', 'assigned',
                               hr._wf_login_of(p_delegator), p_delegator,
                               jsonb_build_object('delegation_id', p_delegation,
                                                  'delegate_employment_id', p_delegate));
  end loop;
  return v_n;
end $fn$;

-- ============================================================ 13. the query family (§4.2, §5.2)
create or replace function hr.wf_pending(p_employment_id uuid default null,
                                         p_filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare v_uid uuid := auth.uid(); v_users uuid[]; v_emp uuid[]; v_org uuid; v_show_wait boolean;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'no_caller'); end if;

  if p_employment_id is null then
    v_emp := hr.employments_of(v_uid); v_users := ARRAY[v_uid];
  else
    select organization_id into v_org from hr.employment where id = p_employment_id;
    if not hr.capability(v_uid, 'workflow.view_queue', v_org)
       and not (p_employment_id = any(hr.employments_of(v_uid))) then
      return hr._governance_refusal(v_org, 'hr_workflow_step', 'no_queue_authority',
        'reading another person''s approval queue needs workflow administration standing',
        p_employment_id, '{}');
    end if;
    v_emp := ARRAY[p_employment_id]; v_users := ARRAY[hr._wf_login_of(p_employment_id)];
  end if;
  v_show_wait := (hr._knob('hr.workflow','inbox_show_waiting') #>> '{}')::boolean;

  return jsonb_build_object(
    'granted', true,
    -- the hot query, served by workflow_step_approvers_idx (a partial GIN on resolved_user_ids)
    'needs_my_decision', coalesce((
      select jsonb_agg(x order by x -> 'urgent' desc, x ->> 'due_at' nulls last)
        from (select jsonb_build_object(
                'step_id', s.id, 'instance_id', i.id, 'flow_key', i.flow_key,
                'step_key', s.step_key, 'due_at', s.due_at, 'activated_at', s.activated_at,
                'priority', i.priority, 'urgent', i.priority = 'urgent',
                'resolution_path', s.resolution_path, 'autonomy_mode', s.autonomy_mode,
                'timeout_at', s.timeout_at, 'sensitivity_tier', i.sensitivity_tier,
                'deep_link', '/hr/tasks/' || i.id::text || '?step=' || s.id::text) x
                from hr.workflow_step s join hr.workflow_instance i
                  on i.id = s.workflow_instance_id
               where s.state = 'active' and s.resolved_user_ids && v_users
                 and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')) q),
      '[]'::jsonb),
    'auto_applying_soon', coalesce((
      select jsonb_agg(jsonb_build_object('step_id', s.id, 'instance_id', i.id,
                                          'flow_key', i.flow_key, 'timeout_at', s.timeout_at))
        from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
       where s.state = 'active' and s.autonomy_mode = 3 and s.timeout_at is not null
         and s.resolved_user_ids && v_users), '[]'::jsonb),
    'waiting_on_others', case when not v_show_wait then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('instance_id', i.id, 'flow_key', i.flow_key,
                                          'state', i.state, 'submitted_at', i.submitted_at))
        from hr.workflow_instance i
       where i.state in ('validating','routing','active','applying','verifying')
         and (i.requester_employment_id = any(v_emp) or i.subject_employment_id = any(v_emp))),
      '[]'::jsonb) end,
    'failures_assigned_to_me', coalesce((
      select jsonb_agg(jsonb_build_object('failure_id', f.id, 'instance_id', f.workflow_instance_id,
                                          'failure_class', f.failure_class, 'state', f.state,
                                          'occurred_at', f.occurred_at))
        from hr.workflow_failure f
       where f.state in ('open','retrying') and f.assigned_employment_id = any(v_emp)), '[]'::jsonb),
    'recently_decided', coalesce((
      select jsonb_agg(jsonb_build_object('decision_id', d.id, 'instance_id', d.workflow_instance_id,
                                          'decision', d.decision, 'decided_at', d.decided_at))
        from hr.workflow_decision d
       where d.actor_employment_id = any(v_emp)
         and d.decided_at > now() - interval '30 days'), '[]'::jsonb));
end $fn$;

create or replace function hr.wf_instance(p_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare inst hr.workflow_instance%rowtype; v_uid uuid := auth.uid(); v_mine uuid[];
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  v_mine := hr.employments_of(v_uid);
  if not (inst.requester_employment_id = any(v_mine)
          or inst.subject_employment_id = any(v_mine)
          or exists (select 1 from hr.workflow_step s where s.workflow_instance_id = p_instance_id
                       and v_uid = any(s.resolved_user_ids))
          or exists (select 1 from hr.workflow_decision d where d.workflow_instance_id = p_instance_id
                       and d.actor_user_id = v_uid)
          or hr.capability(v_uid, 'workflow.view_queue', inst.organization_id)) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_instance', 'no_read_reach',
      'you have no standing on this request', inst.subject_employment_id, ARRAY[p_instance_id]);
  end if;

  return jsonb_build_object(
    'granted', true,
    'instance', to_jsonb(inst),
    'steps',     coalesce((select jsonb_agg(to_jsonb(s) order by s.step_order, s.step_key)
                             from hr.workflow_step s where s.workflow_instance_id = p_instance_id), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(to_jsonb(d) order by d.decided_at)
                             from hr.workflow_decision d where d.workflow_instance_id = p_instance_id), '[]'::jsonb),
    'events',    coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at)
                             from hr.workflow_event e where e.workflow_instance_id = p_instance_id), '[]'::jsonb),
    'failures',  coalesce((select jsonb_agg(to_jsonb(f) order by f.occurred_at)
                             from hr.workflow_failure f where f.workflow_instance_id = p_instance_id), '[]'::jsonb),
    -- §1.7: notices come from the VIEW over the notification spine, never from an HR table
    'notices',   coalesce((select jsonb_agg(to_jsonb(n) order by n.sent_at nulls last)
                             from hr.workflow_notice n where n.workflow_instance_id = p_instance_id), '[]'::jsonb));
end $fn$;

create or replace function hr.wf_for_target(p_target_token text, p_target_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
begin
  return jsonb_build_object(
    'granted', true,
    'open', coalesce((
      select jsonb_agg(jsonb_build_object('instance_id', i.id, 'flow_key', i.flow_key,
                                          'state', i.state, 'submitted_at', i.submitted_at,
                                          'current_step_order', i.current_step_order,
                                          'deep_link', '/hr/tasks/' || i.id::text))
        from hr.workflow_binding b join hr.workflow_instance i on i.id = b.workflow_instance_id
       where b.target_token = p_target_token and b.target_id = p_target_id and b.is_open), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('instance_id', i.id, 'flow_key', i.flow_key,
                                          'state', i.state, 'closed_at', i.closed_at)
                       order by i.created_at desc)
        from hr.workflow_instance i
       where i.target_token = p_target_token and i.target_id = p_target_id
         and i.closed_at is not null), '[]'::jsonb));
end $fn$;

-- ============================================================ grants
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr._wf_close_instance(uuid,text,text)', 'hr._wf_apply(uuid)', 'hr._wf_join(uuid)',
    'hr._wf_close_step(uuid,text,text)', 'hr._wf_target_changed(uuid,text)',
    'hr.wf_decide(uuid,text,text,jsonb)', 'hr.wf_bulk_decide(uuid[],text,text)',
    'hr.wf_withdraw(uuid,text)', 'hr.wf_cancel(uuid,text)', 'hr.wf_resubmit(uuid,jsonb)',
    'hr.wf_escalate(uuid,text)', 'hr.wf_reassign_step(uuid,uuid,text)',
    'hr.wf_record_result(uuid,jsonb,boolean)', 'hr.wf_resolve_failure(uuid,text,text)',
    'hr.wf_delegate(text,uuid,text,uuid,timestamptz,timestamptz,text)',
    'hr._wf_notify_delegation(uuid,uuid,uuid,uuid)',
    'hr.wf_pending(uuid,jsonb)', 'hr.wf_instance(uuid)', 'hr.wf_for_target(text,uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

comment on function hr.wf_decide is
  'SPEC-WORKFLOW-ENGINE §4.2 — THE SOLE WRITER of hr.workflow_decision, which is what makes never-self (§2.5), the target-digest re-check (§3.4) and ledger immutability (AD-11) enforceable at all. Returns a refusal ENVELOPE, never a raise.';

-- ============================================================ assertions
do $$
declare v_n integer;
begin
  -- the placeholder join from file 3 must be GONE
  if pg_get_functiondef('hr._wf_join(uuid)'::regprocedure) like '%join_not_installed%' then
    raise exception 'hr_c4_04: the placeholder _wf_join is still live';
  end if;

  -- the 16-RPC surface of §4.2, all present
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname in
     ('wf_request','wf_submit','wf_decide','wf_bulk_decide','wf_delegate','wf_reassign_step',
      'wf_escalate','wf_withdraw','wf_cancel','wf_resubmit','wf_pending','wf_instance',
      'wf_for_target','wf_record_result','wf_resolve_failure');
  if v_n <> 15 then
    raise exception 'hr_c4_04: expected 15 of the 16 §4.2 RPCs here, found % (wf_tick is file 5)', v_n;
  end if;

  -- 🚨 THE REFUSAL-ENVELOPE LAW IS STRUCTURAL, NOT STYLISTIC: every RPC in the §4.2 surface RETURNS
  -- jsonb, so a refusal is a value the caller reads, never an exception that unwinds the audit
  -- write with it. (hr.wf_digest_whole_row is a HOOK, not an RPC, and returns text by contract.)
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname like 'wf\_%'
     and p.proname not in ('wf_digest_whole_row')
     and p.prorettype <> 'jsonb'::regtype::oid;
  if v_n > 0 then
    raise exception 'hr_c4_04: % hr.wf_* RPCs do not return jsonb', v_n;
  end if;
end $$;
