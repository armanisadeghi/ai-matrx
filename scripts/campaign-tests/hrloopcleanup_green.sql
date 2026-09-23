-- LANE HR-LOOP-CLEANUP — THE LOOP'S LEFTOVERS ARE CLEANED UP, AND THE TWO SILENT WRITES SPEAK.
-- GREEN when the three HR-LOOP-CLEANUP files (and VERSION-HISTORY-FIX file (c) under them) are on
-- the database this runs on. RED on their absence. Ends in ROLLBACK: nothing it does is kept.
--
-- THE REAL CASE, as production holds it (2026-09-22, SELECT-only): at Oak Street Studio a leave
-- request's manager-approval step passed its SLA on 2026-08-31. The HR sweep tried to escalate it
-- every 15 minutes, found nobody better each time, and opened a new failure for the HR owner each
-- time — 2,000+ open failures for ONE stuck request, 16,378 across 8 such steps. Separately, when
-- an employee WITHDREW a leave request, the approver's "Leave request — …" task stayed in their
-- inbox forever, because closing it as 'superseded' raised inside the task door and was swallowed.
-- And a bookkeeping team's "Month-end close checklist" workflow could not be published twice under
-- the no-op version rule, because a publish changed nothing but the number.
--
--   1  (file a) no step holds more than one open failure of one class; every duplicate the lane
--      resolved carries its note and a migration_log line; each kept failure names when the
--      problem first occurred
--   2  (file a over c) the next sweep opens no failure and writes no notification for those steps
--   3  (file b) closing an approval holder's task as 'superseded' really closes it (cancelled,
--      stamped) and the function counts only what it closed
--   4  (file b) an escalation that finds nobody better leaves the approver's task OPEN — the
--      supersession is handed back, never a task taken from the person who still holds the step
--   5  (file b) an outcome nobody defined is a named refusal (22023), never swallowed
--   6  (file b) no approval task is open on a closed step
--   7  (file c) with the no-op trigger on workflow.definition, the new publish shape advances the
--      version every time; the old version-only shape is the one it swallows

\set ON_ERROR_STOP on
\set suite 'hrloopcleanup_green.sql'
\set requires 'exec:hr.wf_tick|function:platform.no_change_keeps_its_version'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local statement_timeout = '300s';
set local lock_timeout = '10s';

do $suite$
declare
  v_n int; v_m int; v_res jsonb; v_step uuid; v_task record; v_ret int; v_status text; v_ver int; v_ver2 int;
  v_def uuid; v_state text; v_msg text; v_fail_before int; v_bound boolean;
begin
  -- 1 -------------------------------------------------------------------------------------------
  select count(*) into v_n from (
    select 1 from hr.workflow_failure f
     where f.state in ('open', 'retrying') and f.workflow_step_id is not null
     group by f.workflow_step_id, f.failure_class having count(*) > 1) x;
  if v_n <> 0 then
    raise exception '1: % step(s) still hold more than one open failure of one class (the loop''s duplicates are not resolved — hrloopcleanup_a not applied)', v_n;
  end if;
  select count(*) into v_n from hr.workflow_failure f
   where f.resolution_note like 'HR-LOOP-CLEANUP (2026-09-24):%'
     and not exists (select 1 from history.migration_log m where m.target_id = f.id
                      and m.verb = 'failure_duplicate_resolved' and m.undone_at is null);
  if v_n <> 0 then
    raise exception '1: % resolved duplicate(s) carry the lane''s note but no live migration_log line', v_n;
  end if;
  select count(*), count(*) filter (where f.metadata -> 'hr_loop_cleanup' ? 'first_occurred_at')
    into v_n, v_m
    from history.migration_log m join hr.workflow_failure f on f.id = m.target_id
   where m.verb = 'failure_kept_for_owner' and m.undone_at is null;
  if v_n <> v_m then
    raise exception '1: % of % kept failure(s) do not say when the problem first occurred', v_n - v_m, v_n;
  end if;
  raise notice '1 PASSED — one open failure per step and class; % resolved duplicate(s) noted and logged; % kept failure(s) carry their first occurrence',
    (select count(*) from hr.workflow_failure where resolution_note like 'HR-LOOP-CLEANUP (2026-09-24):%'), v_n;

  -- 2 -------------------------------------------------------------------------------------------
  select count(*) into v_n from hr.workflow_step s
   where s.state = 'active' and s.escalated_at is null and s.resolution_evidence ? 'escalation_refused';
  if v_n = 0 then
    raise notice 'SKIPPED clause 2 — no step on this database is stuck in a refused escalation';
  else
    v_res := hr.wf_tick();
    select count(*) into v_n from hr.workflow_failure f
     where f.created_at = now() and f.workflow_step_id in (
       select s.id from hr.workflow_step s
        where s.state = 'active' and s.escalated_at is null and s.resolution_evidence ? 'escalation_refused');
    if v_n <> 0 then
      raise exception '2: the next sweep opened % new failure(s) for already-refused steps (tick %) — VERSION-HISTORY-FIX file (c) is not live, or the kept failure is not the newest', v_n, v_res;
    end if;
    select count(*) into v_m from communication.notification n
     where n.created_at = now() and n.target_kind = 'hr_workflow_step' and n.target_id in (
       select s.id from hr.workflow_step s
        where s.state = 'active' and s.escalated_at is null and s.resolution_evidence ? 'escalation_refused');
    if v_m <> 0 then
      raise exception '2: the next sweep wrote % notification(s) about the already-refused steps', v_m;
    end if;
    raise notice '2 PASSED — the next sweep opened 0 failures and wrote 0 failure notifications (tick: %)', v_res;
  end if;

  -- 3 -------------------------------------------------------------------------------------------
  select t.id, t.status, t.dedupe_key, s.id as step_id, s.organization_id into v_task
    from workspace.tasks t
    join hr.workflow_step s on s.id::text = split_part(t.dedupe_key, ':', 2)
   where t.dedupe_key like 'hrwf:%' and t.deleted_at is null
     and t.status not in ('completed', 'cancelled', 'dismissed') and s.state = 'active'
     and cardinality(s.resolved_user_ids) = 1
   order by (s.resolution_evidence ? 'escalation_refused') desc, t.updated_at desc
   limit 1;
  if v_task.id is null then
    raise notice 'SKIPPED clauses 3, 4 — no open approval task on an active single-holder step on this database';
  else
    v_step := v_task.step_id;
    perform hr.arm_write();
    v_ret := hr._wf_unproject_step(v_step, 'superseded');
    select status into v_status from workspace.tasks where id = v_task.id;
    if v_status <> 'cancelled' then
      raise exception '3: the superseded task is still %, and the function said it closed % (hr._wf_unproject_step swallowed the refusal — hrloopcleanup_b not applied)', v_status, v_ret;
    end if;
    if v_ret <> 1 or not exists (select 1 from workspace.tasks where id = v_task.id
                                  and metadata -> 'hr_superseded' ->> 'prior_status' = v_task.status) then
      raise exception '3: the task closed but the count (%) or the supersession stamp is wrong', v_ret;
    end if;
    -- a second call closes nothing and says so
    v_ret := hr._wf_unproject_step(v_step, 'superseded');
    if v_ret <> 0 then
      raise exception '3: a second supersession of an already-closed task counted % closed', v_ret;
    end if;
    raise notice '3 PASSED — the superseded task closed (% -> cancelled, stamped) and only real closes are counted', v_task.status;

    -- 4 -----------------------------------------------------------------------------------------
    -- put it back as it was, then run the real escalation door on the real step
    perform hr._wf_project_step(v_step);
    select status into v_status from workspace.tasks where id = v_task.id;
    if not (hr._hr_knob('hr.workflow', 'inbox_project_tasks', v_task.organization_id, null) #>> '{}')::boolean then
      raise notice 'SKIPPED clause 4 — task projection is switched off for this organization';
    else
      if v_status <> v_task.status then
        raise exception '4: projecting the step to the same holder left their task % (expected % again)', v_status, v_task.status;
      end if;
      v_res := hr.wf_escalate(v_step, 'SLA elapsed');
      select t.status into v_status from workspace.tasks t where t.id = v_task.id;
      select count(*) into v_n from workspace.tasks t where t.dedupe_key = v_task.dedupe_key and t.deleted_at is null;
      if (v_res ->> 'granted')::boolean then
        raise notice 'clause 4: the escalation found a better approver (%), so the old holder''s task is % — checking it closed', v_res, v_status;
        if v_status <> 'cancelled' then
          raise exception '4: the step was escalated away but the old holder''s task is still %', v_status;
        end if;
      elsif v_status <> v_task.status or v_n <> 1 then
        raise exception '4: an escalation that found nobody better left the approver''s task % (% row(s)) — expected it open as %', v_status, v_n, v_task.status;
      end if;
      raise notice '4 PASSED — after the escalation (% ) the holder''s task is %, one row', coalesce(v_res ->> 'reason', 'granted'), v_status;
    end if;
  end if;

  -- 5 -------------------------------------------------------------------------------------------
  select id into v_step from hr.workflow_step order by created_at desc limit 1;
  begin
    perform hr._wf_unproject_step(coalesce(v_step, gen_random_uuid()), 'withdrawn');
    raise exception '5: an undefined outcome (withdrawn) was accepted';
  exception when sqlstate '22023' then
    get stacked diagnostics v_msg = message_text;
    raise notice '5 PASSED — an undefined outcome is refused by name: %', v_msg;
  end;

  -- 6 -------------------------------------------------------------------------------------------
  select count(*) into v_n
    from workspace.tasks t join hr.workflow_step s on s.id::text = split_part(t.dedupe_key, ':', 2)
   where t.dedupe_key like 'hrwf:%' and t.deleted_at is null
     and t.status not in ('completed', 'cancelled', 'dismissed')
     and s.state not in ('pending', 'active', 'awaiting_result');
  if v_n <> 0 then
    raise exception '6: % approval task(s) are still open on a closed step', v_n;
  end if;
  raise notice '6 PASSED — no approval task is open on a closed step';

  -- 7 -------------------------------------------------------------------------------------------
  v_bound := exists (select 1 from pg_trigger where tgrelid = 'workflow.definition'::regclass
                      and tgname = 'zzzzz_no_change_keeps_its_version');
  if not v_bound then
    raise exception '7: workflow.definition carries no zzzzz_no_change_keeps_its_version (hrloopcleanup_c not applied)';
  end if;
  select d.id, d.version into v_def, v_ver from workflow.definition d
   where d.deleted_at is null order by d.updated_at desc limit 1;
  if v_def is null then
    raise notice 'SKIPPED clause 7 — no live workflow definition on this database';
  else
    -- the OLD publish: version-only. Twice, so a first-time actor stamp cannot mask it.
    update workflow.definition set version = version + 1 where id = v_def;
    select version into v_ver from workflow.definition where id = v_def;
    update workflow.definition set version = version + 1 where id = v_def;
    select version into v_ver2 from workflow.definition where id = v_def;
    if v_ver2 <> v_ver then
      raise exception '7: a version-only update moved % -> % under the trigger — the no-op rule is not bound as the file says', v_ver, v_ver2;
    end if;
    -- the NEW publish (matrx-graph DefinitionStore.publish since aidream c545fd2fe3), twice
    for v_n in 1..2 loop
      update workflow.definition
         set version = version + 1,
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('published',
                          jsonb_build_object('version', v_ver + v_n, 'at', clock_timestamp(), 'by', null))
       where id = v_def;
      select version into v_ver2 from workflow.definition where id = v_def;
      if v_ver2 <> v_ver + v_n then
        raise exception '7: publish % answered version % (expected %) — the publish is still swallowed', v_n, v_ver2, v_ver + v_n;
      end if;
    end loop;
    raise notice '7 PASSED — the old version-only publish is swallowed (stays %), the new publish advances % -> % -> %',
      v_ver, v_ver, v_ver + 1, v_ver + 2;
  end if;

  raise notice 'hrloopcleanup_green: ALL CLAUSES PASSED (any SKIPPED line above names what this database could not prove)';
end
$suite$;
rollback;
