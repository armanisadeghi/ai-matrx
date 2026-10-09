-- chair-step: inverse of perf_watch_w2_e_seed_and_cron.sql — unschedules perf-watch-statements and perf-watch-health and removes the seven @large door watches and the eight stmt: statement watches (their samples go with them, ON DELETE CASCADE). Apply before _d_down.
--
-- WHAT IT DOES NOT UNDO: alert rows already written to ops.system_error stay; they are history.
select cron.unschedule(jobid) from cron.job where jobname in ('perf-watch-statements', 'perf-watch-health');
delete from ops.proof_check where kind = 'perf' and (slug like 'door:%@large' or slug like 'stmt:%');
