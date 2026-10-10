-- based-on: ops.perf_page_probe_report(jsonb) d11c345a4d9c4f3fba15bd66edfb66ef7a0ffec3310dda23890a8de8b1212a5a
-- perf_watch2_pages_b_report_result_shape.sql
--
-- ops.perf_page_probe_report returned `results` as a flat list of objects (the slug apart from the sample's
-- answer). Each result is now ONE object {slug, sample_id, state, ...}. Body otherwise unchanged.
-- Inverse: migrations/inverse/perf_watch2_pages_b_report_result_shape_down.sql (restores the flat shape).

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
    v_res := v_res || jsonb_build_array(jsonb_build_object('slug', v_slug) || ops.perf_record_sample(v_id, 'probe', jsonb_build_object(
      'n', v_n, 'errors', v_err,
      'p50_ms', case when v_n > 0 then v_t[greatest(1, ceil(v_n * 0.5)::int)] end,
      'p95_ms', case when v_n > 0 then v_t[greatest(1, ceil(v_n * 0.95)::int)] end,
      'max_ms', case when v_n > 0 then v_t[v_n] end,
      'mean_ms', case when v_n > 0 then round((select avg(x) from unnest(v_t) x), 1) end,
      'bytes', nullif(r->>'html_bytes', '')::numeric, 'release_sha', v_sha,
      'metadata', jsonb_strip_nulls(jsonb_build_object('status', r->'status', 'final_path', r->'final_path')),
      'note', left(concat_ws(' · ', 'status ' || coalesce(r->>'status', '?'), 'page probe', v_seat, v_base, r->>'error'), 1000)), false));
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object('pages', v_done, 'sha', v_sha, 'results', v_res);
end;
$function$;

