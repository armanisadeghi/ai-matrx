-- migrate: skip: a test script, never a migration. It runs against live inside BEGIN … ROLLBACK and leaves nothing behind.
--
-- perf_watch_w3_tests.sql — forcing-function tests for performance watch wave 3. Every block
-- RAISEs on failure; a clean run prints PASS lines.
--   (m) per-watch seat: a member twin is probed AS the member (sample note names the seat); a watch
--       whose seat does not exist turns probe_broken alone, its reason names the seat and the
--       fixture expiry; a sibling admin watch in the same run is still sampled
--   (e) a read door declared non-empty whose answer is empty (Time Entries has no saved views) is
--       probe_broken, never a fast "ok" sample
--   (d) re-declaring a subject writes ONE marker sample (perf_marker) naming what changed;
--       re-declaring the same subject writes none
-- Run (session-mode 5432 connection as postgres): the file itself carries BEGIN and ROLLBACK.
begin;
set local statement_timeout = '170s';
set local lock_timeout = '2s';

-- ── (m) per-watch seat ────────────────────────────────────────────────────────────────────────
do $m$
declare
  v_twin uuid := (select id from ops.proof_check where slug = 'door:custom.views@member');
  v_ghost uuid;
  v_r jsonb;
  v_note text;
  c record;
begin
  if v_twin is null then raise exception '(m) door:custom.views@member is not declared'; end if;
  v_r := ops.perf_probe_run(v_twin);
  select note into v_note from ops.perf_sample where check_id = v_twin and source = 'probe' order by measured_at desc limit 1;
  if v_note is null or v_note not like '%seat hugo.waelchi.cfd403@fixtures.aimatrx.com%' then
    raise exception '(m) the member twin was not probed as the member: % / %', v_note, v_r;
  end if;

  v_ghost := ops.perf_watch_declare('door:test.w3_ghost_seat', 'door', 'w3 ghost seat',
               (select perf_subject from ops.proof_check where slug = 'door:custom.views')
                 || '{"seat_email": "nobody.w3test@fixtures.aimatrx.com"}'::jsonb,
               300, 'p95', 900, 'PERF-WATCH', 'perf');
  update ops.proof_check set metadata = metadata || '{"perf_seat_expires_at": "2026-10-09T03:06:15.434Z"}' where id = v_ghost;
  v_r := ops.perf_probe_run(v_ghost);
  select * into c from ops.proof_check where id = v_ghost;
  if c.perf_state <> 'probe_broken' then raise exception '(m) a missing seat did not break its watch: % / %', c.perf_state, v_r; end if;
  if c.metadata->>'perf_last_reason' not like '%nobody.w3test@fixtures.aimatrx.com%'
     or c.metadata->>'perf_last_reason' not like '%expired 2026-10-09T03:06:15.434Z%' then
    raise exception '(m) the reason does not name the seat and its expiry: %', c.metadata->>'perf_last_reason';
  end if;
  if exists (select 1 from ops.perf_sample where check_id = v_ghost and source = 'probe' and n > 0) then
    raise exception '(m) a watch with no seat was sampled';
  end if;
  raise notice 'PASS (m) member twin probed as the member; a missing seat breaks only its own watch and names the fixture expiry';
end
$m$;

-- ── (e) empty answers break ───────────────────────────────────────────────────────────────────
do $e$
declare
  v_id uuid;
  v_r jsonb;
  c record;
begin
  v_id := ops.perf_watch_declare('door:test.w3_empty', 'door', 'w3 empty views',
            '{"schema":"custom","function":"views","argtypes":"uuid, uuid",
              "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"a312f617-a388-41f4-b1ed-37a844827684"}}'::jsonb,
            300, 'p95', 900, 'PERF-WATCH', 'perf');
  v_r := ops.perf_probe_run(v_id);
  select * into c from ops.proof_check where id = v_id;
  if c.perf_state <> 'probe_broken' or c.metadata->>'perf_last_reason' not like '%empty%' then
    raise exception '(e) an empty answer was not probe_broken: % % / %', c.perf_state, c.metadata->>'perf_last_reason', v_r;
  end if;
  if exists (select 1 from ops.perf_sample where check_id = v_id and n > 0) then
    raise exception '(e) an empty answer was recorded as a timing sample';
  end if;
  raise notice 'PASS (e) an empty answer from a non-empty door is probe_broken, not a sample';
end
$e$;

-- ── (d) re-declare marker ─────────────────────────────────────────────────────────────────────
do $d$
declare
  v_id uuid;
  v_n int;
  v_m record;
begin
  v_id := ops.perf_watch_declare('door:test.w3_marker', 'door', 'w3 marker',
            '{"schema":"custom","function":"views","argtypes":"uuid, uuid","args":{"p_table_id":"7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd"}}'::jsonb,
            300, 'p95', 900, 'PERF-WATCH', 'perf');
  perform ops.perf_watch_declare('door:test.w3_marker', 'door', 'w3 marker',
            '{"schema":"custom","function":"views","argtypes":"uuid, uuid","args":{"p_table_id":"7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd"}}'::jsonb,
            300, 'p95', 900, 'PERF-WATCH', 'perf');
  select count(*) into v_n from ops.perf_sample where check_id = v_id;
  if v_n <> 0 then raise exception '(d) the same subject wrote % marker(s)', v_n; end if;
  perform ops.perf_watch_declare('door:test.w3_marker', 'door', 'w3 marker',
            '{"schema":"custom","function":"views","argtypes":"uuid, uuid","args":{"p_table_id":"6087f27b-5e8b-48ee-b786-6b4efb39d4cf"}}'::jsonb,
            300, 'p95', 900, 'PERF-WATCH', 'perf');
  select * into v_m from ops.perf_sample where check_id = v_id;
  if v_m.id is null or not coalesce((v_m.metadata->>'perf_marker')::boolean, false) or v_m.note not like '%args%' then
    raise exception '(d) a changed subject wrote no marker naming the change: %', to_jsonb(v_m);
  end if;
  raise notice 'PASS (d) a re-declared subject writes one marker naming what changed';
end
$d$;

-- ── (c) a failed run already healed by a later success rings no bell ─────────────────────────
do $c$
declare
  v_r jsonb;
  v_row record;
  v_base bigint := (select max(runid) + 2000000 from cron.job_run_details);
begin
  insert into cron.job_run_details (runid, jobid, job_pid, database, username, command, status, return_message, start_time, end_time)
  select v_base + x.k, j.jobid, 0, current_database(), 'postgres', j.command, x.status, x.msg, now() - x.ago, now() - x.ago + interval '5 seconds'
    from cron.job j,
         (values (1, 'failed', 'ERROR:  w3 test failure', interval '30 minutes'),
                 (2, 'succeeded', '1 row', interval '20 minutes')) x(k, status, msg, ago)
   where j.jobname = 'perf-watch-statements';
  v_r := ops.perf_health_run();
  select * into v_row from ops.system_error
   where error_type = 'perf_watch:collector:statement:failed_run' and context->'runids' @> to_jsonb(v_base + 1);
  if v_row.id is null or v_row.resolved_at is null then
    raise exception '(c) the healed failed run was not recorded resolved: % / %', to_jsonb(v_row), v_r;
  end if;
  if exists (select 1 from communication.notification where event_key = 'platform.perf.watch_alert'
               and dedupe_key like 'perf_watch:collector:statement:failed_run:' || (v_base + 1) || ':%') then
    raise exception '(c) a healed failed run rang a bell';
  end if;
  raise notice 'PASS (c) a failed run healed before the health check is recorded resolved, no bell';
end
$c$;

-- ── (j) the judge reads only samples after the latest marker; vitals judge p75 ───────────────
do $j$
declare
  v_id uuid;
  v_r jsonb;
  i int;
begin
  v_id := ops.perf_watch_declare('door:test.w3_judge', 'door', 'w3 judge',
            '{"schema":"custom","function":"views","argtypes":"uuid, uuid","args":{"p_table_id":"7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd"}}'::jsonb,
            300, 'p95', 900, 'PERF-WATCH', 'perf');
  for i in 1..4 loop
    perform ops.perf_record_sample(v_id, 'probe', jsonb_build_object('n', 10, 'p50_ms', 900, 'p95_ms', 999, 'max_ms', 999, 'mean_ms', 900,
                                                                       'measured_at', now() - make_interval(mins => 60 - i)), true);
  end loop;
  if ops.perf_judge(v_id)->>'state' <> 'over_budget' then raise exception '(j) setup: want over_budget, got %', ops.perf_judge(v_id); end if;
  perform ops.perf_watch_declare('door:test.w3_judge', 'door', 'w3 judge',
            '{"schema":"custom","function":"views","argtypes":"uuid, uuid","args":{"p_table_id":"6087f27b-5e8b-48ee-b786-6b4efb39d4cf"}}'::jsonb,
            300, 'p95', 900, 'PERF-WATCH', 'perf');
  v_r := ops.perf_judge(v_id);
  if v_r->>'reason' <> 'no sample to judge' then
    raise exception '(j) samples from before the marker were judged: %', v_r;
  end if;
  v_id := ops.perf_watch_declare('vital:test:LCP:/w3', 'vital', 'w3 vital', '{"metric":"LCP","route":"/w3"}'::jsonb,
            2500, 'p75', 3600, 'PERF-WATCH', 'perf');
  for i in 1..4 loop
    perform ops.perf_record_sample(v_id, 'vital', jsonb_build_object('n', 40, 'p50_ms', 1000, 'p95_ms', 9000,
                                   'metadata', jsonb_build_object('p75_ms', 3100), 'measured_at', now() - make_interval(mins => 60 - i)), true);
  end loop;
  v_r := ops.perf_judge(v_id);
  if v_r->>'state' <> 'over_budget' then raise exception '(j) a vital was not judged on its p75: %', v_r; end if;
  raise notice 'PASS (j) the judge reads only post-marker samples; a vital is judged on p75 from metadata';
end
$j$;

-- ── (k) job durations ─────────────────────────────────────────────────────────────────────────
do $k$
declare
  v_r jsonb;
  w record;
  v_s record;
  v_base bigint := (select max(runid) + 3000000 from cron.job_run_details);
  v_n int;
begin
  v_r := ops.perf_job_collect();
  select * into w from ops.proof_check where slug = 'job:perf-watch-probe';
  if w.id is null or w.perf_kind <> 'job' or w.budget_ms < 1000 or w.perf_subject->>'budget_basis' not like '%p95%' then
    raise exception '(k) the probe job was not declared with a based budget: % / %', to_jsonb(w), v_r;
  end if;
  if (select count(*) from cron.job where active) <> (select count(*) from ops.proof_check where slug like 'job:%' and slug not like 'job:sch:%'
        and perf_subject->>'jobname' in (select jobname from cron.job where active)) then
    raise exception '(k) not every active cron job has a watch';
  end if;
  if not exists (select 1 from ops.proof_check where slug like 'job:sch:%') then
    raise exception '(k) no scheduler task watch was declared';
  end if;
  insert into cron.job_run_details (runid, jobid, job_pid, database, username, command, status, return_message, start_time, end_time)
  select v_base + x.k, j.jobid, 0, current_database(), 'postgres', j.command, x.status, x.msg, now() - interval '1 minute', now() - interval '1 minute' + x.dur
    from cron.job j,
         (values (1, 'succeeded', '1 row', interval '2 seconds'), (2, 'succeeded', '1 row', interval '4 seconds'),
                 (3, 'failed', 'ERROR:  w3 job test', interval '6 seconds')) x(k, status, msg, dur)
   where j.jobname = 'perf-watch-probe';
  v_r := ops.perf_job_collect();
  -- Every sample of this transaction shares now(): the one carrying the planted failure is the second collection's.
  select * into v_s from ops.perf_sample where check_id = w.id and source = 'job' and measured_at >= now() and note like '%w3 job test%';
  if v_s.id is null or v_s.n < 3 or v_s.errors < 1 or v_s.max_ms < 6000 or v_s.note not like '%w3 job test%' then
    raise exception '(k) the finished runs were not sampled with the failure counted: % / %', to_jsonb(v_s), v_r;
  end if;
  v_n := (select count(*) from ops.perf_sample where check_id = w.id and source = 'job' and measured_at >= now());
  v_r := ops.perf_job_collect();
  if (select count(*) from ops.perf_sample where check_id = w.id and source = 'job' and measured_at >= now()) <> v_n then
    raise exception '(k) the same runs were counted twice';
  end if;
  raise notice 'PASS (k) every active cron job and platform scheduler task is declared with a based budget; runs since the cursor sampled once, failures counted (n %, errors %, max % ms)', v_s.n, v_s.errors, v_s.max_ms;
end
$k$;

-- ── (v) real-user page speed: the client door and the hourly roll-up ──────────────────────────
do $v$
declare
  v_r jsonb;
  v_n int;
  v_w record;
  v_s record;
  v_caught boolean;
begin
  -- Signed in as the member seat (not an admin).
  perform set_config('request.jwt.claims', '{"sub":"043f73e2-e6cd-4ffb-af6f-ea96dc4e59b3","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', '043f73e2-e6cd-4ffb-af6f-ea96dc4e59b3', true);
  set local role authenticated;
  v_r := ops.perf_client_report('[{"name":"LCP","value":1834.5,"route":"/tables/7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd?view=1#x","rating":"good"},
                                  {"name":"CLS","value":0.02,"route":"/notes/123456"},
                                  {"name":"FID","value":12,"route":"/"}]'::jsonb);
  if (v_r->>'accepted')::int <> 2 or (v_r->>'rejected')::int <> 1 then raise exception '(v) want 2 accepted 1 rejected: %', v_r; end if;
  v_caught := false;
  begin
    perform ops.perf_client_report((select jsonb_agg(jsonb_build_object('name','LCP','value',1,'route','/')) from generate_series(1,21)));
  exception when sqlstate '22023' then v_caught := true;
  end;
  if not v_caught then raise exception '(v) 21 samples were accepted'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  v_caught := false;
  begin
    perform ops.perf_client_report('[{"name":"LCP","value":1,"route":"/"}]'::jsonb);
  exception when sqlstate '42501' then v_caught := true;
  end;
  reset role;
  if not v_caught then raise exception '(v) a signed-out caller was accepted'; end if;
  if not exists (select 1 from ops.perf_client_event where route = '/tables/[id]' and metric = 'LCP' and measured_at >= now())
     or not exists (select 1 from ops.perf_client_event where route = '/notes/[n]' and metric = 'CLS' and value_ms = 20 and measured_at >= now()) then
    raise exception '(v) routes were not reduced to templates / CLS not stored ×1000: %',
      (select jsonb_agg(to_jsonb(e)) from ops.perf_client_event e where measured_at >= now());
  end if;
  if exists (select 1 from ops.perf_client_event where measured_at >= now() and created_by = '043f73e2-e6cd-4ffb-af6f-ea96dc4e59b3') then
    raise exception '(v) the caller''s id was stored';
  end if;
  -- Roll-up: 30 loads in the last full hour on one route → one vital sample; 5 on another → none.
  insert into ops.perf_client_event (measured_at, metric, route, value_ms, organization_id, created_by)
  select date_trunc('hour', now()) - interval '30 minutes', 'LCP', '/w3test', 1000 + g * 100, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '87a6e699-3622-4869-8843-d0867456c0dd'::uuid
    from generate_series(1, 30) g
  union all
  select date_trunc('hour', now()) - interval '30 minutes', 'LCP', '/w3few', 900, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '87a6e699-3622-4869-8843-d0867456c0dd'::uuid
    from generate_series(1, 5) g;
  v_r := ops.perf_vital_rollup();
  select * into v_w from ops.proof_check where slug = 'vital:LCP:/w3test';
  if v_w.id is null or v_w.budget_ms <> 2500 or v_w.budget_stat <> 'p75' then raise exception '(v) the vital watch was not declared with the web.dev budget: % / %', to_jsonb(v_w), v_r; end if;
  select * into v_s from ops.perf_sample where check_id = v_w.id and source = 'vital';
  if v_s.n <> 30 or (v_s.metadata->>'p75_ms')::numeric not between 3000 and 3400 then raise exception '(v) the roll-up sample is wrong: %', to_jsonb(v_s); end if;
  if exists (select 1 from ops.proof_check where slug = 'vital:LCP:/w3few') then raise exception '(v) a route under vital_min_n was rolled up'; end if;
  v_r := ops.perf_vital_rollup();
  if (select count(*) from ops.perf_sample where check_id = v_w.id and source = 'vital') <> 1 then raise exception '(v) the same hour was rolled up twice'; end if;
  raise notice 'PASS (v) the signed-in door stores route templates, CLS ×1000, no user id; refuses 21 samples and signed-out callers; the roll-up writes one p75 sample per hour only at n ≥ vital_min_n';
end
$v$;

-- ── (i) CLI ingest ────────────────────────────────────────────────────────────────────────────
do $i$
declare
  v_r jsonb;
  v_door record;
  v_after record;
  v_page record;
begin
  select * into v_door from ops.proof_check where slug = 'door:custom.views';
  v_r := ops.perf_cli_ingest('{"sha":"w3testsha","base":"http://localhost:3001",
     "doors":[{"door":"custom.views","calls":5,"p50":40,"p95":55,"max":60,"kb":0.8,"errors":0},{"door":"custom.template_install","calls":1,"p50":0,"p95":0,"max":0,"kb":0,"errors":1}],
     "pages":[{"page":"w3 test page","pass":"warm","rows_visible_ms":900,"ttfb_ms":120,"budget":{"rows_visible_ms":1500}}]}'::jsonb);
  if (v_r->>'doors')::int <> 1 or (v_r->>'pages')::int <> 1 or v_r->'unmatched_doors' <> '["custom.template_install"]'::jsonb then
    raise exception '(i) ingest counts: %', v_r;
  end if;
  if not exists (select 1 from ops.perf_sample where check_id = v_door.id and source = 'cli' and release_sha = 'w3testsha' and p95_ms = 55) then
    raise exception '(i) the CLI door row did not land as a cli sample with the sha';
  end if;
  select * into v_after from ops.proof_check where id = v_door.id;
  if v_after.perf_state is distinct from v_door.perf_state or v_after.last_run_at is distinct from v_door.last_run_at then
    raise exception '(i) a CLI sample moved the door watch (judged): % → %', v_door.perf_state, v_after.perf_state;
  end if;
  select * into v_page from ops.proof_check where slug = 'page:w3 test page';
  if v_page.perf_kind <> 'page' or not exists (select 1 from ops.perf_sample where check_id = v_page.id and source = 'cli' and p50_ms = 900) then
    raise exception '(i) the page row did not land';
  end if;
  if has_function_privilege('authenticated', 'ops.perf_cli_ingest(jsonb)', 'execute') then raise exception '(i) a signed-in client may call the ingest'; end if;
  raise notice 'PASS (i) CLI door and page rows land as cli samples with the sha, never judged; unmatched doors are named; service-only';
end
$i$;

rollback;
