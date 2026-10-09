-- based-on: ops.perf_health_run() b3ab5df047ab3a0051edffdb653992208e62defb36af3868f2f69a6c4a974861
-- based-on: ops.perf_judge(uuid) d150eedbeb2714d5a565bd7191540d1121a8c8a766be4d36fe506b185e9c8d7e
-- based-on: ops.perf_record_sample(uuid, text, jsonb, boolean) 98513ff321a8433bd767bf6dfe92eb9eaf97e522493cfc9104994ccc77bc0e10
--
-- perf_watch_w3_b_review_fixes_and_knobs.sql
--
-- PERFORMANCE WATCH, WAVE 3 — REVIEW FIXES OF WAVE 2 + THE WAVE-3 KNOBS.
-- Design: common-docs/systems/architecture/observability/performance-watch/PLAN.md §2, §4, §5.
--   1. ops.perf_health_run: a failed collector run that a later run of the same job had ALREADY
--      healed (succeeded) before the health check ran is recorded resolved and rings no bell; the
--      failed-run watch also covers the two new wave-3 collectors (perf-watch-jobs, perf-watch-vitals).
--   2. ops.perf_judge: judges only samples after the latest marker (a re-declared subject,
--      perf_watch_w3_a), never the marker itself, and reads p75 from the sample's metadata (vitals).
--   3. ops.perf_record_sample: stores p_stats.metadata on the sample (p75 for vitals).
--   4. Knobs: perf.client_sample_rate (organization/user may override — a person can raise it for
--      themselves), perf.vital_min_n, perf.client_raw_retention_days, perf.job_budget_multiple,
--      perf.job_budget_floor_ms.
-- Inverse: migrations/inverse/perf_watch_w3_b_review_fixes_and_knobs_down.sql.
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
  v_failed jsonb;
  v_failed_last timestamptz;
  v_later_ok boolean;
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

  -- WAVE 2 (review of wave 1): a run that FAILED (statement timeout, error) rolled back every trace
  -- it would have left; pg_cron's own record survives. Each failed run alerts once (by runid), and
  -- the row is resolved at once when a later run of the same job succeeded.
  for c in select * from (values ('probe', 'perf-watch-probe'), ('statement', 'perf-watch-statements'),
                                 ('job', 'perf-watch-jobs'), ('vital', 'perf-watch-vitals')) x(name, job) loop
    select jsonb_agg(jsonb_build_object('runid', d.runid, 'started', d.start_time, 'message', left(d.return_message, 300)) order by d.start_time),
           max(d.start_time)
      into v_failed, v_failed_last
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname = c.job and d.status = 'failed'
       and d.start_time > now() - make_interval(mins => greatest(2 * v_stmt_cad, 120))
       and not exists (select 1 from ops.system_error e where e.kind = 'perf_watch_alert'
                         and e.error_type = 'perf_watch:collector:' || c.name || ':failed_run'
                         and e.context->'runids' @> to_jsonb(d.runid));
    if v_failed is not null then
      -- WAVE 3 (review of wave 2): a later run of the same job that already SUCCEEDED before this
      -- check ran means the failure healed itself — the row is kept for the record, resolved at
      -- once, and rings no bell.
      v_later_ok := exists (select 1 from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                             where j.jobname = c.job and d.status = 'succeeded' and d.start_time > v_failed_last);
      v_err := ops.record_system_error(jsonb_build_object(
        'kind', 'perf_watch_alert', 'error_type', 'perf_watch:collector:' || c.name || ':failed_run', 'route', 'ops.perf_health_run',
        'source_app', 'database', 'source_feature', 'perf',
        'error_text', format('%s run(s) of the performance %s collector failed: %s', jsonb_array_length(v_failed), c.name, v_failed->-1->>'message'),
        'created_by', v_actor,
        'context', jsonb_build_object('signature', 'perf_watch:collector:' || c.name || ':failed_run', 'collector', c.name,
                                      'runids', (select jsonb_agg(f->'runid') from jsonb_array_elements(v_failed) f), 'runs', v_failed)));
      if v_later_ok then
        update ops.system_error set resolved_at = now(),
               resolution_note = 'a later run of the same job had already succeeded before the health check ran; no bell'
         where id = v_err;
      else
        for v_admin in select a.user_id from admin.admins a join auth.users u on u.id = a.user_id order by a.user_id loop
          perform communication.notify_from_sql(v_sys, 'platform.perf.watch_alert', v_admin, null, null,
            jsonb_build_object('notice', jsonb_build_object('subject', format('A performance %s run failed', c.name),
                                                            'line', left(v_failed->-1->>'message', 200))),
            '/administration/reporting/performance', null, null,
            format('perf_watch:collector:%s:failed_run:%s:%s', c.name, v_failed->-1->>'runid', v_admin), '{}'::jsonb);
        end loop;
      end if;
      v_collectors := v_collectors || jsonb_build_object('collector', c.name, 'failed_runs', v_failed, 'healed', v_later_ok);
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
                                            and coalesce((m.metadata->>'perf_marker')::boolean, false)), '-infinity')
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
                               bytes, release_sha, note, organization_id, created_by, metadata)
  values (c.id, coalesce((v_s->>'measured_at')::timestamptz, now()), p_source,
          coalesce((v_s->>'n')::int, 0), (v_s->>'p50_ms')::numeric, (v_s->>'p95_ms')::numeric,
          (v_s->>'max_ms')::numeric, (v_s->>'mean_ms')::numeric, (v_s->>'calls')::bigint,
          coalesce((v_s->>'errors')::int, 0), (v_s->>'bytes')::bigint, v_s->>'release_sha',
          left(v_s->>'note', 1000), v_sys, v_actor,
          -- WAVE 3: p75 (vitals) and other per-sample facts ride in metadata.
          case when jsonb_typeof(v_s->'metadata') = 'object' then v_s->'metadata' else '{}'::jsonb end)
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
                    || case when (j->>'episode_start')::boolean then jsonb_build_object('perf_episode_started_at', now()) else '{}'::jsonb end
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

insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('perf', 'client_sample_rate', to_jsonb(0.05), to_jsonb(0.05), 'number', 'share', 0, 1,
   'Page-speed sample rate',
   'Share of page loads that report real-user page speed (LCP, INP, CLS, TTFB, FCP). 0 turns it off.',
   'agent', 'PLAN §2: 5% of loads gives a stable p75 per busy route at no cost to the other 95%; a person may raise it for themselves to test.', date '2027-01-08', '{organization,user}'),
  ('perf', 'vital_min_n', to_jsonb(30), to_jsonb(30), 'integer', 'samples', 1, 10000,
   'Page-speed samples per hour',
   'A route''s page-speed numbers are rolled up for an hour only when at least this many loads reported.',
   'agent', 'PLAN §2: below 30 loads a p75 swings with one slow phone; the count is shown beside every number.', date '2027-01-08', '{}'),
  ('perf', 'client_raw_retention_days', to_jsonb(7), to_jsonb(7), 'integer', 'days', 1, 90,
   'Raw page-speed retention',
   'Raw page-speed reports are deleted after this many days; the hourly roll-ups stay with the other samples.',
   'agent', 'PLAN §2: the roll-up is the history; a week of raw rows is enough to re-roll a bad hour.', date '2027-01-08', '{}'),
  ('perf', 'job_budget_multiple', to_jsonb(3), to_jsonb(3), 'number', 'x', 1, 100,
   'Job budget multiple',
   'A scheduled job''s watch is declared with a budget of this many times its current p95 run time.',
   'agent', 'PLAN §2: jobs vary with the data they find; 3x today''s p95 flags a real change, not a busy hour.', date '2027-01-08', '{}'),
  ('perf', 'job_budget_floor_ms', to_jsonb(1000), to_jsonb(1000), 'number', 'ms', 1, 3600000,
   'Job budget floor',
   'No scheduled job''s budget is declared below this, so a 5 ms job is not alerted for taking 20 ms.',
   'agent', 'PLAN §2: below a second, a job''s run time is scheduler noise.', date '2027-01-08', '{}')
on conflict (feature, key) do nothing;
