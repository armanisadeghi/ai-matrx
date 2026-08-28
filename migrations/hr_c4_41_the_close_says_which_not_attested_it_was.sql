-- HR domain C4 — migration 41 (register item HRB-008; ruling A of the coordinator's 2026-08-28
-- answers, refining the 2026-08-27 login-less-attester ruling by the record-honestly law).
--
-- 🚨 ONE TERMINAL STATE WAS BEING ASKED TO MEAN TWO DIFFERENT THINGS.
--
-- `not_attested` STAYS the terminal state for a kiosk-only employee — that is ruled, by design, and
-- nothing here changes it. What was missing is WHICH not_attested it was:
--
--   · `no_response` — the employee was asked, had a surface to answer on, and did not;
--   · `no_reach`    — the employee holds no login, so the ask was never deliverable at all.
--
-- Conflating them is the same species of defect `hr_c4_40` just fixed one migration ago: a record
-- that cannot be read as what actually happened. And here it was not merely ambiguous, it was
-- WRONG — `hr.timecard_wf_apply` wrote this sentence onto every not_attested timecard:
--
--     "The attestation deadline passed with NO ACTION FROM THE EMPLOYEE."
--
-- For a login-less employee that sentence is false and it blames her: there was no action she could
-- have taken, because nobody could ask her. Measured live, 8 login-less active employments exist,
-- and one (Calla Ortega) holds an open attestation step right now.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. CLOSE EVIDENCE, NOT A NEW TERMINAL VALUE (ruling A, verbatim: "as close evidence on the step,
--    NOT a new terminal vocabulary value"). `state` stays `skipped`, `state_reason` stays
--    `not_attested`, `attestation_outcome` stays `not_attested`. The distinction is recorded in
--    `hr.workflow_step.metadata.not_attested_reason` and carried forward onto the timecard row. No
--    CHECK constraint moves, no vocabulary row is added, and nothing downstream that switches on the
--    terminal value changes behaviour.
--
-- 2. THE REASON IS DERIVED, NOT PASSED. `hr._wf_not_attested` computes it from the step it is
--    closing — `cardinality(resolved_user_ids) = 0` is exactly "nobody could be reached", the same
--    fact `hr.timecard_attestation_sweep` already selects on. Deriving it inside the ONE shared
--    transition means the sweep and the failure-lane door (`hr.wf_resolve_failure`, action
--    `not_attested`) cannot disagree — hr_c4_15 RD 2 made them share this function precisely so
--    there would be no second implementation to drift.
--
-- 3. THE SWEEP LINE IS UNCHANGED. `hr_c4_15` RD 1's due-hours-clock eligibility stands: a step with
--    no reachable approver still closes on the clock alone, because reminders to nobody are not a
--    precondition that can ever be met. Ruling A: "it keeps closing on the due-hours clock; it just
--    says which case it closed." C(i) — raising a blocking failure — was rejected as manufacturing
--    standing noise on a by-design recurring case.
--
-- 4. THE NOTE IS WRITTEN PER CASE, AND BOTH HALVES KEEP THE NO-AUTO-DENY SENTENCE. Neither wording
--    attests anything on anybody's behalf, and neither implies the employee refused. The no-reach
--    wording says plainly that nobody asked.
--
-- 5. THE MANAGER FLAG CARRIES IT SO L3 CAN WORD THE DISTINCTION. `hr._wf_notify`'s payload and the
--    `timeout_applied` event both gain the reason and the reachable count, and `hr.pay_period_get`
--    surfaces `attestation_reason` on each workflow row. THE RENDERING IS NOT MINE — the panel
--    wording goes to the L3 lane next; this migration only makes the fact available to it.
--
-- 6. HISTORY IS NOT REWRITTEN. Only closes made from now on carry the evidence. The one already
--    closed instance (subject Priya Raman, who HAS a login and was asked) keeps exactly the record
--    it earned, and a post-condition asserts it was not touched.
--
-- Authority: coordinator ruling A (2026-08-28), refining the login-less-attester ruling
-- (2026-08-27) which STANDS; SPEC-WORKFLOW-ENGINE §8.2 node G; the record-honestly law.
-- Applied live as `hr_c4_41_the_close_says_which_not_attested_it_was`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_41_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the shared transition records why
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$  v_emp uuid; v_res jsonb;$o$;
  v_dec_new constant text := $o$  v_emp uuid; v_res jsonb; v_case text;$o$;

  v_body_old constant text := $o$v_emp := inst.subject_employment_id;
  perform hr.arm_write();

  -- 🚨 `skipped`, NOT `expired` (hr_l3_26 RD 12). attested_at stays NULL; nothing attested on the
  -- employee's behalf. state_reason carries the fact that nobody did.
  v_res := hr._wf_close_step(p_step, 'skipped', 'not_attested');
  perform hr._wf_notify(inst.id, p_step, 'hr.time.attestation_overdue',
                        'timeout_warning', null, v_emp,
                        jsonb_build_object('outcome', 'not_attested',
                                           'flagged_to', 'manager',
                                           'attested', false,
                                           'closed_by', case when p_actor is null
                                                             then 'sweep' else 'failure_lane' end,
                                           'note', p_note));$o$;
  v_body_new constant text := $o$v_emp := inst.subject_employment_id;

  -- 🚨 WHICH not_attested IS THIS? Derived here, in the ONE shared transition, so the sweep and the
  -- failure-lane door cannot disagree (hr_c4_15 RD 2). `resolved_user_ids` empty means nobody could
  -- be reached at all — the same fact the sweep already selects on — as against an employee who had
  -- a surface and did not use it. The terminal value is untouched either way (hr_c4_41 RD 1).
  v_case := case when coalesce(cardinality(st.resolved_user_ids), 0) = 0
                 then 'no_reach' else 'no_response' end;
  perform hr.arm_write();

  -- 🚨 `skipped`, NOT `expired` (hr_l3_26 RD 12). attested_at stays NULL; nothing attested on the
  -- employee's behalf. state_reason carries the fact that nobody did.
  v_res := hr._wf_close_step(p_step, 'skipped', 'not_attested');
  -- close EVIDENCE, not a new terminal value: state stays `skipped`, state_reason stays
  -- `not_attested`, and the reason rides alongside where a reader can find it.
  perform hr.arm_write();
  update hr.workflow_step
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'not_attested_reason', v_case,
           'reachable_user_count_at_close', coalesce(cardinality(st.resolved_user_ids), 0),
           'closed_by', case when p_actor is null then 'sweep' else 'failure_lane' end)
   where id = p_step;
  perform hr._wf_notify(inst.id, p_step, 'hr.time.attestation_overdue',
                        'timeout_warning', null, v_emp,
                        jsonb_build_object('outcome', 'not_attested',
                                           'reason', v_case,
                                           'reachable_user_count',
                                              coalesce(cardinality(st.resolved_user_ids), 0),
                                           'flagged_to', 'manager',
                                           'attested', false,
                                           'closed_by', case when p_actor is null
                                                             then 'sweep' else 'failure_lane' end,
                                           'note', p_note));$o$;

  v_ev_old constant text := $o$                         'outcome', 'not_attested', 'note', p_note,$o$;
  v_ev_new constant text := $o$                         'outcome', 'not_attested', 'reason', v_case, 'note', p_note,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  v_def := pg_get_functiondef(v_oid);
  if position('not_attested_reason' in v_def) > 0 then
    raise notice 'hr_c4_41: the shared transition already records which not_attested it was';
  else
    if position(v_dec_old in v_def) = 0 or position(v_body_old in v_def) = 0
       or position(v_ev_old in v_def) = 0 then
      raise exception 'hr_c4_41: hr._wf_not_attested does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old,  v_dec_new);
    v_new := replace(v_new, v_body_old, v_body_new);
    v_new := replace(v_new, v_ev_old,   v_ev_new);
    execute v_new;
    raise notice 'hr_c4_41: hr._wf_not_attested now records no_reach vs no_response';
  end if;
end
$mig$;

-- ============================================================ 2. the timecard row carries it (RD 4)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$  v_out   text;$o$;
  v_dec_new constant text := $o$  v_out   text;
  v_reason text;$o$;
  v_old constant text := $o$v_out := 'not_attested';
      update hr.pay_period_employment
         set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
               'attestation_outcome', 'not_attested',
               'attestation_closed_at', now(),
               'attestation_note', 'The attestation deadline passed with no action from the employee. The step was closed as not_attested and flagged to the manager. NOTHING here attested on their behalf.')
       where id = v_ppe.id;$o$;
  v_new_txt constant text := $o$v_out := 'not_attested';
      -- 🚨 WHICH not_attested, READ FROM THE CLOSE EVIDENCE rather than re-derived here. The old
      -- single sentence said "no action from the employee" on EVERY not_attested timecard — false,
      -- and blaming, for an employee who holds no login and could never have been asked.
      select ws.metadata ->> 'not_attested_reason' into v_reason
        from hr.workflow_step ws
       where ws.workflow_instance_id = p_instance_id
         and ws.step_key = 'employee_attestation'
       order by ws.closed_at desc nulls last limit 1;
      update hr.pay_period_employment
         set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
               'attestation_outcome', 'not_attested',
               'attestation_reason', coalesce(v_reason, 'no_response'),
               'attestation_closed_at', now(),
               'attestation_note', case when v_reason = 'no_reach'
                 then 'This employee holds no platform login, so the attestation was never deliverable to them — nobody asked, and they did not decline. The step was closed as not_attested and flagged to the manager. NOTHING here attested on their behalf.'
                 else 'The attestation deadline passed with no action from the employee. The step was closed as not_attested and flagged to the manager. NOTHING here attested on their behalf.' end)
       where id = v_ppe.id;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_wf_apply';
  v_def := pg_get_functiondef(v_oid);
  if position('attestation_reason' in v_def) > 0 then
    raise notice 'hr_c4_41: the timecard row already carries the reason';
  else
    if position(v_dec_old in v_def) = 0 or position(v_old in v_def) = 0 then
      raise exception 'hr_c4_41: hr.timecard_wf_apply does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old, v_dec_new);
    v_new := replace(v_new, v_old,     v_new_txt);
    execute v_new;
    raise notice 'hr_c4_41: hr.timecard_wf_apply writes the reason and a case-appropriate note';
  end if;
end
$mig$;

-- ============================================================ 3. the panel can read it (RD 5)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_sel_old constant text := $o$                       ppe.metadata ->> 'attestation_outcome'   as attestation_outcome,$o$;
  v_sel_new constant text := $o$                       ppe.metadata ->> 'attestation_outcome'   as attestation_outcome,
                       ppe.metadata ->> 'attestation_reason'    as attestation_reason,$o$;
  v_row_old constant text := $o$                          'attestation_outcome', h.attestation_outcome,$o$;
  v_row_new constant text := $o$                          'attestation_outcome', h.attestation_outcome,
                          -- hr_c4_41: WHICH not_attested — `no_reach` (never askable) or
                          -- `no_response` (asked, did not answer). The panel words the
                          -- distinction; the engine only records it.
                          'attestation_reason', h.attestation_reason,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  v_def := pg_get_functiondef(v_oid);
  if position('attestation_reason' in v_def) > 0 then
    raise notice 'hr_c4_41: the period door already surfaces the reason';
  else
    if position(v_sel_old in v_def) = 0 or position(v_row_old in v_def) = 0 then
      raise exception 'hr_c4_41: hr.pay_period_get does not carry the expected shape — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_sel_old, v_sel_new);
    v_new := replace(v_new, v_row_old, v_row_new);
    execute v_new;
    raise notice 'hr_c4_41: hr.pay_period_get surfaces attestation_reason';
  end if;
end
$mig$;

-- ============================================================ 4. the contracts
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_41';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('hr', '_wf_not_attested', 'hr_c4_41',
   array['not_attested_reason', '''no_reach''', '''no_response''',
         'cardinality(st.resolved_user_ids)', '''skipped'', ''not_attested'''],
   '{}', true,
   'hr_c4_41: the ONE shared not_attested transition must keep DERIVING which case it closed — no_reach (cardinality(resolved_user_ids)=0, nobody could ever be asked) vs no_response (asked, did not answer) — and recording it as close EVIDENCE. The terminal value must stay `skipped`/`not_attested`: ruling A keeps the terminal state and adds only the reason. Both the sweep and the failure-lane door call this function (hr_c4_15 RD 2) precisely so there is no second implementation to drift; deriving the reason anywhere else re-creates that drift.'),
  ('hr', 'timecard_wf_apply', 'hr_c4_41',
   array['attestation_reason', 'not_attested_reason', 'never deliverable to them',
         'NOTHING here attested on their behalf'],
   array['''The attestation deadline passed with no action from the employee. The step was closed as not_attested and flagged to the manager. NOTHING here attested on their behalf.'')'],
   true,
   'hr_c4_41: the timecard note must be written PER CASE. A single sentence saying "no action from the employee" is false and blaming for a login-less employee who could never have been asked — the conflation ruling A exists to end. The reason must keep being READ from the step''s close evidence rather than re-derived here, and BOTH wordings must keep the no-auto-deny sentence: nothing is ever attested on anybody''s behalf.'),
  ('hr', 'pay_period_get', 'hr_c4_41', array['attestation_reason'], '{}', true,
   'hr_c4_41: the period door must keep surfacing attestation_reason on every workflow row, or the L3 panel cannot word the difference between an employee who ignored the ask and one who was never askable — and a panel that cannot say which is looking at the same conflated record the engine just stopped producing.');
end $$;

-- ============================================================ 5. post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer; v_res jsonb; v_step uuid; v_meta jsonb; v_hist jsonb;
begin
  -- RD 1: the terminal vocabulary did NOT move
  if exists (select 1 from pg_constraint
              where conrelid = 'hr.workflow_step'::regclass and contype = 'c'
                and conname = 'workflow_step_state_check'
                and pg_get_constraintdef(oid) !~ 'skipped') then
    raise exception 'hr_c4_41: the step state vocabulary changed — the ruling keeps the terminal value';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_not_attested') !~ '''skipped'', ''not_attested''' then
    raise exception 'hr_c4_41: the close no longer records skipped/not_attested';
  end if;

  -- RD 6: HISTORY IS NOT REWRITTEN. The already-closed step must carry no new evidence.
  select ws.metadata into v_hist
    from hr.workflow_step ws join hr.workflow_instance i on i.id = ws.workflow_instance_id
   where i.flow_key = 'timecard_attestation' and ws.step_key = 'employee_attestation'
     and ws.state = 'skipped' and ws.closed_at < now() - interval '1 hour'
   order by ws.closed_at limit 1;
  if v_hist is not null and v_hist ? 'not_attested_reason' then
    raise exception 'hr_c4_41: a historically closed step was rewritten — it is evidence, not a target';
  end if;

  -- 🚨 THE RULING, EXECUTED: close the live LOGIN-LESS step and read what it recorded. Rolled back.
  select ws.id into v_step
    from hr.workflow_step ws join hr.workflow_instance i on i.id = ws.workflow_instance_id
   where i.flow_key = 'timecard_attestation' and ws.step_key = 'employee_attestation'
     and ws.state = 'active' and coalesce(cardinality(ws.resolved_user_ids), 0) = 0
   order by ws.created_at limit 1;
  if v_step is not null then
    begin
      perform hr._wf_not_attested(v_step, null, 'hr_c4_41 post-condition');
      select metadata into v_meta from hr.workflow_step where id = v_step;
      if v_meta ->> 'not_attested_reason' <> 'no_reach' then
        raise exception 'hr_c4_41: a no-reach close recorded % instead of no_reach',
          v_meta ->> 'not_attested_reason';
      end if;
      if (v_meta ->> 'reachable_user_count_at_close')::integer <> 0 then
        raise exception 'hr_c4_41: the reachable count was not recorded';
      end if;
      if (select state_reason from hr.workflow_step where id = v_step) <> 'not_attested' then
        raise exception 'hr_c4_41: the terminal reason changed';
      end if;
      raise exception 'hr_c4_41_rollback_marker';
    exception
      when others then
        if sqlerrm !~ 'hr_c4_41_rollback_marker' then raise; end if;
    end;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_41: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_41: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_41_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_41: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_41: the close now says which not_attested it was';
end $$;
