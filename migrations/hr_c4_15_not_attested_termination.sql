-- HR domain C4 — migration 15 (register item HRB-008 follow-up, lane workflow-engine; round-5 T1).
--
-- 🚨 THE LOGIN-LESS ATTESTATION ROUTES BUT CAN NEVER TERMINATE. §8.2 NODE G HAD NO MECHANISM.
--
-- Measured on the real G2V instance before writing a line (2026-08-27) — and the first finding
-- CORRECTS the report this migration was asked for:
--
--   instance 470e7247…  state=ACTIVE  current_step_order=10
--   step     effd7456…  state=ACTIVE  resolved_approver_ids=[ca9e12da…]  resolved_user_ids={}
--   hr.wf_resolve_approvers(step) RIGHT NOW → {"granted": true, ... "no_reach":[{"why":"no_login"}]}
--
-- **There is no futile retry loop and no live `no_login` refusal.** The retry SUCCEEDED at 10:45
-- (`routed: failed → active`). The `why: no_login` still visible is inside the FAILURE ROW'S
-- `detail`, which is the frozen snapshot of the ORIGINAL 10:09 failure — `hr.wf_resolve_failure`
-- never rewrites it. `attempt_count 2` / `state retrying` is the second real defect: **a successful
-- retry never closes its own failure row**, so /hr/tasks shows a permanent "failure assigned to me"
-- for a problem that is fixed, with a stale reason attached. Both are fixed below.
--
-- What IS true, and is the crown blocker: the step is `active`, routed to somebody who cannot act,
-- and nothing can ever close it. §8.2 node G — *"reminders, then the step auto-closes as
-- not_attested and is flagged to the manager, NEVER silently attested"* — had no mechanism at all:
--
--   · `not_attested` was not a legal `hr.workflow_step.state` (the CHECK admits eleven values and
--     that is not one of them);
--   · `hr._wf_join` treats any non-optional step not in (`approved`,`auto_approved`,`skipped`) as
--     unfavourable and returns WITHOUT deciding the instance — so even if a step could close that
--     way, the instance would hang one inch from the end;
--   · nothing anywhere recognised that a self-step resolved to a subject with no reach is
--     STRUCTURALLY unactionable rather than transiently failed, so the only offered remedy was to
--     retry it forever.
--
-- 🚨 EVERYTHING PAST THE JOIN WAS ALREADY BUILT AND IS NOT TOUCHED HERE. `hr.timecard_wf_apply`
-- already handles exactly this case (L3 RD 3): no decision row → `attestation_outcome =
-- 'not_attested'` + the manager note on `hr.pay_period_employment.metadata`, `attested_at` left
-- NULL, row state left alone — and then it opens the `timecard_approval` instance ANYWAY, carrying
-- `attestation_outcome: 'not_attested'` in its payload. So the manager gets a real approval step on
-- a flagged timecard, approves it, the row becomes `approved`, and hr_c4_13's completion gate lets
-- the period through. The whole product outcome the coordinator asked for falls out of unblocking
-- the join — no special case in the gate, no second path.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 ONE TRANSITION, `hr._wf_not_attested`, SO THE TICK CANNOT FORK FROM THE HUMAN PATH.
--    The requirement was explicit: the deadline-driven automation and the human resolution must be
--    the same transition. It is one SECURITY DEFINER function that closes the step, records the
--    event, and flags the manager. `hr.wf_resolve_failure` calls it with an actor; the tick's
--    future pass calls it with NULL and gets `actor_type='automation'`. There is no second copy to
--    drift.
--
-- 2. IT REFUSES ON A STEP THAT IS NOT A SELF-STEP, AND ON ONE THAT WAS ACTUALLY DECIDED.
--    `not_attested` means *"the person whose own record this is never acted"*. There is no such
--    outcome for an approval somebody else owes — that is escalated or reassigned. And a step
--    carrying any `hr.workflow_decision` row is refused outright, so this can never overwrite a
--    real act. Both are hard refusals, not knobs.
--
-- 3. THE STRUCTURALLY-UNACTIONABLE CASE GETS ITS OWN FAILURE CLASS, AND IT IS NOT RETRYABLE.
--    `unactionable_no_reach` is raised by `hr.wf_activate_step` when a step resolves candidates but
--    NONE of them can be reached (no login → no `iam.permissions` grant, no `workspace.tasks` row,
--    no way to call `hr.wf_decide`). It is a STATE, not a transient error: retrying re-runs the
--    same resolver over the same unchanged facts. The class declares `retryable: false` and the
--    door refuses `retry` on it by name, telling the operator what it DOES offer instead.
--    The step still activates and is still honestly `active` — it IS routed; it is the reach that
--    is missing, and `resolution_evidence.no_reach` has said so since hr_c4_11.
--
-- 4. 🚨 THE LEGAL RESOLUTIONS NOW LIVE ON THE VOCABULARY ROW, WHICH IS ALSO THE UI CONTRACT.
--    §1.8 makes `failure_class` a `platform.categories` dimension; each row's `metadata` now carries
--    `resolutions` (and `retryable`). `hr.wf_resolve_failure` validates against THAT instead of a
--    hardcoded `in ('retry','resolve','abandon','reassign')`, and a refusal returns
--    `available_actions`. Verified against the frontend: `p_action` is plain `string` end to end
--    (`features/hr/tasks/service.ts` → `resolveFailure`, and the generated
--    `hr_wf_resolve_failure` Args type), there is no closed union anywhere to extend, and the
--    control that would send it is currently unreferenced. So a new action needs NO frontend type
--    change, and the door can now TELL the page which buttons to render instead of the page
--    guessing.
--
-- 5. A SUCCESSFUL RETRY RESOLVES ITS OWN ROW; A FAILED ONE REFRESHES ITS EVIDENCE. Leaving every
--    retried row in `retrying` forever is what made a fixed problem look permanently broken, and
--    leaving `detail` frozen at the first attempt is what made a stale reason look like a live one.
--
-- 6. `not_attested` IS A FAVOURABLE CLOSE FOR THE JOIN — safely, because only `hr._wf_not_attested`
--    can write it and that function only accepts self-steps. It cannot leak into leave, pay or
--    termination flows: none of their steps set `allows_self`.
--
-- Authority: SPEC-WORKFLOW-ENGINE §8.2 node G, §1.8 (the class vocabulary), §1.9 (the tick's
-- passes), §3.2; SPEC-TIME §7.1. Applied live as `hr_c4_15_not_attested_termination`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_15_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. `not_attested` becomes legal
do $$
declare v_con text;
begin
  if exists (select 1 from pg_constraint c
              join pg_class t on t.oid = c.conrelid
              join pg_namespace n on n.oid = t.relnamespace
             where n.nspname = 'hr' and t.relname = 'workflow_step' and c.contype = 'c'
               and pg_get_constraintdef(c.oid) like '%not_attested%') then
    raise notice 'hr_c4_15: hr.workflow_step.state already admits not_attested';
    return;
  end if;
  select c.conname into v_con from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'hr' and t.relname = 'workflow_step' and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%(state = ANY%';
  if v_con is null then
    raise exception 'hr_c4_15: cannot find the state CHECK on hr.workflow_step';
  end if;
  execute format('alter table hr.workflow_step drop constraint %I', v_con);
  execute format($f$alter table hr.workflow_step add constraint %I check (state = any (array[
      'pending','active','approved','auto_approved','rejected','returned','skipped',
      'expired','cancelled','unroutable','awaiting_result','not_attested']))$f$, v_con);
  raise notice 'hr_c4_15: hr.workflow_step.state now admits not_attested';
end $$;

-- ============================================================ 2. the class vocabulary (§1.8)
-- `position` is a Postgres col_name keyword; it is quoted so the column list parses as identifiers.
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

-- ============================================================ 3. THE ONE TRANSITION (RD 1)
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
  v_mgr uuid; v_mgr_uid uuid; v_res jsonb;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'step_not_found');
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;

  -- RD 2: `not_attested` is the SUBJECT's own non-action. It has no meaning on a step somebody
  -- else owes — that is escalated or reassigned, never marked as if the subject had ignored it.
  if not sd.allows_self then
    return jsonb_build_object('granted', false, 'reason', 'not_a_self_step',
      'detail', 'not_attested closes a step the SUBJECT was to take themselves; an approval somebody else owes is escalated or reassigned');
  end if;
  if st.state not in ('active','unroutable') then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('this step is %s and can no longer be closed as not_attested', st.state));
  end if;
  -- and it can NEVER overwrite a real act
  if exists (select 1 from hr.workflow_decision d where d.workflow_step_id = p_step) then
    return jsonb_build_object('granted', false, 'reason', 'WF_ALREADY_DECIDED',
      'detail', 'this step carries a decision; it was acted on and must not be recorded as not_attested');
  end if;

  perform hr.arm_write();
  perform hr._wf_event(inst.id, p_step, 'timeout_applied', st.state, 'not_attested',
                       case when p_actor is null then 'automation' else 'hr_admin' end,
                       p_actor, null,
                       jsonb_build_object(
                         'outcome', 'not_attested', 'note', p_note,
                         'law', '§8.2 node G: the step closes as not_attested and is flagged to the manager. NOTHING attested on the employee''s behalf.'));

  -- §8.2 node G's other half: the manager is FLAGGED. hr.timecard_wf_apply writes the flag onto
  -- hr.pay_period_employment.metadata; this is the notice, sent where there is somebody to send it.
  v_mgr := hr.manager_as_of(inst.subject_employment_id, current_date);
  if v_mgr is not null then
    v_mgr_uid := hr._wf_login_of(v_mgr);
    if v_mgr_uid is not null then
      perform hr._wf_notify(inst.id, p_step, 'hr.workflow.request_needs_attention', 'outcome',
                            v_mgr_uid, v_mgr,
                            jsonb_build_object('outcome', 'not_attested', 'reason', p_note));
    end if;
  end if;

  -- the close drives the join, which drives apply. hr.timecard_wf_apply then records
  -- attestation_outcome='not_attested' and opens the manager's approval on the flagged timecard.
  v_res := hr._wf_close_step(p_step, 'not_attested',
                             coalesce(nullif(btrim(p_note),''), 'closed as not_attested'));
  return jsonb_build_object('granted', true, 'state', 'not_attested', 'step_id', p_step,
                            'manager_employment_id', v_mgr,
                            'manager_notified', v_mgr_uid is not null,
                            'close', v_res);
end
$fn$;

revoke all on function hr._wf_not_attested(uuid, uuid, text) from public, anon, authenticated;

comment on function hr._wf_not_attested is
  'SPEC-WORKFLOW-ENGINE §8.2 node G — THE single not_attested transition, shared by the human failure-lane resolution (hr.wf_resolve_failure, actor supplied) and the tick''s future deadline pass (actor NULL → actor_type=automation), so the two can never fork. Refuses on a non-self step and on any step carrying a decision. Closes the step, records the event, flags the manager; hr.timecard_wf_apply does the rest.';

-- ============================================================ 4. the join lets it through (RD 6)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$     and s.state not in ('approved','auto_approved','skipped');$o$;
  v_rep constant text := $o$     -- `not_attested` is favourable ENOUGH for the instance to reach apply, where the flow type's
     -- own apply_fn decides what it means (for a timecard: the manager is flagged and their
     -- approval step opens). Safe by construction — only hr._wf_not_attested writes this state and
     -- it accepts self-steps only, so no leave, pay or termination step can ever carry it.
     and s.state not in ('approved','auto_approved','skipped','not_attested');$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_join';
  v_def := pg_get_functiondef(v_oid);
  if position(v_rep in v_def) > 0 then
    raise notice 'hr_c4_15: hr._wf_join already passes not_attested';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_15: hr._wf_join does not carry the expected favourable set — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_15: hr._wf_join now lets a not_attested step reach apply';
  end if;
end
$mig$;

-- ============================================================ 5. the projection outcome
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  v_outcome := case p_state when 'approved' then 'completed'
                            when 'auto_approved' then 'completed'
                            when 'rejected' then 'completed'
                            when 'returned' then 'completed'
                            else 'superseded' end;$o$;
  v_rep constant text := $o$  v_outcome := case p_state when 'approved' then 'completed'
                            when 'auto_approved' then 'completed'
                            when 'rejected' then 'completed'
                            when 'returned' then 'completed'
                            -- the person never acted: the task was IGNORED, not superseded
                            when 'not_attested' then 'ignored'
                            else 'superseded' end;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_close_step';
  v_def := pg_get_functiondef(v_oid);
  if position(v_rep in v_def) > 0 then
    raise notice 'hr_c4_15: hr._wf_close_step already maps not_attested';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_15: hr._wf_close_step does not carry the expected outcome map — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_15: hr._wf_close_step maps not_attested to the `ignored` task outcome';
  end if;
end
$mig$;

-- ============================================================ 6. the unactionable failure is RAISED
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  perform hr._wf_grant_step(p_step);
  perform hr._wf_project_step(p_step);$o$;
  v_rep constant text := $o$  perform hr._wf_grant_step(p_step);
  perform hr._wf_project_step(p_step);

  -- 🚨 RD 3: RESOLVED IS NOT THE SAME AS REACHABLE. When a step resolves candidates but NONE of
  -- them holds a login, there is no grant to issue, no inbox row to project and no way for any of
  -- them to call hr.wf_decide — the step is STRUCTURALLY unactionable, not transiently failed, and
  -- retrying re-runs the same resolver over the same facts. It is raised as a worked failure a
  -- human owns (§1.8) rather than left to sit `active` until a deadline nobody is watching.
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

-- ============================================================ 7. the door: actions from the class
do $mig$
declare
  v_oid oid; v_def text; v_new text;

  v_dec_old constant text := $o$        v_uid uuid := auth.uid(); v_res jsonb;$o$;
  v_dec_new constant text := $o$        v_uid uuid := auth.uid(); v_res jsonb; v_actions jsonb;$o$;

  v_act_old constant text := $o$  if p_action not in ('retry','resolve','abandon','reassign') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_action');
  end if;$o$;
  v_act_new constant text := $o$  -- 🚨 RD 4: THE LEGAL RESOLUTIONS LIVE ON THE CLASS'S VOCABULARY ROW (§1.8), not in a literal
  -- here. That one place is also what the task page should render its buttons from, which is why
  -- a refusal hands back `available_actions` instead of just saying no.
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
  v_na_new constant text := $o$  -- §8.2 node G, taken by a human through the failure lane. The SAME transition the tick's
  -- deadline pass will call — one function, no fork (RD 1).
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

-- ============================================================ 8. a retry that works CLOSES its row
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$    return jsonb_build_object('granted', true, 'action', p_action, 'retry', v_res);$o$;
  v_rep constant text := $o$    -- 🚨 RD 5: A SUCCESSFUL RETRY RESOLVES ITS OWN ROW. Leaving every retried failure in
    -- `retrying` forever is what made a FIXED problem show as a permanent "failure assigned to me",
    -- and leaving `detail` frozen at the first attempt is what made a stale reason look live.
    perform hr.arm_write();
    if coalesce((v_res ->> 'granted')::boolean, false) then
      update hr.workflow_failure
         set state = 'resolved', resolved_at = now(), resolved_by = v_uid,
             detail = coalesce(detail,'{}'::jsonb)
                      || jsonb_build_object('retry_succeeded_at', now(),
                                            'retry_result', v_res)
       where id = p_failure_id;
    else
      update hr.workflow_failure
         set state = 'open',
             detail = coalesce(detail,'{}'::jsonb)
                      || jsonb_build_object('last_retry_at', now(),
                                            'last_retry_result', v_res)
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

-- ============================================================ 9. post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer;
begin
  if not exists (select 1 from pg_constraint c
                  join pg_class t on t.oid = c.conrelid
                  join pg_namespace n on n.oid = t.relnamespace
                 where n.nspname = 'hr' and t.relname = 'workflow_step' and c.contype = 'c'
                   and pg_get_constraintdef(c.oid) like '%not_attested%') then
    raise exception 'hr_c4_15: hr.workflow_step.state still refuses not_attested';
  end if;
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

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = '_wf_not_attested' and p.prosecdef) then
    raise exception 'hr_c4_15: hr._wf_not_attested is missing or is not SECURITY DEFINER';
  end if;
  if has_function_privilege('authenticated', 'hr._wf_not_attested(uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'hr._wf_not_attested(uuid,uuid,text)', 'execute') then
    raise exception 'hr_c4_15: hr._wf_not_attested is callable by a client role';
  end if;
  -- RD 1: exactly ONE place performs the transition
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname <> '_wf_not_attested'
     and p.prosrc ~ '_wf_close_step\([^)]*''not_attested''';
  if v_bad > 0 then
    raise exception 'hr_c4_15: % function(s) besides hr._wf_not_attested close a step as not_attested', v_bad;
  end if;
  -- RD 2: the self-step and already-decided guards are present
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  if v_src !~ 'not sd\.allows_self' or v_src !~ 'WF_ALREADY_DECIDED' then
    raise exception 'hr_c4_15: hr._wf_not_attested lost its self-step or already-decided guard';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_join';
  if v_src !~ '''not_attested''' then
    raise exception 'hr_c4_15: hr._wf_join still stops on a not_attested step';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  if v_src ~ 'p_action not in \(''retry'',''resolve'',''abandon'',''reassign''\)' then
    raise exception 'hr_c4_15: hr.wf_resolve_failure still validates against a hardcoded action list';
  end if;
  if v_src !~ 'available_actions' then
    raise exception 'hr_c4_15: hr.wf_resolve_failure does not tell the caller what it offers';
  end if;
  if v_src !~ 'retry_succeeded_at' then
    raise exception 'hr_c4_15: a successful retry still does not resolve its own row';
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
    raise exception 'hr_c4_15: % hr CONFORMANCE finding(s) — the CHECK rewrite disturbed a table property', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_15_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_15: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
