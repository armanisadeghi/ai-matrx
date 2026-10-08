-- based-on: ops.perf_judge_rule(jsonb, jsonb, jsonb, timestamp with time zone) f2a3849530305d00642921d49437aeeb67d775453104055691ef59e5302ce77f
-- based-on: ops.perf_door_sql(jsonb) 8535c435a01d0e3f46e7225225b7b9f75151bf9b9439bc7db3ebe9c8f7567fa3
--
-- perf_watch_w2_a_rule_and_bytes.sql
--
-- PERFORMANCE WATCH, WAVE 2 — TWO BODY FIXES. Design: common-docs/systems/architecture/
-- observability/performance-watch/PLAN.md §4 (rule), Waves 2 (bytes on every probe sample).
--   1. ops.perf_judge_rule: over_budget and regressed are judged only once the watch has
--      perf.eval_window measured samples of its own source; before that it stays learning.
--      Live 2026-10-08: door:custom.data_home alerted over_budget on its first single sample.
--      Test: perf_watch_w1_tests.sql (a2).
--   2. ops.perf_door_sql: a sample's bytes = length of the door's result as JSON text (was the
--      in-memory pg_column_size of the rows).
-- Inverse: migrations/inverse/perf_watch_w2_a_rule_and_bytes_down.sql (both live bodies, verbatim).
CREATE OR REPLACE FUNCTION ops.perf_judge_rule(p_history jsonb, p_watch jsonb, p_knobs jsonb, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_hist jsonb := coalesce(p_history, '[]'::jsonb);
  v_stat text := coalesce(nullif(p_watch->>'budget_stat', ''), 'p95');
  v_key text;
  v_budget numeric := nullif(p_watch->>'budget_ms', '')::numeric;
  v_prior text := nullif(p_watch->>'state', '');
  v_pinned boolean := coalesce((p_watch->>'baseline_pinned')::boolean, false);
  v_window int := coalesce((p_knobs->>'eval_window')::int, 3);
  v_min_n int := coalesce((p_knobs->>'baseline_min_samples')::int, 12);
  v_days numeric := coalesce((p_knobs->>'baseline_days')::numeric, 7);
  v_pct numeric := coalesce((p_knobs->>'regression_pct')::numeric, 50);
  v_min_ms numeric := coalesce((p_knobs->>'regression_min_ms')::numeric, 50);
  v_k numeric := coalesce((p_knobs->>'regression_mad_k')::numeric, 4);
  v_cool numeric := coalesce((p_knobs->>'alert_cooldown_minutes')::numeric, 60);
  v_last_recovery timestamptz := nullif(p_watch->>'last_recovery_at', '')::timestamptz;
  v_latest jsonb := v_hist->0;
  v_judged numeric;
  v_baseline numeric;
  v_base_n int;
  v_mad numeric := 0;
  v_line numeric;
  v_state text;
  v_reason text;
  v_bad constant text[] := array['over_budget', 'regressed', 'erroring', 'stale', 'probe_broken'];
  v_alert boolean := false;
  v_suppressed text;
  v_have int := 0;
begin
  v_key := v_stat || '_ms';
  if v_latest is null then
    return jsonb_build_object('state', coalesce(v_prior, 'learning'), 'reason', 'no sample to judge',
                              'transition', false, 'alert', false, 'prior_state', v_prior);
  end if;

  -- erroring: every call of the newest sample failed (or nothing was measured).
  if coalesce((v_latest->>'n')::int, 0) = 0
     or coalesce((v_latest->>'errors')::int, 0) >= coalesce((v_latest->>'n')::int, 0) then
    v_state := 'erroring';
    v_reason := format('all %s calls of the newest sample failed', coalesce(v_latest->>'n', '0'));
  else
    -- judged value: median of the bound stat over the newest eval_window samples that measured it
    select percentile_cont(0.5) within group (order by (h.s->>v_key)::numeric)
      into v_judged
      from jsonb_array_elements(v_hist) with ordinality h(s, i)
     where h.i <= v_window and nullif(h.s->>v_key, '') is not null
       and coalesce((h.s->>'errors')::int, 0) < coalesce((h.s->>'n')::int, 0);

    -- baseline: pinned by a person, else the median of the older healthy samples within the
    -- window of days. Healthy = judged ok (or learning) at the time — so samples taken while
    -- the watch was bad never enter it: the baseline is FROZEN during a regression.
    with base as (
      select (h.s->>v_key)::numeric v
        from jsonb_array_elements(v_hist) with ordinality h(s, i)
       where h.i > v_window
         and h.s->>'state_after' in ('ok', 'learning')
         and nullif(h.s->>v_key, '') is not null
         and (nullif(h.s->>'measured_at', '') is null
              or (h.s->>'measured_at')::timestamptz >= p_now - make_interval(secs => v_days * 86400))
    )
    select count(*), percentile_cont(0.5) within group (order by v) into v_base_n, v_baseline from base;
    if v_base_n > 0 then
      select percentile_cont(0.5) within group (order by abs(x.v - v_baseline)) into v_mad
        from (select (h.s->>v_key)::numeric v
                from jsonb_array_elements(v_hist) with ordinality h(s, i)
               where h.i > v_window and h.s->>'state_after' in ('ok', 'learning')
                 and nullif(h.s->>v_key, '') is not null
                 and (nullif(h.s->>'measured_at', '') is null
                      or (h.s->>'measured_at')::timestamptz >= p_now - make_interval(secs => v_days * 86400))) x;
    end if;
    if v_pinned and nullif(p_watch->>'baseline_ms', '') is not null then
      v_baseline := (p_watch->>'baseline_ms')::numeric;
    end if;

    -- WAVE 2: no budget or regression judgment before the watch has eval_window measured samples
    -- of its own source (one cold first sample of data_home alerted on 2026-10-08).
    select count(*) into v_have
      from jsonb_array_elements(v_hist) h(s)
     where nullif(h.s->>v_key, '') is not null
       and coalesce((h.s->>'errors')::int, 0) < coalesce((h.s->>'n')::int, 0);

    if v_judged is null then
      v_state := 'erroring';
      v_reason := format('no %s measured in the last %s samples', v_stat, v_window);
    elsif v_have < v_window then
      v_state := 'learning';
      v_reason := format('learning: %s of %s samples before a budget judgment (%s %s ms so far)', v_have, v_window, v_stat, round(v_judged, 1));
    elsif v_budget is not null and v_judged > v_budget then
      v_state := 'over_budget';
      v_reason := format('%s %s ms (median of last %s) is over the %s ms budget', v_stat, round(v_judged, 1), v_window, v_budget);
    elsif not (v_pinned and v_baseline is not null) and v_base_n < v_min_n then
      v_state := 'learning';
      v_reason := format('learning: %s of %s healthy samples for a baseline', v_base_n, v_min_n);
    else
      v_line := v_baseline + greatest(v_baseline * v_pct / 100, v_min_ms, v_k * coalesce(v_mad, 0));
      if v_judged > v_line then
        v_state := 'regressed';
        v_reason := format('%s %s ms is over the regression line %s ms (baseline %s ms)', v_stat, round(v_judged, 1), round(v_line, 1), round(v_baseline, 1));
      else
        v_state := 'ok';
        v_reason := case when v_prior = any (v_bad)
                         then format('recovered: %s %s ms is within budget and baseline', v_stat, round(v_judged, 1))
                         else format('%s %s ms', v_stat, round(v_judged, 1)) end;
      end if;
    end if;
  end if;

  -- Alert only on a transition INTO a bad state from a good one, never inside the cooldown that
  -- follows a recovery (flap guard).
  if v_state = any (v_bad) and not (coalesce(v_prior, 'learning') = any (v_bad)) then
    if v_last_recovery is not null and v_last_recovery > p_now - make_interval(secs => v_cool * 60) then
      v_suppressed := format('cooldown: recovered %s, alerts wait %s minutes', v_last_recovery, v_cool);
    else
      v_alert := true;
    end if;
  end if;

  return jsonb_build_object(
    'state', v_state, 'reason', v_reason, 'prior_state', v_prior,
    'transition', v_state is distinct from v_prior,
    'recovered', (v_prior = any (v_bad)) and not (v_state = any (v_bad)),
    'alert', v_alert, 'alert_suppressed', v_suppressed,
    'judged_ms', round(v_judged, 3), 'baseline_ms', round(v_baseline, 3), 'baseline_n', coalesce(v_base_n, 0),
    'mad_ms', round(v_mad, 3), 'stat', v_stat, 'budget_ms', v_budget);
end;
$function$;

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
      raise exception 'perf_door_sql: % has no argument %', v_fn, k using errcode = '42883';
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

notify pgrst, 'reload schema';
