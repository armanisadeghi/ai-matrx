-- artifact_natural_key_unique.sql
--
-- chat.artifact was documented as "idempotent on the natural key
-- (user_id, message_id, artifact_type, external_system)" but had NO unique
-- constraint backing that claim — only the pkey (id). So concurrent /
-- double-mount "create artifact" calls (repeat HTML-preview overlay opens, etc.)
-- silently INSERTed duplicate rows instead of coalescing. As of 2026-07-03 that
-- had produced 63 excess rows out of 170 live (23 duplicated natural keys).
--
-- Fix, in one idempotent migration:
--   1. Collapse each duplicate natural-key group to its newest row (hard delete
--      the rest — chat.artifact has NO inbound FKs, so nothing is orphaned; 0
--      rows are soft-deleted, so a FULL index is safe).
--   2. Add a FULL `NULLS NOT DISTINCT` unique index so:
--        - a NULL external_system dedupes against another NULL (the common case),
--        - the index is inferable by `INSERT ... ON CONFLICT (cols)` — a PARTIAL
--          index (e.g. WHERE deleted_at IS NULL) is NOT inferable through
--          supabase-js upsert, which cannot supply the predicate.
--   The route then upserts atomically (ON CONFLICT DO NOTHING → selective update),
--   so the natural key can never duplicate and never emits a 23505/409 again.
--
-- Re-runnable: the DELETE is a no-op once deduped; the index is IF NOT EXISTS.

-- 1. Dedup — keep the newest row per natural key, hard-delete the rest.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, message_id, artifact_type, external_system
           ORDER BY updated_at DESC NULLS LAST,
                    created_at DESC NULLS LAST,
                    id DESC
         ) AS rn
  FROM chat.artifact
)
DELETE FROM chat.artifact a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

-- 2. Full NULLS NOT DISTINCT unique index backing the natural key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cx_artifact_natural_key
  ON chat.artifact (user_id, message_id, artifact_type, external_system)
  NULLS NOT DISTINCT;
