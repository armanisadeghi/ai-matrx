-- chair-step: the REVOKEs withdraw EXECUTE from public/anon (and, for the server-only functions, authenticated) on the three functions this same file creates; each is declared in platform.client_callable_door first. Nothing that existed before is narrowed. Emits no policy.
--
-- perf_watch_w3_g_vitals_and_cli.sql
--
-- PERFORMANCE WATCH, WAVE 3 — REAL-USER PAGE SPEED AND CLI RUNS INTO HISTORY (PLAN §2).
--   1. ops.perf_client_report(p_samples jsonb) — the FIRST client-callable write door into the watch
--      store. Signed-in callers only; ≤ 20 samples; names LCP/INP/CLS/TTFB/FCP only; the route is
--      reduced to a template server-side as well (query/hash dropped, uuids → [id], long numbers → [n])
--      so a raw id can never be stored even if a client sends one; CLS stored ×1000; no user id
--      (created_by = the platform actor). perf.client_sample_rate = 0 for the caller → nothing stored.
--   2. ops.perf_vital_rollup(), hourly (pg_cron perf-watch-vitals, minute 50): the last full hour per
--      metric × route → one 'vital' sample (n, p50, p75 in metadata, p95, max, mean) only when
--      n ≥ perf.vital_min_n, declaring `vital:<metric>:<route>` on first sight with web.dev's "good"
--      threshold as budget (LCP 2500, INP 200, CLS 100 = 0.1 ×1000, TTFB 800, FCP 1800 ms), stat p75.
--      It also deletes raw rows older than perf.client_raw_retention_days.
--   3. ops.perf_cli_ingest(p_report jsonb) — service-only: `pnpm perf:data --record` posts its door and
--      page rows as source 'cli' with the git SHA. Door rows join the admin-seat door watch of the same
--      label; page rows go to `page:<page>` watches. CLI samples are shown, never judged.
-- Inverse: migrations/inverse/perf_watch_w3_g_vitals_and_cli_down.sql.

create or replace function ops.perf_route_template(p_route text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select left(
           regexp_replace(
             regexp_replace(
               split_part(split_part(coalesce(nullif(btrim(p_route), ''), '/'), '?', 1), '#', 1),
               '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '[id]', 'g'),
             '/[0-9]{3,}(?=/|$)', '/[n]', 'g'),
           200);
$function$;

create or replace function ops.perf_client_report(p_samples jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_uid uuid := auth.uid();
  v_rate numeric;
  s jsonb;
  v_metric text;
  v_val numeric;
  v_route text;
  v_rating text;
  v_ok int := 0;
  v_bad int := 0;
begin
  if v_uid is null then
    raise exception 'perf_client_report: page-speed reports are accepted from signed-in sessions only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_samples) is distinct from 'array' or jsonb_array_length(p_samples) = 0 then
    raise exception 'perf_client_report: p_samples must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_samples) > 20 then
    raise exception 'perf_client_report: at most 20 samples per page load (got %)', jsonb_array_length(p_samples) using errcode = '22023';
  end if;
  v_rate := coalesce((platform.knob_resolve('perf', 'client_sample_rate', v_sys, v_uid, null) #>> '{}')::numeric, 0.05);
  if v_rate <= 0 then
    return jsonb_build_object('accepted', 0, 'off', true);
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  for s in select * from jsonb_array_elements(p_samples) loop
    v_metric := upper(s->>'name');
    if jsonb_typeof(s) <> 'object' or v_metric is null or v_metric not in ('LCP', 'INP', 'CLS', 'TTFB', 'FCP')
       or jsonb_typeof(s->'value') <> 'number' or jsonb_typeof(s->'route') <> 'string' then
      v_bad := v_bad + 1;
      continue;
    end if;
    v_val := (s->>'value')::numeric * case when v_metric = 'CLS' then 1000 else 1 end;
    v_route := ops.perf_route_template(s->>'route');
    v_rating := case when s->>'rating' in ('good', 'needs-improvement', 'poor') then s->>'rating' end;
    if v_val < 0 or v_val > 600000 or left(v_route, 1) <> '/' then
      v_bad := v_bad + 1;
      continue;
    end if;
    insert into ops.perf_client_event (measured_at, metric, route, value_ms, rating, navigation_type, release_sha,
                                       organization_id, created_by)
    values (now(), v_metric, v_route, round(v_val, 3), v_rating, left(s->>'navigationType', 40),
            left(s->>'release', 64), v_sys, v_actor);
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('accepted', v_ok, 'rejected', v_bad);
end;
$function$;

create or replace function ops.perf_vital_rollup()
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $function$
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

create or replace function ops.perf_cli_ingest(p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_sha text := left(nullif(btrim(p_report->>'sha'), ''), 64);
  v_base text := left(coalesce(p_report->>'base', ''), 200);
  r jsonb;
  v_id uuid;
  v_ms numeric;
  v_doors int := 0;
  v_pages int := 0;
  v_unmatched jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_report) is distinct from 'object' then
    raise exception 'perf_cli_ingest: the report is a json object {sha, base, doors[], pages[]}' using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  for r in select * from jsonb_array_elements(coalesce(p_report->'doors', '[]'::jsonb)) loop
    select p.id into v_id from ops.proof_check p
     where p.kind = 'perf' and p.perf_kind = 'door' and p.deleted_at is null
       and p.label = r->>'door' and p.slug not like '%@%'
     order by p.slug limit 1;
    if v_id is null then
      v_unmatched := v_unmatched || to_jsonb(r->>'door');
      continue;
    end if;
    perform ops.perf_record_sample(v_id, 'cli', jsonb_build_object(
      'n', coalesce((r->>'calls')::int, 0), 'errors', coalesce((r->>'errors')::int, 0),
      'p50_ms', (r->>'p50')::numeric, 'p95_ms', (r->>'p95')::numeric, 'max_ms', (r->>'max')::numeric,
      'bytes', round(coalesce((r->>'kb')::numeric, 0) * 1024), 'release_sha', v_sha,
      'note', format('pnpm perf:data --record · through PostgREST and the network · %s', v_base)), false);
    v_doors := v_doors + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_report->'pages', '[]'::jsonb)) loop
    if coalesce(r->>'page', '') = '' then continue; end if;
    v_ms := nullif(r->>'rows_visible_ms', '')::numeric;
    v_id := ops.perf_watch_declare('page:' || (r->>'page'), 'page', 'page · ' || (r->>'page'),
              jsonb_build_object('page', r->>'page', 'source', 'cli', 'stat_meaning', 'rows visible (ms), one real browser load',
                                 'budget_basis', 'scripts/perf-data/budgets.json rows_visible_ms'),
              nullif(r #>> '{budget,rows_visible_ms}', '')::numeric, 'p50', 86400, 'PERF-WATCH', 'perf');
    perform ops.perf_record_sample(v_id, 'cli', jsonb_build_object(
      'n', 1, 'errors', case when v_ms is null then 1 else 0 end,
      'p50_ms', v_ms, 'p95_ms', v_ms, 'max_ms', v_ms, 'mean_ms', v_ms, 'release_sha', v_sha,
      'metadata', jsonb_strip_nulls(jsonb_build_object('pass', r->'pass', 'ttfb_ms', r->'ttfb_ms', 'lcp_ms', r->'lcp_ms',
                                                       'hydration_start_ms', r->'hydration_start_ms',
                                                       'calls_before_rows', r->'calls_before_rows', 'store_calls', r->'store_calls')),
      'note', left(concat_ws(' · ', 'pnpm perf:data --record', r->>'pass', v_base, r->>'note'), 1000)), false);
    v_pages := v_pages + 1;
  end loop;
  return jsonb_build_object('doors', v_doors, 'pages', v_pages, 'unmatched_doors', v_unmatched, 'sha', v_sha);
end;
$function$;

-- ── Door rows, then grants ────────────────────────────────────────────────────────────────────
do $grants$
declare f text;
begin
  foreach f in array array['ops.perf_route_template(text)', 'ops.perf_vital_rollup()', 'ops.perf_cli_ingest(jsonb)'] loop
    insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                               reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
           (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
           'Performance watch, wave 3 (performance-watch PLAN §2): the route-template helper, the hourly page-speed roll-up, and the CLI ingest of pnpm perf:data --record. They write platform-scoped watch rows and samples only.',
           'matrx-frontend/migrations/campaign/perf_watch_w3_g_vitals_and_cli.sql',
           'server_only: the pg_cron job perf-watch-vitals (as postgres) and `pnpm perf:data --record` with the service key are the only callers; no browser or signed-in client calls them.',
           false, false
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.oid = f::regprocedure
       and not exists (select 1 from platform.client_callable_door d
                        where d.schema_name = n.nspname and d.function_name = p.proname
                          and d.identity_args = pg_get_function_identity_arguments(p.oid));
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                             reason, declared_by, gate_predicate, signed_in_callers, anonymous_callers)
  select 'ops', 'perf_client_report', pg_get_function_identity_arguments(p.oid),
         (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
         'SIGNED-IN door: one batch of real-user page-speed numbers (LCP, INP, CLS, TTFB, FCP) from a sampled page load (performance-watch PLAN §2). Takes no id and reveals nothing: ≤ 20 samples, validated names, the route reduced to a template server-side, no user id stored (created_by = the platform actor, the system organization). perf.client_sample_rate 0 for the caller stores nothing.',
         'matrx-frontend/migrations/campaign/perf_watch_w3_g_vitals_and_cli.sql',
         'auth.uid() is not null', true, false
    from pg_proc p
   where p.oid = 'ops.perf_client_report(jsonb)'::regprocedure
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = 'ops' and d.function_name = 'perf_client_report');
  revoke all on function ops.perf_client_report(jsonb) from anon;   -- PUBLIC's default was cleared at birth (ddl_guard §6d-4)
  grant execute on function ops.perf_client_report(jsonb) to authenticated, service_role;
end
$grants$;

-- Hourly at minute 50: the last full hour is complete and the health check (:35) has run.
select cron.schedule('perf-watch-vitals', '50 * * * *',
  $cmd$SET statement_timeout='60s'; SET lock_timeout='1s'; SELECT ops.perf_vital_rollup();$cmd$);

do $assert$
begin
  if not has_function_privilege('authenticated', 'ops.perf_client_report(jsonb)', 'execute') then
    raise exception 'the page-speed door lost its authenticated EXECUTE';
  end if;
  if has_function_privilege('authenticated', 'ops.perf_cli_ingest(jsonb)', 'execute')
     or has_function_privilege('anon', 'ops.perf_client_report(jsonb)', 'execute') then
    raise exception 'a server-only perf function is callable by a client';
  end if;
end
$assert$;
