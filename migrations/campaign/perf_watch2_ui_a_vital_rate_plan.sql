--
-- perf_watch2_ui_a_vital_rate_plan.sql
--
-- PERF-WATCH-2 (b): every top route must reach the roll-up minimum (perf.vital_min_n = 30 loads in the 24 h window).
-- A per-route sample-rate map, machine-kept: knob perf.client_sample_rate_by_route = {route template: rate}. A
-- sampled page load resolves it (the same ladder read as perf.client_sample_rate) and stores it on the device;
-- every load afterwards makes ONE random draw against the stored rate of its route (else the global rate).
-- ops.perf_vital_rate_plan() (hourly) sets a route to perf.client_sample_rate_low_traffic (1.0) while it has fewer
-- than vital_min_n loads in 24 h, and drops it back to the global rate once it has 2 x vital_min_n (hysteresis, so
-- a route at 30 does not flap). Cost bound: a route at 1.0 sends at most ~2 x 30 batches a day of <= 20 rows.
-- The same function declares the LCP / INP / TTFB watches (p75 against web.dev "good") of every route that has any
-- vital watch, so a metric that is still under the minimum has its watch waiting.
-- Inverse: migrations/inverse/perf_watch2_ui_a_vital_rate_plan_down.sql.

insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('perf', 'client_sample_rate_low_traffic', to_jsonb(1.0), to_jsonb(1.0), 'number', 'share', 0, 1,
   'Page-speed rate for quiet routes',
   'Share of loads that report page speed on a route that has fewer than the minimum loads in 24 hours.',
   'agent', 'PERF-WATCH-2: at the global 5% a route needs about 600 loads a day for 30 samples; a quiet route reports every load until it has them, a few dozen batches of at most 20 rows a day.', date '2027-01-08', '{}'),
  ('perf', 'client_sample_rate_by_route', '{}'::jsonb, '{}'::jsonb, 'json', null, null, null,
   'Page-speed rate per route',
   'Route template to share of loads that report page speed. Kept by ops.perf_vital_rate_plan() every hour; a route not listed uses the global rate.',
   'agent', 'PERF-WATCH-2: written only by the hourly plan (quiet routes at the low-traffic rate until 2 x the roll-up minimum); at most 60 routes, so the map a device stores stays under 4 KB.', date '2027-01-08', '{}')
on conflict (feature, key) do nothing;

CREATE OR REPLACE FUNCTION ops.perf_vital_rate_plan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_knobs jsonb := ops.perf_knobs();
  v_min int := greatest(1, coalesce((v_knobs->>'vital_min_n')::int, 30));
  v_hi int;
  v_rate numeric := greatest(0, least(1, coalesce((v_knobs->>'client_sample_rate_low_traffic')::numeric, 1.0)));
  v_global numeric := coalesce((v_knobs->>'client_sample_rate')::numeric, 0.05);
  v_cur jsonb := case when jsonb_typeof(v_knobs->'client_sample_rate_by_route') = 'object' then v_knobs->'client_sample_rate_by_route' else '{}'::jsonb end;
  v_plan jsonb := '{}'::jsonb;
  v_declared int := 0;
  r record;
  m text;
  v_id uuid;
begin
  if not coalesce((v_knobs->>'enabled')::boolean, true) then
    return jsonb_build_object('skipped', 'perf.enabled is off');
  end if;
  v_hi := v_min * 2;
  -- A global rate of 0 is OFF: no route is boosted past it.
  if v_global > 0 and v_rate > v_global then
    select coalesce(jsonb_object_agg(t.route, v_rate), '{}'::jsonb) into v_plan
      from (select c.route, coalesce(l.loads, 0) loads
              from (select distinct route from ops.perf_client_event
                     where measured_at >= now() - interval '7 days' and deleted_at is null
                    union
                    select distinct perf_subject->>'route' from ops.proof_check
                     where slug like 'pageprobe:%' and is_active and deleted_at is null and perf_subject->>'route' is not null) c
              left join (select x.route, max(x.c) loads
                           from (select route, metric, count(*) c from ops.perf_client_event
                                  where measured_at >= now() - interval '24 hours' and deleted_at is null
                                  group by route, metric) x group by x.route) l on l.route = c.route
             where left(c.route, 1) = '/'
               and case when v_cur ? c.route then coalesce(l.loads, 0) < v_hi else coalesce(l.loads, 0) < v_min end
             order by coalesce(l.loads, 0), c.route
             limit 60) t;
  end if;
  if v_plan is distinct from v_cur then
    update platform.feature_knob set value = v_plan, set_by = 'agent', updated_at = now()
     where feature = 'perf' and key = 'client_sample_rate_by_route';
  end if;
  -- LCP / INP / TTFB watches for every route that has any vital watch (the roll-up declares the metrics that reached n).
  for r in select distinct perf_subject->>'route' as route from ops.proof_check
            where kind = 'perf' and perf_kind = 'vital' and deleted_at is null and perf_subject->>'route' is not null
  loop
    foreach m in array array['LCP', 'INP', 'TTFB'] loop
      if not exists (select 1 from ops.proof_check where slug = 'vital:' || m || ':' || r.route and kind = 'perf') then
        v_id := ops.perf_watch_declare('vital:' || m || ':' || r.route, 'vital', m || ' · ' || r.route,
                  jsonb_build_object('metric', m, 'route', r.route, 'unit', 'ms', 'budget_basis', 'web.dev "good" threshold at p75'),
                  case m when 'LCP' then 2500 when 'INP' then 200 else 800 end, 'p75', 3600, 'PERF-WATCH', 'perf');
        v_declared := v_declared + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('routes', v_plan, 'route_count', (select count(*) from jsonb_object_keys(v_plan)),
                            'min_n', v_min, 'exit_n', v_hi, 'declared_watches', v_declared);
end;
$function$;

comment on function ops.perf_vital_rate_plan() is
  'Hourly (pg_cron perf-watch-vital-rate-plan): keeps knob perf.client_sample_rate_by_route (quiet routes report every load until 2 x perf.vital_min_n loads in 24 h) and declares the LCP/INP/TTFB watches of every route that has a vital watch. Server-only.';

do $grants$
begin
  insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                             reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
         (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
         'Performance watch PERF-WATCH-2 (performance-watch PLAN §2): the hourly page-speed rate plan. It writes one platform knob value and watch rows only.',
         'matrx-frontend/migrations/campaign/perf_watch2_ui_a_vital_rate_plan.sql',
         'server_only: the pg_cron job perf-watch-vital-rate-plan (as postgres) is the only caller; no browser or signed-in client calls it.',
         false, false
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.oid = 'ops.perf_vital_rate_plan()'::regprocedure
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = n.nspname and d.function_name = p.proname
                        and d.identity_args = pg_get_function_identity_arguments(p.oid));
  grant execute on function ops.perf_vital_rate_plan() to service_role;
end
$grants$;

-- Hourly at minute 54: after the roll-up (:50), before the next hour's loads need the plan.
select cron.schedule('perf-watch-vital-rate-plan', '54 * * * *',
  $cmd$SET statement_timeout='60s'; SET lock_timeout='1s'; SELECT ops.perf_vital_rate_plan();$cmd$);
