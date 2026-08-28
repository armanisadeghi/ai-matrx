-- HR domain C4 — migration 36 (register item HRB-008; D283 ruled by the coordinator 2026-08-28).
--
-- 🚨 A DOOR WITH NO GATE RETURNED ANOTHER ORGANIZATION'S WORKFLOW HISTORY.
--
-- `hr.wf_for_target` filtered on `(target_token, target_id)` and NOTHING else — no `auth.uid()`, no
-- capability, no organization predicate — while being `SECURITY DEFINER`, so RLS was bypassed and
-- nothing else stood in front of it. Measured live (hr_c4_35, D283), as a non-admin employment in an
-- UNRELATED organization:
--
--     hr_wf_for_target('hr_position_assignment', <another org's assignment>)
--       → granted: true, history: [{"flow_key":"pay_change","state":"cancelled", …}]
--
-- It was the only one of the 15 workflow doors with no gate, which is why hr_c4_35 converted eleven
-- and stopped this one rather than stamping DEFINER on a door that authorizes nobody.
--
-- ===================================================================================
-- THE RULING: THE SAME VISIBILITY PREDICATE THE INSTANCE READ PATH ALREADY APPLIES.
--
-- A caller sees exactly the instances they could reach through the instance door, and nothing else.
-- ONE rule, never a second implementation.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE RULE IS EXTRACTED AND ASKED, NOT COPIED. `hr.wf_instance` carried its visibility test
--    INLINE — a five-way disjunction (requester, subject, resolved approver on any step, prior
--    decider, or `workflow.view_queue` over the org). Re-typing that disjunction into
--    `hr.wf_for_target` would have been two implementations of one rule, and two implementations of
--    one rule drift on the first change — this lane has the scar: hr_c4_20 fixed a predicate that
--    could not speak a rung the resolver walked, and hr_c4_31 fixed a resolver that could not speak
--    a carve-out the predicate granted. Same disease, twice. So the disjunction moves ONCE into
--    `hr._wf_instance_visible(instance, user)`, and BOTH paths now ask it. `hr.wf_instance` is
--    rewritten to call the predicate rather than to restate it, so the two can never disagree —
--    the same construction as RECORDED DECISION 1 in the resolver.
--
-- 2. 🚨 THE UNENTITLED CALLER GETS THE ABSENCE SHAPE, NOT A REFUSAL. A named refusal would confirm
--    to a stranger that the target EXISTS — the existence-disclosure law the L3 lane just applied to
--    timesheets. So an unentitled caller receives exactly what a target with no workflow history
--    receives: `{"granted": true, "open": [], "history": []}` — byte-identical to the answer for an
--    id that was never real. Indistinguishable from nonexistent, which is the point.
--
-- 3. THE GATE FILTERS ROWS; IT DOES NOT REFUSE THE CALL. Both subqueries gain
--    `hr._wf_instance_visible(i.id, v_uid)`. A caller entitled to SOME of a target's instances sees
--    those and only those, rather than all-or-nothing — which is what "exactly the instances they
--    could reach through the instance door" means, per instance.
--
-- 4. `v_uid` IS DECLARED IN THE FUNCTION'S OWN DECLARE BLOCK. hr_c4_25/26 each declared a variable
--    inside a nested `declare … begin … exception … end` and read it after the block closed, which
--    PL/pgSQL resolves as a COLUMN — 42703 took `hr.wf_request` down for four lanes. `hr.wf_for_target`
--    had no declare section at all; this adds the FUNCTION's own, never a nested one.
--
-- 5. THE 53RD GRANT IS NOW FREE. hr_c4_35 converted 11 doors and left this one INVOKER, which kept
--    exactly one inner grant alive: `hr.wf_for_target`. With the gate in place the door converts, so
--    **`hr.wf_for_target` is HANDED TO THE SQL LANE BY NAME** as the 53rd and last of check 33's
--    client-reachable helpers. All 15 `public.hr_wf_*` doors are now `SECURITY DEFINER`.
--
-- 6. "RELYING ON THE CURRENT OPENNESS" WAS RELYING ON A LEAK. The one product caller is
--    `features/hr/time/shared/workflowApi.ts` (`getWorkflowForTarget`), used by the timesheet route
--    to find a timecard's open attestation step. Every legitimate reader of that step is covered by
--    the predicate already: the employee is the instance SUBJECT, the approving manager is on
--    `resolved_user_ids`, and HR holds `workflow.view_queue`. Proven live, not assumed.
--
-- Authority: the coordinator's D283 ruling (2026-08-28); SPEC-ACCESS §4.1 and the
-- existence-disclosure law; `/projects/hr-domain/readiness/WF-INVOKER-CONVERSION.md`.
-- Applied live as `hr_c4_36_one_visibility_rule_asked_twice`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_36_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the ONE rule (RD 1)
create or replace function hr._wf_instance_visible(p_instance uuid, p_user uuid)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare inst hr.workflow_instance%rowtype; v_mine uuid[];
begin
  if p_instance is null or p_user is null then
    return false;                       -- RD 2: no identity, no reach. Fails closed.
  end if;
  select * into inst from hr.workflow_instance where id = p_instance;
  if not found then return false; end if;
  v_mine := hr.employments_of(p_user);
  -- SPEC-WORKFLOW-ENGINE §1.7 / §5.1 standing: you may read a request you FILED, one you are the
  -- SUBJECT of, one you were ROUTED, one you have DECIDED, or any in an organization where you hold
  -- workflow.view_queue. This is the whole of the rule, and it now exists exactly once.
  return inst.requester_employment_id = any(v_mine)
      or inst.subject_employment_id = any(v_mine)
      or exists (select 1 from hr.workflow_step s
                  where s.workflow_instance_id = p_instance and p_user = any(s.resolved_user_ids))
      or exists (select 1 from hr.workflow_decision d
                  where d.workflow_instance_id = p_instance and d.actor_user_id = p_user)
      or hr.capability(p_user, 'workflow.view_queue', null, current_date, inst.organization_id);
end
$fn$;

revoke all on function hr._wf_instance_visible(uuid, uuid) from public, anon, authenticated;

comment on function hr._wf_instance_visible is
  'May this login READ this workflow instance? The single visibility rule for the workflow surface — filed it, subject of it, routed it, decided it, or holds workflow.view_queue in its organization. Extracted from hr.wf_instance by hr_c4_36 so hr.wf_for_target could ASK it instead of restating it: two implementations of one visibility rule drift on the first change. Fails closed on a null instance or a null identity.';

-- ============================================================ 2. the instance door ASKS it (RD 1)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_old constant text := $o$  v_mine := hr.employments_of(v_uid);
  if not (inst.requester_employment_id = any(v_mine)
          or inst.subject_employment_id = any(v_mine)
          or exists (select 1 from hr.workflow_step s where s.workflow_instance_id = p_instance_id
                       and v_uid = any(s.resolved_user_ids))
          or exists (select 1 from hr.workflow_decision d where d.workflow_instance_id = p_instance_id
                       and d.actor_user_id = v_uid)
          or hr.capability(v_uid, 'workflow.view_queue', null, current_date, inst.organization_id)) then$o$;
  v_new_txt constant text := $o$  -- 🚨 ONE VISIBILITY RULE, ASKED — NEVER A SECOND COPY. This disjunction used to live here
  -- inline, and hr.wf_for_target had no gate at all. Restating it there would have been two
  -- implementations of one rule; this lane has already paid for that twice (hr_c4_20, hr_c4_31).
  if not hr._wf_instance_visible(p_instance_id, v_uid) then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_instance';
  v_def := pg_get_functiondef(v_oid);
  if position('_wf_instance_visible' in v_def) > 0 then
    raise notice 'hr_c4_36: hr.wf_instance already asks the predicate';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_36: hr.wf_instance does not carry the expected visibility test — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new_txt);
    raise notice 'hr_c4_36: hr.wf_instance now asks hr._wf_instance_visible';
  end if;
end
$mig$;

-- ============================================================ 3. the target door ASKS it too (RD 3, RD 4)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$AS $function$
begin
  return jsonb_build_object($o$;
  v_dec_new constant text := $o$AS $function$
-- RD 4: the FUNCTION's own declare block — never a nested one (the hr_c4_25/26 P0).
declare v_uid uuid := auth.uid();
begin
  return jsonb_build_object($o$;
  v_open_old constant text := $o$       where b.target_token = p_target_token and b.target_id = p_target_id and b.is_open), '[]'::jsonb),$o$;
  v_open_new constant text := $o$       where b.target_token = p_target_token and b.target_id = p_target_id and b.is_open
         -- 🚨 THE GATE: exactly the instances this caller could reach through the instance door.
         and hr._wf_instance_visible(i.id, v_uid)), '[]'::jsonb),$o$;
  v_hist_old constant text := $o$       where i.target_token = p_target_token and i.target_id = p_target_id
         and i.closed_at is not null), '[]'::jsonb));$o$;
  v_hist_new constant text := $o$       where i.target_token = p_target_token and i.target_id = p_target_id
         and i.closed_at is not null
         -- RD 2: an unentitled caller falls to `[]` here, which is the SAME answer a target with no
         -- history gets, and the same answer an id that was never real gets. A named refusal would
         -- confirm the target exists to a stranger.
         and hr._wf_instance_visible(i.id, v_uid)), '[]'::jsonb));$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_for_target';
  v_def := pg_get_functiondef(v_oid);
  if position('_wf_instance_visible' in v_def) > 0 then
    raise notice 'hr_c4_36: hr.wf_for_target already gates';
  else
    if position(v_dec_old in v_def) = 0 or position(v_open_old in v_def) = 0
       or position(v_hist_old in v_def) = 0 then
      raise exception 'hr_c4_36: hr.wf_for_target does not carry the expected shape — refusing to half-apply';
    end if;
    v_new := replace(v_def,  v_dec_old,  v_dec_new);
    v_new := replace(v_new,  v_open_old, v_open_new);
    v_new := replace(v_new,  v_hist_old, v_hist_new);
    execute v_new;
    raise notice 'hr_c4_36: hr.wf_for_target now returns only what the caller may read';
  end if;
end
$mig$;

-- ============================================================ 4. the 12th door converts (RD 5)
do $mig$
declare v_oid oid; v_def text; v_args text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_wf_for_target';
  v_args := pg_get_function_identity_arguments(v_oid);
  v_def  := pg_get_functiondef(v_oid);
  if position('SECURITY DEFINER' in v_def) = 0 then
    if position(e'\nAS $function$' in v_def) = 0 then
      raise exception 'hr_c4_36: unexpected functiondef shape for public.hr_wf_for_target';
    end if;
    execute replace(v_def, e'\nAS $function$',
                    e'\n SECURITY DEFINER\n SET search_path TO \'hr\', \'public\'\nAS $function$');
    raise notice 'hr_c4_36: public.hr_wf_for_target converted — all 15 workflow doors are now DEFINER';
  end if;
  execute format('revoke all on function public.hr_wf_for_target(%s) from public', v_args);
  execute format('revoke all on function public.hr_wf_for_target(%s) from anon', v_args);
  execute format('grant execute on function public.hr_wf_for_target(%s) to authenticated', v_args);
end
$mig$;

-- ============================================================ 5. the contracts
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_36';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('public', 'hr_wf_for_target', 'hr_c4_36', array['hr.wf_for_target('], '{}', true,
   'hr_c4_36: this was the LAST SECURITY INVOKER workflow door, held back by hr_c4_35 because it had no authorization gate at all — measured live returning another organization''s workflow history to an unrelated non-admin (D283). It converts only because hr.wf_for_target now gates. Flipping it back to INVOKER re-imposes the authenticated EXECUTE grant on hr.wf_for_target, which is the 53rd and last helper of the check-33 campaign.'),
  ('hr', 'wf_for_target', 'hr_c4_36',
   array['hr._wf_instance_visible(i.id, v_uid)', 'auth.uid()'], '{}', true,
   'hr_c4_36: THE GATE. Without hr._wf_instance_visible on BOTH the open and history subqueries this function returns every workflow instance bound to a target id to anybody who can call it, across organizations — which is exactly what D283 measured. It must keep ASKING the predicate rather than restating the rule: a second copy of one visibility rule drifts on the first change. The unentitled caller must keep falling to [] rather than being refused by name, because a named refusal confirms the target exists to a stranger.'),
  ('hr', 'wf_instance', 'hr_c4_36', array['hr._wf_instance_visible(p_instance_id, v_uid)'], '{}', true,
   'hr_c4_36: the instance door must keep ASKING the one visibility predicate rather than carrying its own inline copy of the disjunction. It held the original; hr.wf_for_target now shares it. Re-inlining the test here re-creates the two-implementations-of-one-rule shape that produced hr_c4_20 and hr_c4_31.'),
  ('hr', '_wf_instance_visible', 'hr_c4_36',
   array['requester_employment_id', 'subject_employment_id', 'resolved_user_ids',
         'actor_user_id', 'workflow.view_queue'], '{}', true,
   'hr_c4_36: the five standings that make a workflow instance readable — filed it, subject of it, routed it, decided it, or hold workflow.view_queue in its organization. Dropping any one silently narrows BOTH the instance door and the target door at once, which is the cost of a shared rule and the reason it is contracted here rather than at each call site.');
end $$;

-- ============================================================ 6. post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer; v_res jsonb; v_acl text; v_n integer;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = '_wf_instance_visible' and p.prosecdef) then
    raise exception 'hr_c4_36: the visibility predicate is missing or is not SECURITY DEFINER';
  end if;
  -- RD 1: ONE implementation. Neither door may still carry the inline disjunction.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_instance') !~ '_wf_instance_visible' then
    raise exception 'hr_c4_36: hr.wf_instance does not ask the predicate';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname in ('wf_instance','wf_for_target')
         and p.prosrc ~ 'workflow\.view_queue') > 0 then
    raise exception 'hr_c4_36: a door still carries its own copy of the visibility rule';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_for_target') !~ '_wf_instance_visible' then
    raise exception 'hr_c4_36: hr.wf_for_target is still ungated';
  end if;
  -- RD 4: nothing block-scoped was introduced
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_for_target') ~ 'declare v_uid uuid := auth.uid\(\);[^$]*begin[^$]*exception' then
    raise exception 'hr_c4_36: v_uid was introduced inside a nested block';
  end if;

  -- RD 2, EXECUTED: the predicate fails closed on a null identity and a null instance
  if hr._wf_instance_visible((select id from hr.workflow_instance limit 1), null) then
    raise exception 'hr_c4_36: the predicate admits a null identity';
  end if;
  if hr._wf_instance_visible(null, (select login_user_id from hr.employee
                                     where login_user_id is not null limit 1)) then
    raise exception 'hr_c4_36: the predicate admits a null instance';
  end if;

  -- RD 5: all 15 doors are DEFINER, and this one's ACL is right
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_wf\_%' and p.prosecdef;
  if v_n <> 15 then
    raise exception 'hr_c4_36: % of 15 workflow doors are SECURITY DEFINER', v_n;
  end if;
  select p.proacl::text into v_acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_wf_for_target';
  if v_acl is null or v_acl not like '%authenticated=X%' or v_acl like '%anon=X%'
     or v_acl like '%{=X/%' or v_acl like '%,=X/%' then
    raise exception 'hr_c4_36: public.hr_wf_for_target ACL is wrong: %', v_acl;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_36: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_36: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_36_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_36: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_36: one visibility rule, asked by both doors; all 15 workflow doors DEFINER';
end $$;
