-- LANE VERSION-HISTORY-FIX — THE HR SWEEP STOPS RE-SAVING IDENTICAL ROWS EVERY FIFTEEN MINUTES.
-- GREEN when one run of the scheduled sweep (`hr.wf_tick()`, aidream schedule `hr_workflow_tick`,
-- every 15 min) leaves alone a step whose escalation was already refused and whose failure an HR
-- owner has not yet worked, and when projecting an unchanged approval task writes nothing.
-- RED on the bytes' absence. Ends in ROLLBACK.
--
-- THE REAL CASE, as production holds it (2026-09-23, SELECT-only): at Oak Street Studio a leave
-- request's `manager_approval` step passed its SLA on 2026-08-31. Escalation re-resolves the
-- approver while excluding the current one, finds nobody better ("every candidate the fallback
-- chain produced was disqualified"), restores the step exactly as it was — and leaves
-- `escalated_at` NULL, so the next sweep picks the same step again. Every 15 minutes, for each
-- of 8 such steps: a new `hr.workflow_failure` row and a `failure_raised` notification to the HR
-- owner (16,366 failure rows, 16,361 open), a revoke + re-grant of the approver's access, a
-- no-op `update hr.workflow_step_definition set resolver_kind = resolver_kind`, and a re-save of
-- the identical approval task in `workspace.tasks` — 16,300+ phantom versions on each table.
--
--   1  a sweep over the stuck steps opens NO new failure for a step that already has an open
--      failure from its refused escalation (and so sends the HR owner no new notification)
--   2  the sweep moves no `hr.workflow_step_definition` version and no `workspace.tasks` version
--      of those steps
--   3  `wsp_upsert_system_task` with the arguments a task already holds writes nothing (version and
--      updated_at unchanged); with a new title it writes once
--   4  once the HR owner resolves the open failures, the next sweep tries the escalation again —
--      exactly once — so a request is never silently parked

\set ON_ERROR_STOP on
\set suite 'versionhistoryfix_loop_green.sql'
\set requires 'exec:hr.wf_tick'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local statement_timeout = '300s';
set local lock_timeout = '10s';

create temporary table _stuck on commit drop as
select s.id, s.step_definition_id, s.organization_id
  from hr.workflow_step s
 where s.state = 'active' and s.escalated_at is null
   and s.resolution_evidence ? 'escalation_refused'
   and exists (select 1 from hr.workflow_failure f
                where f.workflow_step_id = s.id and f.state in ('open', 'retrying'));

create temporary table _before on commit drop as
select 'step_definition' what, d.id, d.version from hr.workflow_step_definition d
 where d.id in (select step_definition_id from _stuck)
union all
select 'task', t.id, t.version from workspace.tasks t
 where t.dedupe_key like any (select 'hrwf:' || id::text || ':%' from _stuck);

do $suite$
declare
  v_n int; v_moved text; v_res jsonb; v_task uuid; v_ver int; v_upd timestamptz; v_ver2 int; v_upd2 timestamptz;
  v_step uuid; t record;
begin
  select count(*) into v_n from _stuck;
  if v_n = 0 then
    raise notice 'SKIPPED clauses 1, 2, 4 — no step on this database is stuck in a refused escalation (the branch carries no HR workflow data); clause 3 still runs';
  else
    raise notice 'SETUP — % step(s) stuck in a refused escalation with an open failure', v_n;

    v_res := hr.wf_tick();
    select count(*) into v_n from hr.workflow_failure f
     where f.workflow_step_id in (select id from _stuck) and f.created_at = now();
    if v_n <> 0 then
      raise exception '1: one sweep opened % new failure row(s) for steps whose refused escalation already has an open failure (tick said %)', v_n, v_res;
    end if;
    raise notice '1 PASSED — the sweep opened no new failure for an already-refused escalation (tick: %)', v_res;

    select string_agg(format('%s %s v%s -> v%s', b.what, b.id, b.version, coalesce(d.version, t2.version)), '; ')
      into v_moved
      from _before b
      left join hr.workflow_step_definition d on b.what = 'step_definition' and d.id = b.id
      left join workspace.tasks t2 on b.what = 'task' and t2.id = b.id
     where coalesce(d.version, t2.version) <> b.version;
    if v_moved is not null then
      raise exception '2: the sweep re-saved rows that did not change: %', left(v_moved, 1500);
    end if;
    raise notice '2 PASSED — % step-definition / task row(s) of those steps kept their version', (select count(*) from _before);
  end if;

  -- 3: projecting an unchanged approval task writes nothing
  select * into t from workspace.tasks
   where dedupe_key like 'hrwf:%' and deleted_at is null and status not in ('completed','cancelled','dismissed')
   order by updated_at desc limit 1;
  if t.id is null then
    select * into t from workspace.tasks
     where dedupe_key is not null and deleted_at is null and status not in ('completed','cancelled','dismissed')
     order by updated_at desc limit 1;
  end if;
  if t.id is null then
    raise notice 'SKIPPED clause 3 — no open system task with a dedupe key on this database';
  else
  v_ver := t.version; v_upd := t.updated_at;
  perform public.wsp_upsert_system_task(t.dedupe_key, t.title, t.description, t.origin, t.source_type,
    t.source_id, t.source_url, t.source_label, t.due_date, null, t.assignee_id, t.organization_id, t.project_id, '{}'::jsonb);
  select version, updated_at into v_ver2, v_upd2 from workspace.tasks where id = t.id;
  if v_ver2 <> v_ver or v_upd2 <> v_upd then
    raise exception '3: re-projecting an unchanged task moved it v% -> v%, updated_at % -> %', v_ver, v_ver2, v_upd, v_upd2;
  end if;
  perform public.wsp_upsert_system_task(t.dedupe_key, t.title || ' (renamed)', t.description, t.origin, t.source_type,
    t.source_id, t.source_url, t.source_label, t.due_date, null, t.assignee_id, t.organization_id, t.project_id, '{}'::jsonb);
  select version into v_ver2 from workspace.tasks where id = t.id;
  if v_ver2 <> v_ver + 1 then
    raise exception '3: a real title change moved the task v% -> v% (expected one step)', v_ver, v_ver2;
  end if;
  raise notice '3 PASSED — an unchanged projection wrote nothing; a new title wrote once (v% -> v%)', v_ver, v_ver2;
  end if;

  -- 4: the HR owner works the failure; the sweep retries once
  select id into v_step from _stuck order by id limit 1;
  if v_step is not null then
    perform hr.arm_write();
    update hr.workflow_failure set state = 'resolved'
     where workflow_step_id = v_step and state in ('open', 'retrying');
    v_res := hr.wf_tick();
    select count(*) into v_n from hr.workflow_failure f where f.workflow_step_id = v_step and f.created_at = now();
    if v_n <> 1 then
      raise exception '4: after the HR owner resolved the failures, the sweep opened % new failure(s) for the step — expected exactly 1 (one retry)', v_n;
    end if;
    v_res := hr.wf_tick();
    select count(*) into v_n from hr.workflow_failure f where f.workflow_step_id = v_step and f.created_at = now();
    if v_n <> 1 then
      raise exception '4: a second sweep opened another failure (now %) — the retry loops again', v_n;
    end if;
    raise notice '4 PASSED — the HR owner resolved it, the sweep retried the escalation exactly once';
  end if;

  raise notice 'versionhistoryfix_loop_green: ALL CLAUSES PASSED (any SKIPPED line above names what this database could not prove)';
end
$suite$;
rollback;
