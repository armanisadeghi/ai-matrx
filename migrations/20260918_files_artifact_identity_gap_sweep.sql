-- ============================================================================
-- THE DEPLOY-GAP SWEEP (2026-09-18, CS-30)
--
-- `20260917_files_artifact_identity_backfill_and_index.sql` stamped every
-- artifact row that existed when it ran (26,235 of them). The aidream upload
-- door that stamps NEW rows shipped afterwards — its train built at 00:48Z —
-- so every coding artifact uploaded in between landed with both columns NULL.
-- Those rows are not slow, they are INVISIBLE: the panel now finds a session's
-- artifacts by `artifact_kind` / `provider_session_id`, so a row with neither is
-- listed by no session at all.
--
-- 83 such rows existed when this was written. One statement, the same shape as
-- the backfill's batches (the set is small and bounded by the gap's length), and
-- `artifact_kind IS NULL` keeps it idempotent: a re-run stamps 0.
--
-- This class cannot recur silently. `pnpm check:artifact-read-latency`'s fourth
-- detector asks for rows under `coding-sessions/%` that claim the kind in their
-- metadata and carry no `artifact_kind`, and fails naming the door — it is how
-- these 83 were found, minutes after the gap opened.
-- ============================================================================

SET lock_timeout = '2s';

UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.metadata ->> 'kind' = 'coding_session_artifact'
   AND f.artifact_kind IS NULL;

-- NOTHING FAILS SILENTLY: division_by_zero if one artifact row is left unstamped.
SELECT 1 / (CASE WHEN count(*) = 0 THEN 1 ELSE 0 END) AS every_artifact_row_is_stamped
  FROM files.files
 WHERE metadata ->> 'kind' = 'coding_session_artifact'
   AND artifact_kind IS NULL;
