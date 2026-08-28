-- HR domain C4 — migration 22 (register item HRB-008 follow-up, lane workflow-engine; round-21).
--
-- 🚨 ONE PERSON TOOK BOTH LEVELS OF A TWO-LEVEL APPROVAL, AND THE AUDIT READS AS TWO-LEVEL CONTROL.
--
-- Measured live before writing (instance `ba58ce3c-0803-4219-b911-ccfddd7fce15`, org
-- `2643e470-b275-47f3-95f3-ae275ad3ca47`):
--
--   00:39:43  manager_approval    approved  by G2V-Priya Raman  approval_basis='authority'
--   00:41:41  executive_approval  approved  by G2V-Priya Raman  approval_basis='authority'
--
-- Two steps, two minutes apart, one human, no refusal anywhere — and nothing in the record shows
-- the same person twice. A reader of that instance sees a manager approval and an executive
-- approval and concludes two people reviewed a $91,000 salary. **That is a control that reads as a
-- control and is not one**, which is worse than having no second step at all: the second step is
-- what everybody downstream trusts.
--
-- RULED (coordinator, round-21): **`require_second_actor` means two ACTORS.** The mode's own name
-- decides it. Scope is that mode only — `auto_record`'s sole-proprietor carve-out (hr_c4_20) is
-- deliberately untouched, because that rule exists precisely for the org where one person is the
-- whole approval chain and says so in the record.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 ONE MECHANISM, EXTENDED — NOT A PARALLEL CHECK IN `wf_decide`. `hr._wf_prior_deciders`
--    is the single source of "who has already decided on this instance", and BOTH arms call it:
--      · the RESOLVER strikes a prior decider in `eligible()`, in the same loop and the same shape
--        as the requester rule, so the step is never OFFERED to them — no inbox row, no grant, no
--        notification, nothing to click;
--      · `hr.wf_decide` REFUSES if the step is reached any other way — a stale inbox row, a direct
--        RPC call, a grant that outlived a re-resolution.
--    A check in the decide door alone would leave the step visible and clickable and only fail at
--    the end, which is the same "looks fine until it doesn't" shape as the defect itself.
--
-- 2. THE MODE TEST LIVES IN ONE PLACE TOO. `hr._wf_two_actor_action(action)` reads
--    `sole_authority_mode` off the `hr_approval_action` vocabulary row (§1.4 rule 3's own risk
--    split). Neither arm carries a literal list of actions, so the scope cannot drift between them
--    or from the split it is named after.
--
-- 3. WHERE STRIKING EMPTIES THE POOL, THE EXISTING HONEST MACHINERY FIRES — no new stall path.
--    The resolver's no-candidate return already names its reason; it gains
--    `distinct_actor_required`, whose class declares the resolutions that actually apply:
--    `record_without_approval` (the §1.4 rule 3 lane — the act is recorded WITH a reason and
--    stamped `approval_basis='sole_authority'`, so the record says plainly that two-level review did
--    not happen), `reassign`, `abandon`. `sole_actor_deadlock` still names the case where the only
--    candidate was the SUBJECT. The distinction matters: "nobody else holds this" and "the only
--    person who holds it already used it on this request" have different fixes.
--
-- 4. THE ALREADY-LANDED $91,000 IS NOT UNWOUND — IT IS NAMED. The money stands (an unwind would be
--    a second uncontrolled act, and the person is owed their pay). What was missing is the
--    provenance, so a `control_finding` event is appended to that instance's own append-only
--    history: what happened, which decisions, and that the record must not be read as two-level
--    review. **No decision row is touched** — §1.5 makes those immutable, and rewriting one to look
--    better would be exactly the dishonesty this migration exists to stop. Reported to the
--    coordinator for Arman's walkthrough and recorded on the HRB-008 register row.
--
-- Authority: SPEC-ACCESS §1.4 rule 3 (the risk split and its two modes), SPEC-WORKFLOW-ENGINE §2.2
-- (eligibility), §1.5 (the decision ledger is immutable), §1.8 (the class vocabulary).
-- Applied live as `hr_c4_22_two_actors_means_two_actors`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_22_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the ONE mechanism (RD 1 / RD 2)
create or replace function hr._wf_prior_deciders(p_instance uuid)
returns uuid[]
language sql stable security definer set search_path = hr, public
as $fn$
  select coalesce(array_agg(distinct d.actor_employment_id), '{}'::uuid[])
    from hr.workflow_decision d
   where d.workflow_instance_id = p_instance
     and d.actor_employment_id is not null
     -- an abstention is not a decision on the merits, so it does not spend the actor
     and d.decision <> 'abstained';
$fn$;

comment on function hr._wf_prior_deciders is
  'SPEC-WORKFLOW-ENGINE §2.2 — every employment that has already decided a step on this instance. THE single source for the distinct-actor rule: hr.wf_resolve_approvers strikes them in eligible() so the step is never offered, and hr.wf_decide refuses them if the step is reached another way. Abstentions do not count: they are not a decision on the merits.';

create or replace function hr._wf_two_actor_action(p_action_type text)
returns boolean
language sql stable security definer set search_path = hr, public
as $fn$
  select coalesce((select c.metadata ->> 'sole_authority_mode' = 'require_second_actor'
                     from platform.categories c
                    where c.dimension = 'hr_approval_action' and c.slug = p_action_type
                      and c.deleted_at is null
                    limit 1), false);
$fn$;

comment on function hr._wf_two_actor_action is
  'SPEC-ACCESS §1.4 rule 3 — does this action require a SECOND, DISTINCT actor? Read from the hr_approval_action vocabulary row so neither the resolver nor the decide door carries a literal list, and the scope cannot drift from the risk split it is named after.';

revoke all on function hr._wf_prior_deciders(uuid) from public, anon, authenticated;
revoke all on function hr._wf_two_actor_action(text) from public, anon, authenticated;

-- ============================================================ 2. the class + its CHECK
insert into platform.categories (organization_id, dimension, name, slug, is_system, "position",
                                 metadata, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_workflow_failure_class',
       'A second, distinct approver is required', 'distinct_actor_required', true, 27,
       jsonb_build_object(
         'blocks_instance', true,
         'default_assignee', 'hr_admin',
         'retryable', false,
         'resolutions', jsonb_build_array('record_without_approval','reassign','abandon'),
         'detail', 'Everybody the routing plan produced for this step has already decided an earlier step of this same request, and this action requires a second, distinct actor (SPEC-ACCESS §1.4 rule 3). Retrying re-runs the same routing over the same people. Give somebody else the authority, or record the act WITHOUT approval — named, reasoned and stamped approval_basis=sole_authority, so the record never claims a two-level review that did not happen.'),
       'internal'
 where not exists (select 1 from platform.categories c
                    where c.dimension = 'hr_workflow_failure_class'
                      and c.slug = 'distinct_actor_required' and c.deleted_at is null);

do $$
declare v_con text;
begin
  if exists (select 1 from pg_constraint c
              join pg_class t on t.oid = c.conrelid
              join pg_namespace n on n.oid = t.relnamespace
             where n.nspname = 'hr' and t.relname = 'workflow_failure' and c.contype = 'c'
               and pg_get_constraintdef(c.oid) like '%distinct_actor_required%') then
    raise notice 'hr_c4_22: hr.workflow_failure already admits distinct_actor_required';
    return;
  end if;
  select c.conname into v_con from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'hr' and t.relname = 'workflow_failure' and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%failure_class = ANY%';
  execute format('alter table hr.workflow_failure drop constraint %I', v_con);
  execute format($f$alter table hr.workflow_failure add constraint %I check (failure_class = any (array[
      'unroutable','approver_ineligible','validation_error','conflict_at_decision','apply_failed',
      'result_unverified','notification_undeliverable','target_missing','definition_invalid',
      'unactionable_no_reach','sole_actor_deadlock','distinct_actor_required']))$f$, v_con);
  raise notice 'hr_c4_22: hr.workflow_failure.failure_class now admits distinct_actor_required';
end $$;

-- ============================================================ 3. ARM ONE — the resolver
do $mig$
declare
  v_oid oid; v_def text; v_new text;

  v_dec_old constant text := $o$v_action_id uuid;$o$;
  v_dec_new constant text := $o$v_action_id uuid;
  v_two_actor boolean := false;$o$;

  v_mode_old constant text := $o$    select c.id into v_action_id from platform.categories c$o$;
  v_mode_new constant text := $o$    v_two_actor := hr._wf_two_actor_action(v_action);
    select c.id into v_action_id from platform.categories c$o$;

  v_elig_old constant text := $o$          -- an explicit exclusion (escalation moving off the previous holder)$o$;
  v_elig_new constant text := $o$          -- 🚨 A PRIOR DECIDER OF THIS INSTANCE IS STRUCK, exactly as the requester is, and by the
          -- same shape one rung up. `require_second_actor` means two ACTORS: one person taking both
          -- the manager step and the executive step of the same request yields an audit that READS
          -- as two-level control and is not one, which is worse than no second step, because the
          -- second step is what everybody downstream trusts. Scoped to that mode only —
          -- auto_record's sole-proprietor carve-out exists for exactly the opposite case and says
          -- so in the record. The decide door refuses the same people; both arms call the same
          -- hr._wf_prior_deciders, so there is nothing to drift.
          if v_two_actor and c = any(hr._wf_prior_deciders(inst.id)) then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'is_prior_decider');
            continue;
          end if;
          -- an explicit exclusion (escalation moving off the previous holder)$o$;

  v_fail_old constant text := $o$      'reason', case
        when v_refused <> '[]'::jsonb
             and not exists (select 1 from jsonb_array_elements(v_refused) r
                              where r ->> 'why' is distinct from 'is_subject')
          then 'sole_actor_deadlock'
        when v_had_holders then 'approver_ineligible'
        else 'unroutable' end,$o$;
  v_fail_new constant text := $o$      'reason', case
        -- 🚨 "the only person who holds this already used it on THIS request" and "nobody else
        -- holds it at all" have different fixes, so they get different names. The distinct-actor
        -- case is checked first because it is the more specific of the two.
        when exists (select 1 from jsonb_array_elements(v_refused) r
                      where r ->> 'why' = 'is_prior_decider')
          then 'distinct_actor_required'
        when v_refused <> '[]'::jsonb
             and not exists (select 1 from jsonb_array_elements(v_refused) r
                              where r ->> 'why' is distinct from 'is_subject')
          then 'sole_actor_deadlock'
        when v_had_holders then 'approver_ineligible'
        else 'unroutable' end,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$is_prior_decider$chk$ in v_def) > 0 then
    raise notice 'hr_c4_22: the resolver already strikes prior deciders';
  else
    if position(v_dec_old in v_def) = 0 or position(v_mode_old in v_def) = 0
       or position(v_elig_old in v_def) = 0 or position(v_fail_old in v_def) = 0 then
      raise exception 'hr_c4_22: hr.wf_resolve_approvers does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def,  v_dec_old,  v_dec_new);
    v_new := replace(v_new,  v_mode_old, v_mode_new);
    v_new := replace(v_new,  v_elig_old, v_elig_new);
    v_new := replace(v_new,  v_fail_old, v_fail_new);
    execute v_new;
    raise notice 'hr_c4_22: the resolver no longer OFFERS a step to somebody who already decided this instance';
  end if;
end
$mig$;

-- ============================================================ 4. ARM TWO — the decide door
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  -- ---- the decision vocabulary and the reason rules$o$;
  v_rep constant text := $o$  -- ---- 🚨 TWO ACTORS MEANS TWO ACTORS. The resolver does not OFFER this step to somebody who
  -- already decided an earlier step of this instance; this is the OTHER arm, for a step reached any
  -- other way — a stale inbox row, a direct RPC call, a grant that outlived a re-resolution. Both
  -- arms call hr._wf_prior_deciders, so this is one mechanism enforced twice, not two rules.
  if hr._wf_two_actor_action(sd.authority_action)
     and exists (select 1 from unnest(hr._wf_prior_deciders(inst.id)) d where d = any(v_mine)) then
    return hr._governance_refusal(inst.organization_id, 'hr_workflow_step',
      'WF_DISTINCT_ACTOR_REQUIRED',
      'you already decided a step on this request, and this approval requires a second, distinct actor; a two-level review taken twice by one person is not a two-level review',
      inst.subject_employment_id, ARRAY[p_step_id]);
  end if;

  -- ---- the decision vocabulary and the reason rules$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_decide';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$WF_DISTINCT_ACTOR_REQUIRED$chk$ in v_def) > 0 then
    raise notice 'hr_c4_22: the decide door already refuses a prior decider';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_22: hr.wf_decide does not carry the expected anchor — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_22: hr.wf_decide refuses a prior decider of the same instance';
  end if;
end
$mig$;

-- ============================================================ 5. the $91,000 row, NAMED (RD 4)
do $$
declare v_inst uuid := 'ba58ce3c-0803-4219-b911-ccfddd7fce15'; v_org uuid; v_n integer;
begin
  select organization_id into v_org from hr.workflow_instance where id = v_inst;
  if v_org is null then
    raise notice 'hr_c4_22: instance % is not present; nothing to annotate', v_inst;
    return;
  end if;
  if exists (select 1 from hr.workflow_event
              where workflow_instance_id = v_inst and event_kind = 'control_finding') then
    raise notice 'hr_c4_22: the control finding is already on the record';
    return;
  end if;
  select count(*) into v_n from hr.workflow_decision d
   where d.workflow_instance_id = v_inst and d.actor_employment_id is not null;
  perform hr.arm_write();
  -- 🚨 APPENDED, NEVER REWRITTEN. §1.5 makes hr.workflow_decision immutable, and editing a decision
  -- to look better would be precisely the dishonesty this migration exists to stop. The money
  -- stands: unwinding it would be a second uncontrolled act, and the person is owed their pay.
  perform hr._wf_event(
    v_inst, null, 'control_finding', null, null, 'automation', null, null,
    jsonb_build_object(
      'finding', 'one_actor_took_both_levels',
      'detail', 'Both approval steps of this pay change were decided by the same person (G2V-Priya Raman): manager_approval at 00:39:43Z and executive_approval at 00:41:41Z on 2026-08-28, each stamped approval_basis=authority. Under the behaviour in force at the time nothing refused it and nothing in the record showed one person twice, so this instance READS as a two-level review that did not happen.',
      'amount', 91000, 'currency', 'USD', 'effective_from', '2026-11-15',
      'decisions_by_one_actor', v_n,
      'money_unwound', false,
      'why_not_unwound', 'The pay change stands. Reversing it would be a second uncontrolled act and the employee is owed their pay; what was missing is the provenance, which is now on this instance''s permanent history.',
      'fixed_by', 'hr_c4_22 — the resolver no longer offers a step to a prior decider of the same instance, and hr.wf_decide refuses one reached another way.',
      'read_this_record_as', 'ONE actor, not two. Do not cite this instance as evidence of two-level control.'));
  raise notice 'hr_c4_22: control finding appended to instance %', v_inst;
end $$;

-- ============================================================ 6. post-conditions
do $$
declare v_src text; v_bad integer; v_before integer;
begin
  -- RD 1: ONE mechanism, both arms
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = '_wf_prior_deciders') then
    raise exception 'hr_c4_22: hr._wf_prior_deciders is missing';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  if v_src !~ '_wf_prior_deciders' or v_src !~ 'is_prior_decider' then
    raise exception 'hr_c4_22: the resolver does not strike prior deciders';
  end if;
  if v_src !~ 'v_two_actor and c = any' then
    raise exception 'hr_c4_22: the resolver''s strike is not scoped to require_second_actor';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_decide';
  if v_src !~ '_wf_prior_deciders' or v_src !~ 'WF_DISTINCT_ACTOR_REQUIRED' then
    raise exception 'hr_c4_22: the decide door does not refuse a prior decider';
  end if;
  -- neither arm carries a literal action list (RD 2)
  if v_src ~ 'require_second_actor''' then
    raise exception 'hr_c4_22: hr.wf_decide inlines the mode instead of asking the vocabulary';
  end if;

  -- RD 3: the class exists, is writable, and offers the sole-authority lane
  if not exists (select 1 from platform.categories
                  where dimension = 'hr_workflow_failure_class' and slug = 'distinct_actor_required'
                    and deleted_at is null
                    and metadata -> 'resolutions' ? 'record_without_approval') then
    raise exception 'hr_c4_22: the distinct_actor_required class is missing or offers no way out';
  end if;
  select count(*) into v_bad
    from platform.categories c
   where c.dimension = 'hr_workflow_failure_class' and c.deleted_at is null
     and not exists (select 1 from pg_constraint k
                       join pg_class t on t.oid = k.conrelid
                       join pg_namespace n on n.oid = t.relnamespace
                      where n.nspname = 'hr' and t.relname = 'workflow_failure' and k.contype = 'c'
                        and pg_get_constraintdef(k.oid) like '%''' || c.slug || '''%');
  if v_bad > 0 then
    raise exception 'hr_c4_22: % registered failure class(es) are refused by the CHECK', v_bad;
  end if;

  -- RD 4: the finding is on the record, and NOT ONE decision row was touched
  if not exists (select 1 from hr.workflow_event
                  where workflow_instance_id = 'ba58ce3c-0803-4219-b911-ccfddd7fce15'
                    and event_kind = 'control_finding') then
    raise exception 'hr_c4_22: the $91,000 control finding is not on the record';
  end if;
  select count(*) into v_bad from hr.workflow_decision
   where workflow_instance_id = 'ba58ce3c-0803-4219-b911-ccfddd7fce15'
     and decision <> 'approved';
  if v_bad > 0 then
    raise exception 'hr_c4_22: a decision row on the flagged instance was altered';
  end if;

  -- auto_record's carve-out is untouched (hr_c4_20)
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'can_approve')
     !~ 'coalesce\(v_mode, ''require_second_actor''\) = ''auto_record''' then
    raise exception 'hr_c4_22: hr_c4_20''s tier-scoped RULE 2b was lost';
  end if;
  -- and hr_c4_21's pre-flight
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_request') !~ 'WF_NO_POSSIBLE_APPROVER' then
    raise exception 'hr_c4_22: hr_c4_21''s pre-flight was lost';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_22_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_22: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
