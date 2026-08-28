-- HR domain C4 — migration 34 (register item HRB-008; the coordinator's addendum to hr_c4_33's
-- D282 escalation, ruled 2026-08-28).
--
-- 🚨 THE CARVE-OUT IS SOUND ONLY WHILE THE ROUTING REQUIRES THE AUTHORITY.
--
-- hr_c4_33 moved read entitlement to routing time for PATCH flows and deliberately left
-- `pay_change` un-armed, escalating the gap as D282: the flow carries its proposal FLAT under
-- `hr_position_assignment`, which is behind no door, so `hr._wf_pay_change_digest` renders the
-- salary to whoever was assigned the step.
--
-- RULED (SPEC-ACCESS §1.4, the approval carve-out): **holding the step's approval authority
-- entitles the decider to THAT REQUEST'S change summary** — both sides of the one number, only
-- while assigned — and never `comp.read`. The rejected alternative was granting `comp.read` to
-- `pay_change_approve` holders, which would breach the derived manager row's *"nothing else"* and
-- hand out the subject's WHOLE compensation history in order to approve one raise.
--
-- So hr_c4_33's behaviour is now correct BY RULE rather than by accident. What this migration adds
-- is the carve-out's PRECONDITION, made structural instead of assumed.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE PRECONDITION IS "ASSIGNED ⟹ HOLDS THE AUTHORITY", AND TWO GATES ARE WHAT KEEP IT TRUE.
--    `pay_change`'s step definitions declare `fallback_chain = {authority, substitute,
--    reporting_line, top_of_chart}`, so the chain CAN climb to rungs that produce somebody holding
--    no `hr.approval_authority` row. They are stopped by `hr.can_approve`, which has the last word
--    (RECORDED DECISION 1), on two separate gates:
--      · RULE 2b — the reporting-line rung, the ONLY rule that grants an action with no authority
--        row — is gated on `coalesce(v_mode,'require_second_actor') = 'auto_record'`, and
--        `pay_change_approve` is `require_second_actor` (`hr._wf_two_actor_action` says so). A bare
--        manager can therefore never be handed a pay change.
--      · RULE 3 — top of chart — is gated on `not v_has_mgr`, and hr_c4_21 seeds the owner as a
--        rank-1 holder of all 12 `require_second_actor` actions at activation, so the person it
--        reaches holds the row anyway.
--    Measured live: all 12 `pay_change` steps resolve at the `substitute` rung with
--    `evidence.action_type = 'pay_change_approve'` and a named `authority_ids` entry, or refuse
--    with the fallback chain recorded. Nothing is currently assigned on any other basis.
--
-- 2. IT IS PINNED IN THE PROOF, NOT ASSERTED HERE. `hrb008_proof.py` re-resolves every live
--    `pay_change` step and checks that every candidate it produces holds a live
--    `pay_change_approve` authority row, that the refusals carry their fallback chain, and that
--    both gates above are still in `hr.can_approve`. If somebody drops the `auto_record` guard from
--    RULE 2b, the carve-out silently starts entitling bare managers to salaries — that is the
--    drift this pin exists to catch, and it is exactly the shape of failure the engine has already
--    shipped twice.
--
-- 3. THE CONTRACT ROW SAYS WHY THE SUMMARY RENDERS AT ALL, so the next reader does not re-file
--    D282. `hr._wf_pay_change_digest` shows the assigned holder both sides of ONE number — the
--    single most recent APPROVED prior amount (`limit 1`) against the proposed one. It is a change
--    summary, not a history, and that is precisely the width the carve-out licenses. `array_agg` is
--    banned: the moment this function returns a series, it stops being the thing §1.4 permits.
--
-- Authority: SPEC-ACCESS §1.4 (the approval carve-out, ruled 2026-08-28) and §1.4's derived
-- `manager` capability row; SPEC-WORKFLOW-ENGINE §2.2 and RECORDED DECISION 1.
-- Applied live as `hr_c4_34_the_pay_approval_carveout_has_a_precondition`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

-- ============================================================ the contract row (RD 3)
do $$
begin
  delete from hr.function_contract
   where schema_name = 'hr' and function_name = '_wf_pay_change_digest' and home_migration = 'hr_c4_34';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, reason)
  values ('hr', '_wf_pay_change_digest', 'hr_c4_34',
    array['limit 1', 'approved_at is not null', '''field'', ''amount'''],
    array['array_agg'],
    'hr_c4_34 — WHY THIS RENDERS AT ALL, so the next reader does not re-file D282. pay_change carries its proposal FLAT under hr_position_assignment, which is behind NO door, so hr_c4_33''s routing-time entitlement gate does not arm on it. That is correct BY RULE, not by oversight: SPEC-ACCESS §1.4''s approval carve-out (ruled 2026-08-28) says holding the step''s approval authority entitles the decider to THAT REQUEST''S change summary — both sides of the one number, only while assigned — and never comp.read, because granting comp.read to pay_change_approve holders would breach the derived manager row''s "nothing else" and expose the subject''s whole compensation history to approve one raise. The carve-out licenses a SUMMARY, so this function must stay one: `limit 1` on the single most recent APPROVED prior amount, and never array_agg — the moment it returns a series it is a history, which §1.4 does not permit. The carve-out''s precondition (assigned ⟹ holds pay_change_approve authority) is pinned live in hrb008_proof.py, because it is only true while hr.can_approve''s RULE 2b keeps its auto_record mode guard.');
end $$;

-- ============================================================ post-conditions that EXECUTE
do $$
declare v_bad integer; v_res jsonb; v_steps integer; v_bad_steps integer;
begin
  -- RD 1, gate one: the reporting-line rung cannot hand a bare manager a pay change
  if not hr._wf_two_actor_action('pay_change_approve') then
    raise exception 'hr_c4_34: pay_change_approve is no longer require_second_actor — RULE 2b''s mode guard no longer excludes it, and the §1.4 carve-out has lost its precondition';
  end if;
  if not (select prosrc ~ 'RULE 2b'
             and prosrc ~ 'coalesce\(v_mode, ''require_second_actor''\) = ''auto_record'''
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'hr' and p.proname = 'can_approve') then
    raise exception 'hr_c4_34: hr.can_approve RULE 2b lost its auto_record mode guard — a bare manager can now be handed a pay change, and the §1.4 carve-out would entitle them to the salary';
  end if;
  -- RD 1, gate two: top of chart is still reachable only for a subject with no manager
  if not (select prosrc ~ 'if not v_has_mgr then'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'hr' and p.proname = 'can_approve') then
    raise exception 'hr_c4_34: hr.can_approve RULE 3 lost its not-v_has_mgr gate';
  end if;

  -- RD 1, measured: every live pay_change step is assigned on the authority, or refuses on record
  select count(*) into v_steps from hr.workflow_step st
    join hr.workflow_instance i on i.id = st.workflow_instance_id where i.flow_key = 'pay_change';
  select count(*) into v_bad_steps
    from hr.workflow_step st
    join hr.workflow_instance i on i.id = st.workflow_instance_id
   cross join lateral hr.wf_resolve_approvers(st.id) r
   where i.flow_key = 'pay_change'
     and case
           when (r ->> 'granted')::boolean
             then not (r #>> '{evidence,action_type}' = 'pay_change_approve'
                       and jsonb_array_length(coalesce(r #> '{evidence,authority_ids}', '[]'::jsonb)) > 0)
           else r #> '{evidence,fallback_chain}' is null
         end;
  if v_bad_steps > 0 then
    raise exception 'hr_c4_34: % of % live pay_change steps are neither assigned on pay_change_approve authority nor refused with the fallback chain recorded',
      v_bad_steps, v_steps;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_34: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_34: % function contract(s) broken', v_bad;
  end if;
  raise notice 'hr_c4_34: the §1.4 pay-approval carve-out has a pinned precondition (% live pay_change steps checked)', v_steps;
end $$;
