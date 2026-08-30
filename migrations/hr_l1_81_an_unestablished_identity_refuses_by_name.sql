-- hr_l1_81 — AN UNESTABLISHED IDENTITY REFUSES BY NAME. THE WHOLE CLASS, NOT ONE DOOR.
--
-- RECORD of a live change applied on 2026-08-30 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend') + supabase_migrations.schema_migrations.
-- Slot: hr_l1 #0081 (re-checked against both ledgers and both migration directories at commit).
--
-- 🚨 THE DEFECT, FOUND LIVE BY THE T-L10-3 LANE AND REPRODUCED HERE. Five workflow doors wrote
-- their authorization branch as
--
--     if v_uid is not null and not hr.capability(v_uid, …) then  refuse
--
-- which means the branch DOES NOT EXIST when auth.uid() is null. A caller with no established
-- identity does not fail the check — it never reaches the check, and walks straight through to
-- the write. That is fail-OPEN on identity absence, the exact inverse of the house law that an
-- unestablished predicate fails CLOSED. It is not theoretical: the L10 lane's `abandon` calls on
-- two failure rows landed with `resolved_by` NULL, because there was no caller and nothing said
-- so. The evidence of that is two rows whose resolver is unknowable.
--
-- The five doors, all SECURITY DEFINER, all granted to `authenticated` AND `service_role`:
--   hr.wf_resolve_failure   (the one reported)
--   hr.wf_cancel
--   hr.wf_publish_definition
--   hr.wf_reassign_step
--   hr.wf_record_result
--
-- ── THE CALLER CENSUS, BEFORE DECIDING WHETHER A SYSTEM ARM IS REAL ───────────────────────────
--
-- MEASURED, not assumed. (a) Every pg_proc.prosrc in the database mentioning any of the five: the
-- only hits are the five public.hr_wf_* pass-through wrappers, plus four functions that name
-- `hr.wf_resolve_failure` IN A COMMENT ONLY (hr._wf_route, hr.wf_activate_step,
-- hr.timecard_attestation_sweep, hr.punch_write_path_conformance). NOTHING in the database calls
-- any of them. (b) cron.job holds exactly one job in this database (hr.membership_access_sweep)
-- and it calls none of them. (c) grep of aidream / matrx-frontend / matrx-extend / matrx-local for
-- the wrapper names: the only call sites are matrx-frontend/features/hr/tasks/service.ts, which
-- calls them through supabase-js as the signed-in user. There is NO server-side, worker, or
-- service_role caller of any of the five.
--
-- 🚨 SO THE "SYSTEM PATH" WAS NEVER REAL — it was a comment. hr.wf_cancel even carried the line
-- "HR-admin authority, or the engine itself (service role / no auth context)" and an event-actor
-- branch stamping 'automation' when v_uid is null. Nothing has ever taken that path. A sanctioned
-- system caller must be an EXPLICIT, NAMED arm that asserts its context; an accidental gap left by
-- a null-guard is not an arm, and keeping the gap "in case the engine needs it" is how a hole gets
-- a justification. The comment and its dead branch are deleted with the gap.
--
-- A privileged session (a migration, a fixture cleanup) that genuinely must drive one of these
-- doors still can — by ASSERTING an identity, `set_config('request.jwt.claims', …)`, which is
-- exactly what makes the resulting row name who did it. That is the difference between a system
-- path and an anonymous one, and it is the whole point of this change.
--
-- ── WHAT CHANGES, IN EACH OF THE FIVE ─────────────────────────────────────────────────────────
--
--   + a first statement:  if v_uid is null then return {granted:false, reason:'no_caller', …}
--   - the caller-is-established conjunct in front of every capability check
--
-- The refusal reuses hr.wf_request's existing `no_caller` word, so one fact has one name across
-- the engine and no surface needs a new branch (the refusal envelope renders `detail` verbatim).
-- Nothing is staged on the refusal: it returns before any read of the target row and long before
-- hr.arm_write().
--
-- ── THE TWO ROWS THAT LANDED WITH `resolved_by` NULL ──────────────────────────────────────────
--
--   41006826-4711-460a-954e-473916fae28d  (instance 4be6ae4f…)
--   5a256a7a-524e-4376-a30d-4dc7c9d272b4  (instance a7fd791c…)
--
-- ANNOTATED, NOT REVERTED. These are the L10 lane's own sanctioned hr_l1_77 fixture cleanup: both
-- abandon a `sole_actor_deadlock` that was never real, both carry a resolution_note explaining the
-- substitution, and both instances are closed. Reverting them would resurrect two false failures
-- and destroy the record of the defect they document — the opposite of what the cleanup was for.
-- What was wrong is that the row does not say who did it, so `detail` now says so, in words, with
-- the reason the identity is absent. The NULL stays visible; it is explained, not painted over.
-- (Three OTHER rows in this table also carry a null resolver — b4f9d8dc, 6a24183d, 738fe260 — but
-- they did not come through this door at all: they were stamped 'superseded by instance closure'
-- by earlier migrations writing to the table directly. Different provenance, left alone.)
--
-- IDEMPOTENT: CREATE OR REPLACE, a jsonb annotation applied only where absent, and post-condition
-- assertions over the deployed bodies. Re-running changes nothing.
-- ══════════════════════════════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- 1/5 — hr.wf_resolve_failure  (the reported door)
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.wf_resolve_failure(p_failure_id uuid, p_action text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare f hr.workflow_failure%rowtype; inst hr.workflow_instance%rowtype;
        v_uid uuid := auth.uid(); v_res jsonb; v_actions jsonb;
begin
  -- 🚨 hr_l1_81: NO IDENTITY, NO RESOLUTION. The capability check below used to carry a
  -- caller-is-established CONJUNCT in front of it, so a caller with no auth context skipped the
  -- authorization branch ENTIRELY and could resolve any failure in any organization — fail-open on
  -- identity absence. An unestablished predicate fails CLOSED. There is no
  -- sanctioned system caller of this door (census in this file's header); a privileged session
  -- that must drive it asserts an identity first, so the row records who acted.
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller',
                              'detail', 'hr.wf_resolve_failure requires an authenticated caller');
  end if;
  select * into f from hr.workflow_failure where id = p_failure_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  select * into inst from hr.workflow_instance where id = f.workflow_instance_id;

  if not hr.capability(v_uid, 'workflow.resolve_failure', null, current_date, inst.organization_id)
     and not (f.assigned_employment_id = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_failure', 'not_the_assignee',
      'only this failure class''s assignee or a workflow administrator may resolve it',
      inst.subject_employment_id, ARRAY[p_failure_id]);
  end if;
  if f.state in ('resolved','abandoned') then
    return jsonb_build_object('granted', false, 'reason', 'already_closed', 'state', f.state);
  end if;
  -- 🚨 RD 5: THE LEGAL RESOLUTIONS LIVE ON THE CLASS'S VOCABULARY ROW (§1.8), not in a literal
  -- here — and that one place is what the task page should draw its buttons from, which is why a
  -- refusal hands back `available_actions` instead of only saying no.
  select coalesce(c.metadata -> 'resolutions',
                  jsonb_build_array('retry','resolve','abandon','reassign'))
    into v_actions
    from platform.categories c
   where c.dimension = 'hr_workflow_failure_class' and c.slug = f.failure_class
     and c.deleted_at is null
   limit 1;
  v_actions := coalesce(v_actions, jsonb_build_array('retry','resolve','abandon','reassign'));
  if not (v_actions ? p_action) then
    return jsonb_build_object('granted', false, 'reason', 'unknown_action',
      'detail', format('a %s failure does not offer %s', f.failure_class, p_action),
      'failure_class', f.failure_class,
      'available_actions', v_actions);
  end if;
  if coalesce(btrim(p_note),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'WF_REASON_REQUIRED',
      'detail', 'resolving a failure always records what was done about it');
  end if;

  perform hr.arm_write();
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

  -- §8.2 node G, taken by a human through the failure lane — the SAME transition
  -- hr.timecard_attestation_sweep takes, by calling the same function (RD 2).
  -- 🚨 RD 3: `resolve` MAY NOT MAKE A DEAD STEP DISAPPEAR. Marking the row resolved while its step
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

  -- 🚨 SPEC-ACCESS §1.4 rule 3, verbatim: a `require_second_actor` action with no second actor
  -- "routes to the workflow engine's no-eligible-approver failure queue with an explicit, audited
  -- `record_without_approval` action that names the actor and demands a reason". The reason is
  -- already mandatory above; this names the actor and stamps the basis.
  if p_action = 'record_without_approval' then
    if f.workflow_step_id is null then
      return jsonb_build_object('granted', false, 'reason', 'no_step',
        'detail', 'this failure is not attached to a step, so there is nothing to record against');
    end if;
    declare
      v_step hr.workflow_step%rowtype; v_actor uuid; v_mine uuid[];
    begin
      select * into v_step from hr.workflow_step where id = f.workflow_step_id;
      if v_step.state not in ('active','unroutable') then
        return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
          'detail', format('this step is %s and can no longer be recorded against', v_step.state));
      end if;
      v_mine := hr.employments_of(v_uid);
      -- the actor is the deadlocked person themselves, or an HR administrator standing in for them
      v_actor := (select c from unnest(coalesce(v_mine,'{}'::uuid[])) c
                   where c = inst.subject_employment_id limit 1);
      if v_actor is null then
        if not hr.capability(v_uid, 'workflow.cancel', null, current_date, inst.organization_id) then
          return jsonb_build_object('granted', false, 'reason', 'not_the_deadlocked_actor',
            'detail', 'recording an act without approval is done by the person the request is about, or by an HR administrator on their behalf');
        end if;
        v_actor := v_mine[1];
      end if;
      perform hr.arm_write();
      insert into hr.workflow_decision
        (organization_id, workflow_instance_id, workflow_step_id, step_key, decision, reason,
         actor_type, actor_user_id, actor_employment_id, approval_basis, autonomy_mode)
      values (inst.organization_id, inst.id, f.workflow_step_id, v_step.step_key, 'approved', p_note,
              'hr_admin', v_uid, v_actor, 'sole_authority', 4);
      perform hr._wf_event(inst.id, f.workflow_step_id, 'decided', v_step.state, 'approved',
                           'hr_admin', v_uid, v_actor,
                           jsonb_build_object('approval_basis', 'sole_authority',
                                              'recorded_without_approval', true,
                                              'reason', p_note,
                                              'law', 'SPEC-ACCESS §1.4 rule 3: an explicit, audited record_without_approval that names the actor and demands a reason'));
      v_res := hr._wf_close_step(f.workflow_step_id, 'approved', 'recorded without approval: ' || p_note);
      return jsonb_build_object('granted', true, 'action', p_action,
                                'outcome', 'recorded_without_approval',
                                'approval_basis', 'sole_authority',
                                'actor_employment_id', v_actor, 'step', v_res);
    end;
  end if;

  if p_action = 'not_attested' then
    if f.workflow_step_id is null then
      return jsonb_build_object('granted', false, 'reason', 'no_step',
        'detail', 'this failure is not attached to a step, so there is nothing to close as not_attested');
    end if;
    v_res := hr._wf_not_attested(f.workflow_step_id, v_uid, p_note);
    if not coalesce((v_res ->> 'granted')::boolean, false) then
      return v_res;
    end if;
    return jsonb_build_object('granted', true, 'action', p_action, 'outcome', 'not_attested',
                              'not_attested', v_res);
  end if;

  if p_action = 'retry' then
    if f.failure_class = 'apply_failed' then
      v_res := hr._wf_apply(inst.id);
    elsif f.workflow_step_id is not null then
      -- 🚨 THE RETRY RECLAIMS THE BINDING THE FAILURE RELEASED, and refuses plainly if a fresh
      -- instance legitimately took the slot in between — an operator is told which instance to
      -- work, instead of the partial unique index raising in their face.
      if exists (select 1 from hr.workflow_binding b
                  where b.target_token = inst.target_token and b.target_id = inst.target_id
                    and b.flow_key = inst.flow_key and b.is_open and b.exclusive
                    and b.workflow_instance_id <> inst.id) then
        return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
          'detail', 'another instance now holds the open binding on this target; work or cancel that one instead of retrying this',
          'existing_instance_id', (select b.workflow_instance_id from hr.workflow_binding b
                                    where b.target_token = inst.target_token
                                      and b.target_id = inst.target_id
                                      and b.flow_key = inst.flow_key and b.is_open and b.exclusive));
      end if;
      perform hr.arm_write();
      update hr.workflow_step set state = 'pending' where id = f.workflow_step_id
        and state = 'unroutable';
      v_res := hr.wf_activate_step(f.workflow_step_id);
      if coalesce((v_res ->> 'granted')::boolean, false) then
        update hr.workflow_binding set is_open = true where workflow_instance_id = inst.id;
        -- 🚨 and it says WHICH step it is on. Reviving left current_step_order NULL, because only
        -- hr._wf_route ever set it — an active instance that could not name its own position.
        update hr.workflow_instance
           set state = case when state = 'failed' then 'active' else state end,
               state_reason = case when state = 'failed' then null else state_reason end,
               current_step_order = (select s.step_order from hr.workflow_step s
                                      where s.id = f.workflow_step_id)
         where id = inst.id;
        perform hr._wf_event(inst.id, f.workflow_step_id, 'routed', 'failed', 'active',
                             'hr_admin', v_uid, null,
                             jsonb_build_object('failure_id', p_failure_id, 'retry', true,
                                                'binding_reclaimed', true));
      end if;
    end if;
    -- 🚨 RD 6: A SUCCESSFUL RETRY RESOLVES ITS OWN ROW. Leaving every retried failure in
    -- `retrying` forever is what made a FIXED problem show as a permanent "failure assigned to me",
    -- and leaving `detail` frozen at the first attempt is what made a stale reason look live —
    -- which is exactly how this round's report read `why: no_login` off a step that had already
    -- routed successfully.
    perform hr.arm_write();
    if coalesce((v_res ->> 'granted')::boolean, false) then
      update hr.workflow_failure
         set state = 'resolved', resolved_at = now(), resolved_by = v_uid,
             detail = coalesce(detail,'{}'::jsonb)
                      || jsonb_build_object('retry_succeeded_at', now(), 'retry_result', v_res)
       where id = p_failure_id;
    else
      update hr.workflow_failure
         set state = 'open',
             detail = coalesce(detail,'{}'::jsonb)
                      || jsonb_build_object('last_retry_at', now(), 'last_retry_result', v_res)
                      || coalesce(v_res -> 'evidence', '{}'::jsonb)
       where id = p_failure_id;
    end if;
    return jsonb_build_object('granted', true, 'action', p_action, 'retry', v_res,
                              'outcome', case when coalesce((v_res ->> 'granted')::boolean, false)
                                              then 'retried' else 'retry_failed' end,
                              'failure_state', (select state from hr.workflow_failure
                                                 where id = p_failure_id));
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
    return jsonb_build_object('granted', true, 'action', p_action, 'outcome', 'resolved',
                              'step', v_res);
  end if;

  -- RD 5: the task page's Resolve terminal reads `outcome` off this envelope.
  return jsonb_build_object('granted', true, 'action', p_action, 'failure_id', p_failure_id,
                            'outcome', case p_action when 'abandon' then 'abandoned'
                                                     when 'reassign' then 'reassigned'
                                                     else 'resolved' end);
end $function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- 2/5 — hr.wf_cancel. The dead "or the engine itself (service role / no auth context)" arm goes
-- with the gap: nothing in the database, in cron, or in any repo has ever called this without a
-- caller, so the 'automation' actor branch was unreachable text asserting a path that is not real.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.wf_cancel(p_instance_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
        v_uid uuid := auth.uid(); v_comp jsonb;
begin
  -- 🚨 hr_l1_81: NO IDENTITY, NO CANCELLATION (see this migration's header for the class).
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller',
                              'detail', 'hr.wf_cancel requires an authenticated caller');
  end if;
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
  -- HR-admin authority, or one's own request
  if not hr.capability(v_uid, 'workflow.cancel', null, current_date, inst.organization_id) then
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
                       'hr_admin', v_uid, null, jsonb_build_object('reason', p_reason));
  return hr._wf_close_instance(p_instance_id, 'cancelled', p_reason);
end $function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- 3/5 — hr.wf_publish_definition
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.wf_publish_definition(p_definition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  d hr.workflow_definition%rowtype; v_uid uuid := auth.uid(); sd record; v_bad text; v_n integer;
begin
  -- 🚨 hr_l1_81: NO IDENTITY, NO PUBLISH. Rewriting who approves what is the highest-authority act
  -- this engine has; it was the one most exposed by the null-identity gap.
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller',
                              'detail', 'hr.wf_publish_definition requires an authenticated caller');
  end if;
  select * into d from hr.workflow_definition where id = p_definition_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  if d.status <> 'draft' then
    return jsonb_build_object('granted', false, 'reason', 'not_a_draft',
      'detail', format('this definition is %s; a definition is edited only in draft', d.status));
  end if;
  -- 🚨 PUBLISHING ROUTING IS AN OWNER POWER, NOT AN ADMIN ONE. This read `workflow.cancel` — a
  -- stand-in that let anybody who could cancel a request also rewrite WHO APPROVES WHAT, which is
  -- authority.grant's power class. hr_admin is excluded here on the same principle that excludes it
  -- from workflow.record_result. The refusal SENTENCE is unchanged by ruling.
  if not hr.capability(v_uid, 'workflow.publish_definition', null, current_date, d.organization_id) then
    return hr._governance_refusal(d.organization_id, 'hr_workflow_definition', 'no_publish_authority',
      'Publishing a routing definition rewrites who approves what, so it needs the HR owner — HR administration standing is not enough.',
      null, ARRAY[p_definition_id]);
  end if;

  -- §2.1: an unresolvable action slug is `definition_invalid` AT PUBLISH TIME, never at routing time
  select string_agg(distinct sd2.authority_action, ', ') into v_bad
    from hr.workflow_step_definition sd2
   where sd2.workflow_definition_id = p_definition_id and sd2.deleted_at is null
     and sd2.authority_action is not null
     and not exists (select 1 from platform.categories c
                      where c.dimension = 'hr_approval_action' and c.slug = sd2.authority_action
                        and c.deleted_at is null);
  if v_bad is not null then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('these authority_action slugs are not registered hr_approval_action tokens: %s', v_bad));
  end if;

  -- §9.1: `allows_self` is PLATFORM-ONLY and never org-overridable. An org definition that sets it
  -- is refused here rather than quietly honoured.
  if d.organization_id <> '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and exists (select 1 from hr.workflow_step_definition sd2
                  where sd2.workflow_definition_id = p_definition_id and sd2.allows_self
                    and sd2.deleted_at is null) then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', 'allows_self is a platform-rung value and cannot be set in an organisation''s own definition (§9.1)');
  end if;

  -- §7.1: the flow type's AI ceiling caps the mode, refused AT PUBLISH TIME
  select count(*) into v_n
    from hr.workflow_step_definition sd2
    join hr.workflow_flow_type f on f.flow_key = d.flow_key and f.deleted_at is null
   where sd2.workflow_definition_id = p_definition_id and sd2.deleted_at is null
     and ((f.ai_ceiling = 'advisory' and sd2.autonomy_mode in (1,2))
          or (f.ai_ceiling = 'none' and sd2.recommend_mandate_key is not null));
  if v_n > 0 then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('%s step(s) exceed this flow type''s ai_ceiling', v_n));
  end if;

  -- 🚨 §2.6: refuse a definition whose TERMINAL step's fallback chain ends at top_of_chart when the
  -- org has no org-scoped holder for that action. This is how "who approves the CEO" gets answered
  -- at CONFIGURATION time instead of at 5pm on a Friday.
  for sd in select sd2.* from hr.workflow_step_definition sd2
             where sd2.workflow_definition_id = p_definition_id and sd2.deleted_at is null
               and sd2.authority_action is not null
               and sd2.fallback_chain[array_length(sd2.fallback_chain,1)] = 'top_of_chart'
               and sd2.step_order = (select max(step_order) from hr.workflow_step_definition
                                      where workflow_definition_id = p_definition_id
                                        and deleted_at is null)
  loop
    if d.organization_id <> '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
       and not exists (select 1 from hr.approval_authority a
                        where a.organization_id = d.organization_id
                          and a.action_type = sd.authority_action
                          and a.scope_kind = 'org' and a.is_active) then
      return jsonb_build_object('granted', false, 'reason', 'no_top_of_chart_holder',
        'detail', format('step %s falls back to top_of_chart but no org-scoped %s holder exists; name one before publishing',
                         sd.step_key, sd.authority_action));
    end if;
  end loop;

  perform hr.arm_write();
  update hr.workflow_definition
     set status = 'retired', retired_at = now()
   where flow_key = d.flow_key and organization_id = d.organization_id
     and status = 'published' and id <> p_definition_id and deleted_at is null;
  update hr.workflow_definition
     set status = 'published', published_at = now() where id = p_definition_id;

  -- §1.2: publishing DOES NOT TOUCH RUNNING INSTANCES. Every instance pinned
  -- workflow_definition_id + definition_version at request time (AD-11: a rule change never
  -- rewrites a decision already in flight). Nothing below re-points anything, deliberately.
  select count(*) into v_n from hr.workflow_instance
   where flow_key = d.flow_key and organization_id = d.organization_id
     and state not in ('closed','completed','cancelled','rejected','withdrawn','superseded','expired');

  return jsonb_build_object('granted', true, 'definition_id', p_definition_id,
                            'flow_key', d.flow_key, 'definition_version', d.definition_version,
                            'running_instances_untouched', v_n);
end $function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- 4/5 — hr.wf_reassign_step
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.wf_reassign_step(p_step_id uuid, p_to_employment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare st hr.workflow_step%rowtype; sd hr.workflow_step_definition%rowtype;
        inst hr.workflow_instance%rowtype; v_uid uuid := auth.uid(); v_to uuid; v_ok boolean;
        v_tbl text;
begin
  -- 🚨 hr_l1_81: NO IDENTITY, NO REASSIGNMENT (see this migration's header for the class).
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller',
                              'detail', 'hr.wf_reassign_step requires an authenticated caller');
  end if;
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'step_not_found'); end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;

  if not hr.capability(v_uid, 'workflow.reassign', null, current_date, inst.organization_id) then
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

  perform hr.arm_write();
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
end $function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- 5/5 — hr.wf_record_result
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.wf_record_result(p_step_id uuid, p_result jsonb, p_verified boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype;
        ft hr.workflow_flow_type%rowtype; v_probe jsonb; v_uid uuid := auth.uid();
begin
  -- 🚨 hr_l1_81: NO IDENTITY, NO RESULT. `recorded_by` is the whole evidentiary value of this row;
  -- a null-identity caller wrote one anyway, unchecked, because the branch below was skipped.
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller',
                              'detail', 'hr.wf_record_result requires an authenticated caller');
  end if;
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'step_not_found'); end if;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  if st.state <> 'awaiting_result' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('this step is %s and is not awaiting a result', st.state));
  end if;
  if not hr.capability(v_uid, 'workflow.record_result', null, current_date, inst.organization_id)
     and not hr.capability(v_uid, 'workflow.cancel', null, current_date, inst.organization_id) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_step', 'not_the_integration_actor',
      'only the declared integration actor or an HR administrator may record an external result',
      inst.subject_employment_id, ARRAY[p_step_id]);
  end if;

  -- 🚨 THE CLAIM IS NOT THE PROOF. A caller saying "verified" is checked against the flow type's
  -- OWN probe where one is declared; the fail-closed probe answers `verified:false`, which is what
  -- keeps a failed access shutoff from self-completing because an event fired.
  v_probe := hr._wf_call_hook(ft.result_fn, p_step_id);
  perform hr.arm_write();
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
end $function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- THE TWO ANONYMOUS ABANDONS ARE ANNOTATED, NOT REVERTED.
-- Idempotent: the annotation is applied only where it is not already present.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $ann$
declare v_n integer;
begin
  perform hr.arm_write();
  update hr.workflow_failure f
     set detail = coalesce(f.detail,'{}'::jsonb) || jsonb_build_object(
           'resolver_identity_absent', jsonb_build_object(
             'migration', 'hr_l1_81',
             'annotated_at', now(),
             'why', 'This row was abandoned through hr.wf_resolve_failure from a privileged session '
                 || 'with no auth context, during the hr_l1_77 fixture cleanup. The door skipped its '
                 || 'authorization branch entirely when auth.uid() was null, so resolved_by could '
                 || 'not be recorded and no refusal was raised. hr_l1_81 closed that gap.',
             'actor', 'the T-L10-3 verification lane (hr_l1_77 fixture cleanup), acting deliberately',
             'not_reverted_because', 'the abandon itself was correct — the sole_actor_deadlock it '
                 || 'closed was never real, and the instance is the record of the hr_l1_77 defect. '
                 || 'Reverting would resurrect a false failure and destroy that evidence.'))
   where f.id in ('41006826-4711-460a-954e-473916fae28d'::uuid,
                  '5a256a7a-524e-4376-a30d-4dc7c9d272b4'::uuid)
     and f.resolved_by is null
     and not (coalesce(f.detail,'{}'::jsonb) ? 'resolver_identity_absent');
  get diagnostics v_n = row_count;
  raise notice 'hr_l1_81: annotated % anonymous abandon row(s)', v_n;
end
$ann$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- CONTRACT PINS, AMENDED WITH THE REASON. The five pre-existing hr_c4_35/hr_c4_39 pins asserted
-- only that `auth.uid` survives — which it did, all through the defect. They now also assert the
-- named refusal, and BAN the shape that caused it.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
update hr.function_contract
   set must_contain = (select array_agg(distinct x) from unnest(must_contain || array['no_caller']) x),
       must_not_contain = (select array_agg(distinct x)
                             from unnest(must_not_contain || array['v_uid is not null and']) x),
       reason = reason || E'\n\nAMENDED by hr_l1_81 (2026-08-30): the pin asserted `auth.uid` and '
             || 'nothing more, so it stayed green while the branch it protects was being SKIPPED '
             || 'for any caller whose auth.uid() was null — fail-open on identity absence. The pin '
             || 'now requires the named `no_caller` refusal and forbids the caller-is-established '
             || 'conjunct that made the authorization branch evaporate.'
 where schema_name = 'hr'
   and function_name in ('wf_resolve_failure','wf_cancel','wf_reassign_step',
                         'wf_record_result','wf_publish_definition')
   and not ('no_caller' = any(must_contain));


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- POST-CONDITIONS. The clauses have to be IN the deployed bodies, not merely in this file.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare r record; v_bad text := '';
begin
  for r in select unnest(array['wf_resolve_failure','wf_cancel','wf_reassign_step',
                               'wf_record_result','wf_publish_definition']) as fn
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'hr' and p.proname = r.fn
                      and p.prosrc like '%no_caller%'
                      and p.prosrc not like '%v_uid is not null and%') then
      v_bad := v_bad || r.fn || ' ';
    end if;
  end loop;
  if v_bad <> '' then
    raise exception 'hr_l1_81 did not take on: %', v_bad;
  end if;
  if (select count(*) from hr.function_contract
       where schema_name='hr' and function_name in ('wf_resolve_failure','wf_cancel',
             'wf_reassign_step','wf_record_result','wf_publish_definition')
         and 'no_caller' = any(must_contain)) <> 5 then
    raise exception 'hr_l1_81: the five contract pins were not amended';
  end if;
  if (select count(*) from hr.function_contracts_broken()) <> 0 then
    raise exception 'hr_l1_81: a function contract is broken';
  end if;
end
$post$;
