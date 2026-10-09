-- chair-step: restores the pre-tail ops.perf_vital_rollup body (hourly only, no longer-window fallback) and removes the perf.vital_fallback_hours knob; vital samples already written keep their note.
CREATE OR REPLACE FUNCTION ops.perf_vital_rollup()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_knobs jsonb := ops.perf_knobs();
  v_min int;
  v_keep int;
  v_h1 timestamptz := date_trunc('hour', now());
  v_h0 timestamptz := date_trunc('hour', now()) - interval '1 hour';
  g record;
  v_id uuid;
  v_rec jsonb;
  v_rolled jsonb := '[]'::jsonb;
  v_below jsonb := '[]'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_alert_out jsonb;
  v_deleted int;
begin
  if not coalesce((v_knobs->>'enabled')::boolean, true) then
    return jsonb_build_object('skipped', 'perf.enabled is off');
  end if;
  v_min := coalesce((v_knobs->>'vital_min_n')::int, 30);
  v_keep := coalesce((v_knobs->>'client_raw_retention_days')::int, 7);
  perform set_config('app.user_id', v_actor::text, true);
  perform set_config('lock_timeout', '1s', true);
  for g in
    select e.metric, e.route, count(*)::int n,
           percentile_cont(0.5) within group (order by e.value_ms) p50,
           percentile_cont(0.75) within group (order by e.value_ms) p75,
           percentile_cont(0.95) within group (order by e.value_ms) p95,
           max(e.value_ms) mx, avg(e.value_ms) mean
      from ops.perf_client_event e
     where e.measured_at >= v_h0 and e.measured_at < v_h1 and e.deleted_at is null
     group by e.metric, e.route
     order by e.metric, e.route
  loop
    if g.n < v_min then
      v_below := v_below || jsonb_build_object('metric', g.metric, 'route', g.route, 'n', g.n);
      continue;
    end if;
    select id into v_id from ops.proof_check where slug = 'vital:' || g.metric || ':' || g.route and kind = 'perf';
    if v_id is null then
      v_id := ops.perf_watch_declare('vital:' || g.metric || ':' || g.route, 'vital', g.metric || ' · ' || g.route,
                jsonb_build_object('metric', g.metric, 'route', g.route,
                                   'unit', case when g.metric = 'CLS' then 'CLS × 1000' else 'ms' end,
                                   'budget_basis', 'web.dev "good" threshold at p75'),
                case g.metric when 'LCP' then 2500 when 'INP' then 200 when 'CLS' then 100 when 'TTFB' then 800 else 1800 end,
                'p75', 3600, 'PERF-WATCH', 'perf');
    end if;
    if exists (select 1 from ops.perf_sample where check_id = v_id and source = 'vital' and measured_at = v_h1 and deleted_at is null) then
      continue;   -- this hour is already rolled up
    end if;
    v_rec := ops.perf_record_sample(v_id, 'vital', jsonb_build_object(
               'measured_at', v_h1, 'n', g.n,
               'p50_ms', round(g.p50::numeric, 3), 'p95_ms', round(g.p95::numeric, 3),
               'max_ms', round(g.mx, 3), 'mean_ms', round(g.mean, 3),
               'metadata', jsonb_build_object('p75_ms', round(g.p75::numeric, 3), 'hour_start', v_h0),
               'note', format('%s sampled page loads, %s–%s UTC', g.n, to_char(v_h0 at time zone 'UTC', 'HH24:MI'),
                              to_char(v_h1 at time zone 'UTC', 'HH24:MI'))), true);
    if jsonb_typeof(v_rec->'alert_item') = 'object' then v_alerts := v_alerts || jsonb_build_array(v_rec->'alert_item'); end if;
    v_rolled := v_rolled || jsonb_build_object('metric', g.metric, 'route', g.route, 'n', g.n, 'state', v_rec->>'state');
  end loop;
  if jsonb_array_length(v_alerts) > 0 then
    v_alert_out := ops.perf_alert(v_alerts);
  end if;
  -- Raw rows past retention (bounded per run).
  delete from ops.perf_client_event
   where id in (select id from ops.perf_client_event where measured_at < now() - make_interval(days => v_keep) limit 50000);
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('hour', v_h0, 'rolled', v_rolled, 'below_min_n', v_below, 'alerts', v_alert_out, 'raw_deleted', v_deleted);
end;
$function$;

delete from platform.feature_knob where feature = 'perf' and key = 'vital_fallback_hours';
