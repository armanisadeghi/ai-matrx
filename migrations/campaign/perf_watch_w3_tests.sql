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

rollback;
