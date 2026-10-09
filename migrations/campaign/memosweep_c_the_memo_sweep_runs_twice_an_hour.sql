-- lane: MEMO-SWEEP
-- =============================================================================
-- MEMO-SWEEP c (2026-10-08) - schedule iam.kernel_memo_sweep(): memo-off against memo-on answers of custom.levels_of,
-- custom.reaches_directly_many and custom.read_records_page on one snapshot, read-only (see memosweep_a, memosweep_b).
-- pg_cron job kernel-memo-sweep at :22 and :52, fifteen minutes after kernel-shadow-sweep (:07, :37), 5 min statement
-- timeout, 5 s lock timeout. Disagreements and failures: iam.access_shadow_log (caller iam.kernel_memo_sweep|...),
-- ops.system_error kind access_kernel_disagreement, server_status access_kernel (memo_* fields, red sentence).
-- Registered in common-docs/operations/scheduled-tasks.md. Switch off: select cron.unschedule('kernel-memo-sweep');
-- =============================================================================
select cron.schedule('kernel-memo-sweep', '22,52 * * * *',
  $cron$SET statement_timeout = '5min'; SET lock_timeout = '5s'; SELECT iam.kernel_memo_sweep();$cron$);
