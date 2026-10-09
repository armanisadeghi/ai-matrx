-- chair-step: the REVOKE withdraws EXECUTE from public/anon/authenticated on ops.perf_job_rebudget, the function this same file creates (service-only like every collector). Nothing that existed before is narrowed.
--
-- perf_watch_tail_d_job_budgets.sql
--
-- PERFORMANCE WATCH TAIL, ITEM 6 — A JOB'S BUDGET COMES FROM THAT JOB'S OWN HISTORY. 18 job watches were
-- declared at the 1,000 ms floor because their jobs had no recent runs when first seen, and a 1,000 ms
-- budget can never alert for a job that takes 10 ms. ops.perf_job_rebudget(p_apply) sets, once, the budget
-- of every active job watch that still sits at the floor (budget = perf.job_budget_floor_ms, never edited
-- by a person) to  max(perf.job_rebudget_floor_ms, perf.job_rebudget_multiple × p95 of the job's succeeded
-- runs in the last 7 days)  — pg_cron jobs from cron.job_run_details, platform scheduler tasks from
-- scheduler.sch_run, else the watch's own samples. A job with no history at all is left alone and named.
-- Every change is recorded in the watch's edit log (metadata.perf_edits / perf_last_edit, same shape as
-- ops.perf_watch_update, with the basis in words) and a person's later edit is never touched: the function
-- skips any watch that has an edit. p_apply false = report only. This file applies it once.
-- Inverse: migrations/inverse/perf_watch_tail_d_job_budgets_down.sql (restores the 1,000 ms budgets and
-- removes the edit entries this file wrote).

insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('perf', 'job_rebudget_multiple', to_jsonb(1.5), to_jsonb(1.5), 'number', 'x', 1, 20,
   'Job budget multiple of its own p95',
   'A job watch still at the floor budget is set to this multiple of the job''s own p95 over the last 7 days.',
   'agent', 'PERF-WATCH-TAIL 2026-10-08: 1.5x p95 alerts on a job that slows by half while one slow outlier cannot trip it (the rule judges the median of 3 samples).',
   date '2027-01-08', '{}'),
  ('perf', 'job_rebudget_floor_ms', to_jsonb(50), to_jsonb(50), 'number', 'ms', 1, 60000,
   'Smallest budget set from a job''s own history',
   'The history-based job budget never goes below this, so a 5 ms job is not alerted for taking 12 ms.',
   'agent', 'PERF-WATCH-TAIL 2026-10-08: job runs are timed to the millisecond by pg_cron (typically 5-30 ms); 50 ms is above scheduling jitter and far below the old 1,000 ms floor.',
   date '2027-01-08', '{}')
on conflict (feature, key) do nothing;

create function ops.perf_job_rebudget(p_apply boolean default false)
returns jsonb
language plpgsql
set search_path = 'pg_catalog', 'public'
as $fn$
declare
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_knobs jsonb := ops.perf_knobs();
  v_floor_old numeric := coalesce((v_knobs->>'job_budget_floor_ms')::numeric, 1000);
  v_mult numeric := coalesce((v_knobs->>'job_rebudget_multiple')::numeric, 1.5);
  v_floor numeric := coalesce((v_knobs->>'job_rebudget_floor_ms')::numeric, 50);
  w record;
  v_p95 numeric;
  v_n int;
  v_src text;
  v_new numeric;
  v_basis text;
  v_changed jsonb := '[]'::jsonb;
  v_left jsonb := '[]'::jsonb;
  v_edit jsonb;
begin
  perform set_config('app.user_id', v_actor::text, true);
  for w in
    select c.* from ops.proof_check c
     where c.kind = 'perf' and c.perf_kind = 'job' and c.is_active and c.deleted_at is null
       and c.budget_ms = v_floor_old and not (c.metadata ? 'perf_edits')
     order by c.slug
  loop
    v_p95 := null; v_n := 0; v_src := null;
    if w.perf_subject->>'scheduler' = 'pg_cron' then
      select percentile_cont(0.95) within group (order by extract(epoch from d.end_time - d.start_time) * 1000), count(*)
        into v_p95, v_n
        from cron.job_run_details d join cron.job j on j.jobid = d.jobid
       where j.jobname = w.perf_subject->>'jobname' and d.status = 'succeeded' and d.end_time is not null
         and d.start_time > now() - interval '7 days';
      v_src := 'succeeded pg_cron runs';
    elsif w.perf_subject->>'scheduler' = 'matrx-scheduler' then
      select percentile_cont(0.95) within group (order by extract(epoch from r.finished_at - r.started_at) * 1000), count(*)
        into v_p95, v_n
        from scheduler.sch_run r
       where r.task_id = (w.perf_subject->>'task_id')::uuid and r.status = 'success'
         and r.started_at is not null and r.finished_at is not null and r.due_at > now() - interval '7 days';
      v_src := 'successful scheduler runs';
    end if;
    if coalesce(v_n, 0) = 0 then
      select percentile_cont(0.95) within group (order by s.p95_ms), count(*) into v_p95, v_n
        from ops.perf_sample s
       where s.check_id = w.id and s.source = 'job' and s.n > 0 and s.errors = 0 and s.p95_ms is not null
         and s.deleted_at is null and s.measured_at > now() - interval '7 days';
      v_src := 'this watch''s own hourly samples';
    end if;
    if coalesce(v_n, 0) = 0 or v_p95 is null then
      v_left := v_left || jsonb_build_object('slug', w.slug, 'why', 'no succeeded run in the last 7 days; stays at the floor');
      continue;
    end if;
    v_new := round(greatest(v_floor, v_mult * v_p95));
    v_basis := format('%s × p95 %s ms of %s %s in the last 7 days (floor %s ms), set once by lane PERF-WATCH-TAIL',
                      v_mult, round(v_p95, 1), v_n, v_src, v_floor);
    v_changed := v_changed || jsonb_build_object('slug', w.slug, 'from', w.budget_ms, 'to', v_new, 'p95_ms', round(v_p95, 1), 'n', v_n);
    if p_apply then
      v_edit := jsonb_build_object('by', v_actor, 'at', now(), 'basis', v_basis,
                                   'changes', jsonb_build_object('budget_ms', jsonb_build_object('from', w.budget_ms, 'to', v_new)));
      update ops.proof_check
         set budget_ms = v_new,
             metadata = metadata || jsonb_build_object('perf_last_edit', v_edit, 'perf_edits', jsonb_build_array(v_edit),
                                                       'perf_budget_basis', v_basis)
       where id = w.id;
    end if;
  end loop;
  return jsonb_build_object('applied', p_apply, 'changed', v_changed, 'left_at_floor', v_left);
end;
$fn$;

comment on function ops.perf_job_rebudget(boolean) is
  'Sets the budget of job watches still at the floor from each job''s own 7-day p95 (perf.job_rebudget_multiple, floor perf.job_rebudget_floor_ms), recorded as an edit; never touches a watch a person edited. p_apply false only reports.';

revoke all on function ops.perf_job_rebudget(boolean) from public, anon, authenticated;
grant execute on function ops.perf_job_rebudget(boolean) to service_role;

select ops.perf_job_rebudget(true);
