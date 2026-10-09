-- based-on: ops.perf_door_sql(jsonb) b9e881c10f8472b8e388a82a38b6a122b2fac05f587755975d5b37b348f1b77c
--
-- perf_watch_w2_h_door_arg_drift.sql
--
-- PERFORMANCE WATCH, WAVE 2 — ONE DOOR'S SIGNATURE CHANGE NEVER FAILS THE WHOLE PROBE RUN.
-- Live 2026-10-08 17:00 UTC: perf-watch-probe FAILED ("perf_door_sql: custom.data_home(uuid,text,
-- boolean) has no argument p_include_app_tables") — another lane renamed the argument to
-- p_include_platform_tables (same meaning: the page's "Show platform tables" switch, default false),
-- and ops.perf_door_sql raised outside the probe's per-door handling, so no door was sampled.
--   1. ops.perf_door_sql: a pinned argument the door no longer has yields SQL that fails in the
--      warm-up with 42883 naming it → that door turns probe_broken (alerted once), the rest run.
--   2. door:custom.data_home re-declared with p_include_platform_tables false (the page default).
-- The failed run itself is alerted by ops.perf_health_run (failed_run, perf_watch_w2_f).
-- Inverse: migrations/inverse/perf_watch_w2_h_door_arg_drift_down.sql.
CREATE OR REPLACE FUNCTION ops.perf_door_sql(p_subject jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_fn regprocedure;
  v_names text[];
  v_types oid[];
  v_args jsonb := coalesce(p_subject->'args', '{}'::jsonb);
  k text;
  v_pos int;
  v_type text;
  v_parts text[] := '{}';
begin
  v_fn := to_regprocedure(format('%I.%I(%s)', p_subject->>'schema', p_subject->>'function', coalesce(p_subject->>'argtypes', '')));
  if v_fn is null then
    return null;
  end if;
  -- 1-based on both sides (an oidvector cast to oid[] keeps its 0 lower bound).
  select p.proargnames,
         (select array_agg(t order by o) from unnest(p.proargtypes) with ordinality u(t, o))
    into v_names, v_types from pg_proc p where p.oid = v_fn;
  for k in select jsonb_object_keys(v_args) loop
    v_pos := array_position(v_names, k);
    if v_pos is null then
      -- WAVE 2: a door whose argument was renamed must break THAT door (probe_broken, named),
      -- never the whole probe run — raising here escaped the probe's per-door handling and failed
      -- the 17:00 run of 2026-10-08 (custom.data_home lost p_include_app_tables). The returned SQL
      -- fails inside the probe's warm-up with 42883 naming the missing argument.
      return format('select %L::regproc::oid::bigint', 'perf_door_has_no_argument__' || k);
    end if;
    v_type := format_type(v_types[v_pos], null);
    v_parts := v_parts || case
      when v_type = 'jsonb' then format('%I => nullif($1->%L, ''null''::jsonb)', k, k)
      when v_type = 'json' then format('%I => nullif($1->%L, ''null''::jsonb)::json', k, k)
      when v_type like '%[]' then format('%I => (case when jsonb_typeof($1->%L) = ''array'' then array(select jsonb_array_elements_text($1->%L)) end)::%s', k, k, k, v_type)
      else format('%I => ($1->>%L)::%s', k, k, v_type) end;
  end loop;
  -- WAVE 2: bytes = length of the result as JSON text (what PostgREST would send): a scalar
  -- door's value, or the sum of a set's rows. Serialising also forces the whole result to be built.
  return format('select coalesce(sum(octet_length(case when x.j ? %L and (select count(*) from jsonb_object_keys(x.j)) = 1 '
                'then (x.j -> %L)::text else x.j::text end)), 0)::bigint from (select to_jsonb(t) j from %I.%I(%s) t) x',
                p_subject->>'function', p_subject->>'function',
                p_subject->>'schema', p_subject->>'function', array_to_string(v_parts, ', '));
end;
$function$;

select ops.perf_watch_declare('door:custom.data_home', 'door', 'custom.data_home',
  '{"schema":"custom","function":"data_home","argtypes":"uuid, text, boolean","args":{"p_include_platform_tables":false}}'::jsonb,
  300, 'p95', 900, 'PERF-WATCH', 'data');
