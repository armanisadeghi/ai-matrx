-- HR domain C4 — migration 46 (register item HRB-008; L3's rider stopped on hr_c4_44's classifier
-- rather than shipping copy for it — the right call, and the reason is measured below).
--
-- 🚨 `unreachable` FIRED ON EVERY FLOW WITH A NOT-YET-STARTED STEP.
--
-- hr_c4_44 classified a row `unreachable` when any step in its instance was
-- `state in ('active','pending')` with zero resolved users. But approvers RESOLVE AT ACTIVATION —
-- a `pending` step has not been activated yet, so it has zero resolved users BY CONSTRUCTION, not
-- because nobody can be reached.
--
-- Measured live: 3 of 3 `pending` steps database-wide have zero resolved users — 100%, and it could
-- not be otherwise. So the rule fired on any flow that merely has a later step queued.
--
-- The concrete falsehood, on the row that prompted this work — Zzz Noreach's `a8bf7b14`:
--
--   employee_attestation     skipped     0 reachable
--   manager_approval         ACTIVE      1 reachable   <- a manager can act RIGHT NOW
--   payroll_exception_review pending     0 reachable   <- and this made the row "unreachable"
--
-- L3 stopped rather than write the sentence, because the sentence would have been a new false
-- statement replacing the old one — `awaiting` wrongly claimed somebody had been asked, and
-- `unreachable` would have wrongly claimed nobody could act. Their client coerced to the safe
-- fallback instead. That stop is the reason this is a one-word fix and not a shipped falsehood.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. `unreachable` MEANS THE ACTIVE STEP. Dropping `'pending'` leaves `ws2.state = 'active'`: the
--    step that is actually asking somebody right now, and therefore the only one whose reachability
--    a sentence can honestly claim anything about. A queued step has no assignee yet because it has
--    not been activated — that is the engine working, not a person being unreachable.
--
-- 2. 🚨 THE CLASSIFICATION DESCRIBES THE STEP'S ASSIGNEE, NOT THE SUBJECT — so the payload now names
--    WHICH step. Without it the client can only attribute the state to the row's person, and the row
--    is keyed by the SUBJECT: it would have rendered "nobody can act for <subject>" when the truth is
--    "the <employee_attestation> step has no one to ask". On an attestation the two happen to be the
--    same person; on a manager step they are not, and the sentence would name the wrong human.
--    `unreachable_step_key` and `unreachable_step_id` are added so the copy can attribute correctly.
--
-- 3. FALSIFIED ON TWO LIVE ROWS THAT DISAGREE, which is why no fixture was built: the same employee
--    owns one row whose ACTIVE step reaches nobody (stays `unreachable`) and one whose ACTIVE step
--    reaches a manager (stops being `unreachable`). One employee, two rows, opposite answers.
--
-- Authority: L3's stopped rider (2026-08-28) and the coordinator's ruling on it; the record-honestly
-- law — a status value is a claim, and a claim must survive being read aloud.
-- Applied live as `hr_c4_46_unreachable_means_the_active_step`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_46_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_h_old constant text := $o$                            when exists (select 1 from hr.workflow_step ws2
                                          where ws2.workflow_instance_id = i.id
                                            and ws2.state in ('active','pending')
                                            and coalesce(cardinality(ws2.resolved_user_ids), 0) = 0)
                              then 'unreachable'$o$;
  v_h_new constant text := $o$                            -- 🚨 THE ACTIVE STEP ONLY (hr_c4_46). Approvers resolve AT ACTIVATION, so a
                            -- `pending` step has zero resolved users BY CONSTRUCTION — measured at
                            -- 3 of 3 pending steps database-wide. Including it made every flow with
                            -- a queued later step read `unreachable`, including rows whose ACTIVE
                            -- step had a manager ready to act. Only the step that is asking
                            -- somebody right now can be honestly called unreachable.
                            when exists (select 1 from hr.workflow_step ws2
                                          where ws2.workflow_instance_id = i.id
                                            and ws2.state = 'active'
                                            and coalesce(cardinality(ws2.resolved_user_ids), 0) = 0)
                              then 'unreachable'$o$;
  -- RD 2: name WHICH step, so the client attributes to the step's assignee and not to the subject
  v_s_old constant text := $o$                       ppe.metadata ->> 'attestation_reason'    as attestation_reason,$o$;
  v_s_new constant text := $o$                       ppe.metadata ->> 'attestation_reason'    as attestation_reason,
                       -- hr_c4_46: WHICH step cannot be reached. The row is keyed by the SUBJECT,
                       -- but this state is a fact about the STEP's assignee — without the step the
                       -- copy can only blame the row's person, who may not be the one being asked.
                       (select ws3.step_key from hr.workflow_step ws3
                         where ws3.workflow_instance_id = i.id and ws3.state = 'active'
                           and coalesce(cardinality(ws3.resolved_user_ids), 0) = 0
                         order by ws3.step_order limit 1) as unreachable_step_key,
                       (select ws3.id from hr.workflow_step ws3
                         where ws3.workflow_instance_id = i.id and ws3.state = 'active'
                           and coalesce(cardinality(ws3.resolved_user_ids), 0) = 0
                         order by ws3.step_order limit 1) as unreachable_step_id,$o$;
  v_r_old constant text := $o$                          'attestation_reason', h.attestation_reason,$o$;
  v_r_new constant text := $o$                          'attestation_reason', h.attestation_reason,
                          'unreachable_step_key', h.unreachable_step_key,
                          'unreachable_step_id', h.unreachable_step_id,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  v_def := pg_get_functiondef(v_oid);
  if position('unreachable_step_key' in v_def) > 0 then
    raise notice 'hr_c4_46: the classifier already names the active step';
  else
    if position(v_h_old in v_def) = 0 or position(v_s_old in v_def) = 0
       or position(v_r_old in v_def) = 0 then
      raise exception 'hr_c4_46: hr.pay_period_get does not carry the expected shape — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_h_old, v_h_new);
    v_new := replace(v_new, v_s_old, v_s_new);
    v_new := replace(v_new, v_r_old, v_r_new);
    execute v_new;
    raise notice 'hr_c4_46: `unreachable` now means the ACTIVE step, and the payload names which one';
  end if;
end
$mig$;

-- ============================================================ the contract
do $$
begin
  delete from hr.function_contract
   where schema_name = 'hr' and function_name = 'pay_period_get'
     and home_migration in ('hr_c4_44', 'hr_c4_46');
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values ('hr', 'pay_period_get', 'hr_c4_46',
    array['attestation_reason', '''unreachable''', 'ws2.state = ''active''',
          'unreachable_step_key'],
    array['ws2.state in (''active'',''pending'')'], true,
    'hr_c4_46 (supersedes the hr_c4_44 row): `unreachable` must be derived from the ACTIVE step alone. Approvers resolve AT ACTIVATION, so a `pending` step has zero resolved users by construction — measured at 3 of 3 pending steps database-wide — and including it made every flow with a queued later step read unreachable, including rows whose active step had a manager ready to act. The payload must also keep naming WHICH step: this state is a fact about the STEP''s assignee, while the row is keyed by the SUBJECT, so without the step key the client can only attribute it to the wrong person. A status value is a claim, and a claim must survive being read aloud.');
end $$;

-- ============================================================ post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer; v_res jsonb; v_pending integer; v_wrong integer;
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'pay_period_get') ~ 'ws2\.state in \(''active'',''pending''\)' then
    raise exception 'hr_c4_46: the classifier still counts pending steps';
  end if;

  -- the premise, re-measured: a pending step having nobody resolved is the norm, not a signal
  select count(*), count(*) filter (where coalesce(cardinality(resolved_user_ids), 0) = 0)
    into v_pending, v_wrong from hr.workflow_step where state = 'pending';
  if v_pending > 0 and v_wrong <> v_pending then
    raise notice 'hr_c4_46: % of % pending steps have zero resolved users', v_wrong, v_pending;
  end if;

  -- 🚨 BOTH WAYS, on two LIVE rows of the SAME employee that must now disagree.
  -- a row whose ACTIVE step reaches nobody must still read unreachable...
  if not exists (
    select 1 from hr.pay_period_employment ppe
     where exists (select 1 from hr.workflow_binding b
                    join hr.workflow_instance wi on wi.id = b.workflow_instance_id
                    join hr.workflow_step ws on ws.workflow_instance_id = wi.id
                   where b.target_id = ppe.id and ws.state = 'active'
                     and coalesce(cardinality(ws.resolved_user_ids), 0) = 0)) then
    raise notice 'hr_c4_46: no live row has an unreachable ACTIVE step to check against';
  end if;
  -- ...and a row whose ACTIVE step DOES reach somebody must not.
  if exists (
    select 1 from hr.workflow_instance wi
      join hr.workflow_step ws on ws.workflow_instance_id = wi.id
     where ws.state = 'pending'
       and coalesce(cardinality(ws.resolved_user_ids), 0) = 0
       and exists (select 1 from hr.workflow_step ws2
                    where ws2.workflow_instance_id = wi.id and ws2.state = 'active'
                      and coalesce(cardinality(ws2.resolved_user_ids), 0) > 0)
       -- such an instance exists; the classifier must NOT call its row unreachable now
     ) then
    raise notice 'hr_c4_46: a live instance has a reachable ACTIVE step beside a pending one — the exact false positive';
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_46: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_46: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_46_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_46: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_46: unreachable means the active step, and the payload names it';
end $$;
