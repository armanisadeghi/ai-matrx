-- HR domain C4 — migration 11 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 EVERY TIMECARD ATTESTATION IN A KIOSK WORKFORCE WAS UNROUTABLE, AND THE SUBMIT REPORTED IT AS
-- "0 INSTANCE(S) WERE STARTED" — WHICH IS WHY `hr.workflow_instance` LOOKED EMPTY FOR FOUR ROUNDS.
--
-- Measured on the real submitted period (G2V Window Biweekly, `27da579d…`, 2026-08-27), not
-- reasoned about. The submit DID open the instance — the front of the chain was never missing:
--
--   hr.workflow_instance 470e7247…  flow_key=timecard_attestation  state=FAILED
--                                   state_reason=approver_ineligible
--   hr.workflow_step     effd7456…  step_key=employee_attestation  state=UNROUTABLE
--   resolution_evidence  {"refused":[{"why":"no_login",
--                                     "employment_id":"ca9e12da…"}]}      -- G2V-Priya Raman
--   hr.employee.login_user_id = NULL
--
-- The step routes to the employee THEMSELVES (`resolver_kind=fixed_user`,
-- `resolver_config={"employment_source":"subject"}`, `allows_self=true` — §8.2's only v1 self-step).
-- `hr.wf_resolve_approvers` then dropped that single candidate because the employee holds no
-- platform login, the rung came back empty, and the instance failed. Since `hr.wf_request` returns
-- `granted=false` for a failed instance, `hr.pay_period_transition` counted zero and said so.
--
-- ===================================================================================
-- WHY THE DROP IS WRONG, FROM THE SPEC RATHER THAN FROM CONVENIENCE
--
-- SPEC-WORKFLOW-ENGINE §2.2 enumerates `eligible(c)` in full — the subject unless `allows_self`,
-- the requester when the flow marks them an interested party, terminated/inactive employments,
-- absent approvers, vacant seats. **"Has no login" is not on that list.** The engine added a sixth
-- rule the spec does not have.
--
-- §5.1 then says the opposite of that rule, twice and on purpose: *"`assignee_id` is a login, not
-- an employment. HR approval rights belong to an employment (AD-1), and **kiosk-only staff have no
-- login at all (AD-10)**"*, and the projection is built *"for each resolved approver **who has a
-- login**"*. The login is a PROJECTION filter — it decides who gets a `workspace.tasks` mirror row
-- and an `iam.permissions` grant. It was never meant to decide who is a resolved approver.
--
-- The cost of the extra rule is not a cosmetic one. With the step dead at `unroutable`, §8.2 node G
-- — *"no action by the deadline → reminders, then auto-close as `not_attested` and flag it to the
-- manager, NEVER silently attested"* — never runs, because the tick only sweeps ACTIVE steps. The
-- period can then never reach `approved`, since its rows stay `open`. An employee with no login was
-- not merely unreachable; their whole pay period was stuck with nobody told.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE FIX IS SCOPED TO THE SELF-STEP LANE, AND T-21b IS THE REASON — NOT CAUTION.
--    `hr.can_approve(p_user uuid, …)` asks about a PERSON: it starts from
--    `hr.employments_of(p_user)` and returns false for a NULL user. For a login-less candidate the
--    predicate is UNANSWERABLE, not false — and T-21b (this lane's blocking obligation) is that
--    nothing the selector returns can be something `hr.can_approve` refuses. Returning a candidate
--    the predicate was never able to judge would break it.
--    On a SELF-STEP the predicate's own answer is decidable without a login, because its FIRST rule
--    is literally `if v_allows_self then return v_is_self`, and `v_is_self` is
--    `subject = any(employments_of(user))`. When the candidate IS the subject employment, that is
--    TRUE for whoever holds it, login or not. So the self-step lane evaluates exactly the predicate's
--    own condition on the employment and T-21b still holds by construction.
--    Every OTHER rung is UNCHANGED: an authority holder with no login still cannot be asked and
--    still cannot be granted reach, so it is still a refusal there. **Widening this to all rungs is
--    what §2.2 and §5.1 literally say, and it is deliberately NOT done here** — it would route
--    approvals to people the predicate cannot judge, which is a different and much larger change
--    than the blocker needs. Recorded on the HRB-008 register row for the coordinator.
--
-- 2. THE DROP BECOMES A RECORDED OBSERVATION, NOT SILENCE. A kept-but-unreachable candidate is
--    written to `resolution_evidence.no_reach`, so the step says plainly that its approver has no
--    inbox row and no grant. `predicate_refused` keeps meaning "the predicate said no" and nothing
--    else. Same doctrine as §2.2's `predicate_refused`: a candidate never vanishes.
--
-- 3. 🚨 `hr.pay_period_transition` STOPS DISCARDING REFUSALS. It counted only `granted=true` and
--    threw the envelope away, so a period whose every attestation failed to route reported
--    "0 instance(s) were started" — indistinguishable from a period where the engine was never
--    called at all. That single misleading sentence is what four verification rounds read. It now
--    reports routed AND failed, and returns the per-employment reasons in
--    `workflowRoutingFailures`.
--
-- 4. THE BODIES ARE REWRITTEN FROM THE LIVE CATALOG by exact-string replacement, as hr_c4_08 /
--    hr_c4_09 / hr_c4_10 record, and the migration REFUSES to run if any expected text is absent —
--    it can never half-apply to a body it does not recognise. Idempotent: the replacements detect
--    themselves as already applied.
--
-- Authority: SPEC-WORKFLOW-ENGINE §2.2 (the eligible() list), §5.1 (kiosk-only staff have no login;
-- the projection filters on it), §8.2 node G (the deadline path that only exists once the step is
-- active). Applied live as `hr_c4_11_self_step_resolves_without_a_login`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- Preserve the live certification baseline instead of pretending unrelated standing debt is zero.
-- This migration changes function bodies, not entity-table conformance; it may not make the live
-- set worse, but pre-existing failures do not make this independent repair unsafe.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_11_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the resolver
do $mig$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_n   integer := 0;

  v_dec_old constant text := $o$  v_absent    jsonb  := '[]'::jsonb;
$o$;
  v_dec_new constant text := $o$  v_absent    jsonb  := '[]'::jsonb;
  v_noreach   jsonb  := '[]'::jsonb;   -- resolved, but holds no login: no grant, no inbox row
$o$;

  v_log_old constant text := $o$v_uid := hr._wf_login_of(c);
          if v_uid is null then
            -- a kiosk-only employment with no login cannot be granted reach and cannot decide.
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'no_login');
            continue;
          end if;$o$;
  v_log_new constant text := $o$v_uid := hr._wf_login_of(c);
          if v_uid is null then
            -- 🚨 A SELF-STEP RESOLVES ON THE EMPLOYMENT, BECAUSE THE PERSON MAY HAVE NO LOGIN.
            -- §5.1: "kiosk-only staff have no login at all (AD-10)", and there the login is a
            -- PROJECTION filter ("for each resolved approver who has a login") — §2.2's eligible()
            -- list contains no login rule at all. hr.can_approve's FIRST rule is
            -- `if v_allows_self then return v_is_self`, and v_is_self is
            -- `subject = any(employments_of(user))`: when the candidate IS the subject employment
            -- that is TRUE for whoever holds it, login or not. So the predicate's own condition is
            -- evaluated here directly and T-21b still holds — the selector returns only what
            -- hr.can_approve would accept. The candidate is kept and RECORDED as unreachable.
            if sd.allows_self and v_subject is not null and c = v_subject then
              v_noreach := v_noreach || jsonb_build_object('employment_id', c, 'why', 'no_login',
                'detail', 'resolved as the subject of a self-step; no login, so no iam.permissions grant and no workspace.tasks row');
              keep := keep || c;
              continue;
            end if;
            -- every OTHER rung: hr.can_approve asks about a PERSON and cannot judge a login-less
            -- candidate, and no reach can be granted to one either. Still a refusal, still named.
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'no_login');
            continue;
          end if;$o$;

  v_evf_old constant text := $o$                                     'refused', v_refused, 'absent', v_absent));$o$;
  v_evf_new constant text := $o$                                     'refused', v_refused, 'absent', v_absent,
                                     'no_reach', v_noreach));$o$;

  v_evs_old constant text := $o$      'predicate_refused', v_refused, 'absent', v_absent,$o$;
  v_evs_new constant text := $o$      'predicate_refused', v_refused, 'absent', v_absent, 'no_reach', v_noreach,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  if v_oid is null then raise exception 'hr_c4_11: hr.wf_resolve_approvers does not exist'; end if;

  v_def := pg_get_functiondef(v_oid);
  if position(v_log_new in v_def) > 0 then
    raise notice 'hr_c4_11: the resolver already keeps a login-less self-step subject; nothing to do';
  else
    if position(v_dec_old in v_def) = 0 or position(v_log_old in v_def) = 0
       or position(v_evf_old in v_def) = 0 or position(v_evs_old in v_def) = 0 then
      raise exception 'hr_c4_11: hr.wf_resolve_approvers does not carry the expected text — refusing to half-apply to a body this migration does not recognise';
    end if;
    v_new := replace(v_def,   v_dec_old, v_dec_new);
    v_new := replace(v_new,   v_log_old, v_log_new);
    v_new := replace(v_new,   v_evf_old, v_evf_new);
    v_new := replace(v_new,   v_evs_old, v_evs_new);
    execute v_new;
    v_n := v_n + 1;
    raise notice 'hr_c4_11: hr.wf_resolve_approvers rewritten';
  end if;
end
$mig$;

-- ============================================================ 2. the submit's report
do $mig$
declare
  v_oid oid;
  v_def text;
  v_new text;

  v_dec_old constant text := $o$  v_opened   integer := 0;
$o$;
  v_dec_new constant text := $o$  v_opened   integer := 0;
  v_failed   integer := 0;
  v_wf_detail jsonb  := '[]'::jsonb;
$o$;

  v_cnt_old constant text := $o$      if coalesce((v_req ->> 'granted')::boolean, false) then
        v_opened := v_opened + 1;
      end if;$o$;
  v_cnt_new constant text := $o$      if coalesce((v_req ->> 'granted')::boolean, false) then
        v_opened := v_opened + 1;
      else
        -- 🚨 A REFUSAL IS NEVER DISCARDED. This counted successes only and threw the envelope
        -- away, so a period whose every attestation failed to ROUTE reported "0 instance(s) were
        -- started" — the same sentence a period where the engine was never called would print.
        v_failed := v_failed + 1;
        v_wf_detail := v_wf_detail || jsonb_build_object(
          'employment_id', r.employment_id,
          'pay_period_employment_id', v_ppe,
          'instance_id', v_req ->> 'instance_id',
          'reason', v_req ->> 'reason',
          'detail', v_req ->> 'detail');
      end if;$o$;

  v_not_old constant text := $o$    v_notice := format('%s timecard(s) were opened for this period and %s %s instance(s) were started.',
                       (select count(*) from hr.pay_period_employment where pay_period_id = p_pay_period_id),
                       v_opened, v_flow);$o$;
  v_not_new constant text := $o$    v_notice := format('%s timecard(s) were opened for this period and %s %s instance(s) are routed and waiting.',
                       (select count(*) from hr.pay_period_employment where pay_period_id = p_pay_period_id),
                       v_opened, v_flow)
             || case when v_failed > 0
                     then format(' %s could NOT be routed to anybody and were recorded as named failures a person owns — see workflowRoutingFailures. Nothing was skipped silently.', v_failed)
                     else '' end;$o$;

  v_ret_old constant text := $o$    'workflowInstancesOpened', v_opened,$o$;
  v_ret_new constant text := $o$    'workflowInstancesOpened', v_opened,
    'workflowInstancesFailed', v_failed,
    'workflowRoutingFailures', v_wf_detail,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_transition';
  if v_oid is null then raise exception 'hr_c4_11: hr.pay_period_transition does not exist'; end if;

  v_def := pg_get_functiondef(v_oid);
  if position(v_ret_new in v_def) > 0 then
    raise notice 'hr_c4_11: the submit already reports routing failures; nothing to do';
    return;
  end if;
  if position(v_dec_old in v_def) = 0 or position(v_cnt_old in v_def) = 0
     or position(v_not_old in v_def) = 0 or position(v_ret_old in v_def) = 0 then
    raise exception 'hr_c4_11: hr.pay_period_transition does not carry the expected text — refusing to half-apply';
  end if;
  v_new := replace(v_def, v_dec_old, v_dec_new);
  v_new := replace(v_new, v_cnt_old, v_cnt_new);
  v_new := replace(v_new, v_not_old, v_not_new);
  v_new := replace(v_new, v_ret_old, v_ret_new);
  execute v_new;
  raise notice 'hr_c4_11: hr.pay_period_transition now reports routed AND failed, with reasons';
end
$mig$;

-- ============================================================ 3. post-conditions
do $$
declare
  v_src text;
  v_bad integer;
  v_bad_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';

  -- 3a. the self-step lane exists and is guarded by allows_self AND subject identity — never by
  -- "has no login" alone, which would keep a login-less candidate on every rung.
  if v_src !~ 'if sd\.allows_self and v_subject is not null and c = v_subject then' then
    raise exception 'hr_c4_11: the resolver has no self-step branch for a login-less subject';
  end if;
  -- 3b. and every OTHER rung still refuses one
  if v_src !~ '''why'', ''no_login''\)' then
    raise exception 'hr_c4_11: the resolver stopped refusing login-less candidates outside the self-step lane';
  end if;
  -- 3c. the predicate still has the last word for everybody it CAN judge (T-21b)
  if v_src !~ 'hr\.can_approve\(v_uid, v_action, v_target_tbl' then
    raise exception 'hr_c4_11: the resolver no longer puts its candidates back to hr.can_approve';
  end if;
  -- 3d. nothing vanishes: the unreachable are recorded
  if v_src !~ 'no_reach' then
    raise exception 'hr_c4_11: the resolver does not record kept-but-unreachable candidates';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_transition';
  if v_src !~ 'workflowInstancesFailed' or v_src !~ 'workflowRoutingFailures' then
    raise exception 'hr_c4_11: the submit still reports only successes';
  end if;

  -- 3e. hr_c4_08 / hr_c4_09 / hr_c4_10 are all still in force
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_11: % engine function(s) went back to the legacy write-guard arm', v_bad;
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname <> 'capability'
     and p.prosrc ~ 'hr\.capability\(\s*[^,;()]+,\s*[^,;()]+,\s*[a-z_]*\.?organization_id\s*\)';
  if v_bad > 0 then
    raise exception 'hr_c4_11: % function(s) pass an organization id as hr.capability''s third argument', v_bad;
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'delete\s+from\s+hr\.workflow_instance';
  if v_bad > 0 then
    raise exception 'hr_c4_11: % engine function(s) delete hr.workflow_instance rows', v_bad;
  end if;

  -- 3f. 🚨 CERTIFICATION, MEASURED PRECISELY — NOT WEAKENED, AND NOT ONLY BY COUNT.
  -- `iam.canonical_certify_ok` is FALSE for 13 `hr` tokens right now, and every single finding in
  -- the whole schema is `broken_dependent_fn` naming a function owned by ANOTHER lane:
  -- `hr.timesheet_period_grid` (11 tables), `hr.time_rounding_config_check` (2),
  -- `public.hr_compensation_upsert` (2), `hr.heal_grant_drift` (1 — it references
  -- `system_error.message`, a column that does not exist). There are ZERO conformance findings.
  -- This session measured 129/129 an hour before this file and applied nothing in between, so the
  -- breakage arrived from another session; it is filed and reported, never silently repaired here,
  -- because a lane does not rewrite another lane's function.
  --
  -- A bare count comparison would let this migration break something as long as somebody else
  -- fixed something in the same window, so these two run FIRST and are absolute.
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_11: % hr CONFORMANCE finding(s) — this lane changed a table property it must not have', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category = 'broken_dependent_fn'
     and (c.detail ~ '^hr\.wf_' or c.detail ~ '^hr\._wf_' or c.detail ~ '^public\.hr_wf_');
  if v_bad > 0 then
    raise exception 'hr_c4_11: this migration broke % workflow-engine function reference(s)', v_bad;
  end if;

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_11_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_11: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
