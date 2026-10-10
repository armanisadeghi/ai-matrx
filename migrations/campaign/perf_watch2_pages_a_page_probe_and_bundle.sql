-- perf_watch2_pages_a_page_probe_and_bundle.sql
--
-- PERFORMANCE WATCH 2 — PAGES. Synthetic page probes register into the existing watch catalog:
--   watch slug  pageprobe:<route template>   perf_kind 'page'   budget_stat 'p95' (TTFB ms)
--   perf_subject {route, url_path, seat_email, door_slugs[], first_load_js_kb, first_load_js_budget_kb}
--   ops.perf_page_probe_report(jsonb)   probe runner (scripts/perf-data/pages-probe.mjs) posts one run:
--                                       sample source 'probe', p50/p95/mean = TTFB ms, bytes = HTML bytes,
--                                       note carries the status code. Declares the watch on first sight;
--                                       later runs merge route/url/seat/doors into the subject WITHOUT the
--                                       re-declare marker (so first_load_js_kb is never lost or re-learned).
--   ops.perf_page_bundle_report(jsonb)  release-time first-load JS per route (pnpm perf:pages --bundle):
--                                       writes first_load_js_kb into perf_subject, sample source 'cli'
--                                       (shown, never judged) with bytes = JS bytes. Only routes that
--                                       already have a probe watch are updated (never an unprobed watch
--                                       that would turn stale).
--   ops.perf_page_probe_settings()      the knobs the runner reads (calls, run cap, cadence).
-- Knobs (feature perf): page_probe_cadence_minutes 30, page_probe_calls 3, page_probe_budget_ms 600,
-- page_probe_bundle_budget_kb 350, page_probe_run_cap_seconds 75.
-- Both report functions are SECURITY DEFINER, service_role EXECUTE only (functions are born with no client
-- grant; nothing is revoked).
-- Inverse: migrations/inverse/perf_watch2_pages_a_page_probe_and_bundle_down.sql.

insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('perf', 'page_probe_cadence_minutes', to_jsonb(30), to_jsonb(30), 'integer', 'minutes', 5, 1440,
   'Page probe cadence',
   'How often each page probe watch expects a sample; a probe watch with no sample for three times this turns stale.',
   'agent', 'PERF-WATCH-2: every page, every 30 minutes, is 48 samples a day at three requests each — a page-speed baseline in days at invisible cost.', date '2027-01-09', '{}'),
  ('perf', 'page_probe_calls', to_jsonb(3), to_jsonb(3), 'integer', 'calls', 3, 20,
   'Timed requests per page',
   'After one warm-up, the page probe times this many requests of each page and keeps p50, p95 and mean of the time to first byte.',
   'agent', 'PERF-WATCH-2: three timed requests per page is the floor for a median; ten routes at four requests each fit the 75 s run cap.', date '2027-01-09', '{}'),
  ('perf', 'page_probe_budget_ms', to_jsonb(600), to_jsonb(600), 'integer', 'ms', 50, 10000,
   'Page time-to-first-byte budget',
   'A new page probe watch starts with this p95 budget for time to first byte; edit one page on the performance screen.',
   'agent', 'PERF-WATCH-2: 600 ms to first byte is the line past which a signed-in page feels slow before it paints anything.', date '2027-01-09', '{}'),
  ('perf', 'page_probe_bundle_budget_kb', to_jsonb(350), to_jsonb(350), 'integer', 'KB', 50, 5000,
   'First-load JavaScript budget',
   'A new page watch starts with this first-load JavaScript budget (gzip KB the browser must fetch before the page works).',
   'agent', 'PERF-WATCH-2: 350 KB gzip is the common ceiling for an app route on a mid-range phone.', date '2027-01-09', '{}'),
  ('perf', 'page_probe_run_cap_seconds', to_jsonb(75), to_jsonb(75), 'integer', 'seconds', 15, 300,
   'Page probe run cap',
   'A page probe run stops starting new pages after this many seconds; skipped pages are reported, never faked.',
   'agent', 'PERF-WATCH-2: one run never holds a connection longer than 75 s.', date '2027-01-09', '{}')
on conflict (feature, key) do nothing;

create or replace function ops.perf_page_probe_settings()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'calls', coalesce((ops.perf_knobs()->>'page_probe_calls')::int, 3),
    'run_cap_seconds', coalesce((ops.perf_knobs()->>'page_probe_run_cap_seconds')::int, 75),
    'cadence_minutes', coalesce((ops.perf_knobs()->>'page_probe_cadence_minutes')::int, 30),
    'budget_ms', coalesce((ops.perf_knobs()->>'page_probe_budget_ms')::int, 600),
    'bundle_budget_kb', coalesce((ops.perf_knobs()->>'page_probe_bundle_budget_kb')::int, 350));
$function$;

-- p_report: {sha, base, seat_email, pages:[{route, url_path, status, ttfb_ms:[numbers, ok calls only],
--            errors, html_bytes, door_slugs:[text], final_path, error}]}
create or replace function ops.perf_page_probe_report(p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_set jsonb := ops.perf_page_probe_settings();
  v_sha text := left(nullif(btrim(p_report->>'sha'), ''), 64);
  v_base text := left(coalesce(p_report->>'base', ''), 200);
  v_seat text := left(coalesce(p_report->>'seat_email', ''), 200);
  r jsonb;
  v_id uuid;
  v_slug text;
  v_subject jsonb;
  v_t numeric[];
  v_n int;
  v_err int;
  v_done int := 0;
  v_res jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_report) is distinct from 'object' then
    raise exception 'perf_page_probe_report: the report is a json object {sha, base, seat_email, pages[]}' using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  for r in select * from jsonb_array_elements(coalesce(p_report->'pages', '[]'::jsonb)) loop
    if coalesce(r->>'route', '') = '' then continue; end if;
    v_slug := 'pageprobe:' || (r->>'route');
    select array_agg(x::numeric order by x::numeric) into v_t
      from jsonb_array_elements_text(coalesce(r->'ttfb_ms', '[]'::jsonb)) x;
    v_n := coalesce(array_length(v_t, 1), 0);
    v_err := coalesce((r->>'errors')::int, 0);
    v_subject := jsonb_build_object(
      'route', r->>'route', 'url_path', coalesce(r->>'url_path', r->>'route'), 'seat_email', v_seat,
      'door_slugs', case when jsonb_typeof(r->'door_slugs') = 'array' then r->'door_slugs' else '[]'::jsonb end);
    select id into v_id from ops.proof_check where slug = v_slug and kind = 'perf';
    if v_id is null then
      v_id := ops.perf_watch_declare(v_slug, 'page', 'page · ' || (r->>'route'),
                v_subject || jsonb_build_object('first_load_js_kb', null, 'first_load_js_budget_kb', (v_set->>'bundle_budget_kb')::int,
                                                'stat_meaning', 'time to first byte (ms), signed-in member seat, warm, server fetch'),
                (v_set->>'budget_ms')::numeric, 'p95', (v_set->>'cadence_minutes')::int * 60, 'PERF-WATCH-2', 'perf');
    else
      update ops.proof_check set perf_subject = coalesce(perf_subject, '{}'::jsonb) || v_subject, deleted_at = null
       where id = v_id;
    end if;
    v_res := v_res || ops.perf_record_sample(v_id, 'probe', jsonb_build_object(
      'n', v_n, 'errors', v_err,
      'p50_ms', case when v_n > 0 then v_t[greatest(1, ceil(v_n * 0.5)::int)] end,
      'p95_ms', case when v_n > 0 then v_t[greatest(1, ceil(v_n * 0.95)::int)] end,
      'max_ms', case when v_n > 0 then v_t[v_n] end,
      'mean_ms', case when v_n > 0 then round((select avg(x) from unnest(v_t) x), 1) end,
      'bytes', nullif(r->>'html_bytes', '')::numeric, 'release_sha', v_sha,
      'metadata', jsonb_strip_nulls(jsonb_build_object('status', r->'status', 'final_path', r->'final_path')),
      'note', left(concat_ws(' · ', 'status ' || coalesce(r->>'status', '?'), 'page probe', v_seat, v_base, r->>'error'), 1000)), false)
      || jsonb_build_object('slug', v_slug);
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object('pages', v_done, 'sha', v_sha, 'results', v_res);
end;
$function$;

-- p_report: {sha, base, routes:[{route, first_load_js_kb, js_bytes, chunks}]}
create or replace function ops.perf_page_bundle_report(p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_set jsonb := ops.perf_page_probe_settings();
  v_sha text := left(nullif(btrim(p_report->>'sha'), ''), 64);
  r jsonb;
  c ops.proof_check%rowtype;
  v_kb numeric;
  v_budget numeric;
  v_done int := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_report) is distinct from 'object' then
    raise exception 'perf_page_bundle_report: the report is a json object {sha, routes[]}' using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  for r in select * from jsonb_array_elements(coalesce(p_report->'routes', '[]'::jsonb)) loop
    select * into c from ops.proof_check where slug = 'pageprobe:' || (r->>'route') and kind = 'perf' and deleted_at is null;
    if not found then
      v_skipped := v_skipped || to_jsonb(r->>'route');
      continue;
    end if;
    v_kb := round((r->>'first_load_js_kb')::numeric, 1);
    v_budget := coalesce(nullif(c.perf_subject->>'first_load_js_budget_kb', '')::numeric, (v_set->>'bundle_budget_kb')::numeric);
    update ops.proof_check
       set perf_subject = coalesce(perf_subject, '{}'::jsonb)
                          || jsonb_build_object('first_load_js_kb', v_kb, 'first_load_js_budget_kb', v_budget)
     where id = c.id;
    perform ops.perf_record_sample(c.id, 'cli', jsonb_build_object(
      'n', 1, 'errors', 0, 'bytes', nullif(r->>'js_bytes', '')::numeric, 'release_sha', v_sha,
      'metadata', jsonb_build_object('first_load_js_kb', v_kb, 'first_load_js_budget_kb', v_budget, 'chunks', r->'chunks'),
      'note', format('first-load JS %s KB vs budget %s KB%s · release build manifest', v_kb, v_budget,
                     case when v_kb > v_budget then ' · OVER BUNDLE BUDGET' else '' end)), false);
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object('routes', v_done, 'unmatched_routes', v_skipped, 'sha', v_sha);
end;
$function$;

do $grants$
declare f text;
begin
  foreach f in array array['ops.perf_page_probe_settings()', 'ops.perf_page_probe_report(jsonb)', 'ops.perf_page_bundle_report(jsonb)'] loop
    insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                               reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
           (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
           'Performance watch 2, pages (performance-watch PLAN): the page-probe settings read, the page-probe report and the release-time first-load JS report. They write platform-scoped watch rows and samples only.',
           'matrx-frontend/migrations/campaign/perf_watch2_pages_a_page_probe_and_bundle.sql',
           'server_only: `pnpm perf:pages` with the service key is the only caller; no browser or signed-in client calls them.',
           false, false
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.oid = f::regprocedure
       and not exists (select 1 from platform.client_callable_door d
                        where d.schema_name = n.nspname and d.function_name = p.proname
                          and d.identity_args = pg_get_function_identity_arguments(p.oid));
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;

do $assert$
begin
  if has_function_privilege('authenticated', 'ops.perf_page_probe_report(jsonb)', 'execute')
     or has_function_privilege('anon', 'ops.perf_page_bundle_report(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'ops.perf_page_probe_settings()', 'execute') then
    raise exception 'a server-only page-probe function is callable by a client';
  end if;
end
$assert$;
