-- lane: KERNEL-SHADOW
-- =============================================================================
-- KERNEL-SHADOW g — schedule the access-kernel drift sweep (approved by Arman 2026-10-07:
-- "If you really think we need that sweep, go for it."; name kernel-shadow-sweep, every 30 minutes).
--
-- pg_cron, not the sch_* spine: the spine runs agent / tool / ping tasks (scheduler.sch_task.kind
-- CHECK) and has no kind that calls a SQL function; database jobs live in pg_cron and the register's
-- "Database jobs (pg_cron)" table. Idempotent on what it does: cron.schedule with an existing job name
-- replaces that job's schedule and command.
-- Bounded: iam.kernel_shadow_sweep() defaults compare 5 people x 300 Tables x 2 levels = 3,000
-- answers; statement_timeout 5 min, lock_timeout 5 s. Disagreements write iam.access_shadow_log and
-- ops.system_error exactly as the shadow does.
-- Switch off: select cron.unschedule('kernel-shadow-sweep');
-- =============================================================================
select cron.schedule('kernel-shadow-sweep', '7,37 * * * *',
  $cron$SET statement_timeout = '5min'; SET lock_timeout = '5s'; SELECT iam.kernel_shadow_sweep(3, 300);$cron$);
