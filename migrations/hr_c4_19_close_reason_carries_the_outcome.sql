-- HR domain C4 — migration 19 (register item HRB-008 follow-up, lane workflow-engine; round-6).
--
-- 🚨 AN INSTANCE THAT CLOSED `not_attested` SAID `state_reason: "completed"`, SO A READER OF THE
-- INSTANCE ALONE CONCLUDED THE ATTESTATION HAPPENED.
--
-- Measured live (2026-08-27) — the real G2V attestation, after it was correctly terminated:
--
--   hr.workflow_instance          state=closed   state_reason=completed        ← misleading
--   hr.pay_period_employment      metadata.attestation_outcome=not_attested    ← the truth
--
-- ===================================================================================
-- THE RULING, AND IT IS THE ONE THE ENGINE ALREADY MAKES ON THE OTHER BRANCH
--
-- `hr.workflow_instance.state` is PROCESS vocabulary and §3.1 defines it as such: `applying -->
-- completed: apply_fn succeeded`, `completed --> closed: retention clock started`. §1 says the same
-- about the state sets generally — they are *"engine mechanics, not org vocabulary"*. That part is
-- right and is NOT changed here: no new state, no `completed_not_attested` compound, no outcome
-- column on the instance. The OUTCOME of a flow is the apply hook's effect on the subject row
-- (§4.3), and that stays the system of record.
--
-- `state_reason` is the other thing entirely. It is free text whose only job is to say WHY, and
-- the engine ALREADY knows the right answer — look at `hr._wf_apply`'s failure branch:
--
--     state_reason = coalesce(v_out ->> 'reason', 'apply_failed')   -- the HOOK's own word
--
-- The success branch instead hardcoded `'completed'`, which merely restates `state` and therefore
-- carries **zero information** — while reading, to a human, as an outcome. That asymmetry is the
-- whole defect. The success branch now does what the failure branch does: it carries the hook's own
-- outcome word, and where a hook offers none it writes NULL rather than a word that says nothing.
--
-- So: **`state` is process; `state_reason` carries the outcome-bearing word where the flow type's
-- apply hook produces one; the subject row remains the system of record and the projection is the
-- one reader that joins them.** A surface reading the instance alone now reaches the right
-- conclusion instead of the opposite one.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE CONTRACT IS ONE GENERIC KEY, `outcome`, NOT A LIST OF FLOW-SPECIFIC ONES. `hr._wf_apply`
--    reads `v_out ->> 'outcome'` and nothing else. Teaching the engine to look for
--    `attestation_outcome`, then `row_state`, then the next lane's spelling would put flow
--    knowledge inside the engine, which is the exact thing §0 law 3 forbids ("no
--    `IF flow_type = …` anywhere in code"). `hr.timecard_wf_apply` therefore emits `outcome`
--    alongside the keys it already returns — additive, so every existing reader is untouched.
--
-- 2. NULL, NOT `'completed'`, WHEN A HOOK OFFERS NO OUTCOME. `state` already says the instance ran
--    to its end; a reason repeating it is noise that invites exactly this misreading. An empty
--    reason is honest: this flow type has no outcome word.
--
-- 3. THE NOTICE CARRIES THE SAME WORD. `hr.workflow.request_decided` announced
--    `outcome: 'completed'` to the requester — the same misleading sentence, in an email. It now
--    carries the real outcome.
--
-- 4. THE TWO LIVE ROWS ARE REPAIRED FROM THE SUBJECT ROW, never from a guess: the attestation
--    instance takes `hr.pay_period_employment.metadata ->> 'attestation_outcome'`, the approval
--    instance takes the row's state. Anything else with the duplicative `'completed'` reason is set
--    to NULL rather than invented.
--
-- Authority: SPEC-WORKFLOW-ENGINE §3.1 (state is process), §4.3 (the apply hook owns the outcome),
-- §0 law 3 (no flow-specific branching in the engine).
-- Applied live as `hr_c4_19_close_reason_carries_the_outcome`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_19_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the hook declares its outcome
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_att_old constant text := $o$      'attestation_outcome', v_out,$o$;
  v_att_new constant text := $o$      'attestation_outcome', v_out,
      -- §4.3 / hr_c4_19 RD 1: the ONE generic key hr._wf_apply reads, so the engine never has to
      -- know this flow's private spelling. Additive — every existing reader is untouched.
      'outcome', v_out,$o$;
  v_app_old constant text := $o$      'row_state', 'approved',$o$;
  v_app_new constant text := $o$      'row_state', 'approved',
      'outcome', 'approved',$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_wf_apply';
  if v_oid is null then raise exception 'hr_c4_19: hr.timecard_wf_apply does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_att_new in v_def) > 0 then
    raise notice 'hr_c4_19: hr.timecard_wf_apply already declares `outcome`';
  else
    if position(v_att_old in v_def) = 0 or position(v_app_old in v_def) = 0 then
      raise exception 'hr_c4_19: hr.timecard_wf_apply does not carry the expected returns — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_att_old, v_att_new);
    v_new := replace(v_new, v_app_old, v_app_new);
    execute v_new;
    raise notice 'hr_c4_19: hr.timecard_wf_apply now declares `outcome`';
  end if;
end
$mig$;

-- ============================================================ 2. the close reason carries it
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_c_old constant text := $o$  perform hr._wf_close_instance(p_instance, 'closed', 'completed');$o$;
  v_c_new constant text := $o$  -- 🚨 hr_c4_19: THE HOOK'S OWN WORD, exactly as the failure branch above already does
  -- (`state_reason = coalesce(v_out ->> 'reason', 'apply_failed')`). Hardcoding 'completed' here
  -- restated `state` and carried zero information, while reading to a human as an OUTCOME — an
  -- instance that closed `not_attested` said "completed", so a reader of the instance alone
  -- concluded the attestation happened. NULL where a hook offers no outcome: `state` already says
  -- it ran to its end, and a reason repeating that is noise that invites the misreading.
  perform hr._wf_close_instance(p_instance, 'closed', v_out ->> 'outcome');$o$;
  v_n_old constant text := $o$                        jsonb_build_object('outcome','completed'));$o$;
  v_n_new constant text := $o$                        jsonb_build_object('outcome',
                          coalesce(v_out ->> 'outcome', 'completed')));$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_apply';
  v_def := pg_get_functiondef(v_oid);
  if position(v_c_new in v_def) > 0 then
    raise notice 'hr_c4_19: hr._wf_apply already carries the hook''s outcome';
  else
    if position(v_c_old in v_def) = 0 or position(v_n_old in v_def) = 0 then
      raise exception 'hr_c4_19: hr._wf_apply does not carry the expected close/notify — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_c_old, v_c_new);
    v_new := replace(v_new, v_n_old, v_n_new);
    execute v_new;
    raise notice 'hr_c4_19: hr._wf_apply closes with the hook''s outcome, and says the same word in the notice';
  end if;
end
$mig$;

-- ============================================================ 3. repair the rows already standing
do $$
declare v_n integer;
begin
  perform hr.arm_write();
  -- RD 4: derived from the SUBJECT ROW, never guessed.
  with repaired as (
    update hr.workflow_instance i
       set state_reason = case
             when i.flow_key = 'timecard_attestation'
               then (select ppe.metadata ->> 'attestation_outcome'
                       from hr.pay_period_employment ppe where ppe.id = i.target_id)
             when i.flow_key = 'timecard_approval'
               then (select ppe.state from hr.pay_period_employment ppe where ppe.id = i.target_id)
             else null end
     where i.state_reason = 'completed'
    returning i.id)
  select count(*) into v_n from repaired;
  raise notice 'hr_c4_19: repaired % instance(s) whose close reason merely restated the state', v_n;
end $$;

-- ============================================================ 4. post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_apply';
  if v_src ~ '_wf_close_instance\(p_instance, ''closed'', ''completed''\)' then
    raise exception 'hr_c4_19: hr._wf_apply still hardcodes `completed` as the close reason';
  end if;
  if v_src !~ '_wf_close_instance\(p_instance, ''closed'', v_out ->> ''outcome''\)' then
    raise exception 'hr_c4_19: hr._wf_apply does not close with the hook''s outcome';
  end if;
  -- RD 1: the engine reads ONE generic key and knows no flow's private spelling
  if v_src ~ 'attestation_outcome' then
    raise exception 'hr_c4_19: hr._wf_apply now knows a flow-specific key — §0 law 3 forbids it';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_wf_apply';
  if v_src !~ '''outcome'', v_out' then
    raise exception 'hr_c4_19: hr.timecard_wf_apply does not declare the generic outcome key';
  end if;
  -- additive: the keys it already returned are untouched
  if v_src !~ 'attestation_outcome' or v_src !~ 'row_state' then
    raise exception 'hr_c4_19: hr.timecard_wf_apply lost a key an existing reader depends on';
  end if;

  -- 🚨 THE INVARIANT: no closed instance's reason merely restates its state.
  select count(*) into v_bad from hr.workflow_instance
   where state_reason in ('completed','closed');
  if v_bad > 0 then
    raise exception 'hr_c4_19: % instance(s) still carry a close reason that only restates the state', v_bad;
  end if;

  -- and where a subject row records an outcome, the instance agrees with it
  select count(*) into v_bad
    from hr.workflow_instance i
    join hr.pay_period_employment ppe on ppe.id = i.target_id
   where i.flow_key = 'timecard_attestation'
     and i.state in ('completed','closed')
     and ppe.metadata ? 'attestation_outcome'
     and i.state_reason is distinct from (ppe.metadata ->> 'attestation_outcome');
  if v_bad > 0 then
    raise exception 'hr_c4_19: % attestation instance(s) disagree with their own timecard row', v_bad;
  end if;

  -- hr_c4_15..18 still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_close_instance') !~ 'superseded by instance closure' then
    raise exception 'hr_c4_19: hr_c4_18''s failure-row close was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_escalate') !~ 'WF_SELF_STEP_NOT_ESCALATABLE' then
    raise exception 'hr_c4_19: hr_c4_16''s self-step escalation guard was lost';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_19: % engine function(s) went back to the legacy write-guard arm', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_19: % hr CONFORMANCE finding(s)', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_19_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_19: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
