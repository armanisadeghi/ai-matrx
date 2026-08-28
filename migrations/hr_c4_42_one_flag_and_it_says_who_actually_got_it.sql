-- HR domain C4 — migration 42 (register item HRB-008; the coordinator's D285 ruling, 2026-08-28).
--
-- 🚨 TWO SIGNALS FOR ONE FACT — ONE OF THEM NEVER FIRED, THE OTHER FIRED TOO OFTEN.
--
-- D285: the attestation close claimed "flagged to the manager" and flagged nobody —
-- `hr._wf_notify` was called with `p_user => null` and returns 0 on a null user.
--
-- ===================================================================================
-- THE MEASUREMENT THAT DECIDED THE DESIGN (ruling item 3: measure first)
--
--   unactionable_no_reach failures live:            1 open
--   raised WHERE:                                   hr.wf_activate_step RD 4, at ROUTING time
--                                                   (step.created_at == failure.occurred_at, exactly)
--   blocking:                                       yes — `blocks_instance: true`
--   assigned to:                                    the hr_owner (the hr_admin fallback), and its
--                                                   in_app notice status is `succeeded`
--   HR-visible:                                     yes — hr.wf_pending.failures_assigned_to_me
--                                                   and hr.pay_period_get's row failure_class
--   🚨 idempotent:                                  NO. Two re-activations produced THREE failures.
--   volume:                                         8 login-less employments x 59 pay periods,
--                                                   plus one more per re-activation
--
-- So the flag already reaches a human — and it reaches them again, and again, for an outcome the
-- 2026-08-27 ruling calls DESIGNED. That is exactly the standing noise C(i) was rejected for, and
-- it was already being manufactured at routing time by a raise nobody had measured.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE BLOCKING FAILURE IS KILLED FOR THE BY-DESIGN CASE ONLY. `hr.wf_activate_step` RD 4's
--    reasoning is right in general: a step nobody can reach is structurally unactionable and should
--    be worked by a human. It is WRONG for the one case the program has ruled normal — a self-step
--    that resolves to its own subject who holds no login, which is a kiosk-only employee attesting
--    their own timecard. Blocking an instance every period, per person, for a designed terminal
--    outcome is noise, not work. The suppression is scoped exactly to `sd.allows_self` AND the
--    candidate set being precisely the subject; every other unreachable step still raises.
--
-- 2. AND THE RAISE BECOMES IDEMPOTENT FOR EVERYONE. An open `unactionable_no_reach` on the same step
--    means the human already has this work; a second row is a duplicate of the first, not news.
--    Measured before the change: 1 → 2 → 3 across two re-activations. This is a strict improvement
--    for the general case, independent of the attestation ruling.
--
-- 3. THE RECIPIENT IS THE MANAGER OF RECORD, RESOLVED AT CLOSE TIME (ruling item 1), falling back to
--    the HR admin queue — the program's standing fallback, resolved with the identical query
--    `hr._wf_failure` uses, so the two cannot drift.
--
-- 4. 🚨 THE RECORD SAYS WHO WAS *ACTUALLY* NOTIFIED, READ BACK FROM THE CALL (ruling item 2, the
--    success-from-readback law). `hr._wf_notify` returns the number of notices it wrote; that
--    integer — not the intent — decides what gets recorded. `notified_as` can only be
--    `manager_of_record` or `hr_admin_queue` when the count is non-zero, and is `nobody` otherwise.
--    The old wording asserted a recipient it never checked, which is precisely how a claim survives
--    for a whole lane while being false.
--
-- 5. THE TIMECARD NOTE STOPS CLAIMING THE FLAG AND STARTS REPORTING IT. "and flagged to the manager"
--    is removed from both case sentences and replaced by a sentence derived from what actually
--    happened, including the honest "nobody could be notified" case naming where the flag does sit.
--    Both sentences keep the no-auto-deny clause.
--
-- Authority: the coordinator's D285 ruling (2026-08-28) items 1–3; the login-less-attester ruling
-- (2026-08-27) which stands; SPEC-WORKFLOW-ENGINE §1.8 (a failure is worked by a human).
-- Applied live as `hr_c4_42_one_flag_and_it_says_who_actually_got_it`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_42_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. one flag, and it is real (RD 3/4/5)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$  v_emp uuid; v_res jsonb; v_case text;$o$;
  v_dec_new constant text := $o$  v_emp uuid; v_res jsonb; v_case text;
  v_mgr uuid; v_to_user uuid; v_to_emp uuid; v_to_role text; v_sent integer;$o$;
  v_old constant text := $o$perform hr._wf_notify(inst.id, p_step, 'hr.time.attestation_overdue',
                        'timeout_warning', null, v_emp,$o$;
  v_new_txt constant text := $o$-- 🚨 THE RECIPIENT, RESOLVED — this used to pass `null` as the user, and hr._wf_notify returns 0
  -- on a null user, so the "flagged to the manager" claim was never once true (D285). The manager of
  -- record at close time, falling back to the HR admin queue with the same query hr._wf_failure uses.
  v_mgr    := hr.manager_as_of(v_emp, current_date);
  v_to_emp := v_mgr;
  v_to_user := hr._wf_login_of(v_mgr);
  v_to_role := 'manager_of_record';
  if v_to_user is null then
    select ra.employment_id into v_to_emp
      from hr.role_assignment ra
     where ra.organization_id = inst.organization_id and ra.is_active and ra.revoked_at is null
       and ra.role_key in ('hr_owner','hr_admin')
     order by case ra.role_key when 'hr_owner' then 0 else 1 end, ra.created_at
     limit 1;
    v_to_user := hr._wf_login_of(v_to_emp);
    v_to_role := 'hr_admin_queue';
  end if;
  v_sent := coalesce(hr._wf_notify(inst.id, p_step, 'hr.time.attestation_overdue',
                        'timeout_warning', v_to_user, v_to_emp,$o$;
  -- close the call and read the result back BEFORE recording anything about it
  v_tail_old constant text := $o$                                           'note', p_note));$o$;
  v_tail_new constant text := $o$                                           'notified_as', v_to_role,
                                           'note', p_note)), 0);
  -- 🚨 READ BACK, DO NOT ASSERT. hr._wf_notify returns how many notices it actually wrote; that
  -- integer decides what the record says. A recipient nobody checked is how D285 survived a lane.
  if v_sent = 0 then v_to_role := 'nobody'; end if;
  perform hr.arm_write();
  update hr.workflow_step
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'notified_as', v_to_role,
           'notified_user_id', case when v_sent > 0 then v_to_user end,
           'notified_employment_id', case when v_sent > 0 then v_to_emp end,
           'notices_sent', v_sent)
   where id = p_step;$o$;
  v_ev_old constant text := $o$                         'outcome', 'not_attested', 'reason', v_case, 'note', p_note,$o$;
  v_ev_new constant text := $o$                         'outcome', 'not_attested', 'reason', v_case,
                         'notified_as', v_to_role, 'notices_sent', v_sent, 'note', p_note,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  v_def := pg_get_functiondef(v_oid);
  if position('notified_as' in v_def) > 0 then
    raise notice 'hr_c4_42: the close already records who was actually notified';
  else
    if position(v_dec_old in v_def) = 0 or position(v_old in v_def) = 0
       or position(v_tail_old in v_def) = 0 or position(v_ev_old in v_def) = 0 then
      raise exception 'hr_c4_42: hr._wf_not_attested does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old,  v_dec_new);
    v_new := replace(v_new, v_old,      v_new_txt);
    v_new := replace(v_new, v_tail_old, v_tail_new);
    v_new := replace(v_new, v_ev_old,   v_ev_new);
    execute v_new;
    raise notice 'hr_c4_42: the attestation flag now has a real recipient, recorded from the readback';
  end if;
end
$mig$;

-- ============================================================ 2. the duplicate signal dies (RD 1/2)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  if v_cands <> '{}' and coalesce(cardinality(v_users), 0) = 0
     and (v_res ->> 'resolution_path') is distinct from 'external_result' then$o$;
  v_new constant text := $o$  if v_cands <> '{}' and coalesce(cardinality(v_users), 0) = 0
     and (v_res ->> 'resolution_path') is distinct from 'external_result'
     -- 🚨 NOT FOR THE BY-DESIGN SELF-STEP (ruled 2026-08-27, refined 2026-08-28). A kiosk-only
     -- employee attesting their OWN timecard resolves to themselves and holds no login BY DESIGN;
     -- `not_attested` is the accepted terminal state for them. Raising a BLOCKING failure for that,
     -- every pay period, per person, is standing noise rather than work — measured at 8 login-less
     -- employments x 59 periods. The one deliberate signal for this case is the close: the manager
     -- flag, plus attestation_reason on the period panel. Every OTHER unreachable step still raises.
     and not (coalesce(sd.allows_self, false)
              and inst.subject_employment_id is not null
              and v_cands = ARRAY[inst.subject_employment_id])
     -- 🚨 AND ONCE, NOT PER RE-ACTIVATION. Measured before this line: two re-activations produced
     -- THREE failures for one step. An open failure means the human already has this work; a second
     -- row is a duplicate of the first, not news. This half is a general improvement.
     and not exists (select 1 from hr.workflow_failure wf
                      where wf.workflow_step_id = p_step
                        and wf.failure_class = 'unactionable_no_reach'
                        and wf.state in ('open','retrying')) then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_activate_step';
  v_def := pg_get_functiondef(v_oid);
  if position('NOT FOR THE BY-DESIGN SELF-STEP' in v_def) > 0 then
    raise notice 'hr_c4_42: the raise is already scoped and idempotent';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_42: hr.wf_activate_step does not carry the expected raise — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_42: the unactionable_no_reach raise is scoped to real work and raised once';
  end if;
end
$mig$;

-- ============================================================ 3. the note reports, not claims (RD 5)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$  v_reason text;$o$;
  v_dec_new constant text := $o$  v_reason text;
  v_flag   text;$o$;
  v_sel_old constant text := $o$      select ws.metadata ->> 'not_attested_reason' into v_reason$o$;
  v_sel_new constant text := $o$      select ws.metadata ->> 'not_attested_reason', ws.metadata ->> 'notified_as'
        into v_reason, v_flag$o$;
  v_note_old constant text := $o$               'attestation_note', case when v_reason = 'no_reach'
                 then 'This employee holds no platform login, so the attestation was never deliverable to them — nobody asked, and they did not decline. The step was closed as not_attested and flagged to the manager. NOTHING here attested on their behalf.'
                 else 'The attestation deadline passed with no action from the employee. The step was closed as not_attested and flagged to the manager. NOTHING here attested on their behalf.' end)$o$;
  v_note_new constant text := $o$               -- 🚨 THE FLAG SENTENCE IS DERIVED FROM WHAT ACTUALLY HAPPENED, never from intent.
               -- Both case sentences previously ended "and flagged to the manager" — a claim the
               -- engine never kept (D285). NOTHING here attested on their behalf stays in both.
               'attestation_note', (case when v_reason = 'no_reach'
                 then 'This employee holds no platform login, so the attestation was never deliverable to them — nobody asked, and they did not decline. The step was closed as not_attested. NOTHING here attested on their behalf.'
                 else 'The attestation deadline passed with no action from the employee. The step was closed as not_attested. NOTHING here attested on their behalf.' end)
                 || (case v_flag
                       when 'manager_of_record' then ' The manager of record was notified.'
                       when 'hr_admin_queue' then ' No manager of record exists for this employee, so the flag went to the HR admin queue.'
                       else ' Nobody could be notified — there is no manager of record and no reachable HR admin — so this row is where the flag sits.' end))$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_wf_apply';
  v_def := pg_get_functiondef(v_oid);
  if position('notified_as' in v_def) > 0 then
    raise notice 'hr_c4_42: the note already reports the real flag';
  else
    if position(v_dec_old in v_def) = 0 or position(v_sel_old in v_def) = 0
       or position(v_note_old in v_def) = 0 then
      raise exception 'hr_c4_42: hr.timecard_wf_apply does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old,  v_dec_new);
    v_new := replace(v_new, v_sel_old,  v_sel_new);
    v_new := replace(v_new, v_note_old, v_note_new);
    execute v_new;
    raise notice 'hr_c4_42: the timecard note reports the flag it actually raised';
  end if;
end
$mig$;

-- ============================================================ 4. the contracts
do $$
begin
  delete from hr.function_contract where home_migration in ('hr_c4_42');
  delete from hr.function_contract
   where schema_name = 'hr' and function_name = 'timecard_wf_apply' and home_migration = 'hr_c4_41';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('hr', '_wf_not_attested', 'hr_c4_42',
   array['hr.manager_as_of(v_emp', '''hr_owner'',''hr_admin''', 'if v_sent = 0 then',
         '''notified_as''', 'notices_sent'],
   array['''timeout_warning'', null, v_emp'], true,
   'hr_c4_42 (D285): the flag must have a REAL recipient — the manager of record at close time, falling back to the HR admin queue — and the record must say who was ACTUALLY reached, read back from hr._wf_notify''s return value. Passing `null` as the user is BANNED: that function returns 0 on a null user, which is how "flagged to the manager" stayed false for an entire lane while the payload asserted it. `if v_sent = 0` is the readback itself; without it notified_as becomes a claim again.'),
  ('hr', 'wf_activate_step', 'hr_c4_42',
   array['NOT FOR THE BY-DESIGN SELF-STEP', 'wf.failure_class = ''unactionable_no_reach''',
         'unactionable_no_reach'],
   '{}', true,
   'hr_c4_42: the unactionable_no_reach raise must stay SCOPED and IDEMPOTENT. Scoped: a self-step resolving to its own login-less subject is the kiosk-only attestation the 2026-08-27 ruling calls designed, and blocking an instance for it every period per person is standing noise — measured at 8 login-less employments x 59 pay periods. Idempotent: before this line, two re-activations produced THREE blocking failures for one step. Removing either half re-manufactures the noise; removing the raise entirely would hide genuinely unreachable steps, which is the case RD 4 exists for.'),
  ('hr', 'timecard_wf_apply', 'hr_c4_42',
   array['attestation_reason', 'not_attested_reason', 'never deliverable to them',
         'NOTHING here attested on their behalf', 'notified_as', 'this row is where the flag sits'],
   array['closed as not_attested and flagged to the manager'], true,
   'hr_c4_42 (supersedes the hr_c4_41 row): the timecard note must REPORT the flag, never claim it. "and flagged to the manager" is banned — it was false for every not_attested timecard ever written (D285). The sentence is derived from the step''s recorded notified_as, and the nobody-was-notified case must keep saying where the flag actually sits. Both case wordings keep the no-auto-deny clause, and the no_reach wording must keep saying nobody asked rather than blaming the employee.');
end $$;

-- ============================================================ 5. post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer; v_res jsonb; v_step uuid; v_meta jsonb; v_n1 integer; v_n2 integer;
begin
  -- RD 4: the banned spelling is gone
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_not_attested') ~ '''timeout_warning'', null, v_emp' then
    raise exception 'hr_c4_42: the notify call still passes a null user';
  end if;

  -- RD 1/2, EXECUTED: re-activating a by-design self step raises NOTHING, twice over
  select ws.id into v_step
    from hr.workflow_step ws join hr.workflow_instance i on i.id = ws.workflow_instance_id
   where i.flow_key = 'timecard_attestation' and ws.step_key = 'employee_attestation'
     and coalesce(cardinality(ws.resolved_user_ids), 0) = 0
   order by ws.created_at desc limit 1;
  if v_step is not null then
    begin
      select count(*) into v_n1 from hr.workflow_failure
       where failure_class = 'unactionable_no_reach';
      perform hr.arm_write();
      update hr.workflow_step set state = 'pending' where id = v_step;
      perform hr.wf_activate_step(v_step);
      perform hr.arm_write();
      update hr.workflow_step set state = 'pending' where id = v_step;
      perform hr.wf_activate_step(v_step);
      select count(*) into v_n2 from hr.workflow_failure
       where failure_class = 'unactionable_no_reach';
      if v_n2 <> v_n1 then
        raise exception 'hr_c4_42: two re-activations of a by-design self step added % failure(s)',
          v_n2 - v_n1;
      end if;
      raise exception 'hr_c4_42_rollback_marker';
    exception
      when others then
        if sqlerrm !~ 'hr_c4_42_rollback_marker' then raise; end if;
    end;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_42: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_42: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_42_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_42: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_42: one flag, with a real recipient, recorded from the readback';
end $$;
