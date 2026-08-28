-- HR domain C4 — migration 43 (register item HRB-008; correcting hr_c4_42, caught by hrb008 §8.2).
--
-- 🚨 I KILLED THE WRONG DUPLICATE.
--
-- The D285 ruling said: *"if the failure lane already lands the flag in front of a human, the fixed
-- notification may be the redundant one — kill the weaker duplicate rather than shipping two."*
-- hr_c4_42 suppressed the `unactionable_no_reach` FAILURE for the by-design self-step case and kept
-- the notification. That is backwards, and `hrb008_proof` §8.2 node G said so within one run —
-- 7 RED, the suite aborting.
--
-- The failure is not a flag. It is a WORK ITEM, and its resolutions —
-- `["not_attested","reassign","abandon"]` — are the ONLY handle an HR admin has on a stuck
-- attestation: `hr.wf_resolve_failure(<failure>, 'not_attested', …)` is how a human closes one
-- deliberately before the sweep's deadline, and `reassign` is how they move it. Removing the failure
-- removed the handle and left only an automatic close on a clock. A notification tells somebody; a
-- failure lets them act. The notification was always the weaker of the two.
--
-- ===================================================================================
-- WHAT STANDS FROM hr_c4_42, AND WHAT IS REVERTED
--
--   KEPT — the idempotence guard. Measured before it: two re-activations produced THREE blocking
--          failures for one step. One open failure means the human already has this work; a second
--          row is a duplicate of the first. This alone removes the noise the ruling was worried
--          about, without removing anybody's ability to act.
--   KEPT — the real recipient and the readback (D285's substance): the manager of record at close
--          time, HR admin fallback, and `notified_as` derived from `hr._wf_notify`'s return value.
--   REVERTED — the by-design suppression of the raise. Every unreachable-but-resolved step raises
--          again, exactly as `hr.wf_activate_step` RD 4 intended.
--   NEW — the ONE-SIGNAL rule, applied to the correct half: for `no_reach`, the failure work item
--          already sits in front of a human, so the close does NOT also send a notification; it
--          records that the failure lane owns it. For `no_response` there is no failure — the
--          candidate was reachable and simply did not act — so the notification is the only signal
--          and it fires.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE SIGNAL IS CHOSEN BY CASE, NOT SUPPRESSED WHOLESALE. `no_reach` → the failure (actionable,
--    once per step, already assigned and already notified through the failure lane's own notice).
--    `no_response` → the close notification (the only signal that case produces).
--
-- 2. 🚨 IT IS DECIDED BY LOOKING, NOT BY ASSUMING. The close checks whether an
--    `unactionable_no_reach` failure actually exists for this step rather than inferring one from
--    the reason — the same readback discipline hr_c4_42 applied to the recipient. If the raise is
--    ever scoped differently, this keeps telling the truth instead of drifting.
--
-- 3. `notified_as` GAINS ONE HONEST VALUE: `failure_lane_owns_it`. It is not "nobody" — a human has
--    the work item — and it is not a delivered notification either. The timecard note says so in
--    those words, and names where the flag sits.
--
-- 4. THE LESSON, RECORDED WHERE IT HAPPENED: a proof suite that drives the failure lane end to end
--    is what caught this, one run after the migration that broke it. The §8.2 node G section exists
--    because that path is how a stuck attestation ends; deleting its precondition deleted the path.
--
-- Authority: the coordinator's D285 ruling (2026-08-28) item 3, read correctly this time; the
-- login-less-attester ruling (2026-08-27); SPEC-WORKFLOW-ENGINE §1.8 and §8.2 node G.
-- Applied live as `hr_c4_43_the_work_item_is_the_stronger_signal`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_43_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the raise comes back (idempotent)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$     -- 🚨 NOT FOR THE BY-DESIGN SELF-STEP (ruled 2026-08-27, refined 2026-08-28). A kiosk-only
     -- employee attesting their OWN timecard resolves to themselves and holds no login BY DESIGN;
     -- `not_attested` is the accepted terminal state for them. Raising a BLOCKING failure for that,
     -- every pay period, per person, is standing noise rather than work — measured at 8 login-less
     -- employments x 59 periods. The one deliberate signal for this case is the close: the manager
     -- flag, plus attestation_reason on the period panel. Every OTHER unreachable step still raises.
     and not (coalesce(sd.allows_self, false)
              and inst.subject_employment_id is not null
              and v_cands = ARRAY[inst.subject_employment_id])
$o$;
  v_new constant text := $o$     -- 🚨 THE RAISE IS NOT SCOPED AWAY (hr_c4_43 reverting hr_c4_42). A failure here is not a
     -- flag, it is a WORK ITEM: its resolutions are the only handle an HR admin has on a stuck
     -- attestation — hr.wf_resolve_failure(..., 'not_attested') to close one deliberately before the
     -- sweep's clock, or 'reassign' to move it. Suppressing it for the by-design case removed that
     -- handle and hrb008 §8.2 node G went red in one run. The duplicate that had to die was the
     -- weaker one — the close-time NOTIFICATION — and hr._wf_not_attested drops that for no_reach.
$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_activate_step';
  v_def := pg_get_functiondef(v_oid);
  if position('NOT FOR THE BY-DESIGN SELF-STEP' in v_def) = 0 then
    raise notice 'hr_c4_43: the by-design suppression is already gone';
  else
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_43: every unreachable-but-resolved step raises again; the raise stays idempotent';
  end if;
end
$mig$;

-- ============================================================ 2. the close picks the right signal
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$  v_mgr uuid; v_to_user uuid; v_to_emp uuid; v_to_role text; v_sent integer;$o$;
  v_dec_new constant text := $o$  v_mgr uuid; v_to_user uuid; v_to_emp uuid; v_to_role text; v_sent integer;
  v_owned boolean;$o$;
  v_old constant text := $o$  v_sent := coalesce(hr._wf_notify(inst.id, p_step, 'hr.time.attestation_overdue',$o$;
  v_new_txt constant text := $o$  -- 🚨 ONE SIGNAL PER CASE, DECIDED BY LOOKING (hr_c4_43). For `no_reach` the failure lane already
  -- holds a work item for this exact step — assigned, notified, and carrying the resolutions an HR
  -- admin acts through. A second close-time notification about the same fact is the weaker
  -- duplicate. For `no_response` no failure exists (the person was reachable and simply did not
  -- act), so this notification is the ONLY signal and it must fire. Checked against the failure
  -- table rather than inferred from v_case, so a change to the raise cannot make this lie.
  select exists (select 1 from hr.workflow_failure wf
                  where wf.workflow_step_id = p_step
                    and wf.failure_class = 'unactionable_no_reach')
    into v_owned;
  if v_owned then
    v_sent := 0;
    v_to_role := 'failure_lane_owns_it';
  else
  v_sent := coalesce(hr._wf_notify(inst.id, p_step, 'hr.time.attestation_overdue',$o$;
  v_tail_old constant text := $o$  if v_sent = 0 then v_to_role := 'nobody'; end if;$o$;
  v_tail_new constant text := $o$    if v_sent = 0 then v_to_role := 'nobody'; end if;
  end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  v_def := pg_get_functiondef(v_oid);
  if position('failure_lane_owns_it' in v_def) > 0 then
    raise notice 'hr_c4_43: the close already picks the signal by case';
  else
    if position(v_dec_old in v_def) = 0 or position(v_old in v_def) = 0
       or position(v_tail_old in v_def) = 0 then
      raise exception 'hr_c4_43: hr._wf_not_attested does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old,  v_dec_new);
    v_new := replace(v_new, v_old,      v_new_txt);
    v_new := replace(v_new, v_tail_old, v_tail_new);
    execute v_new;
    raise notice 'hr_c4_43: no_reach defers to the failure work item; no_response sends the flag';
  end if;
end
$mig$;

-- ============================================================ 3. the note says where the flag sits
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$                       when 'hr_admin_queue' then ' No manager of record exists for this employee, so the flag went to the HR admin queue.'$o$;
  v_new constant text := $o$                       when 'hr_admin_queue' then ' No manager of record exists for this employee, so the flag went to the HR admin queue.'
                       when 'failure_lane_owns_it' then ' This step was never deliverable, so it is already an open item in the HR admin work queue — that is where it is worked, and no second notice was sent.'$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_wf_apply';
  v_def := pg_get_functiondef(v_oid);
  if position('failure_lane_owns_it' in v_def) > 0 then
    raise notice 'hr_c4_43: the note already names the failure-lane case';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_43: hr.timecard_wf_apply does not carry the expected note — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_43: the note names the work queue for the never-deliverable case';
  end if;
end
$mig$;

-- ============================================================ 4. the contracts
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_43';
  delete from hr.function_contract
   where function_name in ('wf_activate_step','_wf_not_attested','timecard_wf_apply')
     and home_migration = 'hr_c4_42';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('hr', 'wf_activate_step', 'hr_c4_43',
   array['unactionable_no_reach', 'wf.failure_class = ''unactionable_no_reach'''],
   array['NOT FOR THE BY-DESIGN SELF-STEP'], true,
   'hr_c4_43: the raise must stay IDEMPOTENT (an open failure means the human already has this work; before that guard two re-activations produced three blocking rows) and must NOT be scoped away for the by-design self-step. hr_c4_42 tried that and hrb008 §8.2 node G went red in one run: this failure is not a flag, it is the WORK ITEM whose resolutions — not_attested, reassign, abandon — are the only handle an HR admin has on a stuck attestation. Suppressing it removes the handle and leaves only an automatic close on a clock.'),
  ('hr', '_wf_not_attested', 'hr_c4_43',
   array['hr.manager_as_of(v_emp', '''hr_owner'',''hr_admin''', 'if v_sent = 0 then',
         '''notified_as''', 'notices_sent', 'failure_lane_owns_it',
         'wf.failure_class = ''unactionable_no_reach'''],
   array['''timeout_warning'', null, v_emp'], true,
   'hr_c4_43 (supersedes hr_c4_42): ONE signal per case. For no_reach the failure lane already holds an assigned, notified work item for this step, so the close must NOT send a second notification — it records failure_lane_owns_it. For no_response no failure exists and the notification is the only signal, so it must fire, with a REAL recipient (manager of record, HR admin fallback) and notified_as read back from hr._wf_notify''s return value. Passing null as the user stays BANNED — that was D285. The case is decided by LOOKING at hr.workflow_failure, never inferred from the reason, so a change to the raise cannot make this record lie.'),
  ('hr', 'timecard_wf_apply', 'hr_c4_43',
   array['attestation_reason', 'not_attested_reason', 'never deliverable to them',
         'NOTHING here attested on their behalf', 'notified_as', 'failure_lane_owns_it'],
   array['closed as not_attested and flagged to the manager'], true,
   'hr_c4_43 (supersedes hr_c4_42): the note REPORTS the flag, never claims it. "and flagged to the manager" stays banned — it was false for every not_attested timecard ever written (D285). Every notified_as value must have its own sentence, including failure_lane_owns_it, which names the HR admin work queue as where the item is actually worked. Both case wordings keep the no-auto-deny clause, and the no_reach wording must keep saying nobody asked rather than blaming the employee.');
end $$;

-- ============================================================ 5. post-conditions that EXECUTE
do $$
declare v_bad integer; v_before integer; v_res jsonb; v_step uuid; v_n1 integer; v_n2 integer;
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_activate_step') ~ 'NOT FOR THE BY-DESIGN SELF-STEP' then
    raise exception 'hr_c4_43: the by-design suppression is still in place';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_not_attested') ~ '''timeout_warning'', null, v_emp' then
    raise exception 'hr_c4_43: the notify call regressed to a null user';
  end if;

  -- the raise works again AND is still idempotent, executed on the live by-design step
  select ws.id into v_step
    from hr.workflow_step ws join hr.workflow_instance i on i.id = ws.workflow_instance_id
   where i.flow_key = 'timecard_attestation' and ws.step_key = 'employee_attestation'
     and coalesce(cardinality(ws.resolved_user_ids), 0) = 0
   order by ws.created_at desc limit 1;
  if v_step is not null then
    begin
      perform hr.arm_write();
      update hr.workflow_failure set state = 'resolved', resolved_at = now()
       where workflow_step_id = v_step and failure_class = 'unactionable_no_reach';
      select count(*) into v_n1 from hr.workflow_failure where failure_class = 'unactionable_no_reach';
      perform hr.arm_write();
      update hr.workflow_step set state = 'pending' where id = v_step;
      perform hr.wf_activate_step(v_step);
      select count(*) into v_n2 from hr.workflow_failure where failure_class = 'unactionable_no_reach';
      if v_n2 <> v_n1 + 1 then
        raise exception 'hr_c4_43: the raise did not come back (% -> %)', v_n1, v_n2;
      end if;
      -- and a second activation adds nothing
      perform hr.arm_write();
      update hr.workflow_step set state = 'pending' where id = v_step;
      perform hr.wf_activate_step(v_step);
      select count(*) into v_n1 from hr.workflow_failure where failure_class = 'unactionable_no_reach';
      if v_n1 <> v_n2 then
        raise exception 'hr_c4_43: the raise is not idempotent (% -> %)', v_n2, v_n1;
      end if;
      raise exception 'hr_c4_43_rollback_marker';
    exception
      when others then
        if sqlerrm !~ 'hr_c4_43_rollback_marker' then raise; end if;
    end;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_43: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_43: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_43_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_43: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_43: the work item is back; the weaker duplicate is the one that died';
end $$;
