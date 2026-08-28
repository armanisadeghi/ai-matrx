-- HR domain C4 — migration 40 (register item HRB-008; found while diagnosing the
-- `timecard_attestation` self-step referral).
--
-- 🚨 THE EVIDENCE NAMED A PATH THE RESOLVER NEVER WALKED, AND IT HAS NOW MISLED TWO DIAGNOSES.
--
-- `hr.wf_resolve_approvers` emits `resolution_evidence.fallback_chain` verbatim from
-- `sd.fallback_chain` — the step definition's DECLARED array — in every envelope, success and
-- failure alike, regardless of which rungs were actually iterated. Sitting beside `refused` and
-- `absent`, it reads as a trace. It is configuration.
--
-- For a `fixed_user` step the resolver never touches that array at all:
--
--     foreach v_rung in array (case when sd.resolver_kind = 'authority' then sd.fallback_chain
--                                   else ARRAY[sd.resolver_kind] end) loop
--
-- So `timecard_attestation`'s `employee_attestation` step — `resolver_kind = 'fixed_user'`,
-- `resolver_config {"employment_source":"subject"}`, `allows_self = true` — walks exactly ONE rung,
-- `fixed_user`, and resolves to the subject. Its evidence nonetheless reported
-- `fallback_chain: ["authority","substitute","reporting_line","top_of_chart"]`.
--
-- 🚨 TWO SEPARATE DIAGNOSES READ THAT AS THE PATH TAKEN and concluded the self step was being
-- routed through an approver chain: the G2 verification round, and the referral that sent me here.
-- Measured live, it was not: both live attestation steps resolve `rung: "fixed"`, to the SUBJECT
-- ONLY, with the manager never a candidate. Evidence that cannot be read as what happened is
-- evidence that manufactures findings, and this lane's whole method is measuring before designing.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE FIX IS ADDITIVE: `rungs_walked` IS RECORDED ALONGSIDE, NOT INSTEAD. `fallback_chain` is
--    still worth having — "what this definition declares" is a real fact and §2.2's failure
--    guidance is written in terms of it. What was missing is the other fact: which rungs the
--    resolver actually iterated on this pass. Both now appear, and they can be compared.
--
-- 2. IT IS APPENDED WHERE THE LOOP TURNS, so it records the rungs REACHED, not the rungs planned.
--    A chain that exits early on its first rung records one entry — which is precisely the
--    distinction that was missing.
--
-- 3. `v_walked` IS DECLARED IN THE FUNCTION'S OWN DECLARE BLOCK (the hr_c4_25/26 P0). Nothing is
--    scoped inside the loop or inside an exception block.
--
-- 4. NOTHING ABOUT ROUTING CHANGES. This migration adds one evidence key and touches no predicate,
--    no rung, no eligibility rule. The self-step behaviour the referral asked about was ALREADY
--    correct and is pinned by proof in this round rather than rebuilt.
--
-- Authority: SPEC-WORKFLOW-ENGINE §2.2 (the rung list and the resolver's own record) and the
-- record-honestly law this lane runs on.
-- Applied live as `hr_c4_40_the_evidence_names_the_rungs_actually_walked`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_40_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$  v_unentitled jsonb := '[]'::jsonb;   -- candidates struck because they could not see that change$o$;
  v_dec_new constant text := $o$  v_unentitled jsonb := '[]'::jsonb;   -- candidates struck because they could not see that change
  -- hr_c4_40 — the rungs this pass ACTUALLY iterated, as against sd.fallback_chain's declaration.
  v_walked    jsonb  := '[]'::jsonb;$o$;

  v_loop_old constant text := $o$    v_cands := '{}'; v_rows := '{}'; v_holders := '[]'::jsonb; v_delegated := false;$o$;
  v_loop_new constant text := $o$    -- 🚨 RECORDED WHERE THE LOOP TURNS, so this is rungs REACHED and not rungs planned. A chain
    -- that exits on its first rung records exactly one entry — the distinction whose absence let
    -- two diagnoses conclude a fixed_user self-step had been routed through an approver chain.
    v_walked := v_walked || to_jsonb(v_rung);
    v_cands := '{}'; v_rows := '{}'; v_holders := '[]'::jsonb; v_delegated := false;$o$;

  -- both envelopes carry this key, and replace() rewrites both occurrences
  v_ev_old constant text := $o$'fallback_chain', sd.fallback_chain,$o$;
  v_ev_new constant text := $o$'fallback_chain', sd.fallback_chain, 'rungs_walked', v_walked,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  v_def := pg_get_functiondef(v_oid);

  if position('rungs_walked' in v_def) > 0 then
    raise notice 'hr_c4_40: the evidence already names the rungs walked';
  else
    if position(v_dec_old in v_def) = 0 or position(v_loop_old in v_def) = 0
       or position(v_ev_old in v_def) = 0 then
      raise exception 'hr_c4_40: hr.wf_resolve_approvers does not carry the expected text — refusing to half-apply';
    end if;
    -- both evidence sites must be rewritten, or one envelope keeps lying
    if (length(v_def) - length(replace(v_def, v_ev_old, ''))) / length(v_ev_old) <> 2 then
      raise exception 'hr_c4_40: expected exactly 2 evidence sites, found a different number';
    end if;
    v_new := replace(v_def, v_dec_old,  v_dec_new);
    v_new := replace(v_new, v_loop_old, v_loop_new);
    v_new := replace(v_new, v_ev_old,   v_ev_new);
    execute v_new;
    raise notice 'hr_c4_40: resolution_evidence now names the rungs actually walked';
  end if;
end
$mig$;

-- ============================================================ the contract
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_40';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values ('hr', 'wf_resolve_approvers', 'hr_c4_40',
    array['''rungs_walked'', v_walked', 'v_walked := v_walked || to_jsonb(v_rung);',
          '''fallback_chain'', sd.fallback_chain'],
    array['declare v_walked'], true,
    'hr_c4_40: the evidence must keep reporting BOTH what the definition DECLARES (fallback_chain) and what this pass actually WALKED (rungs_walked). Carrying only the declared array is what let two separate diagnoses — the G2 verification round and the timecard_attestation referral — conclude that a fixed_user self-step had been routed through authority/substitute/reporting_line/top_of_chart, when it walked one rung and resolved to the subject. Evidence that cannot be read as what happened manufactures findings. v_walked must stay in the FUNCTION''s declare (the hr_c4_25/26 P0).');
end $$;

-- ============================================================ post-conditions that EXECUTE
do $$
declare v_bad integer; v_before integer; v_res jsonb; v_step uuid; v_ev jsonb;
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') ~ 'declare v_walked' then
    raise exception 'hr_c4_40: v_walked was introduced inside a nested block';
  end if;

  -- 🚨 EXECUTED ON THE VERY STEP THAT WAS MISDIAGNOSED. A fixed_user self-step must now report ONE
  -- rung walked, and it must not be one of the approver rungs.
  select st.id into v_step from hr.workflow_step st
    join hr.workflow_instance i on i.id = st.workflow_instance_id
   where i.flow_key = 'timecard_attestation' and st.step_key = 'employee_attestation'
   order by st.created_at limit 1;
  if v_step is not null then
    v_ev := hr.wf_resolve_approvers(v_step) -> 'evidence';
    if v_ev -> 'rungs_walked' is null then
      raise exception 'hr_c4_40: the evidence does not carry rungs_walked';
    end if;
    if v_ev -> 'rungs_walked' <> '["fixed_user"]'::jsonb then
      raise exception 'hr_c4_40: the self step reports rungs_walked = % — expected exactly ["fixed_user"]',
        v_ev -> 'rungs_walked';
    end if;
    -- and the declared chain is still recorded, unchanged, beside it
    if v_ev -> 'fallback_chain' is null then
      raise exception 'hr_c4_40: the declared fallback_chain was dropped rather than supplemented';
    end if;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_40: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_40: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_40_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_40: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_40: the evidence now distinguishes the declared chain from the rungs walked';
end $$;
