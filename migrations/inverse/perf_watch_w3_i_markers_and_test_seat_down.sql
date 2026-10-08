-- chair-step: inverse of perf_watch_w3_i_markers_and_test_seat.sql — restores the perf_watch_w3_b body of ops.perf_judge verbatim and drops ops.perf_marker and its door row. The twins keep seat test@test.com (the fixture seat it replaced is deleted by the sweep); markers stay as history.
set local lock_timeout = '3s';
CREATE OR REPLACE FUNCTION ops.perf_judge(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  c ops.proof_check%rowtype;
  v_knobs jsonb := ops.perf_knobs();
  v_source text;
  v_hist jsonb;
begin
  select * into c from ops.proof_check where id = p_check_id and kind = 'perf';
  if not found then
    raise exception 'perf_judge: % is not a perf watch', p_check_id using errcode = 'P0002';
  end if;
  v_source := case c.perf_kind when 'door' then 'probe' when 'statement' then 'statement'
                               when 'job' then 'job' when 'vital' then 'vital' else 'probe' end;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.measured_at desc, s.id), '[]'::jsonb) into v_hist
    from (select id, measured_at, n, errors, p50_ms, p95_ms, mean_ms, max_ms,
                 -- WAVE 3: vitals carry p75 (web.dev's own percentile) in the sample's metadata.
                 nullif(metadata->>'p75_ms', '')::numeric p75_ms, state_after
            from ops.perf_sample
           where check_id = p_check_id and source = v_source and deleted_at is null
             and measured_at >= now() - make_interval(days => coalesce((v_knobs->>'baseline_days')::int, 7) + 1)
             -- WAVE 3: a marker (the subject was re-declared) is not a measurement, and nothing
             -- before the latest marker measured the subject being judged now.
             and not coalesce((metadata->>'perf_marker')::boolean, false)
             and measured_at > coalesce((select max(m.measured_at) from ops.perf_sample m
                                          where m.check_id = p_check_id and m.deleted_at is null
                                            and coalesce((m.metadata->>'perf_marker')::boolean, false)
                                            -- an EVENT marker (ops.perf_marker) explains a change; only a
                                            -- re-declared SUBJECT cuts the history being judged
                                            and coalesce(m.metadata->>'perf_marker_kind', 'subject') = 'subject'), '-infinity')
           order by measured_at desc
           limit 2000) s;
  return ops.perf_judge_rule(
    v_hist,
    jsonb_build_object('budget_ms', c.budget_ms, 'budget_stat', c.budget_stat, 'state', c.perf_state,
                       'baseline_pinned', c.perf_baseline_pinned, 'baseline_ms', c.perf_baseline_ms,
                       'last_recovery_at', c.metadata->>'perf_last_recovery_at',
                       'episode_started_at', c.metadata->>'perf_episode_started_at', 'last_alert_at', c.perf_last_alert_at),
    v_knobs, now());
end;
$function$;
delete from platform.client_callable_door where schema_name = 'ops' and function_name = 'perf_marker';
drop function if exists ops.perf_marker(text, timestamptz, text);
