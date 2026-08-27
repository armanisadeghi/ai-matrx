-- HR domain C4 — migration 15 (register item HRB-008 follow-up, lane workflow-engine; round-5 T1).
--
-- 🚨 THE TERMINATION MECHANISM ALREADY EXISTED. IT WAS WAITING ON REMINDERS THAT CAN NEVER BE SENT.
--
-- Two premise corrections first, both measured before a line was written (2026-08-27):
--
-- **A. There is no futile retry loop and no live `no_login` refusal.** The real G2V instance reads
-- `state=ACTIVE`, step `ACTIVE`, `current_step_order=10`, and `hr.wf_resolve_approvers` on that
-- step returns `{"granted": true, … "no_reach":[{"why":"no_login"}]}` RIGHT NOW. The retry
-- SUCCEEDED at 10:45 (`routed: failed → active`). The `why: no_login` still on screen lives in the
-- FAILURE ROW'S `detail` — the frozen snapshot of the original 10:09 failure, which
-- `hr.wf_resolve_failure` never rewrites. `attempt_count 2` / `state retrying` is a real defect,
-- but a different one: **a successful retry never closes its own row**, so a fixed problem shows
-- forever as a "failure assigned to me" with a stale reason attached (§8 below).
--
-- **B. §8.2 node G is BUILT, by the L3 lane, and it is not schedule-gated.**
-- `hr.timecard_attestation_sweep(p_pay_period_id, p_dry_run)` is explicitly a human-run door —
-- *"The attestation sweep is run by a person, on purpose. There is no schedule behind it."* — gated
-- on `payroll.read`, and it does exactly node G: closes the step `skipped` with
-- `state_reason='not_attested'` (RD 12 there: deliberately NOT `expired`, because `hr._wf_join`
-- parks anything outside `approved|auto_approved|skipped` and would strand the timecard with no
-- manager step at all), and notifies with `flagged_to: manager`. `hr.timecard_wf_apply` then writes
-- `attestation_outcome='not_attested'` and OPENS the manager's approval anyway. **So no new step
-- state, no `_wf_join` change and no second path were needed, and none are made here.**
--
-- What actually blocks it is one predicate:
--
--     and ws.reminders_sent >= d.reminder_max
--
-- 🚨 **Reminders are sent by `hr.wf_tick`, which IS deploy/schedule-gated — so the human door waits
-- on an automation that has not run.** And for this population it can never help anyway: the
-- reminders would be addressed to somebody with no login, no inbox row and no notification target.
-- The sweep was waiting for three messages that cannot be sent to a person who cannot receive them.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 REMINDERS TO NOBODY ARE NOT A PRECONDITION THAT CAN EVER BE MET. A step whose
--    `resolved_user_ids` is empty has no reachable approver at all — the resolver has said so in
--    `resolution_evidence.no_reach` since hr_c4_11. Such a step becomes sweep-eligible on the
--    DUE-HOURS CLOCK ALONE. Every other step keeps the reminder precondition exactly as it was:
--    where somebody CAN be nudged, they still get all their nudges first. The returned rows now
--    carry `eligible_because` so the operator can see which rule admitted each one.
--
-- 2. ONE TRANSITION, `hr._wf_not_attested`, SO THE HUMAN DOOR AND THE SWEEP CANNOT FORK.
--    The requirement was explicit. The sweep's two statements are extracted verbatim into one
--    SECURITY DEFINER function, and the sweep is repointed at it — so this is a refactor to a
--    single implementation, not a second one. `hr.wf_resolve_failure`'s new `not_attested` action
--    calls the same function, and a future tick pass calls it with a NULL actor and gets
--    `actor_type='automation'`. There is nothing to drift.
--
-- 3. IT REFUSES ON A NON-SELF STEP AND ON ONE THAT WAS ACTUALLY DECIDED. `not_attested` means
--    *"the person whose own record this is never acted"*; there is no such outcome for an approval
--    somebody else owes — that is escalated or reassigned. A step carrying any
--    `hr.workflow_decision` row is refused outright, so this can never overwrite a real act.
--
-- 4. THE STRUCTURALLY-UNACTIONABLE CASE GETS ITS OWN FAILURE CLASS, AND IT IS NOT RETRYABLE.
--    `unactionable_no_reach` is raised by `hr.wf_activate_step` when a step resolves candidates but
--    none can be reached. It is a STATE, not a transient error: retrying re-runs the same resolver
--    over the same unchanged facts, which is precisely the loop the report described. The class
--    declares `retryable: false` and the door refuses `retry` on it BY NAME, telling the operator
--    what it does offer instead. The step still activates and is still honestly `active` — it IS
--    routed; it is the reach that is missing.
--
-- 5. 🚨 THE LEGAL RESOLUTIONS MOVE ONTO THE VOCABULARY ROW, WHICH IS ALSO THE UI CONTRACT.
--    §1.8 makes `failure_class` a `platform.categories` dimension; each row's `metadata` now carries
--    `resolutions` and `retryable`. `hr.wf_resolve_failure` validates against THAT instead of a
--    hardcoded `in ('retry','resolve','abandon','reassign')`, and every refusal returns
--    `available_actions`. Verified against the frontend before choosing this shape: `p_action` is
--    plain `string` end to end (`features/hr/tasks/service.ts` → `resolveFailure`, and the generated
--    `hr_wf_resolve_failure` Args type), there is NO closed union anywhere to extend, and the
--    wrapper that would send it is currently unreferenced — the "Failures assigned to me" section
--    renders bare links with no action controls. So a new action costs the frontend no type change,
--    and the door can now TELL the page which buttons to draw instead of the page hardcoding them.
--
-- 6. A SUCCESSFUL RETRY RESOLVES ITS OWN ROW; A FAILED ONE REFRESHES ITS EVIDENCE (premise A).
--
-- Authority: SPEC-WORKFLOW-ENGINE §8.2 node G, §1.8, §1.9; SPEC-TIME §7.1 and hr_l3_26 RD 12.
-- Applied live as `hr_c4_15_not_attested_termination`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_15_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the class vocabulary (§1.8, RD 4/5)
-- `position` is a Postgres col_name keyword; quoted so the column list parses as identifiers.
insert into platform.categories (organization_id, dimension, name, slug, is_system, "position",
                                 metadata, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_workflow_failure_class',
       'Unactionable — nobody can be reached', 'unactionable_no_reach', true, 25,
       jsonb_build_object(
         'blocks_instance', true,
         'default_assignee', 'hr_admin',
         'retryable', false,
         'resolutions', jsonb_build_array('not_attested','reassign','abandon'),
         'detail', 'Every resolved approver on this step holds no platform login, so none of them can be granted reach, receive an inbox row, or call hr.wf_decide. Retrying re-runs the same resolver over the same facts. Close it honestly or give somebody else the step.'),
       'internal'
 where not exists (select 1 from platform.categories c
                    where c.dimension = 'hr_workflow_failure_class'
                      and c.slug = 'unactionable_no_reach' and c.deleted_at is null);

-- every OTHER class keeps exactly the actions it has always had, now declared rather than implied
update platform.categories
   set metadata = coalesce(metadata,'{}'::jsonb)
                  || jsonb_build_object('retryable', true,
                                        'resolutions',
                                        jsonb_build_array('retry','resolve','abandon','reassign'))
 where dimension = 'hr_workflow_failure_class' and deleted_at is null
   and slug <> 'unactionable_no_reach'
   and not (metadata ? 'resolutions');

-- ============================================================ 2. THE ONE TRANSITION (RD 2)
-- Lifted verbatim from hr.timecard_attestation_sweep, which is repointed at it in §3. `skipped`
-- with state_reason `not_attested` is L3's RD 12 and is kept exactly: hr._wf_join parks anything
-- outside ('approved','auto_approved','skipped'), so any other state would strand the timecard
-- with no manager step at all.
create or replace function hr._wf_not_attested(p_step uuid,
                                               p_actor uuid default null,
                                               p_note text default null)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  st   hr.workflow_step%rowtype;
  sd   hr.workflow_step_definition%rowtype;
  inst hr.workflow_instance%rowtype;
  v_emp uuid; v_res jsonb;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'step_not_found');
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;

  -- RD 3: `not_attested` is the SUBJECT's own non-action.
  if not sd.allows_self then
    return jsonb_build_object('granted', false, 'reason', 'not_a_self_step',
      'detail', 'not_attested closes a step the SUBJECT was to take themselves; an approval somebody else owes is escalated or reassigned');
  end if;
  if st.state <> 'active' then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('this step is %s and can no longer be closed as not_attested', st.state));
  end if;
  -- and it can NEVER overwrite a real act
  if exists (select 1 from hr.workflow_decision d where d.workflow_step_id = p_step) then
    return jsonb_build_object('granted', false, 'reason', 'WF_ALREADY_DECIDED',
      'detail', 'this step carries a decision; it was acted on and must not be recorded as not_attested');
  end if;

  v_emp := inst.subject_employment_id;
  perform hr.arm_write();

  -- 🚨 `skipped`, NOT `expired` (hr_l3_26 RD 12). attested_at stays NULL; nothing attested on the
  -- employee's behalf. state_reason carries the fact that nobody did.
  v_res := hr._wf_close_step(p_step, 'skipped', 'not_attested');
  perform hr._wf_notify(inst.id, p_step, 'hr.time.attestation_overdue',
                        'timeout_warning', null, v_emp,
                        jsonb_build_object('outcome', 'not_attested',
                                           'flagged_to', 'manager',
                                           'attested', false,
                                           'closed_by', case when p_actor is null
                                                             then 'sweep' else 'failure_lane' end,
                                           'note', p_note));
  perform hr._wf_event(inst.id, p_step, 'timeout_applied', 'active', 'skipped',
                       case when p_actor is null then 'automation' else 'hr_admin' end,
                       p_actor, null,
                       jsonb_build_object(
                         'outcome', 'not_attested', 'note', p_note,
                         'law', '§8.2 node G: closed as not_attested and flagged to the manager. NOTHING attested on the employee''s behalf.'));

  return jsonb_build_object('granted', true, 'state', 'skipped', 'outcome', 'not_attested',
                            'step_id', p_step, 'subject_employment_id', v_emp, 'close', v_res);
end
$fn$;

revoke all on function hr._wf_not_attested(uuid, uuid, text) from public, anon, authenticated;

comment on function hr._wf_not_attested is
  'SPEC-WORKFLOW-ENGINE §8.2 node G — THE single not_attested transition, shared by hr.timecard_attestation_sweep (actor NULL) and hr.wf_resolve_failure''s not_attested action (actor supplied), so the human door and the sweep cannot fork. Closes the step `skipped` with state_reason `not_attested` (hr_l3_26 RD 12 — any other state strands the timecard at hr._wf_join), notifies the manager, and refuses on a non-self step or one carrying a decision.';

-- ============================================================ 3. the sweep uses it, and stops
--                                                                waiting for unsendable reminders
do $mig$
declare
  v_oid oid; v_def text; v_new text;

  v_pred_old constant text := $o$       and ws.reminders_sent >= d.reminder_max$o$;
  v_pred_new constant text := $o$       -- 🚨 RD 1: REMINDERS TO NOBODY ARE NOT A PRECONDITION THAT CAN EVER BE MET. Reminders come
       -- from hr.wf_tick, which is deploy/schedule-gated — and for a step with no reachable
       -- approver they could never help anyway: there is no login, no inbox row and no
       -- notification target to send them to. Such a step is eligible on the DUE-HOURS CLOCK
       -- ALONE. Every other step keeps the reminder precondition exactly as it was.
       and (ws.reminders_sent >= d.reminder_max
            or coalesce(cardinality(ws.resolved_user_ids), 0) = 0)$o$;

  v_row_old constant text := $o$      'action', case when p_dry_run then 'would close as not_attested'
                     else 'closed as not_attested' end);$o$;
  v_row_new constant text := $o$      'action', case when p_dry_run then 'would close as not_attested'
                     else 'closed as not_attested' end,
      'reachable_approvers', coalesce(cardinality(r.resolved_user_ids), 0),
      'eligible_because', case when coalesce(cardinality(r.resolved_user_ids), 0) = 0
                               then 'no reachable approver — reminders could never be delivered'
                               else 'the reminder ladder is exhausted' end);$o$;

  v_sel_old constant text := $o$    select ws.id step_id, ws.workflow_instance_id, ws.activated_at, ws.reminders_sent,$o$;
  v_sel_new constant text := $o$    select ws.id step_id, ws.workflow_instance_id, ws.activated_at, ws.reminders_sent,
           ws.resolved_user_ids,$o$;

  v_do_old constant text := $o$      -- 🚨 RD 12: `skipped`, NOT `expired`. hr._wf_join parks a non-optional step that closed
      -- outside ('approved','auto_approved','skipped') WITHOUT applying, which would strand the
      -- timecard with no manager step at all. §7.1 routes the no-action case straight on to the
      -- manager. attested_at stays NULL; state_reason carries the fact that nobody attested.
      perform hr._wf_close_step(r.step_id, 'skipped', 'not_attested');
      perform hr._wf_notify(r.workflow_instance_id, r.step_id, 'hr.time.attestation_overdue',
                            'timeout_warning', null, r.employment_id,
                            jsonb_build_object('outcome', 'not_attested',
                                               'flagged_to', 'manager',
                                               'attested', false));$o$;
  v_do_new constant text := $o$      -- 🚨 RD 2: ONE TRANSITION. This used to inline the close and the notice; the failure-lane
      -- door (hr.wf_resolve_failure, action `not_attested`) must take the SAME transition, so both
      -- now call hr._wf_not_attested and there is no second implementation to drift. RD 12 —
      -- `skipped`, not `expired` — lives inside it, unchanged.
      perform hr._wf_not_attested(r.step_id, null, 'closed by the attestation sweep');$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_attestation_sweep';
  if v_oid is null then raise exception 'hr_c4_15: hr.timecard_attestation_sweep does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_do_new in v_def) > 0 then
    raise notice 'hr_c4_15: the sweep already delegates to hr._wf_not_attested';
  else
    if position(v_pred_old in v_def) = 0 or position(v_row_old in v_def) = 0
       or position(v_sel_old in v_def) = 0 or position(v_do_old in v_def) = 0 then
      raise exception 'hr_c4_15: hr.timecard_attestation_sweep does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_sel_old,  v_sel_new);
    v_new := replace(v_new, v_pred_old, v_pred_new);
    v_new := replace(v_new, v_row_old,  v_row_new);
    v_new := replace(v_new, v_do_old,   v_do_new);
    execute v_new;
    raise notice 'hr_c4_15: the sweep delegates to hr._wf_not_attested and no longer waits for unsendable reminders';
  end if;
end
$mig$;

-- ============================================================ 4. the unactionable failure is RAISED
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  perform hr._wf_grant_step(p_step);
  perform hr._wf_project_step(p_step);$o$;
  v_rep constant text := $o$  perform hr._wf_grant_step(p_step);
  perform hr._wf_project_step(p_step);

  -- 🚨 RD 4: RESOLVED IS NOT THE SAME AS REACHABLE. When a step resolves candidates but NONE holds
  -- a login, there is no grant to issue, no inbox row to project and no way for any of them to call
  -- hr.wf_decide — the step is STRUCTURALLY unactionable, not transiently failed, and retrying
  -- re-runs the same resolver over the same facts. It is raised as a worked failure a human owns
  -- (§1.8) rather than left sitting `active` behind a deadline nobody is watching.
  if v_cands <> '{}' and coalesce(cardinality(v_users), 0) = 0
     and (v_res ->> 'resolution_path') is distinct from 'external_result' then
    perform hr._wf_failure(inst.id, p_step, 'unactionable_no_reach',
      jsonb_build_object(
        'resolved_approver_ids', to_jsonb(v_cands),
        'no_reach', coalesce(v_res -> 'evidence' -> 'no_reach', '[]'::jsonb),
        'allows_self', sd.allows_self,
        'detail', 'every resolved approver on this step holds no platform login, so none of them can be granted reach or take the decision',
        'resolutions', case when sd.allows_self
                            then jsonb_build_array('not_attested','reassign','abandon')
                            else jsonb_build_array('reassign','abandon') end));
  end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_activate_step';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$'unactionable_no_reach'$chk$ in v_def) > 0 then
    raise notice 'hr_c4_15: hr.wf_activate_step already raises unactionable_no_reach';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_15: hr.wf_activate_step does not carry the expected grant/project pair — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_15: hr.wf_activate_step now raises unactionable_no_reach';
  end if;
end
$mig$;

-- ============================================================ 5. the door: actions from the class
do $mig$
declare
  v_oid oid; v_def text; v_new text;

  v_dec_old constant text := $o$        v_uid uuid := auth.uid(); v_res jsonb;$o$;
  v_dec_new constant text := $o$        v_uid uuid := auth.uid(); v_res jsonb; v_actions jsonb;$o$;

  v_act_old constant text := $o$  if p_action not in ('retry','resolve','abandon','reassign') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_action');
  end if;$o$;
  v_act_new constant text := $o$  -- 🚨 RD 5: THE LEGAL RESOLUTIONS LIVE ON THE CLASS'S VOCABULARY ROW (§1.8), not in a literal
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
  end if;$o$;

  v_na_old constant text := $o$  if p_action = 'retry' then$o$;
  v_na_new constant text := $o$  -- §8.2 node G, taken by a human through the failure lane — the SAME transition
  -- hr.timecard_attestation_sweep takes, by calling the same function (RD 2).
  if p_action = 'not_attested' then
    if f.workflow_step_id is null then
      return jsonb_build_object('granted', false, 'reason', 'no_step',
        'detail', 'this failure is not attached to a step, so there is nothing to close as not_attested');
    end if;
    v_res := hr._wf_not_attested(f.workflow_step_id, v_uid, p_note);
    if not coalesce((v_res ->> 'granted')::boolean, false) then
      return v_res;
    end if;
    return jsonb_build_object('granted', true, 'action', p_action, 'not_attested', v_res);
  end if;

  if p_action = 'retry' then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$'not_attested'$chk$ in v_def) > 0 then
    raise notice 'hr_c4_15: hr.wf_resolve_failure already offers not_attested';
  else
    if position(v_dec_old in v_def) = 0 or position(v_act_old in v_def) = 0
       or position(v_na_old in v_def) = 0 then
      raise exception 'hr_c4_15: hr.wf_resolve_failure does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old, v_dec_new);
    v_new := replace(v_new, v_act_old, v_act_new);
    v_new := replace(v_new, v_na_old,  v_na_new);
    execute v_new;
    raise notice 'hr_c4_15: hr.wf_resolve_failure validates from the class and offers not_attested';
  end if;
end
$mig$;

-- ============================================================ 6. a retry that works CLOSES its row
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$    return jsonb_build_object('granted', true, 'action', p_action, 'retry', v_res);$o$;
  v_rep constant text := $o$    -- 🚨 RD 6: A SUCCESSFUL RETRY RESOLVES ITS OWN ROW. Leaving every retried failure in
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
                              'failure_state', (select state from hr.workflow_failure
                                                 where id = p_failure_id));$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  v_def := pg_get_functiondef(v_oid);
  if position(v_rep in v_def) > 0 then
    raise notice 'hr_c4_15: the retry already closes its own row';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_15: hr.wf_resolve_failure does not carry the expected retry return — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_15: a successful retry now resolves its failure row; a failed one refreshes its evidence';
  end if;
end
$mig$;

-- ============================================================ 7. post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer;
begin
  -- RD 4/5: the class exists, is not retryable, and every class declares its resolutions
  if not exists (select 1 from platform.categories
                  where dimension = 'hr_workflow_failure_class'
                    and slug = 'unactionable_no_reach' and deleted_at is null
                    and (metadata ->> 'retryable')::boolean is false) then
    raise exception 'hr_c4_15: the unactionable_no_reach class is missing or is marked retryable';
  end if;
  select count(*) into v_bad from platform.categories
   where dimension = 'hr_workflow_failure_class' and deleted_at is null
     and not (metadata ? 'resolutions');
  if v_bad > 0 then
    raise exception 'hr_c4_15: % failure class(es) do not declare their resolutions', v_bad;
  end if;

  -- RD 2: ONE implementation. Nothing but hr._wf_not_attested may take the transition.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = '_wf_not_attested' and p.prosecdef) then
    raise exception 'hr_c4_15: hr._wf_not_attested is missing or is not SECURITY DEFINER';
  end if;
  if has_function_privilege('authenticated', 'hr._wf_not_attested(uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'hr._wf_not_attested(uuid,uuid,text)', 'execute') then
    raise exception 'hr_c4_15: hr._wf_not_attested is callable by a client role';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname <> '_wf_not_attested'
     and p.prosrc ~ '_wf_close_step\([^)]*''not_attested''';
  if v_bad > 0 then
    raise exception 'hr_c4_15: % function(s) besides hr._wf_not_attested still inline the not_attested close', v_bad;
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  if v_src !~ 'not sd\.allows_self' or v_src !~ 'WF_ALREADY_DECIDED' then
    raise exception 'hr_c4_15: hr._wf_not_attested lost its self-step or already-decided guard';
  end if;
  -- RD 12 is preserved inside it: `skipped`, never `expired`
  if v_src !~ '_wf_close_step\(p_step, ''skipped'', ''not_attested''\)' then
    raise exception 'hr_c4_15: hr._wf_not_attested no longer closes the step as skipped/not_attested';
  end if;

  -- RD 1: the sweep no longer waits on reminders that cannot be sent, and delegates
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_attestation_sweep';
  if v_src !~ 'hr\._wf_not_attested\(r\.step_id' then
    raise exception 'hr_c4_15: the sweep still inlines its own transition';
  end if;
  if v_src !~ 'cardinality\(ws\.resolved_user_ids\), 0\) = 0' then
    raise exception 'hr_c4_15: the sweep still requires reminders that can never be sent';
  end if;
  if v_src !~ 'ws\.reminders_sent >= d\.reminder_max' then
    raise exception 'hr_c4_15: the sweep dropped the reminder ladder for reachable approvers';
  end if;

  -- RD 5 / RD 6 on the door
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  if v_src ~ 'p_action not in \(''retry'',''resolve'',''abandon'',''reassign''\)' then
    raise exception 'hr_c4_15: hr.wf_resolve_failure still validates against a hardcoded action list';
  end if;
  if v_src !~ 'available_actions' or v_src !~ 'retry_succeeded_at' then
    raise exception 'hr_c4_15: the door does not report what it offers, or a retry still cannot close its row';
  end if;
  if v_src !~ 'binding_reclaimed' then
    raise exception 'hr_c4_15: hr_c4_12''s binding reclaim was lost';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_activate_step';
  if v_src !~ 'unactionable_no_reach' then
    raise exception 'hr_c4_15: hr.wf_activate_step does not raise the unactionable failure';
  end if;

  -- hr_c4_11..14 all still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') !~ 'no_reach' then
    raise exception 'hr_c4_15: hr_c4_11''s self-step lane was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'pay_period_transition')
     !~ 'state not in \(''approved'',''exported'',''locked''\)' then
    raise exception 'hr_c4_15: hr_c4_13''s completion gate was lost';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_15: % engine function(s) went back to the legacy write-guard arm', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_15: % hr CONFORMANCE finding(s)', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_15_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_15: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
