-- based-on: ops.perf_vital_rate_plan() 097d94ecd7b33966217f877c54e5f60a6a8e3fcb3d4e15eec94a3fa44d88f525
--
-- perf_watch2_ui_b_slow_pages.sql
--
-- PERF-WATCH-2 (c): ops.perf_slow_pages(p_days) — the "Slowest pages" section of
-- /administration/reporting/performance in ONE call, platform admins only (42501 for anyone else).
-- One row per route (real-user events of the last p_days, plus every route that has a pageprobe watch):
-- p75 LCP / INP / TTFB with n, a daily p75 LCP trend, the sibling `pageprobe:<route>` watch's newest
-- synthetic TTFB p95, HTML KB and first-load JS KB, and the flagged why, computed here so the page only draws:
--   big_bundle   first_load_js_kb > first_load_js_budget_kb            -> the pageprobe watch
--   slow_server  synthetic TTFB p95 over the probe's budget (or, with no synthetic number yet, real TTFB p75 over
--                800 ms)                                               -> the pageprobe / vital TTFB watch
--   slow_db_door a door in perf_subject.door_slugs is over_budget or regressed -> that door's watch
--   slow_client  LCP p75 over 2500 ms with TTFB fine (<= 800 ms or none) -> the vital LCP watch
-- A route with no pageprobe watch has null probe columns; nothing here needs one to exist.
-- Also: the rate plan keeps the 100 routes closest to the minimum (was the 60 quietest).
-- Inverse: migrations/inverse/perf_watch2_ui_b_slow_pages_down.sql.

CREATE OR REPLACE FUNCTION ops.perf_slow_pages(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 30));
  v_first timestamptz := date_trunc('day', now()) - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)) - 1);
  v_knobs jsonb;
  v_min_n int;
  v_out jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can read performance watches.' using errcode = '42501';
  end if;
  v_knobs := ops.perf_knobs();
  v_min_n := coalesce((v_knobs->>'vital_min_n')::int, 30);

  with ev as (
    select e.route, e.metric, e.value_ms, e.measured_at
      from ops.perf_client_event e
     where e.deleted_at is null and e.measured_at >= v_first
       and e.metric in ('LCP', 'INP', 'TTFB')
  ), agg as (
    select ev.route,
           count(*) filter (where metric = 'LCP')::int n_lcp,
           count(*) filter (where metric = 'INP')::int n_inp,
           count(*) filter (where metric = 'TTFB')::int n_ttfb,
           round((percentile_cont(0.75) within group (order by value_ms) filter (where metric = 'LCP'))::numeric, 1) lcp_p75,
           round((percentile_cont(0.75) within group (order by value_ms) filter (where metric = 'INP'))::numeric, 1) inp_p75,
           round((percentile_cont(0.75) within group (order by value_ms) filter (where metric = 'TTFB'))::numeric, 1) ttfb_p75
      from ev group by ev.route
  ), pp as (
    select c.id, coalesce(c.perf_subject->>'route', substr(c.slug, length('pageprobe:') + 1)) route,
           c.budget_ms, c.perf_state, c.perf_subject,
           s.p95_ms, s.bytes, s.measured_at probe_at
      from ops.proof_check c
      left join lateral (select x.p95_ms, x.bytes, x.measured_at from ops.perf_sample x
                          where x.check_id = c.id and x.deleted_at is null
                            and coalesce((x.metadata->>'perf_marker')::boolean, false) is not true
                          order by x.measured_at desc limit 1) s on true
     where c.kind = 'perf' and c.slug like 'pageprobe:%' and c.deleted_at is null
  ), routes as (
    select route from agg union select route from pp
  ), days as (
    select g::timestamptz as day from generate_series(date_trunc('day', v_first), date_trunc('day', now()), interval '1 day') g
  ), per_day as (
    select route, date_trunc('day', measured_at) as day,
           round((percentile_cont(0.75) within group (order by value_ms))::numeric, 1) p75
      from ev where metric = 'LCP' group by 1, 2
  ), trend as (
    select r.route, jsonb_agg(pd.p75 order by d.day) series
      from routes r cross join days d
      left join per_day pd on pd.route = r.route and pd.day = d.day
     group by r.route
  ), vw as (
    select c.perf_subject->>'route' route,
           max(c.id::text) filter (where c.perf_subject->>'metric' = 'LCP') lcp_id,
           max(c.id::text) filter (where c.perf_subject->>'metric' = 'INP') inp_id,
           max(c.id::text) filter (where c.perf_subject->>'metric' = 'TTFB') ttfb_id
      from ops.proof_check c
     where c.kind = 'perf' and c.perf_kind = 'vital' and c.deleted_at is null
     group by 1
  ), base as (
    select r.route,
           greatest(coalesce(a.n_lcp, 0), coalesce(a.n_ttfb, 0), coalesce(a.n_inp, 0)) loads,
           coalesce(a.n_lcp, 0) n_lcp, coalesce(a.n_inp, 0) n_inp, coalesce(a.n_ttfb, 0) n_ttfb,
           a.lcp_p75, a.inp_p75, a.ttfb_p75, t.series trend,
           p.id probe_id, p.perf_state probe_state, p.budget_ms probe_budget_ms, p.p95_ms probe_ttfb_p95_ms,
           round(p.bytes / 1024.0, 1) html_kb, p.probe_at,
           nullif(p.perf_subject->>'first_load_js_kb', '')::numeric first_load_js_kb,
           nullif(p.perf_subject->>'first_load_js_budget_kb', '')::numeric first_load_js_budget_kb,
           coalesce(p.perf_subject->'door_slugs', '[]'::jsonb) door_slugs,
           v.lcp_id, v.inp_id, v.ttfb_id
      from routes r
      left join agg a on a.route = r.route
      left join trend t on t.route = r.route
      left join pp p on p.route = r.route
      left join vw v on v.route = r.route
  ), flagged as (
    select b.*,
           (select coalesce(jsonb_agg(f), '[]'::jsonb) from (
              select jsonb_build_object('why', 'big_bundle', 'watch_id', b.probe_id,
                       'detail', b.first_load_js_kb || ' KB over ' || b.first_load_js_budget_kb || ' KB') f
               where b.first_load_js_kb is not null and b.first_load_js_budget_kb is not null
                 and b.first_load_js_kb > b.first_load_js_budget_kb
              union all
              select jsonb_build_object('why', 'slow_server', 'watch_id', b.probe_id,
                       'detail', 'probe ' || round(b.probe_ttfb_p95_ms) || ' ms over ' || round(b.probe_budget_ms) || ' ms')
               where b.probe_ttfb_p95_ms is not null and b.probe_budget_ms is not null and b.probe_ttfb_p95_ms > b.probe_budget_ms
              union all
              select jsonb_build_object('why', 'slow_server', 'watch_id', b.ttfb_id,
                       'detail', 'users ' || round(b.ttfb_p75) || ' ms over 800 ms')
               where b.probe_ttfb_p95_ms is null and b.ttfb_p75 is not null and b.ttfb_p75 > 800
              union all
              select jsonb_build_object('why', 'slow_db_door', 'watch_id', d.id, 'detail', d.slug || ' ' || d.perf_state)
                from ops.proof_check d
               where d.kind = 'perf' and d.deleted_at is null and d.perf_state in ('over_budget', 'regressed')
                 and d.slug in (select jsonb_array_elements_text(b.door_slugs))
              union all
              select jsonb_build_object('why', 'slow_client', 'watch_id', b.lcp_id,
                       'detail', 'LCP ' || round(b.lcp_p75) || ' ms, TTFB ' || coalesce(round(b.ttfb_p75)::text, 'n/a') || ' ms')
               where b.lcp_p75 is not null and b.lcp_p75 > 2500 and (b.ttfb_p75 is null or b.ttfb_p75 <= 800)
           ) q) flags
      from base b
  )
  select jsonb_build_object(
           'days', v_days, 'min_n', v_min_n, 'since', v_first, 'generated_at', now(),
           'probes_present', exists (select 1 from pp),
           'rows', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'route', f.route, 'loads', f.loads,
                      'n_lcp', f.n_lcp, 'n_inp', f.n_inp, 'n_ttfb', f.n_ttfb,
                      'lcp_p75', f.lcp_p75, 'inp_p75', f.inp_p75, 'ttfb_p75', f.ttfb_p75,
                      'trend', f.trend,
                      'probe_watch_id', f.probe_id, 'probe_state', f.probe_state, 'probe_at', f.probe_at,
                      'probe_budget_ms', f.probe_budget_ms, 'probe_ttfb_p95_ms', f.probe_ttfb_p95_ms,
                      'html_kb', f.html_kb, 'first_load_js_kb', f.first_load_js_kb,
                      'first_load_js_budget_kb', f.first_load_js_budget_kb,
                      'vital_watch_ids', jsonb_strip_nulls(jsonb_build_object('LCP', f.lcp_id, 'INP', f.inp_id, 'TTFB', f.ttfb_id)),
                      'flags', f.flags)
                    order by coalesce(f.lcp_p75, f.ttfb_p75, f.probe_ttfb_p95_ms, 0) desc, f.route)
               from (select * from flagged order by coalesce(lcp_p75, ttfb_p75, probe_ttfb_p95_ms, 0) desc, route limit 200) f), '[]'::jsonb))
    into v_out;
  return v_out;
end;
$function$;

comment on function ops.perf_slow_pages(integer) is
  'Slowest pages in one call: per route real-user p75 LCP/INP/TTFB with n, daily LCP trend, the pageprobe watch''s synthetic TTFB p95, HTML KB and first-load JS KB, and the flagged why (big_bundle, slow_server, slow_db_door, slow_client) with the watch to open. Platform admins only (42501).';

do $grants$
begin
  insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                             reason, declared_by, gate_predicate, signed_in_callers, anonymous_callers)
  select 'ops', p.proname, pg_get_function_identity_arguments(p.oid),
         (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
         'SIGNED-IN door, platform admins only: one-call read of the Slowest pages section of /administration/reporting/performance (performance-watch PLAN §6). The body refuses anyone who is not a platform admin (42501) before reading; read only.',
         'matrx-frontend/migrations/campaign/perf_watch2_ui_b_slow_pages.sql',
         'public.is_platform_admin()', true, false
    from pg_proc p
   where p.oid = 'ops.perf_slow_pages(integer)'::regprocedure
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = 'ops' and d.function_name = p.proname
                        and d.identity_args = pg_get_function_identity_arguments(p.oid));
  grant execute on function ops.perf_slow_pages(integer) to authenticated, service_role;
end
$grants$;

-- The rate plan keeps the routes CLOSEST to the minimum when more than 100 are quiet (they reach 30 soonest).
CREATE OR REPLACE FUNCTION ops.perf_vital_rate_plan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
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
             order by coalesce(l.loads, 0) desc, c.route
             limit 100) t;
  end if;
  if v_plan is distinct from v_cur then
    update platform.feature_knob set value = v_plan, set_by = 'agent', updated_at = now()
     where feature = 'perf' and key = 'client_sample_rate_by_route';
  end if;
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
