-- migrate: skip: a test script, never a migration. Each section runs against live inside BEGIN … ROLLBACK and leaves nothing behind.
--
-- perf_watch2_ui_tests.sql — forcing-function tests for lane PERF-WATCH-2 (UI half). Every section RAISEs on
-- failure; a clean run prints PASS lines. Sections are separated by `-- @@section` lines.
--   (p) ops.perf_vital_rate_plan: a quiet route is boosted to the low-traffic rate, a route with enough loads is
--       not, a boosted route stays until 2 x the minimum (hysteresis) and then drops, a global rate of 0 boosts
--       nothing, the LCP/INP/TTFB watches of a route with any vital watch are declared once (p75, web.dev "good").
--   (s) ops.perf_slow_pages: platform admins only; real-user p75 + n + trend per route; every flag (big_bundle,
--       slow_server, slow_db_door, slow_client) with the watch to open; tolerates routes with no pageprobe watch.
-- Run (session-mode connection as postgres): node runsql.js perf_watch2_ui_tests.sql [section]

-- @@section p
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';
do $p$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_plan jsonb;
  v_map jsonb;
  v_w uuid;
  v_n int;
begin
  perform set_config('matrx.admin_lane', 'on', true);
  -- Start from a known map: /pq-mid and /pq-done are already boosted.
  update platform.feature_knob set value = '{"/pq-mid": 1, "/pq-done": 1}'::jsonb where feature = 'perf' and key = 'client_sample_rate_by_route';
  insert into ops.perf_client_event (measured_at, metric, route, value_ms, organization_id, created_by)
  select now() - interval '2 hours', m, r, 1000, v_sys, v_admin
    from (values ('/pq-quiet', 10), ('/pq-busy', 40), ('/pq-mid', 40), ('/pq-done', 70)) t(r, n),
         lateral generate_series(1, t.n) g, (values ('TTFB'), ('LCP')) mm(m);
  v_plan := ops.perf_vital_rate_plan();
  select value into v_map from platform.feature_knob where feature = 'perf' and key = 'client_sample_rate_by_route';
  if v_map->>'/pq-quiet' is distinct from '1' then raise exception '(p) a route with 10 loads in 24 h is not at the low-traffic rate: %', v_map; end if;
  if v_map ? '/pq-busy' then raise exception '(p) a route that already has 40 loads (>= 30) was boosted'; end if;
  if v_map->>'/pq-mid' is distinct from '1' then raise exception '(p) a boosted route with 40 loads (between 30 and 60) dropped early: hysteresis broken'; end if;
  if v_map ? '/pq-done' then raise exception '(p) a boosted route with 70 loads (>= 60) was kept at 1.0'; end if;
  if (select count(*) from jsonb_object_keys(v_map)) > 100 then raise exception '(p) the map is over its 100-route cap'; end if;

  -- The low-traffic rate is a knob: 0.5 writes 0.5.
  update platform.feature_knob set value = to_jsonb(0.5) where feature = 'perf' and key = 'client_sample_rate_low_traffic';
  perform ops.perf_vital_rate_plan();
  select value into v_map from platform.feature_knob where feature = 'perf' and key = 'client_sample_rate_by_route';
  if v_map->>'/pq-quiet' is distinct from '0.5' then raise exception '(p) the low-traffic rate knob is not what the plan writes: %', v_map; end if;
  update platform.feature_knob set value = to_jsonb(1.0) where feature = 'perf' and key = 'client_sample_rate_low_traffic';

  -- Page speed off (global rate 0): nothing is boosted past it.
  update platform.feature_knob set value = to_jsonb(0) where feature = 'perf' and key = 'client_sample_rate';
  perform ops.perf_vital_rate_plan();
  select value into v_map from platform.feature_knob where feature = 'perf' and key = 'client_sample_rate_by_route';
  if v_map <> '{}'::jsonb then raise exception '(p) a global rate of 0 still boosted routes: %', v_map; end if;
  update platform.feature_knob set value = to_jsonb(0.05) where feature = 'perf' and key = 'client_sample_rate';

  -- Watches: a route with only an LCP watch gets INP and TTFB, once, p75 against the web.dev "good" lines.
  v_w := ops.perf_watch_declare('vital:LCP:/pq-decl', 'vital', 'LCP · /pq-decl',
           jsonb_build_object('metric', 'LCP', 'route', '/pq-decl', 'unit', 'ms'), 2500, 'p75', 3600, 'PERF-WATCH', 'perf');
  v_plan := ops.perf_vital_rate_plan();
  if (v_plan->>'declared_watches')::int < 2 then raise exception '(p) INP and TTFB watches were not declared: %', v_plan; end if;
  select count(*) into v_n from ops.proof_check
   where slug in ('vital:INP:/pq-decl', 'vital:TTFB:/pq-decl') and kind = 'perf' and perf_kind = 'vital' and budget_stat = 'p75'
     and ((slug like 'vital:INP:%' and budget_ms = 200) or (slug like 'vital:TTFB:%' and budget_ms = 800));
  if v_n <> 2 then raise exception '(p) the declared watches have the wrong kind, stat or budget (% of 2 right)', v_n; end if;
  v_plan := ops.perf_vital_rate_plan();
  if (v_plan->>'declared_watches')::int <> 0 then raise exception '(p) a second run declared again: %', v_plan; end if;
  -- A person-edited budget is never overwritten by the plan.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform ops.perf_watch_update((select id from ops.proof_check where slug = 'vital:INP:/pq-decl'), 350);
  perform ops.perf_vital_rate_plan();
  if (select budget_ms from ops.proof_check where slug = 'vital:INP:/pq-decl') <> 350 then raise exception '(p) the plan overwrote an edited budget'; end if;
  -- Nobody but the server can run it.
  if has_function_privilege('authenticated', 'ops.perf_vital_rate_plan()', 'execute') or has_function_privilege('anon', 'ops.perf_vital_rate_plan()', 'execute') then
    raise exception '(p) a client may execute the rate plan';
  end if;
  raise notice 'PASS (p) quiet routes boosted, busy ones not, hysteresis 30/60, off stays off, knob-driven rate, LCP/INP/TTFB watches declared once at web.dev budgets, edited budget kept, server-only';
end
$p$;
rollback;

-- @@section s
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';
do $s$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_member constant uuid := '043f73e2-e6cd-4ffb-af6f-ea96dc4e59b3';
  v_door uuid;
  v_probe uuid;
  v_probe2 uuid;
  v_out jsonb;
  v_row jsonb;
  v_ok boolean;
  v_why text[];
begin
  perform set_config('matrx.admin_lane', 'on', true);
  -- /sp-client: users wait on the page, the server is fast  -> slow_client only
  -- /sp-server: users wait on the server                     -> slow_server (real TTFB; no probe yet)
  -- /sp-probe : bundle + synthetic TTFB + a door over budget -> big_bundle, slow_server, slow_db_door
  -- /sp-fast  : fine                                         -> no flag
  -- /sp-only  : a pageprobe watch and no real-user rows      -> a row with null user numbers
  insert into ops.perf_client_event (measured_at, metric, route, value_ms, organization_id, created_by)
  select now() - interval '1 hour', t.m, t.r, t.v + g, v_sys, v_admin
    from (values ('LCP', '/sp-client', 4000), ('TTFB', '/sp-client', 200),
                 ('LCP', '/sp-server', 6000), ('TTFB', '/sp-server', 3000),
                 ('LCP', '/sp-probe', 2000), ('TTFB', '/sp-probe', 300),
                 ('LCP', '/sp-fast', 900), ('TTFB', '/sp-fast', 100), ('INP', '/sp-fast', 80)) t(m, r, v),
         generate_series(1, 31) g;
  insert into ops.perf_client_event (measured_at, metric, route, value_ms, organization_id, created_by)
  select now() - interval '3 days', 'LCP', '/sp-client', 3000, v_sys, v_admin from generate_series(1, 5);

  v_door := ops.perf_watch_declare('door:test.sp_door', 'door', 'sp door',
              (select perf_subject from ops.proof_check where slug = 'door:custom.views'), 300, 'p95', 900, 'PERF-WATCH-2', 'perf');
  update ops.proof_check set perf_state = 'over_budget' where id = v_door;
  v_probe := ops.perf_watch_declare('pageprobe:/sp-probe', 'page', 'page /sp-probe',
              jsonb_build_object('route', '/sp-probe', 'url_path', '/sp-probe', 'seat_email', 'admin@admin.com',
                                 'door_slugs', jsonb_build_array('door:test.sp_door', 'door:custom.views'),
                                 'first_load_js_kb', 900, 'first_load_js_budget_kb', 500), 800, 'p95', 3600, 'PERF-WATCH-2', 'perf');
  insert into ops.perf_sample (check_id, measured_at, source, n, errors, p95_ms, bytes, organization_id, created_by)
  values (v_probe, now() - interval '1 hour', 'cli', 5, 0, 700, 100000, v_sys, v_admin),
         (v_probe, now() - interval '10 minutes', 'cli', 5, 0, 1200, 204800, v_sys, v_admin);   -- the newest one counts
  v_probe2 := ops.perf_watch_declare('pageprobe:/sp-only', 'page', 'page /sp-only',
              jsonb_build_object('route', '/sp-only', 'door_slugs', '[]'::jsonb, 'first_load_js_kb', 100, 'first_load_js_budget_kb', 500), 800, 'p95', 3600, 'PERF-WATCH-2', 'perf');
  insert into ops.perf_sample (check_id, measured_at, source, n, errors, p95_ms, bytes, organization_id, created_by)
  values (v_probe2, now() - interval '5 minutes', 'cli', 5, 0, 120, 4096, v_sys, v_admin);
  perform ops.perf_watch_declare('vital:LCP:/sp-client', 'vital', 'LCP · /sp-client',
            jsonb_build_object('metric', 'LCP', 'route', '/sp-client'), 2500, 'p75', 3600, 'PERF-WATCH', 'perf');

  -- Who may read.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_member::text, true);
  perform set_config('role', 'authenticated', true);
  v_ok := false;
  begin perform ops.perf_slow_pages(7); exception when sqlstate '42501' then v_ok := true; end;
  if not v_ok then perform set_config('role', 'postgres', true); raise exception '(s) a non-admin read the slow pages'; end if;
  perform set_config('role', 'postgres', true);
  if has_function_privilege('anon', 'ops.perf_slow_pages(integer)', 'execute') then raise exception '(s) a signed-out caller may execute the slow-pages read'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('role', 'authenticated', true);
  v_out := ops.perf_slow_pages(7);
  perform set_config('role', 'postgres', true);

  if (v_out->>'days')::int <> 7 or (v_out->>'min_n')::int <> 30 or not (v_out->>'probes_present')::boolean then
    raise exception '(s) header wrong: %', v_out - 'rows';
  end if;
  -- slow_client
  select r into v_row from jsonb_array_elements(v_out->'rows') r where r->>'route' = '/sp-client';
  if (v_row->>'lcp_p75')::numeric < 4000 or (v_row->>'n_lcp')::int <> 36 or (v_row->>'n_ttfb')::int <> 31 or jsonb_array_length(v_row->'trend') <> 7 then
    raise exception '(s) /sp-client numbers wrong: %', v_row;
  end if;
  select array_agg(f->>'why') into v_why from jsonb_array_elements(v_row->'flags') f;
  if v_why is distinct from array['slow_client'] then raise exception '(s) /sp-client flags: %', v_row->'flags'; end if;
  if (v_row->'flags'->0->>'watch_id') is distinct from (select id::text from ops.proof_check where slug = 'vital:LCP:/sp-client') then
    raise exception '(s) slow_client does not open the LCP watch: %', v_row->'flags';
  end if;
  if v_row->>'probe_watch_id' is not null or v_row->>'html_kb' is not null then raise exception '(s) a route with no pageprobe watch has probe numbers: %', v_row; end if;
  -- slow_server from real users (no synthetic number yet), and never slow_client with a bad TTFB
  select r into v_row from jsonb_array_elements(v_out->'rows') r where r->>'route' = '/sp-server';
  select array_agg(f->>'why') into v_why from jsonb_array_elements(v_row->'flags') f;
  if v_why is distinct from array['slow_server'] then raise exception '(s) /sp-server flags: %', v_row->'flags'; end if;
  -- the three probe flags, each with the watch to open
  select r into v_row from jsonb_array_elements(v_out->'rows') r where r->>'route' = '/sp-probe';
  select array_agg(f->>'why' order by f->>'why') into v_why from jsonb_array_elements(v_row->'flags') f;
  if v_why is distinct from array['big_bundle', 'slow_db_door', 'slow_server'] then raise exception '(s) /sp-probe flags: %', v_row->'flags'; end if;
  if (select count(*) from jsonb_array_elements(v_row->'flags') f where f->>'watch_id' = v_probe::text) <> 2
     or not exists (select 1 from jsonb_array_elements(v_row->'flags') f where f->>'why' = 'slow_db_door' and f->>'watch_id' = v_door::text) then
    raise exception '(s) the flags open the wrong watches: %', v_row->'flags';
  end if;
  if (v_row->>'probe_ttfb_p95_ms')::numeric <> 1200 or (v_row->>'html_kb')::numeric <> 200 or (v_row->>'first_load_js_kb')::numeric <> 900 then
    raise exception '(s) the newest pageprobe sample was not used: %', v_row;
  end if;
  -- fine route: no flag; probe-only route: listed, user numbers null, no flag
  select r into v_row from jsonb_array_elements(v_out->'rows') r where r->>'route' = '/sp-fast';
  if jsonb_array_length(v_row->'flags') <> 0 or (v_row->>'inp_p75')::numeric < 80 then raise exception '(s) /sp-fast: %', v_row; end if;
  select r into v_row from jsonb_array_elements(v_out->'rows') r where r->>'route' = '/sp-only';
  if v_row is null or v_row->>'lcp_p75' is not null or jsonb_array_length(v_row->'flags') <> 0 or (v_row->>'probe_ttfb_p95_ms')::numeric <> 120 then
    raise exception '(s) a probe-only route is wrong: %', v_row;
  end if;
  -- worst first
  if (v_out->'rows'->0->>'lcp_p75')::numeric < (v_out->'rows'->1->>'lcp_p75')::numeric then raise exception '(s) rows are not worst-first'; end if;
  raise notice 'PASS (s) admins only; p75 + n + 7-day trend per route; newest pageprobe sample; big_bundle, slow_server, slow_db_door, slow_client each with the watch to open; routes without a probe or without users tolerated';
end
$s$;
rollback;
