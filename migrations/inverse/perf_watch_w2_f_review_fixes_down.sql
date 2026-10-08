-- chair-step: inverse of perf_watch_w2_f_review_fixes.sql — restores the bodies of ops.perf_judge_rule, ops.perf_judge, ops.perf_record_sample and ops.perf_health_run as they were before it, verbatim (a cooldown-held alert stays held; failed cron runs are not alerted). metadata.perf_episode_started_at stamps stay, unread.
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
    from (select id, measured_at, n, errors, p50_ms, p95_ms, mean_ms, max_ms, null::numeric p75_ms, state_after
            from ops.perf_sample
           where check_id = p_check_id and source = v_source and deleted_at is null
             and measured_at >= now() - make_interval(days => coalesce((v_knobs->>'baseline_days')::int, 7) + 1)
           order by measured_at desc
           limit 2000) s;
  return ops.perf_judge_rule(
    v_hist,
    jsonb_build_object('budget_ms', c.budget_ms, 'budget_stat', c.budget_stat, 'state', c.perf_state,
                       'baseline_pinned', c.perf_baseline_pinned, 'baseline_ms', c.perf_baseline_ms,
                       'last_recovery_at', c.metadata->>'perf_last_recovery_at'),
    v_knobs, now());
end;
$function$;

CREATE OR REPLACE FUNCTION ops.perf_record_sample(p_check_id uuid, p_source text, p_stats jsonb, p_defer_alert boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c ops.proof_check%rowtype;
  v_s jsonb := coalesce(p_stats, '{}'::jsonb);
  v_own text;
  v_id uuid;
  v_at timestamptz;
  j jsonb;
  v_item jsonb;
  v_alert jsonb;
  v_resolved int := 0;
  v_bad constant text[] := array['over_budget', 'regressed', 'erroring', 'stale', 'probe_broken'];
begin
  if p_source is null or p_source not in ('probe', 'statement', 'job', 'vital', 'cli') then
    raise exception 'perf_record_sample: source % is not probe|statement|job|vital|cli', p_source using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  select * into c from ops.proof_check where id = p_check_id and kind = 'perf' for update;
  if not found then
    raise exception 'perf_record_sample: % is not a perf watch', p_check_id using errcode = 'P0002';
  end if;
  v_own := case c.perf_kind when 'door' then 'probe' when 'statement' then 'statement'
                            when 'job' then 'job' when 'vital' then 'vital' else 'probe' end;
  insert into ops.perf_sample (check_id, measured_at, source, n, p50_ms, p95_ms, max_ms, mean_ms, calls, errors,
                               bytes, release_sha, note, organization_id, created_by)
  values (c.id, coalesce((v_s->>'measured_at')::timestamptz, now()), p_source,
          coalesce((v_s->>'n')::int, 0), (v_s->>'p50_ms')::numeric, (v_s->>'p95_ms')::numeric,
          (v_s->>'max_ms')::numeric, (v_s->>'mean_ms')::numeric, (v_s->>'calls')::bigint,
          coalesce((v_s->>'errors')::int, 0), (v_s->>'bytes')::bigint, v_s->>'release_sha',
          left(v_s->>'note', 1000), v_sys, v_actor)
  returning id, measured_at into v_id, v_at;

  -- Other sources are shown, never judged (a CLI number never moves a probe baseline).
  if p_source <> v_own or not c.is_active then
    update ops.perf_sample set state_after = c.perf_state where id = v_id;
    return jsonb_build_object('sample_id', v_id, 'judged', false, 'state', c.perf_state);
  end if;

  j := ops.perf_judge(c.id);
  update ops.perf_sample
     set state_after = j->>'state',
         note = concat_ws(' · ', nullif(note, ''), j->>'reason')
   where id = v_id;
  update ops.proof_check
     set perf_state = j->>'state',
         perf_state_since = case when (j->>'transition')::boolean then now() else perf_state_since end,
         perf_baseline_ms = case when perf_baseline_pinned then perf_baseline_ms
                                 else coalesce((j->>'baseline_ms')::numeric, perf_baseline_ms) end,
         last_run_at = v_at,
         last_verdict = case when j->>'state' = any (v_bad) then 'fail' else 'pass' end,
         metadata = metadata
                    || case when (j->>'recovered')::boolean then jsonb_build_object('perf_last_recovery_at', now()) else '{}'::jsonb end
                    || jsonb_build_object('perf_last_reason', j->>'reason')
   where id = c.id;

  -- Recovery resolves this watch's open alert rows (and a grouped row once none of its watches is bad).
  if (j->>'recovered')::boolean then
    update ops.system_error
       set resolved_at = now(), resolution_note = 'perf watch recovered: ' || (j->>'reason')
     where kind = 'perf_watch_alert' and resolved_at is null
       and error_type like 'perf_watch:' || c.slug || ':%';
    get diagnostics v_resolved = row_count;
    update ops.system_error e
       set resolved_at = now(), resolution_note = 'every watch in this group recovered'
     where e.kind = 'perf_watch_alert' and e.resolved_at is null and e.error_type = 'perf_watch:group'
       and e.context->'check_ids' @> jsonb_build_array(c.id)
       and not exists (select 1 from ops.proof_check w
                        where w.id::text in (select jsonb_array_elements_text(e.context->'check_ids'))
                          and w.perf_state = any (v_bad));
  end if;

  if (j->>'alert')::boolean then
    v_item := jsonb_build_object('check_id', c.id, 'slug', c.slug, 'label', c.label, 'state', j->>'state',
                                 'prior_state', j->>'prior_state', 'judged_ms', j->'judged_ms',
                                 'budget_ms', c.budget_ms, 'stat', j->>'stat', 'baseline_ms', j->'baseline_ms',
                                 'owner', c.owner, 'reason', j->>'reason');
    if not p_defer_alert then
      v_alert := ops.perf_alert(jsonb_build_array(v_item));
    end if;
  end if;
  return jsonb_build_object('sample_id', v_id, 'judged', true, 'state', j->>'state', 'prior_state', j->>'prior_state',
                            'transition', (j->>'transition')::boolean, 'reason', j->>'reason',
                            'alert_item', v_item, 'alert', v_alert, 'resolved_errors', v_resolved,
                            'alert_suppressed', j->>'alert_suppressed');
end;
$function$;

CREATE OR REPLACE FUNCTION ops.perf_health_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_knobs jsonb := ops.perf_knobs();
  v_k int;
  v_probe_cad int;
  v_stmt_cad int;
  v_probe_last timestamptz;
  v_stmt_last timestamptz;
  v_probe_bad text;
  v_stmt_bad text;
  c record;
  w record;
  v_coll_bad text;
  v_items jsonb := '[]'::jsonb;
  v_stale jsonb := '[]'::jsonb;
  v_collectors jsonb := '[]'::jsonb;
  v_alert_out jsonb;
  v_err uuid;
  v_admin uuid;
  v_notified int;
  v_reason text;
begin
  if not coalesce((v_knobs->>'enabled')::boolean, true) then
    return jsonb_build_object('skipped', 'perf.enabled is off');
  end if;
  v_k := coalesce((v_knobs->>'stale_after_cadences')::int, 3);
  v_probe_cad := coalesce((v_knobs->>'probe_cadence_minutes')::int, 15);
  v_stmt_cad := coalesce((v_knobs->>'statement_cadence_minutes')::int, 60);
  perform set_config('app.user_id', v_actor::text, true);

  -- When did each collector last finish? The probe stamps perf_last_probe_at on every door it
  -- probed or skipped (pressure / wall cap); the statement collector writes a snapshot every run.
  select max((p.metadata->>'perf_last_probe_at')::timestamptz) into v_probe_last
    from ops.proof_check p where p.kind = 'perf' and p.perf_kind = 'door' and p.deleted_at is null;
  select max(s.taken_at) into v_stmt_last from ops.perf_statement_snapshot s where s.deleted_at is null;

  if exists (select 1 from ops.proof_check p where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active and p.deleted_at is null) then
    if coalesce(v_probe_last, (select min(created_at) from ops.proof_check where kind = 'perf' and perf_kind = 'door' and deleted_at is null))
         < now() - make_interval(mins => v_k * v_probe_cad) then
      v_probe_bad := format('the door probe has not finished since %s (expected every %s minutes)', coalesce(v_probe_last::text, 'it was declared'), v_probe_cad);
    elsif not exists (select 1 from ops.proof_check p where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active
                         and p.deleted_at is null and p.perf_state is distinct from 'probe_broken') then
      v_probe_bad := 'every active door watch is probe_broken (the probe seat or its pinned fixtures are missing)';
    elsif exists (select 1 from ops.system_error e where e.kind = 'perf_watch_alert'
                    and e.error_type = 'perf_watch:collector:probe:probe_broken' and e.resolved_at is null
                    and not exists (select 1 from ops.perf_sample s where s.source = 'probe' and s.measured_at > e.created_at)) then
      v_probe_bad := 'the door probe reported probe_broken and has not sampled since';
    end if;
  end if;
  if exists (select 1 from ops.proof_check p where p.kind = 'perf' and p.perf_kind = 'statement' and p.is_active and p.deleted_at is null) then
    if coalesce(v_stmt_last, (select min(created_at) from ops.proof_check where kind = 'perf' and perf_kind = 'statement' and deleted_at is null))
         < now() - make_interval(mins => v_k * v_stmt_cad) then
      v_stmt_bad := format('the statement collector has not finished since %s (expected every %s minutes)', coalesce(v_stmt_last::text, 'it was declared'), v_stmt_cad);
    end if;
  end if;

  -- One alert per collector, held open until it is healthy again.
  for c in select * from (values ('probe', v_probe_bad, v_probe_last), ('statement', v_stmt_bad, v_stmt_last)) x(name, bad, last_at) loop
    v_collectors := v_collectors || jsonb_build_object('collector', c.name, 'last_finished_at', c.last_at, 'problem', c.bad);
    if c.bad is not null then
      if not exists (select 1 from ops.system_error e where e.kind = 'perf_watch_alert' and e.resolved_at is null
                       and e.error_type in ('perf_watch:collector:' || c.name, 'perf_watch:collector:' || c.name || ':probe_broken')) then
        v_err := ops.record_system_error(jsonb_build_object(
          'kind', 'perf_watch_alert', 'error_type', 'perf_watch:collector:' || c.name, 'route', 'ops.perf_health_run',
          'source_app', 'database', 'source_feature', 'perf',
          'error_text', format('The performance %s collector is not healthy: %s.', c.name, c.bad),
          'created_by', v_actor,
          'context', jsonb_build_object('signature', 'perf_watch:collector:' || c.name, 'collector', c.name,
                                        'last_finished_at', c.last_at, 'line', c.bad)));
        v_notified := 0;
        for v_admin in select a.user_id from admin.admins a join auth.users u on u.id = a.user_id order by a.user_id loop
          perform communication.notify_from_sql(v_sys, 'platform.perf.watch_alert', v_admin, null, null,
            jsonb_build_object('notice', jsonb_build_object('subject', format('The performance %s collector stopped', c.name), 'line', c.bad)),
            '/administration/reporting/performance', null, null,
            format('perf_watch:collector:%s:%s:%s', c.name, to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), v_admin), '{}'::jsonb);
          v_notified := v_notified + 1;
        end loop;
        v_collectors := jsonb_set(v_collectors, array[(jsonb_array_length(v_collectors) - 1)::text, 'alerted'], to_jsonb(v_notified));
      end if;
    else
      update ops.system_error set resolved_at = now(), resolution_note = format('the %s collector finished again at %s', c.name, c.last_at)
       where kind = 'perf_watch_alert' and resolved_at is null
         and error_type in ('perf_watch:collector:' || c.name, 'perf_watch:collector:' || c.name || ':probe_broken');
    end if;
  end loop;

  -- Stale watches: silent under a sick collector (its one alert covers them), alerted under a healthy one.
  for w in
    select p.* from ops.proof_check p
     where p.kind = 'perf' and p.perf_kind in ('door', 'statement') and p.is_active and p.deleted_at is null
       and p.perf_state is distinct from 'stale' and p.perf_state is distinct from 'paused'
       and coalesce(p.last_run_at, p.created_at) < now() - make_interval(secs => v_k * p.live_every_seconds)
     order by p.slug
  loop
    v_coll_bad := case w.perf_kind when 'door' then v_probe_bad else v_stmt_bad end;
    v_reason := format('stale: no sample since %s (%s × the %s-minute cadence)', coalesce(w.last_run_at::text, 'it was declared'),
                       v_k, round(w.live_every_seconds / 60.0));
    update ops.proof_check
       set perf_state = 'stale', perf_state_since = now(), last_verdict = 'fail',
           metadata = metadata || jsonb_build_object('perf_last_reason', v_reason, 'perf_stale_from', w.perf_state)
     where id = w.id;
    v_stale := v_stale || jsonb_build_object('slug', w.slug, 'from', w.perf_state, 'silent', v_coll_bad is not null);
    if v_coll_bad is null and not (coalesce(w.perf_state, 'learning') = any (array['over_budget', 'regressed', 'erroring', 'stale', 'probe_broken'])) then
      v_items := v_items || jsonb_build_object('check_id', w.id, 'slug', w.slug, 'label', w.label, 'state', 'stale',
                                               'prior_state', w.perf_state, 'budget_ms', w.budget_ms, 'stat', w.budget_stat,
                                               'owner', w.owner, 'reason', v_reason);
    end if;
  end loop;
  if jsonb_array_length(v_items) > 0 then
    v_alert_out := ops.perf_alert(v_items);
  end if;

  return jsonb_build_object('collectors', v_collectors, 'stale', v_stale, 'alerts', v_alert_out);
end;
$function$;
