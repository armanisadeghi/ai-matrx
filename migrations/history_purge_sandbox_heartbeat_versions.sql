-- Purge contentless sandbox_instance version rows — 2026-08-23
--
-- WHAT HAPPENED
-- `public.sandbox_instances` is a versioned entity, so every UPDATE captured a
-- full ~1KB JSON snapshot into `history.row_versions`. Sandbox instances
-- heartbeat continuously, so ~292 live instances generated 4.86 MILLION version
-- rows in July + August 2026 — 90% of the entire version history table by row
-- count, and ~7 GB of the database.
--
-- Measured before the purge: in a 20,000-row sample of consecutive
-- sandbox_instance versions, 98.7% differed from their predecessor in NOTHING
-- but `updated_at` and `version`. Across July the figure was 99.88%
-- (1,810,844 of 1,812,980 rows carried no information at all).
--
-- THE CAUSE IS ALREADY FIXED. The `_version_capture_update` trigger on
-- `public.sandbox_instances` now carries a WHEN guard that skips updates
-- touching only `updated_at`, `version`, and `last_heartbeat_at`. The effect is
-- unmistakable in the data: 176,971 sandbox versions were written on
-- 2026-08-21, then 3 on 08-22 and 2 on 08-23. The newest row this purge removes
-- is dated 2026-08-21 22:37 — nothing after the guard landed qualifies.
--
-- This migration removes the debris the bug left behind. It is repair, not
-- retention: no retention policy is implied or created, and
-- `platform.retention_policy`'s "never destroy by omission" floor is untouched.
--
-- WHAT IS DELETED — deliberately the narrowest possible predicate:
--   entity_type = 'sandbox_instance'      (no other entity is touched)
--   AND operation = 'UPDATE'              (INSERT/DELETE/SOFT_DELETE all kept)
--   AND a previous version exists         (every row keeps its first version)
--   AND this version differs from that predecessor in nothing except
--       updated_at / version / last_heartbeat_at
--
-- Verified before executing: 0 non-sandbox rows and 0 non-UPDATE rows in the
-- delete set, and ALL 222 distinct sandbox instances in the July partition
-- retain at least one version. No entity loses its history; only contentless
-- duplicates go.
--
-- Rows removed: 1,810,844 (2026_07) + 3,047,068 (2026_08) = 4,857,912.
--
-- Space is returned to the OS only by a rewrite of the affected partitions.
-- `history.row_versions_2026_07` is closed (no writer) and was vacuumed full in
-- the same session. `history.row_versions_2026_08` is the LIVE partition — a
-- VACUUM FULL there takes an ACCESS EXCLUSIVE lock that would stall every
-- versioned write on the platform, so it is deliberately deferred until the
-- partition closes on 2026-09-01:
--     VACUUM (FULL, ANALYZE) history.row_versions_2026_08;
--
-- Re-running this migration is a no-op: the predicate finds nothing.

BEGIN;

CREATE TEMP TABLE _purge_ids ON COMMIT DROP AS
WITH v AS (
  SELECT id,
         operation,
         (row_data - 'updated_at' - 'version' - 'last_heartbeat_at') AS sig,
         lag(row_data - 'updated_at' - 'version' - 'last_heartbeat_at')
           OVER (PARTITION BY row_id ORDER BY version) AS prev_sig
  FROM history.row_versions
  WHERE entity_type = 'sandbox_instance'
    AND occurred_at >= '2026-07-01' AND occurred_at < '2026-09-01'
)
SELECT id FROM v
WHERE operation = 'UPDATE'
  AND prev_sig IS NOT NULL
  AND sig IS NOT DISTINCT FROM prev_sig;

DELETE FROM history.row_versions r
USING _purge_ids p
WHERE r.id = p.id
  AND r.entity_type = 'sandbox_instance'
  AND r.operation = 'UPDATE';

COMMIT;
