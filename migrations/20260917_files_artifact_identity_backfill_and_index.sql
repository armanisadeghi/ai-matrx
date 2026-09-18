-- ============================================================================
-- FILL THE TWO REAL COLUMNS, THEN INDEX THEM (2026-09-17, CS-30)
--
-- Runs after `20260917_files_artifact_identity_columns.sql`. Three parts, in
-- this order, and every one of them is re-runnable:
--
--   1. BATCHED BACKFILL. Ten identical statements, each stamping at most 5,000
--      rows whose `artifact_kind` is still NULL. `artifact_kind IS NULL` is the
--      progress marker, so a re-run stamps 0 rows and a partially applied file
--      simply continues. Production held 26,235 such rows when this was
--      written (6 batches' worth); the capacity is deliberately ~2x that.
--      Batches, not one 26k-row UPDATE, because `files.files` is the platform's
--      hottest table and every UPDATE here fires its 10 row triggers: it bumps
--      `version`/`updated_at` and writes one `history.row_versions` snapshot
--      per row. That cost is REAL and is accepted rather than dodged — no
--      `session_replication_role`, no `DISABLE TRIGGER`, no guard bypassed for
--      a migration's convenience. `platform._stamp_actor` leaves `updated_by`
--      alone when no actor is set, so authorship is not rewritten.
--   2. AN ASSERT. If any artifact row is still unstamped, the SELECT raises
--      `division_by_zero` and NO ledger row is written. A backfill that
--      silently stops half way is the defect this exists to make impossible.
--   3. THE INDEX, built CONCURRENTLY. `(provider_session_id, artifact_kind)
--      WHERE deleted_at IS NULL` — the panel's two equalities, both on real
--      `text` columns, whose `texteq` IS leakproof, so under RLS they become an
--      Index Cond instead of a per-row Filter. Session first because that is
--      the selective one (85 sessions vs 2 kinds).
--
-- The file runs in the AUTOCOMMIT lane (the runner detects `CREATE INDEX
-- CONCURRENTLY`), which sends each statement on its own connection-level
-- transaction — which is exactly what makes the batches real batches.
--
-- ⚠️ IF THIS FILE FAILS PART WAY, THE COMMITTED STATEMENTS STAY COMMITTED and
-- no ledger row is written. Re-run it. But FIRST check for an INVALID index: a
-- `CREATE INDEX CONCURRENTLY` that does not finish leaves one behind that
-- Postgres still maintains on every write, and `IF NOT EXISTS` then skips it
-- forever (this happened twice to CS-27's own index):
--     select c.relname, i.indisvalid from pg_class c
--       join pg_index i on i.indexrelid = c.oid
--      where c.relname = 'files_artifact_provider_session_idx';
-- If `indisvalid` is false, `DROP INDEX CONCURRENTLY files.files_artifact_provider_session_idx;`
-- (a chair step — a DROP is never a swept migration) before re-running.
-- ============================================================================

-- The platform's maintenance-DDL guard refuses DDL on a migration session whose
-- lock_timeout is zero or above 2 s: an online build must never sit in the lock
-- queue of a table every client writes. It fails fast instead, and the answer to
-- a busy minute is to re-run, never to widen the wait.
SET lock_timeout = '2s';

-- batch 1 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 2 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 3 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 4 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 5 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 6 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 7 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 8 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 9 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- batch 10 of 10
UPDATE files.files AS f
   SET artifact_kind = f.metadata ->> 'kind',
       provider_session_id = f.metadata ->> 'cli_session_id'
 WHERE f.id IN (
         SELECT s.id
           FROM files.files AS s
          WHERE s.metadata ->> 'kind' = 'coding_session_artifact'
            AND s.artifact_kind IS NULL
          LIMIT 5000);

-- NOTHING FAILS SILENTLY: division_by_zero if one artifact row is left unstamped.
SELECT 1 / (CASE WHEN count(*) = 0 THEN 1 ELSE 0 END) AS every_artifact_row_is_stamped
  FROM files.files
 WHERE metadata ->> 'kind' = 'coding_session_artifact'
   AND artifact_kind IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS files_artifact_provider_session_idx
  ON files.files (provider_session_id, artifact_kind)
  WHERE deleted_at IS NULL;
