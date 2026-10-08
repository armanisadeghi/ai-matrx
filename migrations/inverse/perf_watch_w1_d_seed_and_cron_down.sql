-- chair-step: inverse of perf_watch_w1_d_seed_and_cron.sql — unschedules the two perf-watch pg_cron jobs and deletes the eight seeded door watches (their samples go with them, ON DELETE CASCADE).
select cron.unschedule(jobid) from cron.job where jobname in ('perf-watch-probe', 'perf-watch-sample-retention');
delete from ops.proof_check where kind = 'perf' and slug like 'door:%' and owner = 'PERF-WATCH';
