-- chair-step: the REVOKE withdraws EXECUTE from public/anon/authenticated on ops.perf_job_collect, the function this same file creates; it is declared in platform.client_callable_door first. Nothing that existed before is narrowed. Emits no policy.
--
-- perf_watch_w3_d_job_durations.sql
--
-- PERFORMANCE WATCH, WAVE 3 — JOB DURATIONS (PLAN §2) + THE views@large RE-PIN, AGAIN.
--   1. ops.perf_job_collect(), hourly (pg_cron perf-watch-jobs, minute 25): for every ACTIVE pg_cron
--      job and every enabled platform scheduler task (scheduler.sch_task of the system organization;
--      sch_run records started_at/finished_at), a watch `job:<jobname>` / `job:sch:<task id>` is
--      declared the first time it is seen, budget = perf.job_budget_multiple (3) × its p95 over the
--      last 7 days, never below perf.job_budget_floor_ms (1000) — the basis is written into the
--      subject. Each run reads the runs that FINISHED since its cursor (cron: runid; scheduler:
--      finished_at, bounded by the (task_id, due_at) index) → one sample: n, p50/p95/max/mean of run
--      time, errors = failed runs. An hour with no finished run writes no sample.
--   2. door:custom.views@large: the 1,000-record Rincon table (w3_a) is refused to the admin seat
--      ("not a member of that organization", although iam.organization_member says owner) — re-pinned
--      to Holloway Creative's largest table WITH saved views, Tasks (355 records, 1 view), where the
--      member seat reaches it too, so views@member@large exists.
-- Inverse: migrations/inverse/perf_watch_w3_d_job_durations_down.sql.

create or replace function ops.perf_job_collect()
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_knobs jsonb := ops.perf_knobs();
  v_mult numeric;
  v_floor numeric;
  j record;
  w record;
  v_id uuid;
  v_p95 numeric;
  v_n7 int;
  v_cursor bigint;
  v_next bigint;
  v_cursor_at timestamptz;
  v_next_at timestamptz;
  v_stats record;
  v_last_err text;
  v_declared jsonb := '[]'::jsonb;
  v_sampled jsonb := '[]'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_rec jsonb;
  v_alert_out jsonb;
begin
  if not coalesce((v_knobs->>'enabled')::boolean, true) then
    return jsonb_build_object('skipped', 'perf.enabled is off');
  end if;
  v_mult := coalesce((v_knobs->>'job_budget_multiple')::numeric, 3);
  v_floor := coalesce((v_knobs->>'job_budget_floor_ms')::numeric, 1000);
  perform set_config('app.user_id', v_actor::text, true);
  perform set_config('lock_timeout', '1s', true);

  -- ── pg_cron jobs ─────────────────────────────────────────────────────────────────────────────
  for j in select jobid, jobname, schedule from cron.job where active and jobname is not null order by jobname loop
    select * into w from ops.proof_check where slug = 'job:' || j.jobname and kind = 'perf';
    if not found then
      select percentile_cont(0.95) within group (order by extract(epoch from d.end_time - d.start_time) * 1000), count(*)
        into v_p95, v_n7
        from cron.job_run_details d
       where d.jobid = j.jobid and d.status = 'succeeded' and d.end_time is not null
         and d.start_time > now() - interval '7 days';
      v_id := ops.perf_watch_declare('job:' || j.jobname, 'job', 'pg_cron · ' || j.jobname,
                jsonb_build_object('scheduler', 'pg_cron', 'jobname', j.jobname, 'schedule', j.schedule,
                                   'budget_basis', format('%s × p95 %s ms of %s succeeded runs in the 7 days before %s (floor %s ms)',
                                                          v_mult, coalesce(round(v_p95)::text, 'n/a'), v_n7, now()::date, v_floor)),
                round(greatest(v_floor, v_mult * coalesce(v_p95, 0))), 'p95', 3600, 'PERF-WATCH', 'perf');
      v_declared := v_declared || to_jsonb('job:' || j.jobname);
      select * into w from ops.proof_check where id = v_id;
    end if;
    if not w.is_active or w.deleted_at is not null then continue; end if;
    -- First run: the last hour. After that: every run that finished since the cursor (runid is monotonic).
    v_cursor := nullif(w.metadata->>'perf_job_cursor_runid', '')::bigint;
    if v_cursor is null then
      select coalesce(max(d.runid), 0) into v_cursor from cron.job_run_details d
       where d.jobid = j.jobid and d.start_time <= now() - interval '1 hour';
    end if;
    select count(*) n,
           count(*) filter (where d.status = 'failed') errs,
           percentile_cont(0.5) within group (order by extract(epoch from d.end_time - d.start_time) * 1000) p50,
           percentile_cont(0.95) within group (order by extract(epoch from d.end_time - d.start_time) * 1000) p95,
           max(extract(epoch from d.end_time - d.start_time) * 1000) mx,
           avg(extract(epoch from d.end_time - d.start_time) * 1000) mean,
           max(d.runid) last_runid
      into v_stats
      from cron.job_run_details d
     where d.jobid = j.jobid and d.runid > v_cursor and d.status in ('succeeded', 'failed') and d.end_time is not null;
    -- A run still going holds the cursor below it, so it is counted when it finishes.
    select least(coalesce(v_stats.last_runid, v_cursor), coalesce(min(d.runid) - 1, coalesce(v_stats.last_runid, v_cursor)))
      into v_next from cron.job_run_details d
     where d.jobid = j.jobid and d.runid > v_cursor and d.status in ('starting', 'running');
    update ops.proof_check set metadata = metadata || jsonb_build_object('perf_job_cursor_runid', greatest(v_next, v_cursor))
     where id = w.id;
    if coalesce(v_stats.n, 0) = 0 then continue; end if;
    select left(d.return_message, 200) into v_last_err from cron.job_run_details d
     where d.jobid = j.jobid and d.runid > v_cursor and d.status = 'failed' order by d.runid desc limit 1;
    v_rec := ops.perf_record_sample(w.id, 'job', jsonb_build_object(
               'n', v_stats.n, 'errors', v_stats.errs,
               'p50_ms', round(v_stats.p50::numeric, 3), 'p95_ms', round(v_stats.p95::numeric, 3),
               'max_ms', round(v_stats.mx::numeric, 3), 'mean_ms', round(v_stats.mean::numeric, 3),
               'note', concat_ws(' · ', format('%s run(s) finished since the last collection', v_stats.n),
                                 case when v_stats.errs > 0 then format('%s failed: %s', v_stats.errs, v_last_err) end)), true);
    if jsonb_typeof(v_rec->'alert_item') = 'object' then v_alerts := v_alerts || jsonb_build_array(v_rec->'alert_item'); end if;
    v_sampled := v_sampled || jsonb_build_object('slug', w.slug, 'n', v_stats.n, 'errors', v_stats.errs, 'state', v_rec->>'state');
  end loop;

  -- ── Platform scheduler tasks (scheduler.sch_run records started_at / finished_at) ────────────
  for j in select t.id, t.title from scheduler.sch_task t
            where t.organization_id = v_sys and t.enabled and t.deleted_at is null order by t.title loop
    select * into w from ops.proof_check where slug = 'job:sch:' || j.id and kind = 'perf';
    if not found then
      select percentile_cont(0.95) within group (order by extract(epoch from r.finished_at - r.started_at) * 1000), count(*)
        into v_p95, v_n7
        from scheduler.sch_run r
       where r.task_id = j.id and r.due_at > now() - interval '7 days' and r.status = 'success'
         and r.started_at is not null and r.finished_at is not null;
      v_id := ops.perf_watch_declare('job:sch:' || j.id, 'job', 'scheduler · ' || j.title,
                jsonb_build_object('scheduler', 'matrx-scheduler', 'task_id', j.id, 'title', j.title,
                                   'budget_basis', format('%s × p95 %s ms of %s successful runs in the 7 days before %s (floor %s ms)',
                                                          v_mult, coalesce(round(v_p95)::text, 'n/a'), v_n7, now()::date, v_floor)),
                round(greatest(v_floor, v_mult * coalesce(v_p95, 0))), 'p95', 3600, 'PERF-WATCH', 'perf');
      v_declared := v_declared || to_jsonb('job:sch:' || j.id);
      select * into w from ops.proof_check where id = v_id;
    end if;
    if not w.is_active or w.deleted_at is not null then continue; end if;
    v_cursor_at := coalesce(nullif(w.metadata->>'perf_job_cursor_at', '')::timestamptz, now() - interval '1 hour');
    select count(*) n,
           count(*) filter (where r.status in ('failed', 'interrupted')) errs,
           percentile_cont(0.5) within group (order by extract(epoch from r.finished_at - r.started_at) * 1000) p50,
           percentile_cont(0.95) within group (order by extract(epoch from r.finished_at - r.started_at) * 1000) p95,
           max(extract(epoch from r.finished_at - r.started_at) * 1000) mx,
           avg(extract(epoch from r.finished_at - r.started_at) * 1000) mean,
           max(r.finished_at) last_at
      into v_stats
      from scheduler.sch_run r
     where r.task_id = j.id and r.due_at > v_cursor_at - interval '1 day'
       and r.finished_at > v_cursor_at and r.started_at is not null and r.status <> 'skipped';
    v_next_at := coalesce(v_stats.last_at, v_cursor_at);
    update ops.proof_check set metadata = metadata || jsonb_build_object('perf_job_cursor_at', v_next_at) where id = w.id;
    if coalesce(v_stats.n, 0) = 0 then continue; end if;
    select left(r.error_message, 200) into v_last_err from scheduler.sch_run r
     where r.task_id = j.id and r.due_at > v_cursor_at - interval '1 day' and r.finished_at > v_cursor_at
       and r.status in ('failed', 'interrupted') order by r.finished_at desc limit 1;
    v_rec := ops.perf_record_sample(w.id, 'job', jsonb_build_object(
               'n', v_stats.n, 'errors', v_stats.errs,
               'p50_ms', round(v_stats.p50::numeric, 3), 'p95_ms', round(v_stats.p95::numeric, 3),
               'max_ms', round(v_stats.mx::numeric, 3), 'mean_ms', round(v_stats.mean::numeric, 3),
               'note', concat_ws(' · ', format('%s run(s) finished since the last collection', v_stats.n),
                                 case when v_stats.errs > 0 then format('%s failed: %s', v_stats.errs, v_last_err) end)), true);
    if jsonb_typeof(v_rec->'alert_item') = 'object' then v_alerts := v_alerts || jsonb_build_array(v_rec->'alert_item'); end if;
    v_sampled := v_sampled || jsonb_build_object('slug', w.slug, 'n', v_stats.n, 'errors', v_stats.errs, 'state', v_rec->>'state');
  end loop;

  if jsonb_array_length(v_alerts) > 0 then
    v_alert_out := ops.perf_alert(v_alerts);
  end if;
  return jsonb_build_object('declared', v_declared, 'sampled', v_sampled, 'alerts', v_alert_out);
end;
$function$;

do $grants$
begin
  insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                             reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
  select 'ops', 'perf_job_collect', '', '{}'::oid[],
         'Performance watch job-duration collector (performance-watch PLAN §2): reads pg_cron and scheduler run history and writes platform-scoped job watches and samples. Takes no argument.',
         'matrx-frontend/migrations/campaign/perf_watch_w3_d_job_durations.sql',
         'server_only: the pg_cron job perf-watch-jobs (as postgres) is the only caller; no browser or signed-in client ever runs a collector.',
         false, false
   where not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = 'ops' and d.function_name = 'perf_job_collect' and d.identity_args = '');
  revoke all on function ops.perf_job_collect() from public, anon, authenticated;
  grant execute on function ops.perf_job_collect() to service_role;
end
$grants$;

-- Hourly at minute 25 (between the statement collector at :05 and the health check at :35).
select cron.schedule('perf-watch-jobs', '25 * * * *',
  $cmd$SET statement_timeout='60s'; SET lock_timeout='1s'; SELECT ops.perf_job_collect();$cmd$);

-- ── views@large → Holloway Creative's Tasks (355 records, 1 saved view); its member twin ──────
select ops.perf_watch_declare('door:custom.views@large', 'door', p.label,
         jsonb_build_object('schema', 'custom', 'function', 'views', 'argtypes', 'uuid, uuid', 'table_records', 355,
                            'args', jsonb_build_object('p_organization_id', '344cfaa8-2b0c-4971-854a-9694614816f2',
                                                       'p_table_id', '1193d215-3dfc-42e4-9844-b23155377360')),
         p.budget_ms, p.budget_stat, p.live_every_seconds, p.owner, p.source_feature)
  from ops.proof_check p where p.slug = 'door:custom.views@large';
select ops.perf_watch_declare('door:custom.views@member@large', 'door', p.label || ' · member seat',
         p.perf_subject || '{"seat_email": "hugo.waelchi.cfd403@fixtures.aimatrx.com"}'::jsonb,
         300, 'p95', p.live_every_seconds, 'PERF-WATCH', p.source_feature)
  from ops.proof_check p where p.slug = 'door:custom.views@large';
