-- based-on: ops.perf_watch_board(integer, integer) 11d108be13f1d767953fe0749d3c59da5be69b3cbcd5f0b590f8fdb4c67ec195
--
-- perf_watch_tail_f_board_slimmer.sql
--
-- PERFORMANCE WATCH TAIL, ITEM 5 (measured after file c) — a sparkline point is smaller still: only its
-- id, time, source, p50 / p95 / mean (p75 for a vital), state and nothing null. The page's list needs
-- the judged number and the state change of every point; n, max, calls and errors are read from the newest
-- sample or, on open, from ops.perf_watch_history. Same signature, grants and sections as file c.
-- Inverse: migrations/inverse/perf_watch_tail_f_board_slimmer_down.sql.

CREATE OR REPLACE FUNCTION ops.perf_watch_board(p_days integer DEFAULT 7, p_points integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
  v_points integer := greatest(2, least(coalesce(p_points, 60), 120));
  v_knobs jsonb;
  v_min_n int;
  v_win_h int;
  v_out jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can read performance watches.' using errcode = '42501';
  end if;
  v_knobs := ops.perf_knobs();
  v_min_n := coalesce((v_knobs->>'vital_min_n')::int, 30);
  v_win_h := greatest(2, least(coalesce((v_knobs->>'vital_fallback_hours')::int, 24), 168));

  with w as (
    select c.id, c.slug, c.label, c.owner, c.source_feature, c.is_active, c.live_every_seconds, c.perf_kind,
           c.perf_subject, c.budget_ms, c.budget_stat, c.perf_state, c.perf_state_since, c.perf_baseline_ms,
           c.perf_baseline_pinned, c.perf_last_alert_at,
           -- The edit log is read when a watch is opened, never with the list.
           c.metadata - 'perf_edits' as metadata
      from ops.proof_check c
     where c.kind = 'perf' and c.deleted_at is null
  ), s as (
    select x.id, x.check_id, x.measured_at, x.source, x.n, x.p50_ms, x.p95_ms, x.max_ms, x.mean_ms, x.calls,
           x.errors, x.bytes, x.release_sha, x.state_after, x.note, x.metadata,
           row_number() over (partition by x.check_id order by x.measured_at desc, x.id) as rn,
           count(*) over (partition by x.check_id) as cnt
      from ops.perf_sample x
      join w on w.id = x.check_id
     where x.deleted_at is null and x.measured_at >= v_since
  ), kept as (
    select s.*,
           (s.rn = 1 or coalesce((s.metadata ->> 'perf_marker')::boolean, false)) as detailed
      from s
     where s.rn = 1
        or coalesce((s.metadata ->> 'perf_marker')::boolean, false)
        or (s.rn - 1) % greatest(1, ceil(s.cnt::numeric / v_points)::integer) = 0
  ), slim as (
    -- The newest sample and every marker keep their words; a sparkline point is only the judged numbers and the state.
    select k.check_id, k.measured_at, k.id,
           case when k.detailed
                then jsonb_build_object('id', k.id, 'check_id', k.check_id, 'measured_at', k.measured_at, 'source', k.source,
                       'n', k.n, 'p50_ms', k.p50_ms, 'p95_ms', k.p95_ms, 'max_ms', k.max_ms, 'mean_ms', k.mean_ms,
                       'calls', k.calls, 'errors', k.errors, 'bytes', k.bytes, 'release_sha', k.release_sha,
                       'state_after', k.state_after, 'note', k.note, 'metadata', k.metadata)
                else jsonb_strip_nulls(jsonb_build_object('id', k.id, 'check_id', k.check_id, 'measured_at', k.measured_at, 'source', k.source,
                       'p50_ms', k.p50_ms, 'p95_ms', k.p95_ms, 'mean_ms', k.mean_ms, 'state_after', k.state_after,
                       'metadata', case when k.metadata ? 'p75_ms' then jsonb_build_object('p75_ms', k.metadata -> 'p75_ms') else '{}'::jsonb end))
           end as j
      from kept k
  )
  select jsonb_build_object(
           'watches', coalesce((select jsonb_agg(to_jsonb(w) order by w.slug) from w), '[]'::jsonb),
           'recent', coalesce((select jsonb_agg(sl.j order by sl.measured_at desc, sl.id) from slim sl), '[]'::jsonb),
           'since', v_since,
           'points', v_points,
           -- Collector health: every perf cron job, its newest run, and the probe split's door counts.
           'collectors', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'job', j.jobname, 'schedule', j.schedule,
                      'timeout_seconds', nullif(substring(j.command from 'statement_timeout=''(\d+)s'''), '')::int,
                      'group', substring(j.jobname from '^perf-watch-probe-(.*)$'),
                      'doors', case when j.jobname like 'perf-watch-probe-%'
                                    then (select count(*) from w where w.perf_kind = 'door' and w.is_active
                                             and ops.perf_probe_group(w.perf_subject) = substring(j.jobname from '^perf-watch-probe-(.*)$')) end,
                      'last_started_at', r.start_time,
                      'last_seconds', round(extract(epoch from r.end_time - r.start_time)::numeric, 1),
                      'last_status', r.status) order by j.jobname)
               from cron.job j
               left join lateral (select d.start_time, d.end_time, d.status from cron.job_run_details d
                                   where d.jobid = j.jobid order by d.start_time desc limit 1) r on true
              where j.jobname like 'perf-watch-%'), '[]'::jsonb),
           -- Page speed: loads counted per route over the roll-up window, and whether a watch exists yet.
           'vitals', jsonb_build_object(
             'min_n', v_min_n, 'window_hours', v_win_h,
             'sample_rate', (v_knobs ->> 'client_sample_rate')::numeric,
             'routes', coalesce((
               select jsonb_agg(jsonb_build_object('metric', t.metric, 'route', t.route, 'n_window', t.n_window,
                                                   'n_hour', t.n_hour, 'has_watch', t.has_watch) order by t.n_window desc, t.metric, t.route)
                 from (select e.metric, e.route, count(*)::int n_window,
                              (count(*) filter (where e.measured_at >= date_trunc('hour', now()) - interval '1 hour'))::int n_hour,
                              exists (select 1 from w where w.slug = 'vital:' || e.metric || ':' || e.route) has_watch
                         from ops.perf_client_event e
                        where e.measured_at >= now() - make_interval(hours => v_win_h) and e.deleted_at is null
                        group by e.metric, e.route
                        order by count(*) desc, e.metric, e.route
                        limit 40) t), '[]'::jsonb)))
    into v_out;
  return v_out;
end;
$function$;
