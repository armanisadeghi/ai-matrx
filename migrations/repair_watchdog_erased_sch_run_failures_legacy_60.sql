-- APPLIED LIVE 2026-08-23 via Supabase MCP apply_migration. Idempotent
-- (`finished_at IS NULL` guards the whole statement), so a re-run is a no-op.
--
-- Finishes repair_watchdog_erased_sch_run_failures.sql. That pass repaired 111
-- of the 171 watchdog-erased rows and deliberately skipped the other 60,
-- because sch_run_claim_protocol_by_claimed_at_chk rejected ANY update to a
-- pre-CLAIM_PROTOCOL=2 row — and stamping claim_protocol=2 to get past it
-- would have asserted a protocol those runs did not use.
--
-- aidream db/migrations/0483_scheduler_claim_protocol_fence_grandfather_cutover.sql
-- removed that blockage the honest way: the fence now grandfathers rows
-- created at or before the measured protocol-2 cutover BY ITS PREDICATE
-- (validated), instead of by NOT VALID, which only skipped the historical scan
-- and left 48,493 legacy rows permanently un-updatable.
--
-- These 60 rows: 2026-06-11 .. 2026-07-19, 6 distinct tasks. Nothing here
-- invents a cause and nothing here writes claim_protocol. The message is the
-- same reconstruction the first pass used, and finished_at is set to
-- updated_at, which IS the moment the watchdog wrote the row.

UPDATE scheduler.sch_run
SET finished_at = updated_at,
    error_message = COALESCE(
      error_message,
      'Force-failed by the lifecycle watchdog, which recorded no reason at the '
      || 'time (fixed 2026-08-23). Reconstructed from the row''s own shape: a '
      || 'terminal ''failed'' with no finish time is written by no other code '
      || 'path in matrx-scheduler. The run''s claim lease had not necessarily '
      || 'expired — the old rule fired on age alone (610s from claimed_at) and '
      || 'could kill a healthy long-running job mid-flight.'
    ),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'watchdog_reason', 'timeout',
      'watchdog_evidence_repaired_at', now()::text
    )
WHERE status = 'failed'
  AND finished_at IS NULL
  AND claimed_at IS NOT NULL;
