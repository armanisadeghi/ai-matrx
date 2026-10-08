-- migrate: skip: a test script, never a migration. It runs against live inside BEGIN … ROLLBACK and leaves nothing behind.
--
-- perf_watch_w1_tests.sql — forcing-function tests for performance watch wave 1
-- (perf_watch_w1_c_functions.sql). Every block RAISEs on failure; a clean run prints PASS lines.
--   (a) the pure rule on synthetic histories: learning, ok, over_budget, regressed, frozen
--       baseline during a regression, cooldown, single spike never alerts
--   (b) a probe run of custom.record_update leaves the record's updated_at and version unchanged
--       and writes no outbox / history row (with a live control proving the detector sees a write)
--   (c) a forced bad transition writes exactly one system_error row and one bell per platform
--       admin, and a second sample in the same bad state repeats neither
-- Run (session-mode 5432 connection as postgres; any client that runs a multi-statement script):
--   the file itself carries BEGIN and ROLLBACK.
begin;
set local statement_timeout = '90s';
set local lock_timeout = '2s';

-- ── (a) the pure rule ─────────────────────────────────────────────────────────────────────────
do $a$
declare
  k jsonb := '{"eval_window":3,"baseline_min_samples":12,"baseline_days":7,"regression_pct":50,"regression_min_ms":50,"regression_mad_k":4,"alert_cooldown_minutes":60}';
  w jsonb := '{"budget_ms":300,"budget_stat":"p95","state":"ok","baseline_pinned":false}';
  now_ timestamptz := '2026-10-08 12:00:00+00';
  -- n samples, newest first, p95 values given, older ones marked state_after
  h jsonb;
  r jsonb;
  function_h text;
begin
  -- helper shape: newest-first array
  -- learning: 5 healthy samples
  select jsonb_agg(jsonb_build_object('measured_at', now_ - make_interval(mins => 15 * i), 'n', 10, 'errors', 0,
                                      'p95_ms', 100, 'state_after', 'learning') order by i)
    into h from generate_series(0, 4) i;
  r := ops.perf_judge_rule(h, w || '{"state":"learning"}', k, now_);
  if r->>'state' <> 'learning' or (r->>'alert')::boolean then raise exception '(a) learning: got %', r; end if;
  raise notice 'PASS (a) learning: %', r->>'reason';

  -- ok: 20 samples at 100 ms
  select jsonb_agg(jsonb_build_object('measured_at', now_ - make_interval(mins => 15 * i), 'n', 10, 'errors', 0,
                                      'p95_ms', 100 + (i % 3), 'state_after', 'ok') order by i)
    into h from generate_series(0, 19) i;
  r := ops.perf_judge_rule(h, w, k, now_);
  if r->>'state' <> 'ok' or (r->>'alert')::boolean then raise exception '(a) ok: got %', r; end if;
  raise notice 'PASS (a) ok: %', r->>'reason';

  -- over_budget: the newest 3 at 400 ms against a 300 ms budget → alert from ok
  select jsonb_agg(jsonb_build_object('measured_at', now_ - make_interval(mins => 15 * i), 'n', 10, 'errors', 0,
                                      'p95_ms', case when i < 3 then 400 else 100 end, 'state_after', 'ok') order by i)
    into h from generate_series(0, 19) i;
  r := ops.perf_judge_rule(h, w, k, now_);
  if r->>'state' <> 'over_budget' or not (r->>'alert')::boolean then raise exception '(a) over_budget: got %', r; end if;
  raise notice 'PASS (a) over_budget alerts: %', r->>'reason';

  -- regressed: baseline 100, newest 3 at 200, budget 1000 → over the line 150 → alert
  r := ops.perf_judge_rule(
         (select jsonb_agg(jsonb_build_object('measured_at', now_ - make_interval(mins => 15 * i), 'n', 10, 'errors', 0,
                                              'p95_ms', case when i < 3 then 200 else 100 + (i % 3) end, 'state_after', 'ok') order by i)
            from generate_series(0, 19) i),
         w || '{"budget_ms":1000}', k, now_);
  if r->>'state' <> 'regressed' or not (r->>'alert')::boolean or (r->>'baseline_ms')::numeric > 102 then
    raise exception '(a) regressed: got %', r;
  end if;
  raise notice 'PASS (a) regressed alerts: %', r->>'reason';

  -- frozen baseline: 30 samples at 200 taken while regressed sit between the window and the
  -- healthy history; they never enter the baseline, so it stays 100 and the watch stays
  -- regressed — and a watch already regressed does not alert again.
  r := ops.perf_judge_rule(
         (select jsonb_agg(jsonb_build_object('measured_at', now_ - make_interval(mins => 15 * i), 'n', 10, 'errors', 0,
                                              'p95_ms', case when i < 33 then 200 else 100 end,
                                              'state_after', case when i < 33 then 'regressed' else 'ok' end) order by i)
            from generate_series(0, 50) i),
         w || '{"budget_ms":1000,"state":"regressed"}', k, now_);
  if r->>'state' <> 'regressed' or (r->>'alert')::boolean or (r->>'baseline_ms')::numeric <> 100 then
    raise exception '(a) frozen baseline: got %', r;
  end if;
  raise notice 'PASS (a) frozen baseline %: still regressed, no repeat alert', r->>'baseline_ms';

  -- cooldown: recovered 10 minutes ago → the new over_budget is NOT alerted; 2 hours ago → it is
  select jsonb_agg(jsonb_build_object('measured_at', now_ - make_interval(mins => 15 * i), 'n', 10, 'errors', 0,
                                      'p95_ms', case when i < 3 then 400 else 100 end, 'state_after', 'ok') order by i)
    into h from generate_series(0, 19) i;
  r := ops.perf_judge_rule(h, w || jsonb_build_object('last_recovery_at', now_ - interval '10 minutes'), k, now_);
  if r->>'state' <> 'over_budget' or (r->>'alert')::boolean or r->>'alert_suppressed' is null then
    raise exception '(a) cooldown: got %', r;
  end if;
  r := ops.perf_judge_rule(h, w || jsonb_build_object('last_recovery_at', now_ - interval '2 hours'), k, now_);
  if not (r->>'alert')::boolean then raise exception '(a) cooldown expiry: got %', r; end if;
  raise notice 'PASS (a) cooldown holds the alert for 60 minutes after a recovery';

  -- single spike: newest sample 1000 ms, the two before it 100 → median 100 → ok, no alert
  select jsonb_agg(jsonb_build_object('measured_at', now_ - make_interval(mins => 15 * i), 'n', 10, 'errors', 0,
                                      'p95_ms', case when i = 0 then 1000 else 100 end, 'state_after', 'ok') order by i)
    into h from generate_series(0, 19) i;
  r := ops.perf_judge_rule(h, w, k, now_);
  if r->>'state' <> 'ok' or (r->>'alert')::boolean then raise exception '(a) single spike: got %', r; end if;
  raise notice 'PASS (a) a single 1000 ms spike does not alert';

  -- erroring: every call failed
  r := ops.perf_judge_rule(jsonb_build_array(jsonb_build_object('n', 10, 'errors', 10)) || h, w, k, now_);
  if r->>'state' <> 'erroring' or not (r->>'alert')::boolean then raise exception '(a) erroring: got %', r; end if;
  raise notice 'PASS (a) erroring alerts';
end
$a$;

-- ── (b) a probe of custom.record_update writes nothing that survives ─────────────────────────
do $b$
declare
  v_rec constant uuid := '01627457-8a65-42f5-8592-71cc626a77c9';
  v_org constant uuid := '344cfaa8-2b0c-4971-854a-9694614816f2';
  v_watch uuid;
  v_before record;
  v_after record;
  v_outbox_before bigint;
  v_hist_before bigint;
  v_outbox_after bigint;
  v_hist_after bigint;
  v_run jsonb;
  v_n int;
  v_hours jsonb;
begin
  select version, updated_at, data into v_before from custom.record where id = v_rec;
  v_hours := '22'::jsonb;  -- the value the seeded watch pins (read through read_records_page on 2026-10-08)
  select count(*) into v_outbox_before from custom.io_outbox where record_id = v_rec;
  select count(*) into v_hist_before from history.row_versions where row_id = v_rec;
  v_watch := ops.perf_watch_declare('test:perf-w1:record_update', 'door', 'TEST record_update probe',
    jsonb_build_object('schema', 'custom', 'function', 'record_update', 'argtypes', 'uuid, uuid, jsonb, integer',
                       'args', jsonb_build_object('p_organization_id', v_org, 'p_record_id', v_rec,
                                                  'p_patch', jsonb_build_object('hours', v_hours))),
    300, 'p95', 900, 'PERF-WATCH', 'perf');
  v_run := ops.perf_probe_run(v_watch);
  if current_user <> 'postgres' then raise exception '(b) role did not come back: %', current_user; end if;
  select n, errors into v_n from ops.perf_sample where check_id = v_watch;
  if v_n is null then raise exception '(b) the probe wrote no sample: %', v_run; end if;
  if (select errors from ops.perf_sample where check_id = v_watch) > 0 then
    raise exception '(b) the door failed under the probe: %', (select note from ops.perf_sample where check_id = v_watch);
  end if;
  select version, updated_at, data into v_after from custom.record where id = v_rec;
  select count(*) into v_outbox_after from custom.io_outbox where record_id = v_rec;
  select count(*) into v_hist_after from history.row_versions where row_id = v_rec;
  if v_after.version <> v_before.version or v_after.updated_at <> v_before.updated_at
     or v_after.data is distinct from v_before.data
     or v_outbox_after <> v_outbox_before or v_hist_after <> v_hist_before then
    raise exception '(b) the probe left a write: version % → %, updated_at % → %, outbox % → %, history % → %',
      v_before.version, v_after.version, v_before.updated_at, v_after.updated_at,
      v_outbox_before, v_outbox_after, v_hist_before, v_hist_after;
  end if;
  raise notice 'PASS (b) % timed calls of record_update (p95 % ms) left version %, updated_at %, outbox %, history % unchanged',
    v_n, (select p95_ms from ops.perf_sample where check_id = v_watch), v_after.version, v_after.updated_at, v_outbox_after, v_hist_after;

  -- Control: the same door called for real (inside this rolled-back transaction) IS seen.
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","email":"admin@admin.com"}', true);
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_rec, jsonb_build_object('hours', 23));
  perform set_config('role', 'postgres', true);
  select version, updated_at into v_after from custom.record where id = v_rec;
  if v_after.version = v_before.version then
    raise exception '(b) control: a real record_update did not move the version — the detector is blind';
  end if;
  raise notice 'PASS (b) control: a real write moves version % → %', v_before.version, v_after.version;
end
$b$;

-- ── (c) one alert per episode ─────────────────────────────────────────────────────────────────
do $c$
declare
  v_watch uuid;
  v_admins int;
  v_err int;
  v_notes int;
  v_r jsonb;
  v_stats constant jsonb := '{"n":10,"errors":0,"p50_ms":400,"p95_ms":500,"max_ms":600,"mean_ms":420}';
begin
  select count(*) into v_admins from admin.admins a join auth.users u on u.id = a.user_id;
  v_watch := ops.perf_watch_declare('test:perf-w1:forced', 'door', 'TEST forced over budget',
    '{"schema":"custom","function":"data_home","argtypes":"uuid, text, boolean","args":{"p_include_app_tables":false}}',
    1, 'p95', 900, 'PERF-WATCH', 'perf');
  v_r := ops.perf_record_sample(v_watch, 'probe', v_stats);
  if v_r->>'state' <> 'over_budget' then raise exception '(c) expected over_budget, got %', v_r; end if;
  select count(*) into v_err from ops.system_error where error_type = 'perf_watch:test:perf-w1:forced:over_budget';
  select count(*) into v_notes from communication.notification
   where event_key = 'platform.perf.watch_alert' and dedupe_key like 'perf_watch:test:perf-w1:forced:over_budget:%';
  if v_err <> 1 or v_notes <> v_admins then
    raise exception '(c) first transition: % system_error rows (want 1), % notifications (want % admins)', v_err, v_notes, v_admins;
  end if;
  v_r := ops.perf_record_sample(v_watch, 'probe', v_stats);
  select count(*) into v_err from ops.system_error where error_type = 'perf_watch:test:perf-w1:forced:over_budget';
  select count(*) into v_notes from communication.notification
   where event_key = 'platform.perf.watch_alert' and dedupe_key like 'perf_watch:test:perf-w1:forced:over_budget:%';
  if v_err <> 1 or v_notes <> v_admins or (v_r->>'transition')::boolean then
    raise exception '(c) second sample repeated the alert: % system_error rows, % notifications, %', v_err, v_notes, v_r;
  end if;
  raise notice 'PASS (c) one system_error row and % bells (one per platform admin); the second sample repeated neither', v_notes;
  -- Recovery resolves the row.
  update ops.proof_check set budget_ms = 100000 where id = v_watch;
  perform ops.perf_record_sample(v_watch, 'probe', v_stats);
  perform ops.perf_record_sample(v_watch, 'probe', v_stats);
  v_r := ops.perf_record_sample(v_watch, 'probe', v_stats);
  if exists (select 1 from ops.system_error where error_type = 'perf_watch:test:perf-w1:forced:over_budget' and resolved_at is null) then
    raise exception '(c) recovery did not resolve the alert row: %', v_r;
  end if;
  raise notice 'PASS (c) recovery (%) resolved the alert row', v_r->>'state';
end
$c$;

rollback;
