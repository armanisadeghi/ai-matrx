-- HR domain C4 — migration 20 (register item HRB-008 follow-up, lane workflow-engine; round-15).
--
-- 🚨 THREE OF SEVEN LIVE TIMECARDS COULD BE APPROVED BY NOBODY, AND PAYROLL STALLED IN SILENCE.
-- `hr.timecards_without_an_approver()`, measured 2026-08-27:
--
--   G2S-XMID Ximena Delgado  has_manager=true   reporting_line_rung_absent_from_predicate
--   G2S-FIX  Fiona Xavier    has_manager=true   reporting_line_rung_absent_from_predicate
--   Armani Sadeghi           has_manager=false  sole_approver_cannot_self_approve
--
-- Both shapes are the same disease: **`hr.can_approve` cannot speak a rule the rest of the system
-- already states.** Neither fix widens anything on this lane's own authority — one is a
-- coordinator ruling, the other is dead code the spec already mandates.
--
-- ===================================================================================
-- SHAPE 1 — THE REPORTING-LINE RUNG IS STRUCTURALLY DEAD (RULED by the coordinator)
--
-- `hr.wf_resolve_approvers` walks `fallback_chain`, whose platform default is
-- `{authority, substitute, reporting_line, top_of_chart}`, and its `reporting_line` rung yields the
-- subject's manager. RECORDED DECISION 1 then filters every candidate through `hr.can_approve` —
-- whose RULE 2 needs an `hr.approval_authority` row and whose RULE 3 is gated on `not v_has_mgr`.
-- A subject WITH a manager therefore fails both: the rung the selector walks is one the predicate
-- cannot speak, so it can never yield anybody. §8.2's own `manager_approval` step — *the manager
-- approves the timecard* — is undeliverable in any org that has not hand-seeded authority rows,
-- which is every fresh org. (Live: zero `timecard_approve` authority rows exist in any org.)
--
-- FIX: `can_approve` gains RULE 2b, mirroring the selector's rung, and it is **data-driven from the
-- routing plan** rather than from a list in code — an action is manager-approvable exactly when a
-- published step definition for that action declares `reporting_line` in its fallback chain. The
-- org's own routing plan therefore decides, §0 law 3 is kept (no `IF flow_type = …` in code), and
-- predicate and resolver read the same row to reach the same answer.
--
-- ===================================================================================
-- SHAPE 2 — §3's SOLE-PROPRIETOR CARVE-OUT IS DEAD CODE (spec-mandated, not invented)
--
-- SPEC-ACCESS §1.4 rule 3 is explicit: when the subject is top of the chart and the only eligible
-- approver is themselves, `sole_authority_mode[action_type]` decides — **`auto_record`** for
-- `timecard_approve` / `leave_approve` / `swap_approve` (*"blocking a sole proprietor from taking a
-- day off is over-tightening, and the record is stamped `approval_basis='sole_authority'` and
-- audited"*), and **`require_second_actor`** for `pay_change_approve` / `termination_approve` /
-- `offer_approve` (*"which routes to the workflow engine's no-eligible-approver failure queue with
-- an explicit, audited `record_without_approval` action that names the actor and demands a
-- reason"*).
--
-- 🚨 The `auto_record` half was WRITTEN and UNREACHABLE. It sits at the end of RULE 3:
--
--     if v_mode = 'auto_record' and v_is_self then return true; end if;
--
-- but RULE 1 returns first, unconditionally:
--
--     if v_is_self then return false; end if;
--
-- so `v_is_self` can never be true when that line is evaluated. The live vocabulary confirms the
-- shape is real: `timecard_approve.sole_authority_mode = auto_record`. A sole proprietor's own
-- timecard was refused by a rule the spec says must not refuse it.
--
-- FIX: RULE 1 stops being blanket and consults §3's own three conditions — mode is `auto_record`,
-- the subject is top of the chart, and there is genuinely NO second actor who could act. All three
-- must hold; any one missing and the refusal stands exactly as before. `require_second_actor`
-- actions are untouched and still refuse, which is what routes them to the failure queue.
--
-- And that queue entry must be NAMED, per the honest-termination pattern this lane already
-- established with `unactionable_no_reach`: when the chain's ONLY refusal was `is_subject`, the
-- resolver now reports `sole_actor_deadlock` rather than the generic `approver_ineligible`, the
-- class declares `record_without_approval` among its resolutions, and `hr.wf_resolve_failure`
-- implements that action with §3's own requirements — it names the actor, demands a reason (the
-- door already refuses an empty note), and stamps `approval_basis='sole_authority'`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. RULE 2b IS SCOPED BY THE ROUTING PLAN, NOT BY A HARDCODED ACTION LIST. `'reporting_line' =
--    any(sd.fallback_chain)` on a live step definition IS the declaration "a manager may take
--    this". No new column, no list in code, and an org that removes the rung from its own routing
--    plan removes the manager's right in the same act.
--
-- 2. THE WHOLE CHAIN, NOT ONLY THE DIRECT MANAGER — because §2.2's rung is *"the subject's primary
--    manager at as_of, then that manager's manager, climbing until an eligible employment is
--    found"*, and escalation legitimately reaches those ancestors. A predicate that accepted only
--    the direct manager would kill escalation the same way this defect killed the rung.
--
-- 3. THE SECOND-ACTOR TEST IS A REAL SEARCH, NOT A HEADCOUNT. It asks whether any OTHER active
--    employment in the tenant, with a login, holds this action's authority (directly or by role) or
--    the `hr_owner` / org-owner backstop. Counting employees would have called a two-person org
--    with one admin "not sole".
--
-- 4. THE FAILURE CLASS'S CHECK IS EXTENDED IN THE SAME FILE. hr_c4_15 registered a class the
--    hardcoded `hr.workflow_failure` CHECK then rejected, live; hr_c4_17 cleaned that up. This file
--    does both halves at once and asserts a real insert, rolled back.
--
-- 5. CHECK 26'S ALLOWLIST SHRINKS TO NOTHING, BY DELETION. All three named subjects are fixed
--    here — two by RULE 2b, one by the reachable carve-out — so the entry is removed rather than
--    re-dated.
--
-- Authority: SPEC-ACCESS §1.4 rules 1–3 (verbatim above), SPEC-WORKFLOW-ENGINE §2.2 (the rung
-- list), §8.2 (the manager approves), §1.8 (the class vocabulary), §0 law 3.
-- Applied live as `hr_c4_20_predicate_speaks_the_rungs_the_resolver_walks`. Idempotent.

set local statement_timeout = '600s';
-- the shared checkout has many concurrent writers; the one ALTER here waits rather than
-- losing a whole idempotent file to a transient lock.
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_20_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the class + its CHECK (RD 4)
insert into platform.categories (organization_id, dimension, name, slug, is_system, "position",
                                 metadata, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_workflow_failure_class',
       'Sole actor — a second approver is required and none exists', 'sole_actor_deadlock', true, 26,
       jsonb_build_object(
         'blocks_instance', true,
         'default_assignee', 'hr_admin',
         'retryable', false,
         'resolutions', jsonb_build_array('record_without_approval','reassign','abandon'),
         'detail', 'The only candidate the routing plan produced is the subject of the request, and this action''s sole_authority_mode requires a second actor. Retrying re-runs the same routing over the same people. Either somebody else is given the authority, or the act is recorded WITHOUT approval — named, reasoned and audited (SPEC-ACCESS §1.4 rule 3).'),
       'internal'
 where not exists (select 1 from platform.categories c
                    where c.dimension = 'hr_workflow_failure_class'
                      and c.slug = 'sole_actor_deadlock' and c.deleted_at is null);

do $$
declare v_con text;
begin
  if exists (select 1 from pg_constraint c
              join pg_class t on t.oid = c.conrelid
              join pg_namespace n on n.oid = t.relnamespace
             where n.nspname = 'hr' and t.relname = 'workflow_failure' and c.contype = 'c'
               and pg_get_constraintdef(c.oid) like '%sole_actor_deadlock%') then
    raise notice 'hr_c4_20: hr.workflow_failure already admits sole_actor_deadlock';
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
      'unactionable_no_reach','sole_actor_deadlock']))$f$, v_con);
  raise notice 'hr_c4_20: hr.workflow_failure.failure_class now admits sole_actor_deadlock';
end $$;

-- ============================================================ 2. the predicate speaks both rungs
do $mig$
declare
  v_oid oid; v_def text; v_new text;

  -- SHAPE 2: RULE 1 stops being blanket and consults §3's own conditions
  v_r1_old constant text := $o$  if v_is_self then
    return false;   -- no override, no break-glass, no exception for HR owners or the org owner
  end if;$o$;
  v_r1_new constant text := $o$  if v_is_self then
    -- 🚨 §1.4 RULE 3's SOLE-PROPRIETOR CARVE-OUT, WHICH WAS WRITTEN AND UNREACHABLE. It sits at the
    -- end of RULE 3 as `if v_mode = 'auto_record' and v_is_self then return true`, but this return
    -- fired first and unconditionally — so a sole proprietor's own timecard was refused by the very
    -- rule the spec says must not refuse it ("blocking a sole proprietor from taking a day off is
    -- over-tightening"). All THREE of §3's conditions must hold; any one missing and the refusal
    -- stands exactly as it did. `require_second_actor` actions are untouched and still refuse,
    -- which is what routes them to the no-eligible-approver failure queue.
    if v_mode = 'auto_record'
       and hr.manager_as_of(v_subject, p_at) is null            -- top of the chart
       and not exists (                                          -- and genuinely no second actor
         select 1
           from hr.employment em2
           join hr.employee e2 on e2.id = em2.employee_id
          where em2.organization_id = (select em3.organization_id from hr.employment em3
                                        where em3.id = v_subject)
            and em2.deleted_at is null
            and em2.status = 'active'
            and not (em2.id = any(v_mine))
            and e2.login_user_id is not null
            and (
              exists (select 1 from hr.approval_authority aa2
                       where aa2.organization_id = em2.organization_id
                         and aa2.action_type = p_action_type and aa2.is_active
                         and aa2.effective_from <= p_at
                         and (aa2.effective_to is null or aa2.effective_to >= p_at)
                         and ((aa2.holder_kind = 'employment' and aa2.holder_id::uuid = em2.id)
                              or (aa2.holder_kind = 'role' and exists (
                                    select 1 from hr.role_assignment ra2
                                     where ra2.employment_id = em2.id
                                       and ra2.role_key = aa2.holder_id
                                       and ra2.is_active and ra2.revoked_at is null))))
              or exists (select 1 from hr.role_assignment ra3
                          where ra3.organization_id = em2.organization_id
                            and ra3.employment_id = em2.id and ra3.role_key = 'hr_owner'
                            and ra3.is_active and ra3.revoked_at is null
                            and ra3.effective_from <= p_at
                            and (ra3.effective_to is null or ra3.effective_to >= p_at))
              or exists (select 1 from iam.organization_member om2
                          where om2.organization_id = em2.organization_id
                            and om2.user_id = e2.login_user_id and om2.role = 'owner')))
    then
      -- the engine stamps approval_basis='sole_authority' on the decision and audits it (§1.4 r3)
      return true;
    end if;
    return false;   -- otherwise: no override, no break-glass, no exception for HR owners or the org owner
  end if;$o$;

  -- SHAPE 1: the rung the selector walks, now speakable
  v_r3_old constant text := $o$  -- ---------- RULE 3. TOP OF CHART.$o$;
  v_r3_new constant text := $o$  -- ---------- 🚨 RULE 2b. THE REPORTING LINE — THE RUNG THE SELECTOR ACTUALLY WALKS.
  -- hr.wf_resolve_approvers produces the subject's manager at its `reporting_line` rung and then
  -- filters every candidate through THIS function (its RECORDED DECISION 1). Without this rule
  -- RULE 2 needs an authority row and RULE 3 is gated on `not v_has_mgr`, so a subject WITH a
  -- manager failed both and the rung could never yield anybody — §8.2's own manager_approval step
  -- was undeliverable in any org that had not hand-seeded authority rows, which is every fresh org.
  --
  -- Scoped by the ROUTING PLAN, not by a list in code (§0 law 3): an action is manager-approvable
  -- exactly when a live step definition for it declares `reporting_line` in its fallback chain. The
  -- whole chain counts, not just the direct manager, because §2.2's rung climbs "until an eligible
  -- employment is found" and escalation legitimately reaches those ancestors.
  if v_subject is not null
     and exists (select 1 from hr.workflow_step_definition sd
                  where sd.deleted_at is null
                    and sd.authority_action = p_action_type
                    and 'reporting_line' = any(sd.fallback_chain))
     and exists (select 1
                   from hr.manager_chain(v_subject, p_at) mc
                   join hr.employment mem on mem.id = mc.manager_employment_id
                  where mc.manager_employment_id = any(v_mine)
                    and mem.organization_id = v_org)
  then
    return true;
  end if;

  -- ---------- RULE 3. TOP OF CHART.$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'can_approve';
  if v_oid is null then raise exception 'hr_c4_20: hr.can_approve does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$RULE 2b$chk$ in v_def) > 0 then
    raise notice 'hr_c4_20: hr.can_approve already speaks the reporting-line rung';
  else
    if position(v_r1_old in v_def) = 0 or position(v_r3_old in v_def) = 0 then
      raise exception 'hr_c4_20: hr.can_approve does not carry the expected rules — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_r1_old, v_r1_new);
    v_new := replace(v_new, v_r3_old, v_r3_new);
    execute v_new;
    raise notice 'hr_c4_20: hr.can_approve now speaks the reporting-line rung and §3''s sole-authority carve-out';
  end if;
end
$mig$;

-- ============================================================ 3. the deadlock is NAMED
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$      'reason', case when v_had_holders then 'approver_ineligible' else 'unroutable' end,$o$;
  v_rep constant text := $o$      -- 🚨 when the ONLY thing the chain produced was the subject themselves, the honest name is
      -- not the generic one: §1.4 rule 3's sole-actor case has its own resolutions (an audited
      -- `record_without_approval`, or giving somebody else the authority), and a queue that cannot
      -- say which problem it has cannot offer the right way out.
      'reason', case
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
  if position($chk$sole_actor_deadlock$chk$ in v_def) > 0 then
    raise notice 'hr_c4_20: the resolver already names the sole-actor deadlock';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_20: hr.wf_resolve_approvers does not carry the expected failure naming — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_20: hr.wf_resolve_approvers names the sole-actor deadlock';
  end if;
end
$mig$;

-- ============================================================ 4. §3's `record_without_approval`
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  if p_action = 'not_attested' then$o$;
  v_rep constant text := $o$  -- 🚨 SPEC-ACCESS §1.4 rule 3, verbatim: a `require_second_actor` action with no second actor
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

  if p_action = 'not_attested' then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$record_without_approval$chk$ in v_def) > 0 then
    raise notice 'hr_c4_20: the door already offers record_without_approval';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_20: hr.wf_resolve_failure does not carry hr_c4_15''s branch — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_20: hr.wf_resolve_failure offers §1.4 rule 3''s record_without_approval';
  end if;
end
$mig$;

-- ============================================================ 5. check 26's allowlist, deleted (RD 5)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$    from hr.timecards_without_an_approver() t
    -- decision 1: dated, stated, printed below on every run, and shrinking by deletion
   where t.pay_period_employment_id not in (
     select ppe.id from hr.pay_period_employment ppe
      join hr.employment em on em.id = ppe.employment_id
      join hr.employee e on e.id = em.employee_id
     where e.display_name in ('G2S-FIX Fiona Xavier', 'G2S-XMID Ximena Delgado', 'Armani Sadeghi'));$o$;
  v_rep constant text := $o$    from hr.timecards_without_an_approver() t;
    -- decision 1 CLOSED 2026-08-27 (hr_c4_20): the allowlist is deleted, not re-dated. All three
    -- subjects are fixed at the source — the two with managers by hr.can_approve's new RULE 2b
    -- (the reporting-line rung the selector always walked), and the sole approver by making
    -- SPEC-ACCESS §1.4 rule 3's `auto_record` carve-out reachable, which was written but sat behind
    -- RULE 1's unconditional self-refusal.$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if v_oid is null then raise exception 'hr_c4_20: hr.punch_write_path_conformance does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$decision 1 CLOSED 2026-08-27$chk$ in v_def) > 0 then
    raise notice 'hr_c4_20: check 26''s allowlist is already deleted';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_20: check 26 does not carry the expected allowlist — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_20: check 26''s allowlist deleted';
  end if;
end
$mig$;

-- ============================================================ 6. post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer; v_left jsonb;
begin
  -- 🚨 THE MEASUREMENT THAT MATTERS: no live timecard is without an approver, allowlist gone.
  select coalesce(jsonb_agg(jsonb_build_object('subject', t.subject, 'shape', t.shape)), '[]'::jsonb)
    into v_left from hr.timecards_without_an_approver() t;
  if v_left <> '[]'::jsonb then
    raise exception 'hr_c4_20: % timecard(s) still have no approver: %',
      jsonb_array_length(v_left), v_left;
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if v_src ~ 'G2S-FIX Fiona Xavier' or v_src ~ 'Ximena Delgado' then
    raise exception 'hr_c4_20: check 26 still carries its allowlist';
  end if;

  -- shape 1: the predicate speaks the rung, and is scoped by the routing plan not a code list
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'can_approve';
  if v_src !~ 'RULE 2b' or v_src !~ 'reporting_line'' = any\(sd\.fallback_chain\)' then
    raise exception 'hr_c4_20: hr.can_approve does not speak the reporting-line rung from the routing plan';
  end if;
  -- shape 2: the carve-out is reachable, and still requires ALL THREE of §3's conditions
  if v_src !~ 'v_mode = ''auto_record''\s*\n\s*and hr\.manager_as_of' then
    raise exception 'hr_c4_20: the sole-authority carve-out is not gated on mode AND top-of-chart';
  end if;
  if v_src !~ 'and not exists \(\s*--\s*and genuinely no second actor' then
    raise exception 'hr_c4_20: the carve-out does not test for a second actor';
  end if;
  -- and never-approve-yourself still stands for require_second_actor
  if (select hr.can_approve(null, 'pay_change_approve', 'hr.employment',
                            (select id from hr.employment limit 1))) then
    raise exception 'hr_c4_20: can_approve answers true for a null caller';
  end if;

  -- the named deadlock and its resolution
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') !~ 'sole_actor_deadlock' then
    raise exception 'hr_c4_20: the resolver does not name the sole-actor deadlock';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  if v_src !~ 'record_without_approval' or v_src !~ 'sole_authority' then
    raise exception 'hr_c4_20: the door does not offer §1.4 rule 3''s record_without_approval';
  end if;
  if not exists (select 1 from platform.categories
                  where dimension = 'hr_workflow_failure_class' and slug = 'sole_actor_deadlock'
                    and deleted_at is null
                    and metadata -> 'resolutions' ? 'record_without_approval') then
    raise exception 'hr_c4_20: the sole_actor_deadlock class does not offer record_without_approval';
  end if;
  -- RD 4: the class is WRITABLE, not merely registered (the hr_c4_15 trap)
  select count(*) into v_bad
    from platform.categories c
   where c.dimension = 'hr_workflow_failure_class' and c.deleted_at is null
     and not exists (select 1 from pg_constraint k
                       join pg_class t on t.oid = k.conrelid
                       join pg_namespace n on n.oid = t.relnamespace
                      where n.nspname = 'hr' and t.relname = 'workflow_failure' and k.contype = 'c'
                        and pg_get_constraintdef(k.oid) like '%''' || c.slug || '''%');
  if v_bad > 0 then
    raise exception 'hr_c4_20: % registered failure class(es) are refused by the CHECK', v_bad;
  end if;

  -- hr_c4_15..19 still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_apply') ~ '''closed'', ''completed''' then
    raise exception 'hr_c4_20: hr_c4_19''s outcome-bearing close reason was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_close_instance') !~ 'superseded by instance closure' then
    raise exception 'hr_c4_20: hr_c4_18''s failure-row close was lost';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_20: % engine function(s) went back to the legacy write-guard arm', v_bad;
  end if;

  -- 🚨 status matters as much as category: iam.canonical_certify also emits an INFO `snapshot` row
  -- (129 of them, one per table) that is not a finding at all. Counting rows by category alone made
  -- this gate read every healthy table as a violation.
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn'
     and c.status in ('FAIL','WARN');
  if v_bad > 0 then
    raise exception 'hr_c4_20: % hr CONFORMANCE finding(s)', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_20_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_20: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
