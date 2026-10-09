-- chair-step: the DELETE is the function's existing raw-row retention (rows past perf.client_raw_retention_days, 50,000 per run), carried over unchanged inside the replaced ops.perf_vital_rollup body; the new behaviour only adds a longer-window roll-up for quiet routes and one knob.
-- based-on: ops.perf_vital_rollup() 197d238b52edf2c7bf9672091f1b87a966322fc95476901cdb9220f74b3634e0
--
-- perf_watch_tail_b_vital_rollup_window.sql
--
-- PERFORMANCE WATCH TAIL, ITEM 2 — PAGE SPEED STOPS BEING SILENT. At 5% sampling no route reached
-- perf.vital_min_n (30) loads in an hour, so no vital watch existed and the page said nothing.
-- Now the hourly roll-up falls back to a longer window (perf.vital_fallback_hours, default 24) for a
-- route that is under the minimum in the hour but has at least that many loads in the window and at
-- least one in this hour; the sample says so in its note and metadata.window_hours. A route that is
-- still under the minimum reports n and "not enough samples yet" through ops.perf_watch_board (file c).
-- The 5% rate knob (perf.client_sample_rate) is untouched.
-- Inverse: migrations/inverse/perf_watch_tail_b_vital_rollup_window_down.sql.

insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('perf', 'vital_fallback_hours', to_jsonb(24), to_jsonb(24), 'integer', 'hours', 2, 168,
   'Page-speed roll-up window for quiet routes',
   'When a route has fewer than the minimum sampled loads in an hour, its page-speed watch is rolled up over this many hours instead.',
   'agent', 'PERF-WATCH-TAIL 2026-10-08: at 5% sampling no route reached 30 loads an hour; a day is the shortest window that lets a moderately used route reach 30 without hiding a same-day regression for long.',
   date '2027-01-08', '{}')
on conflict (feature, key) do nothing;

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
  v_win_h int;
  v_w0 timestamptz;
  v_h1 timestamptz := date_trunc('hour', now());
  v_h0 timestamptz := date_trunc('hour', now()) - interval '1 hour';
  g record;
  v_windowed boolean;
  v_n int;
  v_p50 numeric;
  v_p75 numeric;
  v_p95 numeric;
  v_mx numeric;
  v_mean numeric;
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
  -- WAVE 4: a route too quiet for an hourly roll-up is rolled up over the longer window instead.
  v_win_h := greatest(2, least(coalesce((v_knobs->>'vital_fallback_hours')::int, 24), 168));
  v_w0 := v_h1 - make_interval(hours => v_win_h);
  perform set_config('app.user_id', v_actor::text, true);
  perform set_config('lock_timeout', '1s', true);
  for g in
    select e.metric, e.route,
           count(*) filter (where e.measured_at >= v_h0)::int n_hour,
           count(*)::int n_win,
           percentile_cont(0.5) within group (order by e.value_ms) filter (where e.measured_at >= v_h0) h50,
           percentile_cont(0.75) within group (order by e.value_ms) filter (where e.measured_at >= v_h0) h75,
           percentile_cont(0.95) within group (order by e.value_ms) filter (where e.measured_at >= v_h0) h95,
           max(e.value_ms) filter (where e.measured_at >= v_h0) hmx, avg(e.value_ms) filter (where e.measured_at >= v_h0) hmean,
           percentile_cont(0.5) within group (order by e.value_ms) w50,
           percentile_cont(0.75) within group (order by e.value_ms) w75,
           percentile_cont(0.95) within group (order by e.value_ms) w95,
           max(e.value_ms) wmx, avg(e.value_ms) wmean
      from ops.perf_client_event e
     where e.measured_at >= v_w0 and e.measured_at < v_h1 and e.deleted_at is null
     group by e.metric, e.route
     order by e.metric, e.route
  loop
    -- Hourly when the hour alone has enough loads; else the longer window, provided this hour added
    -- at least one load (an hour with none would only repeat the last sample).
    v_windowed := g.n_hour < v_min;
    if (v_windowed and (g.n_win < v_min or g.n_hour < 1)) then
      v_below := v_below || jsonb_build_object('metric', g.metric, 'route', g.route, 'n_hour', g.n_hour, 'n_window', g.n_win, 'window_hours', v_win_h);
      continue;
    end if;
    v_n := case when v_windowed then g.n_win else g.n_hour end;
    v_p50 := case when v_windowed then g.w50 else g.h50 end;
    v_p75 := case when v_windowed then g.w75 else g.h75 end;
    v_p95 := case when v_windowed then g.w95 else g.h95 end;
    v_mx := case when v_windowed then g.wmx else g.hmx end;
    v_mean := case when v_windowed then g.wmean else g.hmean end;
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
               'measured_at', v_h1, 'n', v_n,
               'p50_ms', round(v_p50::numeric, 3), 'p95_ms', round(v_p95::numeric, 3),
               'max_ms', round(v_mx, 3), 'mean_ms', round(v_mean, 3),
               'metadata', jsonb_build_object('p75_ms', round(v_p75::numeric, 3), 'hour_start', v_h0,
                                              'window_hours', case when v_windowed then v_win_h else 1 end),
               'note', case when v_windowed
                            then format('%s sampled page loads in the %s hours to %s UTC (this hour alone: %s, under %s)', v_n, v_win_h,
                                        to_char(v_h1 at time zone 'UTC', 'HH24:MI'), g.n_hour, v_min)
                            else format('%s sampled page loads, %s–%s UTC', v_n, to_char(v_h0 at time zone 'UTC', 'HH24:MI'),
                                        to_char(v_h1 at time zone 'UTC', 'HH24:MI')) end), true);
    if jsonb_typeof(v_rec->'alert_item') = 'object' then v_alerts := v_alerts || jsonb_build_array(v_rec->'alert_item'); end if;
    v_rolled := v_rolled || jsonb_build_object('metric', g.metric, 'route', g.route, 'n', v_n, 'window_hours', case when v_windowed then v_win_h else 1 end, 'state', v_rec->>'state');
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
