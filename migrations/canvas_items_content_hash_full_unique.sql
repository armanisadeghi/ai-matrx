-- canvas_items_content_hash_full_unique.sql
--
-- canvas.canvas_items dedupes saves on the natural key (user_id, content_hash),
-- but the backing index was PARTIAL:
--   canvas_items_user_content_unique (user_id, content_hash) WHERE content_hash IS NOT NULL
-- A partial unique index CANNOT be an `ON CONFLICT (cols)` arbiter — Postgres
-- requires the predicate in the ON CONFLICT clause, which supabase-js `.upsert`
-- cannot supply. So `canvasItemsService.save` was stuck on select-then-insert,
-- which 409s (23505) under concurrent / re-save-identical-content races and
-- surfaces RED in the Error Inspector even when the app recovers.
--
-- Replace the partial index with a FULL unique index on the same columns so the
-- service can upsert atomically (ON CONFLICT DO NOTHING → no 409 ever). This is
-- semantically equivalent for dedup: content_hash is always set on saved items
-- (0 NULL of 197 live rows, 0 non-null duplicates), and a standard unique still
-- allows multiple NULLs (distinct) exactly as the partial did.
--
-- Re-runnable: guarded on catalog presence.

DO $$
BEGIN
  -- Create the full unique index first (idempotent) …
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'canvas' AND c.relname = 'canvas_items_user_content_full_unique'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX canvas_items_user_content_full_unique '
         || 'ON canvas.canvas_items (user_id, content_hash)';
  END IF;

  -- … then drop the partial one it supersedes.
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'canvas' AND c.relname = 'canvas_items_user_content_unique'
  ) THEN
    EXECUTE 'DROP INDEX canvas.canvas_items_user_content_unique';
  END IF;
END $$;
