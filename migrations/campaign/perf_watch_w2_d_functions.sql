-- chair-step: the REVOKEs withdraw EXECUTE from public/anon (and, for the server-only functions, authenticated) on the functions this same file creates; each is declared in platform.client_callable_door first. Nothing that existed before is narrowed. Emits no policy.
--
-- perf_watch_w2_d_functions.sql
--
-- PERFORMANCE WATCH, WAVE 2 — STATEMENT HISTORY, STALE + COLLECTOR HEALTH, THE ADMIN EDIT DOOR.
-- Design: common-docs/systems/architecture/observability/performance-watch/PLAN.md §2 (statement
-- history), §4 (stale), §5 (collector health), §6 (edit budget / pin baseline / pause), Knobs.
--
--   ops.perf_statement_collect()   hourly (pg_cron, _e): snapshot pg_stat_statements for every
--                                  statement watch's queryids (re-resolved from the PostgREST call
--                                  text `"<schema>"."<fn>"(` on every run) and the top
--                                  perf.statement_top_n by total time, then diff against the previous
--                                  snapshot into ops.perf_sample (source 'statement': mean_ms, calls,
--                                  max_ms). A counter that went down, a changed stats_reset or a
--                                  vanished queryid drops that interval (or key) with a note — never
--                                  a fake fast reading. Trims snapshots past the retention knob.
--   ops.perf_health_run()          hourly (pg_cron, _e): marks watches stale after
--                                  perf.stale_after_cadences × cadence with no sample; ONE alert per
--                                  collector (probe / statement) that has not finished in that many
--                                  cadences or reported probe_broken — its watches turn stale silently
--                                  under it; a healthy collector's stale watches alert (grouped when
--                                  ≥ perf.group_alert_min). Recovery resolves the collector row.
--   ops.perf_watch_update(...)     platform-admin-only CLIENT door: edit budget, pause/resume, pin or
--                                  unpin the baseline; who/when/what is kept in metadata.perf_edits.
--
-- DIFF RULES (per key userid × dbid × queryid × toplevel, pg_stat_statements 1.11 / PG 17):
--   both snapshots, same stats_since, counters not lower      → Δcalls, Δtotal kept
--   stats_since moved past the previous snapshot (re-created)  → counted from zero (whole counter)
--   only in the new snapshot, created after the previous one   → counted from zero
--   only in the new snapshot, older than the previous one      → dropped (was never captured)
--   counter went down with the same stats_since                → dropped
--   only in the previous snapshot (evicted)                    → dropped: its last calls are lost
--   stats_reset changed                                        → the whole interval dropped
--   interval max_ms is known only when the key's max grew (or its min/max window restarted)
-- Inverse: migrations/inverse/perf_watch_w2_d_functions_down.sql.

-- ── Knobs (feature `perf`, wave-2 set) ─────────────────────────────────────────────────────────
insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('perf', 'statement_top_n', to_jsonb(50), to_jsonb(50), 'integer', 'statements', 0, 1000,
   'Top statements kept each hour',
   'Besides the watched statements, the hourly snapshot keeps this many statements with the most total time.',
   'agent', 'PLAN §2: the top 50 by total time answer "what got slow" for statements nobody watches yet.', date '2027-01-08', '{}'),
  ('perf', 'statement_cadence_minutes', to_jsonb(60), to_jsonb(60), 'integer', 'minutes', 15, 1440,
   'Statement history cadence',
   'How often the statement collector is expected to finish; used for stale and collector-health judgments.',
   'agent', 'PLAN §2: hourly; one catalog read per hour.', date '2027-01-08', '{}'),
  ('perf', 'statement_snapshot_retention_days', to_jsonb(14), to_jsonb(14), 'integer', 'days', 1, 365,
   'Raw statement snapshots kept',
   'Raw hourly counter snapshots older than this are moved to the trash; the samples derived from them stay.',
   'agent', 'Only the newest snapshot is ever diffed; two weeks of raw counters answer any audit of a sample.', date '2027-01-08', '{}'),
  ('perf', 'stale_after_cadences', to_jsonb(3), to_jsonb(3), 'integer', 'cadences', 2, 48,
   'Stale after missed cadences',
   'A watch with no sample for this many cadences is stale; a collector that has not finished for this many is alerted once.',
   'agent', 'PLAN §4/§5: three missed runs is never a hiccup.', date '2027-01-08', '{}')
on conflict (feature, key) do nothing;

-- ── The statement collector (PLAN §2) ──────────────────────────────────────────────────────────
create or replace function ops.perf_statement_collect()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_knobs jsonb := ops.perf_knobs();
  v_top int;
  v_keep_days int;
  v_run uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_reset timestamptz;
  v_prev record;
  v_rows int;
  w record;
  d record;
  v_note text;
  v_rec jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_done jsonb := '[]'::jsonb;
  v_alert_out jsonb;
  v_trimmed int;
begin
  if not coalesce((v_knobs->>'enabled')::boolean, true) then
    return jsonb_build_object('skipped', 'perf.enabled is off');
  end if;
  v_top := coalesce((v_knobs->>'statement_top_n')::int, 50);
  v_keep_days := coalesce((v_knobs->>'statement_snapshot_retention_days')::int, 14);
  perform set_config('app.user_id', v_actor::text, true);
  select stats_reset into v_reset from extensions.pg_stat_statements_info;

  -- The previous snapshot (before this one is written).
  select s.run_id, s.taken_at, s.stats_reset into v_prev
    from ops.perf_statement_snapshot s
   where s.deleted_at is null
   order by s.taken_at desc
   limit 1;

  -- This snapshot: every statement whose text calls a watched door the PostgREST way, and the top N.
  insert into ops.perf_statement_snapshot (run_id, taken_at, stats_reset, userid, dbid, queryid, toplevel, calls,
                                           total_exec_time_ms, max_exec_time_ms, stddev_exec_time_ms, stats_since,
                                           minmax_stats_since, watch_slugs, in_top, query_head, organization_id, created_by)
  with watched as (
    select p.slug, format('"%s"."%s"(', p.perf_subject->>'schema', p.perf_subject->>'function') pat
      from ops.proof_check p
     where p.kind = 'perf' and p.perf_kind = 'statement' and p.deleted_at is null
  ), s as (
    select st.*, row_number() over (order by st.total_exec_time desc) rk
      from extensions.pg_stat_statements(true) st
     where st.dbid = (select oid from pg_database where datname = current_database())
       and st.queryid is not null
  ), m as (
    select s.*, coalesce((select array_agg(x.slug order by x.slug) from watched x where strpos(s.query, x.pat) > 0), '{}'::text[]) slugs
      from s
  )
  select v_run, v_now, v_reset, m.userid::bigint, m.dbid::bigint, m.queryid, m.toplevel, m.calls,
         m.total_exec_time, m.max_exec_time, m.stddev_exec_time, m.stats_since, m.minmax_stats_since,
         m.slugs, m.rk <= v_top, left(m.query, 300), v_sys, v_actor
    from m
   where m.rk <= v_top or cardinality(m.slugs) > 0;
  get diagnostics v_rows = row_count;

  for w in
    select p.* from ops.proof_check p
     where p.kind = 'perf' and p.perf_kind = 'statement' and p.is_active and p.deleted_at is null
     order by p.slug
  loop
    if v_prev.run_id is null then
      v_note := 'first snapshot: the next run gives the first sample';
    elsif v_prev.stats_reset is distinct from v_reset then
      v_note := format('interval dropped: pg_stat_statements was reset (%s → %s)', v_prev.stats_reset, v_reset);
    else
      v_note := null;
    end if;
    if v_note is not null then
      update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_collect_at', v_now, 'perf_last_collect_note', v_note)
       where id = w.id;
      v_done := v_done || jsonb_build_object('slug', w.slug, 'note', v_note);
      continue;
    end if;

    with cur as (
      select * from ops.perf_statement_snapshot where run_id = v_run and w.slug = any (watch_slugs)
    ), prv as (
      select * from ops.perf_statement_snapshot where run_id = v_prev.run_id and w.slug = any (watch_slugs) and deleted_at is null
    ), pair as (
      select c.queryid cq, p.queryid pq, c.calls cc, p.calls pc, c.total_exec_time_ms ct, p.total_exec_time_ms pt,
             c.max_exec_time_ms cm, p.max_exec_time_ms pm, c.stats_since cs, p.stats_since ps,
             c.minmax_stats_since cms, p.minmax_stats_since pms,
             case
               when p.queryid is null and c.stats_since >= v_prev.taken_at then 'new'
               when p.queryid is null then 'uncaptured'
               when c.queryid is null then 'vanished'
               when c.stats_since is distinct from p.stats_since and c.stats_since >= v_prev.taken_at then 'recreated'
               when c.stats_since is distinct from p.stats_since then 'moved'
               when c.calls < p.calls or c.total_exec_time_ms < p.total_exec_time_ms then 'decreased'
               else 'kept' end k
        from cur c
        full join prv p on p.userid = c.userid and p.dbid = c.dbid and p.queryid = c.queryid and p.toplevel = c.toplevel
    )
    select coalesce(sum(case when k = 'kept' then cc - pc when k in ('new', 'recreated') then cc end), 0)::bigint dcalls,
           coalesce(sum(case when k = 'kept' then ct - pt when k in ('new', 'recreated') then ct end), 0)::numeric dtotal,
           max(case when k in ('new', 'recreated') then cm
                    when k = 'kept' and (cm > coalesce(pm, -1) or cms is distinct from pms) then cm end) dmax,
           count(distinct cq) filter (where k in ('kept', 'new', 'recreated')) n_q,
           count(*) filter (where k = 'new') n_new,
           count(*) filter (where k = 'recreated') n_recreated,
           count(*) filter (where k in ('vanished', 'decreased', 'uncaptured', 'moved')) n_dropped,
           string_agg(distinct k, ',') filter (where k in ('vanished', 'decreased', 'uncaptured', 'moved')) why_dropped
      into d from pair;

    v_note := concat_ws(' · ',
      format('mean of %s real calls since %s (%s queryid%s)', d.dcalls, to_char(v_prev.taken_at at time zone 'UTC', 'HH24:MI "UTC"'), d.n_q, case when d.n_q = 1 then '' else 's' end),
      case when d.n_new + d.n_recreated > 0 then format('%s queryid(s) new since the last snapshot, counted from zero', d.n_new + d.n_recreated) end,
      case when d.n_dropped > 0 then format('%s queryid(s) dropped from this interval (%s)', d.n_dropped, d.why_dropped) end,
      case when d.dmax is null and d.dcalls > 0 then 'max unknown this interval (no new maximum)' end);

    if d.dcalls = 0 then
      -- No real caller in the interval: nothing to judge, but the collector did look.
      update ops.proof_check
         set last_run_at = v_now,
             metadata = metadata || jsonb_build_object('perf_last_collect_at', v_now,
                                                       'perf_last_collect_note', 'no real calls in the interval' ||
                                                         case when d.n_dropped > 0 then format(' (%s queryid(s) dropped: %s)', d.n_dropped, d.why_dropped) else '' end)
       where id = w.id;
      v_done := v_done || jsonb_build_object('slug', w.slug, 'calls', 0);
      continue;
    end if;

    v_rec := ops.perf_record_sample(w.id, 'statement', jsonb_build_object(
               'n', least(d.dcalls, 2147483647), 'calls', d.dcalls,
               'mean_ms', round(d.dtotal / d.dcalls, 3), 'max_ms', round(d.dmax::numeric, 3),
               'errors', 0, 'measured_at', v_now, 'note', v_note), true);
    update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_collect_at', v_now) - 'perf_last_collect_note'
     where id = w.id;
    if jsonb_typeof(v_rec->'alert_item') = 'object' then
      v_alerts := v_alerts || jsonb_build_array(v_rec->'alert_item');
    end if;
    v_done := v_done || jsonb_build_object('slug', w.slug, 'calls', d.dcalls, 'mean_ms', round(d.dtotal / d.dcalls, 1),
                                           'state', v_rec->>'state', 'dropped', d.n_dropped);
  end loop;

  if jsonb_array_length(v_alerts) > 0 then
    v_alert_out := ops.perf_alert(v_alerts);
  end if;

  update ops.perf_statement_snapshot set deleted_at = now()
   where deleted_at is null and taken_at < now() - make_interval(days => v_keep_days);
  get diagnostics v_trimmed = row_count;

  return jsonb_build_object('run_id', v_run, 'rows', v_rows, 'previous', v_prev.taken_at, 'stats_reset', v_reset,
                            'watches', v_done, 'alerts', v_alert_out, 'trimmed', v_trimmed);
end;
$function$;

-- ── Stale + collector health (PLAN §4 stale, §5 collector health) ─────────────────────────────
create or replace function ops.perf_health_run()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
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

-- ── The admin edit door (PLAN §6: edit budget / pause / pin baseline) ─────────────────────────
-- NULL leaves a value as it is. Pause = is_active false + state 'paused' (no probe, no sample
-- judged, no stale); resume = learning until the next sample judges it. Pinning without a
-- number pins the current baseline. Every edit is appended to metadata.perf_edits (last 50).
create or replace function ops.perf_watch_update(
  p_check_id uuid, p_budget_ms numeric default null, p_is_active boolean default null,
  p_baseline_ms numeric default null, p_baseline_pinned boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_me uuid := auth.uid();
  c ops.proof_check%rowtype;
  v_changes jsonb := '{}'::jsonb;
  v_pin boolean;
  v_base numeric;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can change a performance watch.' using errcode = '42501';
  end if;
  select * into c from ops.proof_check where id = p_check_id and kind = 'perf' and deleted_at is null for update;
  if not found then
    raise exception 'No performance watch %.', p_check_id using errcode = 'P0002';
  end if;
  if p_budget_ms is not null and p_budget_ms <= 0 then
    raise exception 'A budget is a positive number of milliseconds.' using errcode = '22023';
  end if;
  if p_baseline_ms is not null and p_baseline_ms < 0 then
    raise exception 'A baseline is zero or more milliseconds.' using errcode = '22023';
  end if;
  perform set_config('app.user_id', coalesce(v_me, '87a6e699-3622-4869-8843-d0867456c0dd'::uuid)::text, true);

  if p_budget_ms is not null and p_budget_ms is distinct from c.budget_ms then
    v_changes := v_changes || jsonb_build_object('budget_ms', jsonb_build_object('from', c.budget_ms, 'to', p_budget_ms));
  end if;
  v_pin := coalesce(p_baseline_pinned, case when p_baseline_ms is not null then true end, c.perf_baseline_pinned);
  v_base := case when v_pin then coalesce(p_baseline_ms, c.perf_baseline_ms) else c.perf_baseline_ms end;
  if v_pin and v_base is null then
    raise exception 'This watch has no baseline yet; give a number to pin.' using errcode = '22023';
  end if;
  if v_pin is distinct from c.perf_baseline_pinned or (v_pin and v_base is distinct from c.perf_baseline_ms) then
    v_changes := v_changes || jsonb_build_object('baseline', jsonb_build_object(
      'from', jsonb_build_object('ms', c.perf_baseline_ms, 'pinned', c.perf_baseline_pinned),
      'to', jsonb_build_object('ms', v_base, 'pinned', v_pin)));
  end if;
  if p_is_active is not null and p_is_active is distinct from c.is_active then
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('from', c.is_active, 'to', p_is_active));
  end if;
  if v_changes = '{}'::jsonb then
    return jsonb_build_object('id', c.id, 'changed', false);
  end if;

  update ops.proof_check
     set budget_ms = coalesce(p_budget_ms, budget_ms),
         perf_baseline_pinned = v_pin,
         perf_baseline_ms = v_base,
         is_active = coalesce(p_is_active, is_active),
         perf_state = case when p_is_active is false and c.is_active then 'paused'
                           when p_is_active is true and not c.is_active then 'learning'
                           else perf_state end,
         perf_state_since = case when p_is_active is not null and p_is_active is distinct from c.is_active then now() else perf_state_since end,
         metadata = metadata
                    || case when p_is_active is false and c.is_active then jsonb_build_object('perf_paused_from', c.perf_state) else '{}'::jsonb end
                    || case when p_is_active is true and not c.is_active
                            then jsonb_build_object('perf_last_reason', 'resumed: judged again from the next sample') else '{}'::jsonb end
                    || jsonb_build_object(
                         'perf_last_edit', jsonb_build_object('by', v_me, 'at', now(), 'changes', v_changes),
                         'perf_edits', (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                                          from (select e, o from jsonb_array_elements(
                                                  coalesce(metadata->'perf_edits', '[]'::jsonb)
                                                  || jsonb_build_array(jsonb_build_object('by', v_me, 'at', now(), 'changes', v_changes)))
                                                  with ordinality x(e, o)
                                                order by o desc limit 50) t))
   where id = c.id
   returning * into c;
  return jsonb_build_object('id', c.id, 'changed', true, 'changes', v_changes, 'budget_ms', c.budget_ms,
                            'is_active', c.is_active, 'perf_state', c.perf_state,
                            'perf_baseline_ms', c.perf_baseline_ms, 'perf_baseline_pinned', c.perf_baseline_pinned);
end;
$function$;

-- ── Door rows, then grants ────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array['ops.perf_statement_collect()', 'ops.perf_health_run()'] loop
    insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                               reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
           (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
           'Performance watch collectors (performance-watch PLAN §2, §5): the hourly statement-history snapshot and the stale / collector-health check. They take no argument and act on platform-scoped watch rows only.',
           'matrx-frontend/migrations/campaign/perf_watch_w2_d_functions.sql',
           'server_only: the pg_cron jobs perf-watch-statements and perf-watch-health (as postgres) are the only callers; no browser or signed-in client ever runs a collector.',
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
  select 'ops', 'perf_watch_update', pg_get_function_identity_arguments(p.oid),
         (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
         'SIGNED-IN door, platform admins only: edits one performance watch on /administration/reporting/performance — budget, pause/resume, pin/unpin baseline (performance-watch PLAN §6). The body refuses anyone who is not a platform admin inside the admin lane (42501) before reading the row; who/when/what is recorded in the watch''s metadata.perf_edits.',
         'matrx-frontend/migrations/campaign/perf_watch_w2_d_functions.sql',
         'public.is_platform_admin()', true, false
    from pg_proc p
   where p.oid = 'ops.perf_watch_update(uuid, numeric, boolean, numeric, boolean)'::regprocedure
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = 'ops' and d.function_name = 'perf_watch_update'
                        and d.identity_args = pg_get_function_identity_arguments(p.oid));
  revoke all on function ops.perf_watch_update(uuid, numeric, boolean, numeric, boolean) from anon;  -- PUBLIC's default was cleared at birth (ddl_guard §6d-4)
  grant execute on function ops.perf_watch_update(uuid, numeric, boolean, numeric, boolean) to authenticated, service_role;
end
$grants$;

-- Retention policy row: purge a trashed raw snapshot a week after the collector trashes it.
insert into platform.retention_policy (scope, entity_token, organization_id, trigger_kind, mode, retention_days,
                                       label, description, basis, set_by, review_due)
select 'entity', 'ops_perf_statement_snapshot', '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'soft_deleted', 'purge', 7,
       'Statement snapshot retention',
       'Purges a raw statement snapshot 7 days after the hourly collector trashed it (older than perf.statement_snapshot_retention_days).',
       'performance-watch PLAN §2: only the newest snapshot is diffed; the samples derived from older ones stay in ops.perf_sample.',
       'agent', date '2027-04-08'
 where not exists (select 1 from platform.retention_policy p where p.entity_token = 'ops_perf_statement_snapshot'
                    and p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

-- ── In-file assertions: roll everything back unless each holds ────────────────────────────────
do $assert$
begin
  if not iam.canonical_certify_ok('ops', 'perf_statement_snapshot', 'ops_perf_statement_snapshot') then
    raise exception 'ops.perf_statement_snapshot is not canonical-certified: %',
      (select string_agg(x::text, '; ') from iam.verify_canonical('ops', 'perf_statement_snapshot', 'ops_perf_statement_snapshot', 'system') x);
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'ops.perf_statement_snapshot'::regclass and polname = 'platform_admin_read') then
    raise exception 'ops.perf_statement_snapshot has no platform_admin_read — our own admin database access is required';
  end if;
  if has_table_privilege('authenticated', 'ops.perf_statement_snapshot', 'INSERT')
     or has_table_privilege('authenticated', 'ops.perf_statement_snapshot', 'UPDATE')
     or has_table_privilege('authenticated', 'ops.perf_statement_snapshot', 'DELETE') then
    raise exception 'ops.perf_statement_snapshot still grants a client write privilege';
  end if;
  if has_function_privilege('authenticated', 'ops.perf_statement_collect()', 'EXECUTE')
     or has_function_privilege('authenticated', 'ops.perf_health_run()', 'EXECUTE')
     or has_function_privilege('anon', 'ops.perf_watch_update(uuid, numeric, boolean, numeric, boolean)', 'EXECUTE') then
    raise exception 'a perf collector is callable by a client role, or the edit door by anon';
  end if;
  if not has_function_privilege('authenticated', 'ops.perf_watch_update(uuid, numeric, boolean, numeric, boolean)', 'EXECUTE') then
    raise exception 'the edit door lost its authenticated EXECUTE (a DDL guard revoked it?)';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
