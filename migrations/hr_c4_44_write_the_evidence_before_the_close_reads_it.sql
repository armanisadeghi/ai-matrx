-- HR domain C4 — migration 44 (register item HRB-008; four findings from L3's panel walk, 2026-08-28).
--
-- 🚨 THE READER RAN BEFORE THE WRITER, AND A COALESCE MADE IT SILENT — IN THE BLAMING DIRECTION.
--
-- `hr._wf_not_attested` closed the step FIRST and wrote its close evidence AFTER. Closing the step
-- is what triggers `_wf_close_instance → _wf_apply → hr.timecard_wf_apply`, which READS that
-- evidence. So the reader ran while the evidence did not exist yet, `coalesce(v_reason,
-- 'no_response')` supplied a plausible default, and the panel was handed the opposite of the truth.
--
-- Measured live on `Zzz Noreach` (`login_user_id = null`), instance 58a73882:
--
--   the step says (true):   not_attested_reason = no_reach, notified_as = hr_admin_queue,
--                           notices_sent = 3
--   the panel was handed:   attestation_reason = no_response
--                           "The attestation deadline passed with no action from the employee…
--                            Nobody could be notified"
--
-- Both derived values wrong, both toward blame, about the one person `hr_c4_41` exists to protect —
-- and the flag HAD been delivered. A `coalesce` whose left side cannot exist yet is not a default,
-- it is a fabrication with a plausible shape; it turned an ordering bug into a confident falsehood.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. ONE SOURCE, WRITTEN FIRST. The close evidence and the notify readback are both recorded BEFORE
--    `hr._wf_close_step` runs, so every downstream reader — apply, the panel, anything added later —
--    sees a complete record or none at all. Deriving the reason twice was the other option and it is
--    the worse one: two derivations of one fact drift, which is the defect this lane keeps paying
--    for (hr_c4_20, hr_c4_31, hr_c4_36).
--
-- 2. 🚨 AN ABSENT FACT IS NAMED, NEVER DEFAULTED. `coalesce(v_reason,'no_response')` becomes
--    `coalesce(v_reason,'unrecorded')`, with its own sentence saying the case was not recorded. A
--    fallback must never resolve to an accusation: if the engine does not know whether somebody was
--    reachable, it must say it does not know.
--
-- 3. THE SWEEP'S AUTHORITY IS AS OF NOW, NOT AS OF THE PERIOD'S END. It asked
--    `hr.capability(v_uid,'payroll.read', null, v_per.period_end_on)` — a MAINTENANCE ACT gated on
--    standing the actor held in the past. Measured: every payroll.read holder became effective
--    2026-08-26 or later, so **12 of 64 pay periods are unsweepable by anybody, forever**, and
--    nothing about that improves with time. A sweep acts NOW; current standing governs what history
--    you may act on (hr_l3_43). The period's own dates still govern the DUE-HOURS clock below,
--    which is a fact about the period rather than about the actor.
--
-- 4. `awaiting` MEANT "SOMEBODY HAS BEEN ASKED" AND WAS TELLING THAT ABOUT NOBODY. The period
--    panel's health had four values and a never-askable row landed in `awaiting`, which the client
--    renders as *"Somebody has been asked and the flow is alive"*. A live step with ZERO reachable
--    users is now `unreachable` — a fifth value, and the classification is the door's job, not the
--    panel's. 🚨 OWED TO L3: `unreachable` needs its own sentence client-side; until then it will
--    render as an unknown value rather than as a false claim, which is the safer failure.
--
-- 5. THE WRONG DERIVED VALUES ARE REPAIRED, AND THAT IS NOT REWRITING HISTORY. The step's
--    `not_attested_reason` is the EVIDENCE; `pay_period_employment.attestation_reason` is a derived
--    COPY of it that the ordering bug filled in wrong. Correcting a derived value to match its
--    source is a repair. Only rows whose step actually carries evidence are touched, only where the
--    two disagree, and the step metadata itself is never written.
--
-- Authority: L3's panel walk (2026-08-28, step a40b9b32); hr_l3_43 (current standing governs what
-- history you may read); SPEC-TIME §3.3; the record-honestly law.
-- Applied live as `hr_c4_44_write_the_evidence_before_the_close_reads_it`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_44_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the writer runs first (RD 1)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_close_old constant text := $o$  perform hr.arm_write();

  -- 🚨 `skipped`, NOT `expired` (hr_l3_26 RD 12). attested_at stays NULL; nothing attested on the
  -- employee's behalf. state_reason carries the fact that nobody did.
  v_res := hr._wf_close_step(p_step, 'skipped', 'not_attested');
  -- close EVIDENCE, not a new terminal value: state stays `skipped`, state_reason stays
  -- `not_attested`, and the reason rides alongside where a reader can find it.
  perform hr.arm_write();$o$;
  v_close_new constant text := $o$  -- 🚨 THE EVIDENCE IS WRITTEN BEFORE THE CLOSE (hr_c4_44). Closing the step is what triggers
  -- _wf_close_instance -> _wf_apply -> hr.timecard_wf_apply, and that function READS this evidence.
  -- With the close first, the reader ran before the writer and a coalesce handed the panel the
  -- opposite of the truth about a login-less employee. Nothing downstream may observe a half-written
  -- close: everything this close knows is recorded here, and only then does the step close.
  -- close EVIDENCE, not a new terminal value: state stays `skipped`, state_reason stays
  -- `not_attested`, and the reason rides alongside where a reader can find it.
  perform hr.arm_write();$o$;
  v_tail_old constant text := $o$           'notices_sent', v_sent)
   where id = p_step;$o$;
  v_tail_new constant text := $o$           'notices_sent', v_sent)
   where id = p_step;

  -- 🚨 AND ONLY NOW IS THE STEP CLOSED, with every fact about this close already on the row.
  -- `skipped`, NOT `expired` (hr_l3_26 RD 12). attested_at stays NULL; nothing attested on the
  -- employee's behalf. state_reason carries the fact that nobody did.
  perform hr.arm_write();
  v_res := hr._wf_close_step(p_step, 'skipped', 'not_attested');$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  v_def := pg_get_functiondef(v_oid);
  if position('AND ONLY NOW IS THE STEP CLOSED' in v_def) > 0 then
    raise notice 'hr_c4_44: the evidence already precedes the close';
  else
    if position(v_close_old in v_def) = 0 or position(v_tail_old in v_def) = 0 then
      raise exception 'hr_c4_44: hr._wf_not_attested does not carry the expected shape — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_close_old, v_close_new);
    v_new := replace(v_new, v_tail_old,  v_tail_new);
    execute v_new;
    raise notice 'hr_c4_44: the close evidence is written before anything can read it';
  end if;
end
$mig$;

-- ============================================================ 2. an absent fact is named (RD 2)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_r_old constant text := $o$               'attestation_reason', coalesce(v_reason, 'no_response'),$o$;
  v_r_new constant text := $o$               -- 🚨 NEVER DEFAULT AN ABSENT FACT TO THE BLAMING CASE (hr_c4_44). This read
               -- coalesce(v_reason,'no_response') while the ordering bug guaranteed v_reason was
               -- NULL, so every never-askable employee was recorded as one who ignored the ask.
               'attestation_reason', coalesce(v_reason, 'unrecorded'),$o$;
  v_n_old constant text := $o$                 else 'The attestation deadline passed with no action from the employee. The step was closed as not_attested. NOTHING here attested on their behalf.' end)$o$;
  v_n_new constant text := $o$                 when v_reason = 'no_response' then 'The attestation deadline passed with no action from the employee. The step was closed as not_attested. NOTHING here attested on their behalf.'
                 else 'The attestation deadline passed and the step was closed as not_attested. The close did not record which case this was, so it is NOT known whether this employee was ever reachable — this is not a statement that they ignored it. NOTHING here attested on their behalf.' end)$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_wf_apply';
  v_def := pg_get_functiondef(v_oid);
  if position('''unrecorded''' in v_def) > 0 then
    raise notice 'hr_c4_44: the fallback is already honest';
  else
    if position(v_r_old in v_def) = 0 or position(v_n_old in v_def) = 0 then
      raise exception 'hr_c4_44: hr.timecard_wf_apply does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_r_old, v_r_new);
    v_new := replace(v_new, v_n_old, v_n_new);
    execute v_new;
    raise notice 'hr_c4_44: an unrecorded case is named, not defaulted to blame';
  end if;
end
$mig$;

-- ============================================================ 3. the sweep acts NOW (RD 3)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  if not hr.capability(v_uid, 'payroll.read', null, v_per.period_end_on) then$o$;
  v_new constant text := $o$  -- 🚨 AS OF NOW, NOT AS OF THE PERIOD'S END (hr_c4_44). This is a MAINTENANCE act, and it was
  -- gated on standing the actor held on a date in the past. Every payroll.read holder became
  -- effective 2026-08-26 or later, so 12 of 64 pay periods were unsweepable by anybody, forever —
  -- and no passage of time fixes it. Current standing governs what history you may act on
  -- (hr_l3_43). The period's own dates still drive the due-hours clock below, which is a fact about
  -- the period rather than about the actor.
  if not hr.capability(v_uid, 'payroll.read', null, current_date) then$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_attestation_sweep';
  v_def := pg_get_functiondef(v_oid);
  if position('AS OF NOW, NOT AS OF THE PERIOD' in v_def) > 0 then
    raise notice 'hr_c4_44: the sweep already checks standing as of now';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_44: hr.timecard_attestation_sweep does not carry the expected gate — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_44: the sweep checks the actor''s standing as of now';
  end if;
end
$mig$;

-- ============================================================ 4. never-asked is not `awaiting` (RD 4)
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_h_old constant text := $o$case when i.id is null then 'no_flow'
                            when i.state = 'failed' then 'stuck'$o$;
  v_h_new constant text := $o$case when i.id is null then 'no_flow'
                            when i.state = 'failed' then 'stuck'
                            -- 🚨 `awaiting` renders as "Somebody has been asked and the flow is
                            -- alive", and a row whose live step can reach NOBODY was landing there.
                            -- Nobody has been asked. hr_c4_44 — OWED TO L3: its own sentence.
                            when exists (select 1 from hr.workflow_step ws2
                                          where ws2.workflow_instance_id = i.id
                                            and ws2.state in ('active','pending')
                                            and coalesce(cardinality(ws2.resolved_user_ids), 0) = 0)
                              then 'unreachable'$o$;
  v_c_old constant text := $o$                'no_flow',  count(*) filter (where h.health = 'no_flow'),$o$;
  v_c_new constant text := $o$                'no_flow',  count(*) filter (where h.health = 'no_flow'),
                'unreachable', count(*) filter (where h.health = 'unreachable'),$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  v_def := pg_get_functiondef(v_oid);
  if position('''unreachable''' in v_def) > 0 then
    raise notice 'hr_c4_44: the panel already distinguishes unreachable from awaiting';
  else
    if position(v_h_old in v_def) = 0 or position(v_c_old in v_def) = 0 then
      raise exception 'hr_c4_44: hr.pay_period_get does not carry the expected health shape — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_h_old, v_h_new);
    v_new := replace(v_new, v_c_old, v_c_new);
    execute v_new;
    raise notice 'hr_c4_44: a never-askable row reads `unreachable`, not `awaiting`';
  end if;
end
$mig$;

-- ============================================================ 5. repair the derived copies (RD 5)
do $$
declare v_n integer := 0;
begin
  perform hr.arm_write();
  with truth as (
    select i.target_id as ppe_id,
           ws.metadata ->> 'not_attested_reason' as reason,
           ws.metadata ->> 'notified_as'        as flag
      from hr.workflow_step ws
      join hr.workflow_instance i on i.id = ws.workflow_instance_id
     where i.flow_key = 'timecard_attestation'
       and ws.step_key = 'employee_attestation'
       and ws.metadata ? 'not_attested_reason'
  )
  update hr.pay_period_employment ppe
     set metadata = coalesce(ppe.metadata, '{}'::jsonb) || jsonb_build_object(
           'attestation_reason', t.reason,
           'attestation_note', (case when t.reason = 'no_reach'
             then 'This employee holds no platform login, so the attestation was never deliverable to them — nobody asked, and they did not decline. The step was closed as not_attested. NOTHING here attested on their behalf.'
             else 'The attestation deadline passed with no action from the employee. The step was closed as not_attested. NOTHING here attested on their behalf.' end)
             || (case t.flag
                   when 'manager_of_record' then ' The manager of record was notified.'
                   when 'hr_admin_queue' then ' No manager of record exists for this employee, so the flag went to the HR admin queue.'
                   when 'failure_lane_owns_it' then ' This step was never deliverable, so it is already an open item in the HR admin work queue — that is where it is worked, and no second notice was sent.'
                   else ' Nobody could be notified — there is no manager of record and no reachable HR admin — so this row is where the flag sits.' end),
           'attestation_reason_repaired_by', 'hr_c4_44')
    from truth t
   where ppe.id = t.ppe_id
     and ppe.metadata ->> 'attestation_reason' is distinct from t.reason;
  get diagnostics v_n = row_count;
  raise notice 'hr_c4_44: repaired % derived attestation_reason row(s) to match the step evidence', v_n;
end $$;

-- ============================================================ 6. the contracts
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_44';
  delete from hr.function_contract
   where function_name in ('_wf_not_attested','timecard_wf_apply') and home_migration = 'hr_c4_43';
  delete from hr.function_contract
   where function_name = 'pay_period_get' and home_migration = 'hr_c4_41';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('hr', '_wf_not_attested', 'hr_c4_44',
   array['AND ONLY NOW IS THE STEP CLOSED', 'hr.manager_as_of(v_emp',
         'if v_sent = 0 then', 'failure_lane_owns_it',
         'wf.failure_class = ''unactionable_no_reach'''],
   array['''timeout_warning'', null, v_emp'], true,
   'hr_c4_44 (supersedes hr_c4_43): THE EVIDENCE IS WRITTEN BEFORE THE CLOSE. hr._wf_close_step triggers _wf_apply, which READS this step''s metadata; with the close first the reader ran before the writer and hr.timecard_wf_apply''s coalesce handed the panel `no_response` for a login-less employee whose flag HAD been delivered. Every fact about the close must be on the row before the close happens. The D285 substance stands: a real recipient (manager of record, HR admin fallback), notified_as read back from hr._wf_notify''s return, a null user BANNED, and no_reach deferring to the failure work item.'),
  ('hr', 'timecard_wf_apply', 'hr_c4_44',
   array['attestation_reason', 'not_attested_reason', 'never deliverable to them',
         'NOTHING here attested on their behalf', 'notified_as', 'failure_lane_owns_it',
         '''unrecorded''', 'NOT known whether this employee was ever reachable'],
   array['coalesce(v_reason, ''no_response'')',
         'closed as not_attested and flagged to the manager'], true,
   'hr_c4_44: an ABSENT fact must be named, never defaulted to the blaming case. coalesce(v_reason,''no_response'') is BANNED — it fabricated a plausible value while the ordering bug guaranteed the left side was null, and recorded every never-askable employee as one who ignored the ask. The unrecorded wording must keep saying it is not known whether they were reachable, and every notified_as value must keep its own sentence.'),
  ('hr', 'timecard_attestation_sweep', 'hr_c4_44',
   array['current_date', 'attestation_due_hours_after_period_end', 'hr._wf_not_attested'],
   array['''payroll.read'', null, v_per.period_end_on'], true,
   'hr_c4_44: the sweep is a MAINTENANCE act and its authority check is AS OF NOW. Gating on v_per.period_end_on asked whether the actor had standing on a date in the past: every payroll.read holder became effective 2026-08-26 or later, so 12 of 64 pay periods were unsweepable by anybody, forever. The period''s own dates must keep driving the due-hours clock — that is a fact about the period, not about the actor.'),
  ('hr', 'pay_period_get', 'hr_c4_44',
   array['attestation_reason', '''unreachable''', 'resolved_user_ids'], '{}', true,
   'hr_c4_44: the period door must keep surfacing attestation_reason AND must keep classifying a row whose live step can reach nobody as `unreachable` rather than `awaiting`. `awaiting` renders client-side as "Somebody has been asked and the flow is alive", which is a false claim about a never-askable person. The classification is the door''s job — a panel cannot derive it without re-implementing the reachability rule.');
end $$;

-- ============================================================ 7. post-conditions that EXECUTE
do $$
declare v_bad integer; v_before integer; v_res jsonb; v_step uuid; v_ppe uuid; v_reason text;
begin
  -- RD 1, EXECUTED end to end: close a live no-reach step and read what the PANEL was handed
  select ws.id, i.target_id into v_step, v_ppe
    from hr.workflow_step ws join hr.workflow_instance i on i.id = ws.workflow_instance_id
   where i.flow_key = 'timecard_attestation' and ws.step_key = 'employee_attestation'
     and ws.state = 'active' and coalesce(cardinality(ws.resolved_user_ids), 0) = 0
   order by ws.created_at limit 1;
  if v_step is not null then
    begin
      perform hr._wf_not_attested(v_step, null, 'hr_c4_44 post-condition');
      select ppe.metadata ->> 'attestation_reason' into v_reason
        from hr.pay_period_employment ppe where ppe.id = v_ppe;
      if v_reason is distinct from 'no_reach' then
        raise exception 'hr_c4_44: the panel was handed attestation_reason=% for a no-reach close', v_reason;
      end if;
      raise exception 'hr_c4_44_rollback_marker';
    exception
      when others then
        if sqlerrm !~ 'hr_c4_44_rollback_marker' then raise; end if;
    end;
  end if;

  -- RD 5: no derived copy disagrees with its evidence any more
  select count(*) into v_bad
    from hr.workflow_step ws
    join hr.workflow_instance i on i.id = ws.workflow_instance_id
    join hr.pay_period_employment ppe on ppe.id = i.target_id
   where i.flow_key = 'timecard_attestation' and ws.step_key = 'employee_attestation'
     and ws.metadata ? 'not_attested_reason'
     and ppe.metadata ->> 'attestation_reason' is distinct from ws.metadata ->> 'not_attested_reason';
  if v_bad > 0 then
    raise exception 'hr_c4_44: % derived attestation_reason row(s) still disagree with the evidence', v_bad;
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_44: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_44: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_44_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_44: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_44: the writer runs first, the fallback is honest, the sweep acts now';
end $$;
