-- HR domain L5 — migration 28 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 MY DOOR SUBMITTED THE SAME REQUEST TWICE, AND BLAMED THE ENGINE FOR THE SECOND ONE.
--
-- `hr.leave_request_submit` called `hr.wf_request(...)` and then `hr.wf_submit(instance)`. Read
-- the engine's own last three lines:
--
--     if p_as_draft then
--       return jsonb_build_object('granted', true, 'instance_id', v_inst, 'state', 'draft');
--     end if;
--     return hr.wf_submit(v_inst);
--
-- **`hr.wf_request` already submits and routes**, and returns `wf_submit`'s result verbatim.
-- `p_as_draft => true` is the two-phase escape hatch for a caller that wants to hold a draft. With
-- the default, the instance is never `draft` by the time it returns — and §4.2 says `wf_submit`
-- *"refuses when: instance not `draft`"*. So the second call could only ever fail, on every
-- request, forever. It surfaced as a nested `WF_STEP_CLOSED — only a draft may be submitted` in
-- this lane's envelope, which reads like an engine fault and is nothing of the sort. C4 found it
-- while fixing an unrelated P0, which is the only reason anybody looked.
--
-- **THE CONTRACT §4.2 INTENDS FOR A DOOR THAT WANTS ATOMIC SUBMIT: call `wf_request` once and use
-- what it returned.** One caller, one sequencing, and no draft state to leak — a draft this door
-- created and failed to submit would be an invisible half-filed request owned by nobody. The
-- alternative (`p_as_draft => true` plus an explicit submit) buys a two-phase capability a
-- self-service form does not want and cannot use.
--
-- What made it survivable: the request still routed, because `wf_request` had already done the
-- work. The envelope stayed honest — `granted: true` with the refusal nested rather than a false
-- success — so nothing downstream was wrong, only noisy. That is luck, not design: a caller
-- reading `workflow.granted` instead of the top-level `granted` would have reported every
-- successful request as a failure.
--
-- Authority: SPEC-WORKFLOW-ENGINE §4.2 (`hr.wf_request` / `hr.wf_submit` signatures and refusals).
-- Contract row declared below. Applied live as `hr_l5_28_wf_request_already_submits`. Idempotent.

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';

  if v_def not like '%hr.wf_submit(%' then
    raise notice 'hr_l5_28: the double submit is already gone — nothing to do.';
    return;
  end if;

  -- Replace the second submit with a use of what wf_request returned. The instance id is still
  -- stamped on the request afterwards; `hr.leave_wf_validate` runs INSIDE wf_request and reads the
  -- request through the instance's target_id, so it never needed that column to be set first.
  v_new := replace(v_def,
    E'  v_sub := hr.wf_submit(v_inst);\n',
    E'  -- hr_l5_28: NO SECOND SUBMIT. hr.wf_request already ran hr.wf_submit and returned its\n'
 || E'  -- result; calling it again always lands on a non-draft and always refuses (§4.2).\n'
 || E'  v_sub := v_wf;\n');

  if v_new = v_def then
    raise exception 'hr_l5_28: the second wf_submit call did not match — re-derive it from the live body';
  end if;
  execute v_new;
end $$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', 'leave_request_submit', 'hr_l5_28',
   array['hr.wf_request('],
   array['hr.wf_submit('],
   'hr_l5_28: hr.wf_request ALREADY submits and routes (its own body ends `return '
   || 'hr.wf_submit(v_inst)` unless p_as_draft), and §4.2 says wf_submit refuses any instance that '
   || 'is not draft. A door that calls both submits twice and the second call can only ever fail — '
   || 'it shipped as a nested WF_STEP_CLOSED that read like an engine fault. Either call wf_request '
   || 'alone (this door) or pass p_as_draft => true and submit explicitly; never both.',
   true)
on conflict do nothing;

-- -----------------------------------------------------------------------------------
-- Self-proof
-- -----------------------------------------------------------------------------------

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';

  if v_def like '%hr.wf_submit(%' then
    raise exception 'hr_l5_28: the door still calls hr.wf_submit after hr.wf_request';
  end if;
  if v_def not like '%hr.wf_request(%' then
    raise exception 'hr_l5_28: the door no longer requests a workflow at all';
  end if;
  -- the envelope must still report intake rejection, which now comes from wf_request's own result
  if v_def not like '%rejected_at_intake%' then
    raise exception 'hr_l5_28: the door stopped reporting rejected_at_intake';
  end if;
  -- and the four named refusals must all survive this edit
  if v_def not like '%worker_class_outside_policy_scope%'
     or v_def not like '%policy_no_longer_exists%'
     or v_def not like '%policy_inactive%'
     or v_def not like '%not_enrolled_on_these_dates%' then
    raise exception 'hr_l5_28: one of the four named refusals was lost';
  end if;

  -- the contract this file declares must hold the moment it is declared
  if exists (
    select 1 from hr.function_contract c
     where c.home_migration = 'hr_l5_28' and c.is_active
       and exists (select 1 from unnest(c.must_not_contain) m where v_def like '%' || m || '%')) then
    raise exception 'hr_l5_28: the contract is violated on declaration';
  end if;
end $$;
