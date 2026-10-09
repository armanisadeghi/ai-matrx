-- migrate: skip: a test script, never a migration. Each section runs against live inside BEGIN … ROLLBACK and leaves nothing behind.
--
-- perf_watch_tail_tests.sql — forcing-function tests for lane PERF-WATCH-TAIL. Every section RAISEs on
-- failure; a clean run prints PASS lines. Sections are separated by `-- @@section` lines so a runner can
-- run each alone (the failing one then does not hide the others).
--   (g) the door probe is two jobs: groups by seat, each group run touches only its own doors, a bad
--       group is refused, the two cron jobs exist at offset minutes and the old one is gone
--   (h) collector health is per group: a stopped member job is named, an admin one is not blamed
--   (b) the two board reads (ops.perf_watch_board / ops.perf_watch_history): platform admins only; one call
--       returns watches + the newest sample + markers + sampled history + collectors + vitals; sparkline points
--       are capped and carry only numbers; the edit log is not in the list; history is returned on open
--   (v) vitals: a quiet route is rolled up over the longer window; one still under the minimum is shown with n
--   (j) job budgets come from each job's own history, recorded as an edit, never overwriting a person's edit
-- Run (session-mode 5432 connection as postgres).

-- @@section g
begin;
set local statement_timeout = '170s';
set local lock_timeout = '2s';
do $g$
declare
  v_admin uuid := (select id from ops.proof_check where slug = 'door:custom.views');
  v_member uuid := (select id from ops.proof_check where slug = 'door:custom.views@member');
  v_r jsonb;
  v_n int;
  v_caught boolean := false;
  v_a text;
  v_m text;
begin
  if v_admin is null or v_member is null then raise exception '(g) the views door pair is not declared'; end if;
  if ops.perf_probe_group((select perf_subject from ops.proof_check where id = v_admin)) <> 'admin'
     or ops.perf_probe_group((select perf_subject from ops.proof_check where id = v_member)) <> 'member' then
    raise exception '(g) a door is in the wrong probe group';
  end if;
  if exists (select 1 from ops.proof_check where kind = 'perf' and perf_kind = 'door' and deleted_at is null
              and ops.perf_probe_group(perf_subject) not in ('admin', 'member')) then
    raise exception '(g) a door is in neither group';
  end if;
  -- A group run touches only its own doors.
  v_r := ops.perf_probe_group_run(v_member, 'admin');
  if jsonb_array_length(v_r->'probed') <> 0 then raise exception '(g) the admin group probed a member door: %', v_r; end if;
  v_r := ops.perf_probe_group_run(v_admin, 'member');
  if jsonb_array_length(v_r->'probed') <> 0 then raise exception '(g) the member group probed an admin door: %', v_r; end if;
  v_r := ops.perf_probe_group_run(v_member, 'member');
  if jsonb_array_length(v_r->'probed') <> 1 or v_r->>'group' <> 'member' then raise exception '(g) the member group did not probe its door: %', v_r; end if;
  select count(*) into v_n from ops.perf_sample where check_id = v_member and source = 'probe' and n >= 3 and measured_at > now() - interval '1 minute';
  if v_n <> 1 then raise exception '(g) the member door has % fresh samples with at least 3 calls', v_n; end if;
  v_r := ops.perf_probe_run(v_admin);
  if jsonb_array_length(v_r->'probed') <> 1 then raise exception '(g) the all-groups entry did not probe the door: %', v_r; end if;
  begin
    perform ops.perf_probe_group_run(null, 'everyone');
  exception when sqlstate '22023' then v_caught := true;
  end;
  if not v_caught then raise exception '(g) an unknown group was accepted'; end if;
  -- The cron side.
  if exists (select 1 from cron.job where jobname = 'perf-watch-probe') then raise exception '(g) the single probe job is still scheduled'; end if;
  select schedule into v_a from cron.job where jobname = 'perf-watch-probe-admin' and active;
  select schedule into v_m from cron.job where jobname = 'perf-watch-probe-member' and active;
  if v_a is null or v_m is null then raise exception '(g) a probe job is missing or inactive: % / %', v_a, v_m; end if;
  if (select count(*) from (select unnest(string_to_array(split_part(v_a, ' ', 1), ',')) intersect
                            select unnest(string_to_array(split_part(v_m, ' ', 1), ','))) x) <> 0 then
    raise exception '(g) the two probe jobs share a minute: % / %', v_a, v_m;
  end if;
  if (select command from cron.job where jobname = 'perf-watch-probe-admin') not like '%perf_probe_group_run(null, ''admin'')%'
     or (select command from cron.job where jobname = 'perf-watch-probe-member') not like '%perf_probe_group_run(null, ''member'')%'
     or (select command from cron.job where jobname = 'perf-watch-probe-member') not like '%statement_timeout=''90s''%' then
    raise exception '(g) a probe job does not call its own group with its own timeout';
  end if;
  if has_function_privilege('authenticated', 'ops.perf_probe_group_run(uuid, text)', 'execute') then raise exception '(g) a client may run the probe'; end if;
  raise notice 'PASS (g) doors split by seat; each group run touches only its own doors and keeps >= 3 calls; bad group refused; two jobs at offset minutes, old one gone';
end
$g$;
rollback;

-- @@section h
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';
do $h$
declare
  v_r jsonb;
  v_probe jsonb;
  v_st jsonb;
begin
  -- Admin doors finished a moment ago; member doors three hours ago.
  update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_at', now())
   where kind = 'perf' and perf_kind = 'door' and deleted_at is null and ops.perf_probe_group(perf_subject) = 'admin';
  update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_at', now() - interval '3 hours')
   where kind = 'perf' and perf_kind = 'door' and deleted_at is null and ops.perf_probe_group(perf_subject) = 'member';
  v_r := ops.perf_health_run();
  select c into v_probe from jsonb_array_elements(v_r->'collectors') c where c->>'collector' = 'probe' and c ? 'problem' limit 1;
  if v_probe->>'problem' is null or v_probe->>'problem' not like '%member door probe has not finished%' or v_probe->>'problem' like '%admin%' then
    raise exception '(h) a stopped member job was not named alone: %', v_r->'collectors';
  end if;
  -- Both fresh: healthy.
  update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_at', now())
   where kind = 'perf' and perf_kind = 'door' and deleted_at is null;
  v_r := ops.perf_health_run();
  if exists (select 1 from jsonb_array_elements(v_r->'collectors') c where c->>'collector' = 'probe' and c->>'problem' is not null) then
    raise exception '(h) a healthy probe was reported: %', v_r->'collectors';
  end if;
  v_st := ops.perf_watch_status();
  if not (v_st->'collectors' ? 'probe_admin') or not (v_st->'collectors' ? 'probe_member') or (v_st->'collectors' ? 'probe') then
    raise exception '(h) the status line does not show the split: %', v_st->'collectors';
  end if;
  raise notice 'PASS (h) health judges each probe group by itself and names the stopped one; status shows probe_admin and probe_member';
end
$h$;
rollback;

-- @@section b
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';
do $b$
declare
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_member constant uuid := '043f73e2-e6cd-4ffb-af6f-ea96dc4e59b3';
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_w uuid;
  v_ok boolean;
  v_board jsonb;
  v_hist jsonb;
  v_big jsonb;
  v_newest timestamptz;
  v_rows jsonb;
  v_total int;
  v_avg numeric;
begin
  v_w := ops.perf_watch_declare('door:test.tail_board', 'door', 'tail board watch',
           (select perf_subject from ops.proof_check where slug = 'door:custom.views'), 300, 'p95', 900, 'PERF-WATCH-TAIL', 'perf');
  insert into ops.perf_sample (check_id, measured_at, source, n, errors, p50_ms, p95_ms, max_ms, mean_ms, bytes, release_sha, note,
                               state_after, organization_id, created_by)
  select v_w, now() - make_interval(mins => g * 5), 'probe', 10, 0, 20 + g % 7, 40 + g % 11, 60, 25, 1234, 'abcdef0123456789',
         'a sample note that the sparkline does not need and that costs bytes on every row of the list', 'ok', v_sys, v_admin
    from generate_series(1, 300) g;
  perform ops.perf_marker('door:test.tail_board', now() - interval '1 hour', 'tail test marker');
  select max(measured_at) into v_newest from ops.perf_sample where check_id = v_w and coalesce((metadata->>'perf_marker')::boolean, false) is not true;

  -- A signed-in member who is not a platform admin: both reads refuse.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_member::text, true);
  perform set_config('matrx.admin_lane', 'on', true);
  perform set_config('role', 'authenticated', true);
  v_ok := false;
  begin perform ops.perf_watch_board(7, 10); exception when sqlstate '42501' then v_ok := true; end;
  if not v_ok then perform set_config('role', 'postgres', true); raise exception '(b) a non-admin read the board'; end if;
  v_ok := false;
  begin perform ops.perf_watch_history(v_w, 10); exception when sqlstate '42501' then v_ok := true; end;
  if not v_ok then perform set_config('role', 'postgres', true); raise exception '(b) a non-admin read a watch history'; end if;
  -- A platform admin outside the admin lane is an ordinary person.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('matrx.admin_lane', 'off', true);
  v_ok := false;
  begin perform ops.perf_watch_board(7, 10); exception when sqlstate '42501' then v_ok := true; end;
  if not v_ok then perform set_config('role', 'postgres', true); raise exception '(b) an admin outside the lane read the board'; end if;
  v_ok := false;
  begin perform ops.perf_watch_history(v_w, 10); exception when sqlstate '42501' then v_ok := true; end;
  if not v_ok then perform set_config('role', 'postgres', true); raise exception '(b) an admin outside the lane read a watch history'; end if;
  -- Signed out.
  perform set_config('role', 'anon', true);
  if has_function_privilege('anon', 'ops.perf_watch_board(integer, integer)', 'execute')
     or has_function_privilege('anon', 'ops.perf_watch_history(uuid, integer)', 'execute') then
    perform set_config('role', 'postgres', true); raise exception '(b) a signed-out caller may execute a board read';
  end if;
  perform set_config('role', 'postgres', true);

  -- A platform admin in the lane: ONE call returns everything the page needs.
  perform set_config('matrx.admin_lane', 'on', true);
  perform ops.perf_watch_update(v_w, 350);   -- leaves an edit in the watch's log
  perform set_config('role', 'authenticated', true);
  v_board := ops.perf_watch_board(7, 10);
  perform set_config('role', 'postgres', true);
  if (select count(*) from jsonb_array_elements(v_board->'watches')) <> (select count(*) from ops.proof_check where kind = 'perf' and deleted_at is null) then
    raise exception '(b) the board does not list every watch';
  end if;
  if not v_board ? 'collectors' or not v_board ? 'vitals' or not (v_board->'vitals' ? 'routes') then
    raise exception '(b) the board lacks the collectors or vitals section: %', (select array_agg(k) from jsonb_object_keys(v_board) k);
  end if;
  select jsonb_agg(r) into v_rows from jsonb_array_elements(v_board->'recent') r where (r->>'check_id')::uuid = v_w;
  if not exists (select 1 from jsonb_array_elements(v_rows) r where (r->>'measured_at')::timestamptz = v_newest and r->>'note' is not null) then
    raise exception '(b) the newest sample (with its note) is not in the board';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_rows) r where r->>'note' = 'tail test marker' and coalesce((r#>>'{metadata,perf_marker}')::boolean, false)) then
    raise exception '(b) the marker is not in the board';
  end if;
  if jsonb_array_length(v_rows) > 10 + 1 + 1 then raise exception '(b) % sparkline rows for 10 points asked (+ newest + 1 marker)', jsonb_array_length(v_rows); end if;
  if exists (select 1 from jsonb_array_elements(v_rows) r
              where (r->>'measured_at')::timestamptz <> v_newest and r->>'note' is distinct from 'tail test marker'
                and (r ? 'note' or r ? 'release_sha' or r ? 'bytes' or (r#>'{metadata}') <> '{}'::jsonb)) then
    raise exception '(b) a sparkline point carries more than numbers: %', (select r from jsonb_array_elements(v_rows) r where r ? 'note' limit 1);
  end if;
  select avg(length(r::text)) into v_avg from jsonb_array_elements(v_rows) r
   where (r->>'measured_at')::timestamptz <> v_newest and r->>'note' is distinct from 'tail test marker';
  if v_avg > 270 then raise exception '(b) a sparkline point is % bytes (limit 270)', round(v_avg); end if;
  if exists (select 1 from jsonb_array_elements(v_board->'watches') w where w->'metadata' ? 'perf_edits') then
    raise exception '(b) the list carries the edit log';
  end if;
  -- A huge request is capped.
  perform set_config('role', 'authenticated', true);
  v_big := ops.perf_watch_board(7, 100000);
  perform set_config('role', 'postgres', true);
  select count(*) into v_total from jsonb_array_elements(v_big->'recent') r where (r->>'check_id')::uuid = v_w;
  if v_total > 120 + 1 + 1 or (v_big->>'points')::int > 120 then raise exception '(b) p_points was not capped: % rows, points %', v_total, v_big->>'points'; end if;
  -- The detail is read on open: the watch's own history, newest first, limited.
  perform set_config('role', 'authenticated', true);
  v_hist := ops.perf_watch_history(v_w, 50);
  perform set_config('role', 'postgres', true);
  if jsonb_array_length(v_hist) <> 50 or (v_hist->0->>'measured_at')::timestamptz < (v_hist->1->>'measured_at')::timestamptz
     or (v_hist->0) ? 'note' is not true then
    raise exception '(b) the history is not 50 newest-first rows with their notes';
  end if;
  perform set_config('role', 'authenticated', true);
  v_hist := ops.perf_watch_history(v_w, 2000);
  perform set_config('role', 'postgres', true);
  if jsonb_array_length(v_hist) <> 301 then raise exception '(b) the history has % rows, want 300 samples + 1 marker (+ the declare marker)', jsonb_array_length(v_hist); end if;
  raise notice 'PASS (b) board and history refuse non-admins, admins outside the lane and signed-out callers; one call returns watches, newest sample, markers, capped number-only sparkline, collectors and vitals; history on open';
end
$b$;
rollback;

-- @@section v
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';
do $v$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_h date;
  v_r jsonb;
  v_w record;
  v_s record;
  v_board jsonb;
  v_route jsonb;
  v_min int := coalesce((ops.perf_knobs()->>'vital_min_n')::int, 30);
begin
  perform set_config('matrx.admin_lane', 'on', true);
  -- tailquiet: 3 loads in the last full hour, 35 in the hours before -> windowed roll-up (38 loads).
  -- tailtiny: 4 in the last hour + 6 before -> under the minimum even over the window.
  -- tailhour: 30 in the last hour -> the ordinary hourly sample.
  -- tailidle: 40 loads, none in the last hour -> nothing new to say.
  insert into ops.perf_client_event (measured_at, metric, route, value_ms, organization_id, created_by)
  select date_trunc('hour', now()) - interval '30 minutes', 'LCP', '/tailquiet', 2000 + g, v_sys, v_admin from generate_series(1, 3) g
  union all select date_trunc('hour', now()) - interval '5 hours', 'LCP', '/tailquiet', 2000 + g, v_sys, v_admin from generate_series(1, 35) g
  union all select date_trunc('hour', now()) - interval '30 minutes', 'LCP', '/tailtiny', 900, v_sys, v_admin from generate_series(1, 4) g
  union all select date_trunc('hour', now()) - interval '5 hours', 'LCP', '/tailtiny', 900, v_sys, v_admin from generate_series(1, 6) g
  union all select date_trunc('hour', now()) - interval '30 minutes', 'LCP', '/tailhour', 1500, v_sys, v_admin from generate_series(1, 30) g
  union all select date_trunc('hour', now()) - interval '5 hours', 'LCP', '/tailidle', 1500, v_sys, v_admin from generate_series(1, 40) g;
  v_r := ops.perf_vital_rollup();

  select * into v_w from ops.proof_check where slug = 'vital:LCP:/tailquiet';
  if v_w.id is null then raise exception '(v) a quiet route with enough loads over the window got no watch: %', v_r; end if;
  select * into v_s from ops.perf_sample where check_id = v_w.id and source = 'vital';
  if v_s.n <> 38 or (v_s.metadata->>'window_hours')::int <> 24 or v_s.note not like '%24 hours%this hour alone: 3%' then
    raise exception '(v) the windowed sample is wrong: %', to_jsonb(v_s);
  end if;
  select * into v_s from ops.perf_sample s where s.check_id = (select id from ops.proof_check where slug = 'vital:LCP:/tailhour') and s.source = 'vital';
  if v_s.n <> 30 or (v_s.metadata->>'window_hours')::int <> 1 then raise exception '(v) the hourly sample changed: %', to_jsonb(v_s); end if;
  if exists (select 1 from ops.proof_check where slug in ('vital:LCP:/tailtiny', 'vital:LCP:/tailidle')) then
    raise exception '(v) a route under the minimum, or with nothing new, was rolled up';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_r->'below_min_n') b where b->>'route' = '/tailtiny' and (b->>'n_window')::int = 10) then
    raise exception '(v) the roll-up does not name the route still under the minimum with its n: %', v_r->'below_min_n';
  end if;
  v_r := ops.perf_vital_rollup();
  if (select count(*) from ops.perf_sample where check_id = v_w.id and source = 'vital') <> 1 then raise exception '(v) the same hour was rolled up twice'; end if;
  -- The page is told, never left silent.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('role', 'authenticated', true);
  v_board := ops.perf_watch_board(7, 10);
  perform set_config('role', 'postgres', true);
  select r into v_route from jsonb_array_elements(v_board->'vitals'->'routes') r where r->>'route' = '/tailtiny';
  if v_route is null or (v_route->>'n_window')::int <> 10 or (v_route->>'has_watch')::boolean then
    raise exception '(v) the board does not show the quiet route with its n: %', v_board->'vitals';
  end if;
  if (v_board->'vitals'->>'min_n')::int <> v_min or (v_board->'vitals'->>'window_hours')::int <> 24 then
    raise exception '(v) the board does not carry the threshold and window: %', v_board->'vitals';
  end if;
  raise notice 'PASS (v) a quiet route rolls up over 24 hours (n and window in the sample); a route still under the minimum is listed with n; idle hours add nothing; the board carries threshold and window';
end
$v$;
rollback;

-- @@section j
begin;
set local statement_timeout = '120s';
set local lock_timeout = '2s';
do $j$
declare
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_jobid bigint;
  v_w uuid;
  v_edited uuid;
  v_quiet uuid;
  v_p95 numeric;
  v_want numeric;
  v_r jsonb;
  c record;
  v_subj constant jsonb := '{"scheduler":"pg_cron"}';
begin
  select cron.schedule('tailtest-job', '0 0 1 1 *', 'select 1') into v_jobid;
  insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
  select v_jobid, 900000000 + g, 1, 'postgres', 'postgres', 'select 1', 'succeeded', '1 row',
         now() - make_interval(hours => g), now() - make_interval(hours => g) + make_interval(secs => (20 + 2 * g) / 1000.0)
    from generate_series(1, 10) g;
  select percentile_cont(0.95) within group (order by (20 + 2 * g)) into v_p95 from generate_series(1, 10) g;
  v_want := round(greatest(50, 1.5 * v_p95));

  v_w := ops.perf_watch_declare('job:tailtest-job', 'job', 'tail test job', v_subj || '{"jobname":"tailtest-job"}', 1000, 'p95', 3600, 'PERF-WATCH-TAIL', 'perf');
  v_edited := ops.perf_watch_declare('job:tailtest-edited', 'job', 'tail test edited job', v_subj || '{"jobname":"tailtest-job"}', 1000, 'p95', 3600, 'PERF-WATCH-TAIL', 'perf');
  update ops.proof_check set metadata = metadata || '{"perf_edits":[{"by":"a person"}]}' where id = v_edited;
  v_quiet := ops.perf_watch_declare('job:tailtest-quiet', 'job', 'tail test job without history', v_subj || '{"jobname":"tailtest-no-such-job"}', 1000, 'p95', 3600, 'PERF-WATCH-TAIL', 'perf');

  v_r := ops.perf_job_rebudget(false);
  if (select budget_ms from ops.proof_check where id = v_w) <> 1000 then raise exception '(j) a report-only run changed a budget'; end if;
  if not exists (select 1 from jsonb_array_elements(v_r->'changed') x where x->>'slug' = 'job:tailtest-job' and (x->>'to')::numeric = v_want) then
    raise exception '(j) the report does not say job:tailtest-job goes to % : %', v_want, v_r;
  end if;
  v_r := ops.perf_job_rebudget(true);
  select * into c from ops.proof_check where id = v_w;
  if c.budget_ms <> v_want then raise exception '(j) budget % want %', c.budget_ms, v_want; end if;
  if jsonb_array_length(c.metadata->'perf_edits') <> 1 or c.metadata#>>'{perf_last_edit,by}' <> v_actor::text
     or c.metadata#>>'{perf_last_edit,changes,budget_ms,from}' <> '1000' or c.metadata#>>'{perf_last_edit,basis}' not like '%p95%10 succeeded pg_cron runs%' then
    raise exception '(j) the change is not recorded as an edit with its basis: %', c.metadata;
  end if;
  if (select budget_ms from ops.proof_check where id = v_edited) <> 1000 then raise exception '(j) a person-edited watch was overwritten'; end if;
  if (select budget_ms from ops.proof_check where id = v_quiet) <> 1000
     or not exists (select 1 from jsonb_array_elements(v_r->'left_at_floor') x where x->>'slug' = 'job:tailtest-quiet') then
    raise exception '(j) a job with no history was changed or not named: %', v_r;
  end if;
  v_r := ops.perf_job_rebudget(true);
  if exists (select 1 from jsonb_array_elements(v_r->'changed') x where x->>'slug' = 'job:tailtest-job') or (select budget_ms from ops.proof_check where id = v_w) <> v_want then
    raise exception '(j) the second run changed an already-set budget';
  end if;
  -- The real watches: the floor budgets were replaced once from their own history.
  if not exists (select 1 from ops.proof_check where kind = 'perf' and perf_kind = 'job' and deleted_at is null and slug not like 'job:tailtest%'
                  and metadata->>'perf_budget_basis' like '%set once by lane PERF-WATCH-TAIL' and budget_ms < 1000) then
    raise exception '(j) no real job watch was set from its own history';
  end if;
  if has_function_privilege('authenticated', 'ops.perf_job_rebudget(boolean)', 'execute') then raise exception '(j) a client may rebudget'; end if;
  raise notice 'PASS (j) job budgets come from their own 7-day p95 (x1.5, floor 50 ms), recorded as an edit with basis; a person''s edit and a job with no history are left alone; second run changes nothing';
end
$j$;
rollback;
