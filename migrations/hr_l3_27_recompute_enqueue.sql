-- HR domain L3 — migration 27 (register item HRB-015, lane L3 punch + kiosk).
-- Full header lives in matrx-frontend/migrations/hr_l3_27_recompute_enqueue.sql.
--
-- 🚨 THE PRECONDITION IN THE BRIEF IS NOT TRUE YET, AND THIS DOES NOT PRETEND OTHERWISE.
-- `recompute_for_worker` exists but is registered nowhere and called from nowhere (its only
-- occurrence in the repo is its own `def`; its docstring says "This creates no schedule"). The queue
-- dispatches on `scheduler.sch_agent_task.variables->>'tool_name'` against a Python registry, and
-- live there are 61 registered tool_names, NONE of them HR. A job enqueued today would sit in
-- `scheduler.sch_run` forever while the lane LOOKED wired - the exact N1 shape.
-- So: enqueue for real when the handler task exists, and refuse to fabricate a job when it does not.
-- Applied live as `hr_l3_27_recompute_enqueue`. Idempotent.

create or replace function hr._recompute_workweek_start(p_employment_id uuid, p_local_work_date date)
returns date
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  -- the unit is the WORKWEEK, not the day: overtime is computed on the whole week
  select p_local_work_date
       - ((extract(dow from p_local_work_date)::int
           - coalesce((select pg.workweek_start_dow from hr.employment em
                        join hr.pay_group pg on pg.id = em.pay_group_id
                       where em.id = p_employment_id), 0) + 7) % 7);
$$;

create or replace function hr._recompute_enqueue(
  p_employment_id uuid, p_local_work_date date, p_organization_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare v_task uuid; v_week date; v_run uuid;
begin
  begin
    v_week := hr._recompute_workweek_start(p_employment_id, p_local_work_date);

    select t.id into v_task
      from scheduler.sch_task t
      join scheduler.sch_agent_task a on a.id = t.id
     where t.kind = 'tool' and t.enabled and t.deleted_at is null
       and a.variables ->> 'tool_name' = 'hr_time_recompute'
       and t.organization_id in (p_organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
     order by (t.organization_id = p_organization_id) desc
     limit 1;

    if v_task is null then
      return jsonb_build_object('enqueued', false, 'reason', 'no_registered_handler',
        'unit', jsonb_build_object('employment_id', p_employment_id, 'workweek_start', v_week),
        'owed_by', 'aidream: register_system_task("hr_time_recompute", ...) + one sch_task per org',
        'door', 'hr.recompute_enqueue_debt()');
    end if;

    insert into scheduler.sch_run (task_id, organization_id, due_at, status, queue, metadata)
    values (v_task, p_organization_id, now(), 'queued', 'default',
            jsonb_build_object('tool_name','hr_time_recompute',
                               'employment_id', p_employment_id,
                               'workweek_start', v_week,
                               'local_work_date', p_local_work_date,
                               'reason', p_reason,
                               'enqueued_by','hr._recompute_enqueue'))
    returning id into v_run;

    return jsonb_build_object('enqueued', true, 'sch_run_id', v_run, 'task_id', v_task,
      'unit', jsonb_build_object('employment_id', p_employment_id, 'workweek_start', v_week),
      'reason', p_reason);
  exception when others then
    -- the punch has already committed its evidence; recompute is derivable
    return jsonb_build_object('enqueued', false, 'reason', 'enqueue_failed',
      'sqlstate', sqlstate, 'message', left(sqlerrm, 200),
      'note', 'The write committed. Recompute is derivable from the punches and can be re-run.');
  end;
end
$$;

comment on function hr._recompute_enqueue(uuid, date, uuid, text) is
  'The ONE recompute enqueue point. Queues onto scheduler.sch_run when the hr_time_recompute handler task exists; returns enqueued:false rather than fabricating a job nothing dispatches. Never raises - a queue problem must never fail a punch.';

create or replace function hr.recompute_enqueue_debt()
returns jsonb
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  select jsonb_build_object(
    'handler_task_registered', exists (
      select 1 from scheduler.sch_task t join scheduler.sch_agent_task a on a.id = t.id
       where t.kind='tool' and t.enabled and t.deleted_at is null
         and a.variables ->> 'tool_name' = 'hr_time_recompute'),
    'queued_runs', (select count(*) from scheduler.sch_run r
                     where r.status='queued' and r.metadata ->> 'tool_name' = 'hr_time_recompute'),
    'owed_by_aidream', jsonb_build_array(
      'register_system_task("hr_time_recompute", handler calling recompute_for_worker)',
      'one scheduler.sch_task (kind=tool) + sch_agent_task variables.tool_name=hr_time_recompute',
      'the handler must read scheduler.sch_run.metadata for (employment_id, workweek_start) - sch_agent_task.variables is per-task and cannot carry per-call args'));
$$;

-- wire hr.punch_record: declare AND use, in one pass
do $outer$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure;
  if position('_recompute_enqueue' in v_def) > 0 then
    raise notice 'hr_l3_27: punch_record already wired';
  else
    v_def := replace(v_def, E'  v_rest_axis    text;', E'  v_rest_axis    text;\n  v_enq          jsonb;');
    v_def := replace(v_def,
      E'  return jsonb_build_object(\n    ''ok'', true,\n    ''replayed'', false,',
      E'  -- hr_l3_27: a punch changes the week''s computed hours. Never fails the punch.\n  v_enq := hr._recompute_enqueue(p_employment_id, v_date, v_org, ''punch_record'');\n\n  return jsonb_build_object(\n    ''ok'', true,\n    ''replayed'', false,\n    ''recompute'', v_enq,');
    execute v_def;
  end if;
end $outer$;

-- wire hr.punch_correct: one enqueue per affected (employment, day)
do $outer$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_correct(uuid[],jsonb,text)'::regprocedure;
  if position('_recompute_enqueue' in v_def) > 0 then
    raise notice 'hr_l3_27: punch_correct already wired';
  else
    v_def := replace(v_def, E'  v_notified  integer := 0;',
                            E'  v_notified  integer := 0;\n  v_enq       jsonb;\n  v_enqs      jsonb := ''[]''::jsonb;');
    v_def := replace(v_def,
      E'  return jsonb_build_object(\n    ''ok'', true,\n    ''reason'', p_reason,',
      E'  -- hr_l3_27: one enqueue per affected (employment, day); the unit widens to the workweek.\n  for v_item in select * from jsonb_array_elements(v_days) loop\n    v_enq := hr._recompute_enqueue((v_item ->> ''employment_id'')::uuid,\n                                   (v_item ->> ''local_work_date'')::date,\n                                   (select em.organization_id from hr.employment em\n                                     where em.id = (v_item ->> ''employment_id'')::uuid),\n                                   ''punch_correct'');\n    v_enqs := v_enqs || jsonb_build_array(v_enq);\n  end loop;\n\n  return jsonb_build_object(\n    ''ok'', true,\n    ''reason'', p_reason,\n    ''recompute'', v_enqs,');
    execute v_def;
  end if;
end $outer$;

-- wire hr.attendance_exception_resolve (another lane's function, additive only)
do $outer$
declare v_def text; v_anchor text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.attendance_exception_resolve(uuid,text,text,uuid)'::regprocedure;
  if position('_recompute_enqueue' in v_def) > 0 then
    raise notice 'hr_l3_27: exception_resolve already wired';
    return;
  end if;
  -- resolving an exception can write a premium line, which changes the week's computed hours
  v_anchor := 'return hr._time_ok(';
  if position(v_anchor in v_def) = 0 then
    raise notice 'hr_l3_27: exception_resolve has no _time_ok return to anchor on; left unwired (reported)';
    return;
  end if;
  v_def := replace(v_def, v_anchor,
    E'perform hr._recompute_enqueue(v_ae.employment_id, v_ae.local_work_date, v_ae.organization_id, ''attendance_exception_resolve'');\n  return hr._time_ok(');
  execute v_def;
end $outer$;

do $$
declare v_pr text; v_pc text; v_er text;
begin
  v_pr := pg_get_functiondef('hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure);
  v_pc := pg_get_functiondef('hr.punch_correct(uuid[],jsonb,text)'::regprocedure);
  v_er := pg_get_functiondef('hr.attendance_exception_resolve(uuid,text,text,uuid)'::regprocedure);
  if v_pr not like '%hr._recompute_enqueue%' then raise exception 'hr_l3_27: punch_record not wired'; end if;
  if v_pc not like '%hr._recompute_enqueue%' then raise exception 'hr_l3_27: punch_correct not wired'; end if;
  if v_er not like '%hr._recompute_enqueue%' then raise exception 'hr_l3_27: exception_resolve not wired'; end if;
  if to_regprocedure('hr.recompute_enqueue_debt()') is null then
    raise exception 'hr_l3_27: the debt reporter did not land';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) > 0 then
    raise exception 'hr_l3_27: the conformance gate went RED';
  end if;
end $$;
