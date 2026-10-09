-- perf_watch_tail_e_retire_probe_job_watch.sql
--
-- PERFORMANCE WATCH TAIL, ITEM 1 (follow-up) — the job watch `job:perf-watch-probe` watched the cron job
-- the split replaced; with the job gone it would sit in `learning` for ever. It is paused with the reason
-- (the same fields ops.perf_watch_update writes), its history kept; `job:perf-watch-probe-admin` and
-- `job:perf-watch-probe-member` are declared by the hourly job collector like every other cron job.
-- Inverse: migrations/inverse/perf_watch_tail_e_retire_probe_job_watch_down.sql.

update ops.proof_check
   set is_active = false, perf_state = 'paused', perf_state_since = now(),
       metadata = metadata || jsonb_build_object('perf_paused_from', perf_state,
                    'perf_last_reason', 'paused: the cron job perf-watch-probe was replaced by perf-watch-probe-admin and perf-watch-probe-member (lane PERF-WATCH-TAIL)')
 where kind = 'perf' and slug = 'job:perf-watch-probe' and is_active;
