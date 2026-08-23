-- APPLIED LIVE 2026-08-23 via Supabase MCP apply_migration. Idempotent
-- (`finished_at IS NULL` guards the whole statement), so a re-run is a no-op.
--
-- Repair the sch_run rows the lifecycle watchdog force-failed WITHOUT
-- recording anything (171 rows, 2026-06-11 .. 2026-08-20, 23 distinct tasks).
--
-- `status='failed' AND finished_at IS NULL` is the watchdog's unique
-- fingerprint: every other terminal writer in matrx-scheduler goes through
-- queries.finalize_run, which unconditionally stamps finished_at (and
-- sweep_expired_leases stamps finished_at + error_message='lease expired').
-- Only the matrx-orm lifecycle sweeper wrote status alone — its
-- WatchedLifecycleConfig for scheduler.sch_run carried no
-- extra_fields_on_timeout and metadata_column=None, so it left neither a
-- reason, a finish time, nor an audit stamp.
--
-- This is why seo.gsc_ingestion_health rendered "The nightly Search Console
-- job is failing (last run 2026-08-20 09:15: no error recorded)": the accuser
-- had destroyed its own evidence. Root cause fixed in aidream
-- aidream/db/watchdog_configs.py — the rule now respects each run's claim
-- lease and stamps status + finished_at + error_message + claim_token=NULL,
-- matching sweep_expired_leases exactly.
--
-- Nothing here invents a cause. finished_at is set to updated_at, which IS
-- the moment the watchdog wrote the row, and the message states plainly that
-- it was reconstructed and from what.
--
-- SCOPED to rows carrying claim_protocol=2 (111 of the 171). The other 60
-- predate that protocol, and `sch_run_claim_protocol_by_claimed_at_chk`
-- (claimed_at IS NOT NULL => metadata->>'claim_protocol' = '2', NOT VALID)
-- rejects ANY update to them — 48,493 legacy rows are un-updatable this way.
-- They are all in a terminal status, so nothing is operationally stuck, and
-- stamping claim_protocol=2 on them to get past the check would assert a
-- protocol those runs did not use. Left alone deliberately; tracked
-- separately.

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
  AND claimed_at IS NOT NULL
  AND (metadata->>'claim_protocol') = '2';
