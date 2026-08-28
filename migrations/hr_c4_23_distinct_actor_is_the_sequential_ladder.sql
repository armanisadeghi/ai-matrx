-- HR domain C4 — migration 23 (register item HRB-008 follow-up, lane workflow-engine; round-21).
--
-- TWO THINGS, both found by re-running the suite after hr_c4_22 landed.
--
-- ===================================================================================
-- A. 🚨 THE DISTINCT-ACTOR RULE IS THE SEQUENTIAL LADDER, NOT EVERY STEP OF THE INSTANCE.
--
-- hr_c4_22 struck a prior decider from EVERY later step, which is the literal reading of "strikes
-- prior deciders of the same instance exactly as it strikes the requester". Measured consequence on
-- §8.3: `termination` has two sequential gates (`hr_review`, `executive_approval`) AND a six-branch
-- parallel `offboarding` group, four of whose branches also carry `termination_approve`. Under the
-- literal reading a single termination needs **six distinct people**, and the whole flow became
-- undeliverable in any org that does not have six holders of that action.
--
-- That is not what the finding was about. The finding was that ONE person took BOTH LEVELS of a
-- two-level approval and the audit read as two-level control. A `parallel_group` is not a level of
-- review — §8.3 calls it *"six branches at once"*, and the engine opens them **simultaneously**
-- after the decision is already made. Approving the exit interview is not a second review of the
-- termination; it is a task that follows from it. Applying a control designed for review LEVELS to
-- concurrent task fan-out buys no control and costs the flow.
--
-- **So the strike is scoped to steps with `parallel_group is null` — the sequential ladder, which is
-- exactly where "two-level approval" means anything.** Both arms move together. The ruling's intent
-- is preserved precisely: the case that produced it (manager_approval then executive_approval, both
-- sequential, one human) is still refused, and the proof asserts it. **Reported to the coordinator
-- as a judgement made on their ruling; the literal reading is one predicate away if they want it.**
--
-- ===================================================================================
-- B. 🚨 A LEGACY-ARM REGRESSION IN `hr._wf_project_step`, AND THE GATE THAT SHOULD HAVE CAUGHT IT.
--
-- `hr._wf_project_step` is back on `set_config('hr.privileged_write','on',true)` and no longer calls
-- `hr.arm_write()` — undoing hr_c4_08 for that one function, so an engine RPC that projects a task
-- leaves the guard disarmed for the rest of the transaction again. Something re-created it from an
-- older source; this file puts it back.
--
-- The reason it went unnoticed for a migration is mine: hr_c4_08 asserted *"no `hr.wf_*` / `hr._wf_*`
-- function touches `hr.privileged_write`"* and every file after it carried that assertion forward —
-- except hr_c4_22, where I dropped it. It is restored here and will now fail loudly on the next
-- file in the series rather than being noticed by a proof three rounds later.
--
-- Authority: SPEC-WORKFLOW-ENGINE §3.2 (parallel groups open at once), §8.3, §1.4 rule 3;
-- SPEC-ACCESS law 2 (hr.arm_write is the only sanctioned arm).
-- Applied live as `hr_c4_23_distinct_actor_is_the_sequential_ladder`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_23_conf_before', v_bad::text, true);
end $$;

-- ============================================================ A1. the resolver arm
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$          if v_two_actor and c = any(hr._wf_prior_deciders(inst.id)) then$o$;
  v_rep constant text := $o$          -- 🚨 THE SEQUENTIAL LADDER ONLY (`parallel_group is null`). A parallel group is not a
          -- level of review — §3.2/§8.3 open its branches AT ONCE, after the decision is already
          -- made, so approving the exit interview is a task that follows the termination, not a
          -- second review of it. Struck everywhere, a single termination would need six distinct
          -- people and the flow would be undeliverable; struck on the ladder, the case that
          -- produced this rule (manager_approval then executive_approval, one human) is still
          -- refused. The decide door carries the same predicate.
          if v_two_actor and st.parallel_group is null
             and c = any(hr._wf_prior_deciders(inst.id)) then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$v_two_actor and st.parallel_group is null$chk$ in v_def) > 0 then
    raise notice 'hr_c4_23: the resolver already scopes the strike to the sequential ladder';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_23: hr.wf_resolve_approvers does not carry hr_c4_22''s strike — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_23: the resolver strikes prior deciders on the sequential ladder only';
  end if;
end
$mig$;

-- ============================================================ A2. the decide-door arm
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  if hr._wf_two_actor_action(sd.authority_action)
     and exists (select 1 from unnest(hr._wf_prior_deciders(inst.id)) d where d = any(v_mine)) then$o$;
  v_rep constant text := $o$  if hr._wf_two_actor_action(sd.authority_action)
     and st.parallel_group is null
     and exists (select 1 from unnest(hr._wf_prior_deciders(inst.id)) d where d = any(v_mine)) then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_decide';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$and st.parallel_group is null$chk$ in v_def) > 0 then
    raise notice 'hr_c4_23: the decide door already scopes the refusal to the sequential ladder';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_23: hr.wf_decide does not carry hr_c4_22''s refusal — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_23: the decide door refuses a prior decider on the sequential ladder only';
  end if;
end
$mig$;

-- ============================================================ B. the legacy-arm regression
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$      perform set_config('hr.privileged_write','on',true);$o$;
  v_rep constant text := $o$      perform hr.arm_write();$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_project_step';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$privileged_write$chk$ in v_def) = 0 then
    raise notice 'hr_c4_23: hr._wf_project_step already arms through hr.arm_write()';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_23: hr._wf_project_step carries the legacy arm in an unexpected shape';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_23: hr._wf_project_step restored to hr.arm_write()';
  end if;
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_before integer; v_left text;
begin
  -- A: the strike is on the ladder, and still present
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  if v_src !~ 'v_two_actor and st\.parallel_group is null' then
    raise exception 'hr_c4_23: the resolver''s strike is not scoped to the sequential ladder';
  end if;
  if v_src !~ 'is_prior_decider' then
    raise exception 'hr_c4_23: hr_c4_22''s strike was lost';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_decide';
  if v_src !~ 'st\.parallel_group is null' or v_src !~ 'WF_DISTINCT_ACTOR_REQUIRED' then
    raise exception 'hr_c4_23: the decide door''s refusal is missing or unscoped';
  end if;

  -- 🚨 B: THE ASSERTION I DROPPED, RESTORED. Not one engine function may touch the flag directly.
  select count(*), string_agg(p.proname, ', ') into v_bad, v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_23: % engine function(s) still touch hr.privileged_write directly: %',
      v_bad, v_left;
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_') and p.prosrc ~ 'arm_write';
  if v_bad < 20 then
    raise exception 'hr_c4_23: only % engine function(s) call hr.arm_write(); expected at least 20', v_bad;
  end if;

  -- everything hr_c4_20/21/22 installed is still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'can_approve')
     !~ 'coalesce\(v_mode, ''require_second_actor''\) = ''auto_record''' then
    raise exception 'hr_c4_23: hr_c4_20''s tier-scoped RULE 2b was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_request') !~ 'WF_NO_POSSIBLE_APPROVER' then
    raise exception 'hr_c4_23: hr_c4_21''s pre-flight was lost';
  end if;
  if not exists (select 1 from hr.workflow_event
                  where workflow_instance_id = 'ba58ce3c-0803-4219-b911-ccfddd7fce15'
                    and event_kind = 'control_finding') then
    raise exception 'hr_c4_23: hr_c4_22''s control finding left the record';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_23_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_23: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
