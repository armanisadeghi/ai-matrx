-- migrate: skip: a test script, never a migration. It runs against live inside BEGIN … ROLLBACK and leaves nothing behind.
--
-- perf_watch_w2_tests.sql — forcing-function tests for performance watch wave 2
-- (perf_watch_w2_d_functions.sql, perf_watch_w2_e_seed_and_cron.sql). Every block RAISEs on
-- failure; a clean run prints PASS lines. The rule fix (a2) lives in perf_watch_w1_tests.sql.
--   (s) the statement collector: a real first snapshot; a counted interval (Δcalls, mean) from a
--       previous snapshot 10 calls behind; a counter that went DOWN and a VANISHED queryid are
--       dropped with a note, never counted; a changed stats_reset drops the whole interval
--   (h) stale + collector health: a healthy probe's stale watches alert GROUPED (≥ group_alert_min
--       transitions → one grouped system_error row + one bell per platform admin, not N); a dead
--       probe raises ONE collector alert, its watches turn stale silently, a second run repeats
--       nothing, and a finished probe resolves the collector row
--   (f) a collector run that failed (timeout) — whose own traces rolled back — alerts once, by runid
--   (u) ops.perf_watch_update: refuses a signed-in non-admin and an admin outside the admin lane;
--       an admin in the lane edits the budget, pins a baseline, pauses and resumes — each recorded
-- Run (session-mode 5432 connection as postgres): the file itself carries BEGIN and ROLLBACK.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';

-- ── (s) the statement collector ───────────────────────────────────────────────────────────────
do $s$
declare
  v_watch uuid := (select id from ops.proof_check where slug = 'stmt:custom.read_records_page');
  v_r jsonb;
  v_run1 uuid;
  v_run2 uuid;
  v_key record;
  v_key2 record;
  v_n int;
  v_s record;
begin
  if v_watch is null then raise exception '(s) stmt:custom.read_records_page is not declared'; end if;
  -- Only this test's snapshots count: older ones are hidden for the transaction.
  update ops.perf_statement_snapshot set deleted_at = now() where deleted_at is null;
  delete from ops.perf_sample where check_id = v_watch and measured_at >= now() - interval '1 second';

  v_r := ops.perf_statement_collect();
  v_run1 := (v_r->>'run_id')::uuid;
  if v_r->>'previous' is not null then raise exception '(s) first run found a previous snapshot: %', v_r; end if;
  select count(*) into v_n from ops.perf_statement_snapshot where run_id = v_run1 and 'stmt:custom.read_records_page' = any (watch_slugs);
  if v_n = 0 then raise exception '(s) no read_records_page queryid resolved from the PostgREST call text'; end if;
  if (select count(*) from ops.perf_statement_snapshot where run_id = v_run1 and in_top) < least(50, (select count(*) from extensions.pg_stat_statements)) then
    raise exception '(s) the top-N by total time is not in the snapshot';
  end if;
  if exists (select 1 from ops.perf_sample where check_id = v_watch and source = 'statement' and measured_at >= now()) then
    raise exception '(s) a first snapshot wrote a sample';
  end if;
  raise notice 'PASS (s) first snapshot: % rows, % read_records_page queryid(s), no sample', v_r->>'rows', v_n;

  -- Make run 1 an hour old and its busiest read_records_page key 10 calls / 1000 ms behind;
  -- a second key's counter is set ABOVE today's (it "went down"); a third, invented key vanished.
  update ops.perf_statement_snapshot set taken_at = taken_at - interval '1 hour' where run_id = v_run1;
  select * into v_key from ops.perf_statement_snapshot
   where run_id = v_run1 and 'stmt:custom.read_records_page' = any (watch_slugs) order by calls desc limit 1;
  update ops.perf_statement_snapshot set calls = calls - 10, total_exec_time_ms = total_exec_time_ms - 1000 where id = v_key.id;
  select * into v_key2 from ops.perf_statement_snapshot
   where run_id = v_run1 and 'stmt:custom.read_records_page' = any (watch_slugs) and id <> v_key.id order by calls desc limit 1;
  if v_key2.id is not null then
    update ops.perf_statement_snapshot set calls = calls + 1000000 where id = v_key2.id;
  end if;
  insert into ops.perf_statement_snapshot (run_id, taken_at, stats_reset, userid, dbid, queryid, toplevel, calls,
                                           total_exec_time_ms, watch_slugs, organization_id, created_by)
  values (v_run1, v_key.taken_at - interval '1 hour', v_key.stats_reset, v_key.userid, v_key.dbid, -4242424242, true, 7, 70,
          array['stmt:custom.read_records_page'], '39c38960-d30c-4840-b0c1-c9960de95582', '87a6e699-3622-4869-8843-d0867456c0dd');

  v_r := ops.perf_statement_collect();
  v_run2 := (v_r->>'run_id')::uuid;
  select * into v_s from ops.perf_sample where check_id = v_watch and source = 'statement' order by measured_at desc, created_at desc limit 1;
  if v_s.id is null or v_s.measured_at < now() then raise exception '(s) the counted interval wrote no sample: %', v_r; end if;
  if v_s.calls < 10 or v_s.calls >= 1000000 then
    raise exception '(s) Δcalls % — want ≥ 10 (the 10 calls behind) and never the decreased key: %', v_s.calls, v_s.note;
  end if;
  if v_s.mean_ms is null or v_s.mean_ms <= 0 then raise exception '(s) no mean: %', to_jsonb(v_s); end if;
  if v_s.note not like '%dropped from this interval%' or (v_key2.id is not null and v_s.note not like '%decreased%') or v_s.note not like '%vanished%' then
    raise exception '(s) the dropped keys are not named in the note: %', v_s.note;
  end if;
  raise notice 'PASS (s) counted interval: % calls, mean % ms; note: %', v_s.calls, v_s.mean_ms, v_s.note;

  -- A changed stats_reset drops the whole interval: no new sample, the watch says why.
  update ops.perf_statement_snapshot set stats_reset = stats_reset - interval '1 day', taken_at = taken_at - interval '1 hour' where run_id = v_run2;
  delete from ops.perf_statement_snapshot where run_id = v_run1;
  v_r := ops.perf_statement_collect();
  if (select count(*) from ops.perf_sample where check_id = v_watch and source = 'statement' and measured_at >= now()) <> 1 then
    raise exception '(s) a reset interval wrote a sample: %', v_r;
  end if;
  if (select metadata->>'perf_last_collect_note' from ops.proof_check where id = v_watch) not like 'interval dropped: pg_stat_statements was reset%' then
    raise exception '(s) the reset is not noted on the watch: %', (select metadata from ops.proof_check where id = v_watch);
  end if;
  raise notice 'PASS (s) a changed stats_reset dropped the interval with a note';
end
$s$;

-- ── (h) stale + collector health, grouped alerts ──────────────────────────────────────────────
do $h$
declare
  v_admins int;
  v_ids uuid[];
  v_r jsonb;
  v_group int;
  v_bells int;
  v_coll int;
  v_min int := greatest(2, coalesce((platform.knob_resolve('perf', 'group_alert_min', '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, null, null) #>> '{}')::int, 3));
begin
  select count(*) into v_admins from admin.admins a join auth.users u on u.id = a.user_id;
  -- Every other watch is fresh; the statement collector has just finished (snapshot from (s)).
  update ops.proof_check set last_run_at = now(), perf_state = 'learning'
   where kind = 'perf' and deleted_at is null and is_active;
  update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_at', now())
   where kind = 'perf' and perf_kind = 'door';
  -- Healthy probe, v_min + 1 door watches with no sample for two hours → one grouped alert.
  select array_agg(id) into v_ids from (select id from ops.proof_check where kind = 'perf' and perf_kind = 'door' and is_active
                                          and deleted_at is null order by slug limit v_min + 1) x;
  update ops.proof_check set last_run_at = now() - interval '2 hours', perf_state = 'ok' where id = any (v_ids);
  v_r := ops.perf_health_run();
  if (select count(*) from ops.proof_check where id = any (v_ids) and perf_state = 'stale') <> cardinality(v_ids) then
    raise exception '(h) the watches did not turn stale: %', v_r;
  end if;
  select count(*) into v_group from ops.system_error
   where kind = 'perf_watch_alert' and error_type = 'perf_watch:group' and resolved_at is null
     and context->'check_ids' @> to_jsonb(v_ids);
  select count(*) into v_bells from communication.notification
   where event_key = 'platform.perf.watch_alert' and dedupe_key like 'perf_watch:group:%' and created_at >= now();
  if v_group <> 1 or v_bells <> v_admins
     or exists (select 1 from ops.system_error where error_type like 'perf_watch:door:%:stale' and created_at >= now()) then
    raise exception '(h) % stale transitions: % grouped rows (want 1), % bells (want % admins), or per-watch rows were written: %',
      cardinality(v_ids), v_group, v_bells, v_admins, v_r;
  end if;
  raise notice 'PASS (h) % stale watches under a healthy probe → 1 grouped system_error row + % bells (one per platform admin)', cardinality(v_ids), v_bells;

  -- Dead probe: no door finished for two hours → ONE collector alert, stale silently.
  update ops.proof_check set perf_state = 'ok', last_run_at = now() - interval '2 hours',
         metadata = metadata || jsonb_build_object('perf_last_probe_at', now() - interval '2 hours')
   where kind = 'perf' and perf_kind = 'door';
  update ops.system_error set resolved_at = now() where kind = 'perf_watch_alert' and resolved_at is null and error_type like 'perf_watch:collector:%';
  v_r := ops.perf_health_run();
  select count(*) into v_coll from ops.system_error where error_type = 'perf_watch:collector:probe' and resolved_at is null;
  select count(*) into v_bells from communication.notification
   where event_key = 'platform.perf.watch_alert' and dedupe_key like 'perf_watch:collector:probe:%' and created_at >= now();
  if v_coll <> 1 or v_bells <> v_admins then
    raise exception '(h) dead probe: % collector rows (want 1), % bells (want %): %', v_coll, v_bells, v_admins, v_r;
  end if;
  if exists (select 1 from ops.proof_check where kind = 'perf' and perf_kind = 'door' and is_active and perf_state <> 'stale') then
    raise exception '(h) under a dead probe some door watches did not turn stale: %', v_r;
  end if;
  if (select count(*) from ops.system_error where error_type = 'perf_watch:group' and created_at >= now() and resolved_at is null) <> 1 then
    raise exception '(h) the dead probe''s stale watches alerted (they must be silent under the collector alert): %', v_r;
  end if;
  v_r := ops.perf_health_run();
  if (select count(*) from ops.system_error where error_type = 'perf_watch:collector:probe' and created_at >= now()) <> 1
     or (select count(*) from communication.notification where event_key = 'platform.perf.watch_alert'
           and dedupe_key like 'perf_watch:collector:probe:%' and created_at >= now()) <> v_admins then
    raise exception '(h) a second run repeated the collector alert: %', v_r;
  end if;
  raise notice 'PASS (h) dead probe → 1 collector alert + % bells, every door watch stale silently; a second run repeated nothing', v_bells;

  -- The probe finishes again → the collector row is resolved.
  update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_at', now()) where kind = 'perf' and perf_kind = 'door';
  v_r := ops.perf_health_run();
  if exists (select 1 from ops.system_error where error_type = 'perf_watch:collector:probe' and resolved_at is null) then
    raise exception '(h) a finished probe did not resolve the collector alert: %', v_r;
  end if;
  raise notice 'PASS (h) a finished probe resolved the collector alert';
end
$h$;

-- ── (f) a failed collector run alerts once (its own traces were rolled back) ──────────────────
do $f$
declare
  v_admins int;
  v_r jsonb;
begin
  select count(*) into v_admins from admin.admins a join auth.users u on u.id = a.user_id;
  -- runid far above the sequence (postgres may not draw from cron's runid_seq); rolled back.
  insert into cron.job_run_details (runid, jobid, job_pid, database, username, command, status, return_message, start_time, end_time)
  select (select max(runid) + 1000000 from cron.job_run_details), j.jobid, 0, current_database(), 'postgres', j.command, 'failed', 'ERROR:  canceling statement due to statement timeout',
         now() + interval '1 second', now() + interval '91 seconds'
    from cron.job j where j.jobname = 'perf-watch-probe';
  v_r := ops.perf_health_run();
  v_r := ops.perf_health_run();
  if (select count(*) from ops.system_error where error_type = 'perf_watch:collector:probe:failed_run' and created_at >= now()) <> 1
     or (select count(*) from communication.notification where event_key = 'platform.perf.watch_alert'
           and dedupe_key like 'perf_watch:collector:probe:failed_run:%' and created_at >= now()) <> v_admins then
    raise exception '(f) a failed probe run: want 1 failed_run row and % bells over two health runs: %', v_admins, v_r;
  end if;
  raise notice 'PASS (f) a timed-out probe run → 1 failed_run row + % bells; the next health run repeated nothing', v_admins;
end
$f$;

-- ── (u) the admin edit door ───────────────────────────────────────────────────────────────────
do $u$
declare
  v_watch uuid := (select id from ops.proof_check where slug = 'door:custom.views@large');
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_other uuid := (select u.id from auth.users u where u.email = 'test@test.com');
  v_r jsonb;
  v_ok boolean;
  c ops.proof_check%rowtype;
begin
  -- A signed-in person who is not a platform admin.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_ok := false;
  begin
    perform ops.perf_watch_update(v_watch, 123);
  exception when insufficient_privilege then v_ok := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_ok then raise exception '(u) a non-admin changed a watch'; end if;
  -- A platform admin OUTSIDE the admin lane is an ordinary person.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('matrx.admin_lane', 'off', true);
  perform set_config('role', 'authenticated', true);
  v_ok := false;
  begin
    perform ops.perf_watch_update(v_watch, 123);
  exception when insufficient_privilege then v_ok := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_ok then raise exception '(u) an admin outside the admin lane changed a watch'; end if;
  raise notice 'PASS (u) a non-admin and an admin outside the lane are refused (42501)';

  -- In the lane: budget, pin, pause, resume.
  perform set_config('matrx.admin_lane', 'on', true);
  perform set_config('role', 'authenticated', true);
  v_r := ops.perf_watch_update(v_watch, 450);
  v_r := ops.perf_watch_update(v_watch, null, null, 12.5, true);
  v_r := ops.perf_watch_update(v_watch, null, false);
  perform set_config('role', 'postgres', true);
  select * into c from ops.proof_check where id = v_watch;
  if c.budget_ms <> 450 or not c.perf_baseline_pinned or c.perf_baseline_ms <> 12.5 or c.is_active or c.perf_state <> 'paused'
     or jsonb_array_length(c.metadata->'perf_edits') < 3 or c.metadata->'perf_last_edit'->>'by' <> v_admin::text then
    raise exception '(u) the edits did not land or were not recorded: %', to_jsonb(c);
  end if;
  perform set_config('role', 'authenticated', true);
  v_r := ops.perf_watch_update(v_watch, 300, true, null, false);
  perform set_config('role', 'postgres', true);
  select * into c from ops.proof_check where id = v_watch;
  if c.budget_ms <> 300 or c.perf_baseline_pinned or not c.is_active or c.perf_state <> 'learning' then
    raise exception '(u) resume / unpin / budget back did not land: %', to_jsonb(c);
  end if;
  raise notice 'PASS (u) budget 300 → 450 → 300, baseline pinned 12.5 then unpinned, paused then resumed; % edits recorded', jsonb_array_length(c.metadata->'perf_edits');
end
$u$;

rollback;
