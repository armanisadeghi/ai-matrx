-- A machine's bookkeeping write is not a modification.
--
-- 2026-09-26 15:45–18:11 UTC the Sources files backfill (aidream
-- scripts/backfill_files_to_sources.py) extracted every existing file and wrote the new
-- document's id back onto files.files.canonical_processed_document_id. platform._touch_row
-- stamps updated_at = now() on EVERY update, so 4,746 files uploaded months ago read
-- "modified today" in /files (default sort updated_at desc) and buried the one PDF the
-- owner actually uploaded that morning.
--
-- The class: updated_at is the human-facing "Last modified" (Google Drive's reference —
-- indexing, OCR, thumbnailing never move a file's modified time). A write that changes ONLY
-- machine-maintained pointers/derived facts must keep it. `version` still bumps (optimistic
-- concurrency needs it) and history still records the change.
--
-- The primitive: platform._keep_updated_at_for_bookkeeping(<col>, ...), a BEFORE UPDATE
-- trigger each table attaches with its own bookkeeping columns as arguments. It is named
-- `_touch_row_bookkeeping` so it fires right after `_touch_row` (triggers fire in name order).
-- Any other change — or no bookkeeping column changing at all — leaves _touch_row's stamp.

CREATE OR REPLACE FUNCTION platform._keep_updated_at_for_bookkeeping()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    -- Stamped by the platform's own triggers on every write; never evidence of a change.
    stamped   text[] := ARRAY['updated_at', 'version', 'updated_by', 'updated_by_tier', 'updated_by_system'];
    ignored   text[] := stamped || TG_ARGV::text[];
    new_rec   jsonb := to_jsonb(NEW);
    old_rec   jsonb := to_jsonb(OLD);
    k         text;
BEGIN
    IF TG_OP <> 'UPDATE' OR NOT (new_rec ? 'updated_at') THEN
        RETURN NEW;
    END IF;
    -- Only a write whose every real change is to a declared bookkeeping column keeps the time.
    FOREACH k IN ARRAY TG_ARGV::text[] LOOP
        IF (new_rec -> k) IS DISTINCT FROM (old_rec -> k) THEN
            IF (new_rec - ignored) IS NOT DISTINCT FROM (old_rec - ignored) THEN
                NEW.updated_at := OLD.updated_at;
            END IF;
            RETURN NEW;
        END IF;
    END LOOP;
    RETURN NEW;
END
$function$;

COMMENT ON FUNCTION platform._keep_updated_at_for_bookkeeping() IS
  'BEFORE UPDATE trigger, attached as _touch_row_bookkeeping(<bookkeeping columns>): a write that changes only the named machine-maintained columns keeps updated_at (the human "Last modified"). version still bumps. See migrations/platform_bookkeeping_writes_keep_updated_at.sql.';

-- files.files: the extracted-document pointer, the dedup pointer, the storage location and
-- the probed media facts are all written by machines after upload, never by the owner.
CREATE TRIGGER _touch_row_bookkeeping
    BEFORE UPDATE ON files.files
    FOR EACH ROW
    EXECUTE FUNCTION platform._keep_updated_at_for_bookkeeping(
        'canonical_processed_document_id', 'duplicate_of_file_id', 'storage_uri',
        'width', 'height', 'duration_ms');

-- Repair: put back the real "Last modified" on every file whose ONLY change since
-- 2026-09-26 15:00 UTC was the backfill's pointer write (measured: 4,746 rows, each with
-- exactly one history row after 15:00 differing from its prior version only in
-- canonical_processed_document_id). The prior value comes from history.row_versions.
-- relabel_keeps_updated_at stops _touch_row from re-stamping the restored value.
SET LOCAL app.relabel_keeps_updated_at = 'on';

WITH hit AS (
    SELECT f.id
    FROM files.files f
    WHERE f.updated_at >= '2026-09-26 15:00+00'
      AND f.created_at <  '2026-09-26 15:00+00'
),
x AS (
    SELECT h.id,
        (SELECT r.row_data FROM history.row_versions r
          WHERE r.entity_type = 'file' AND r.row_id = h.id AND r.occurred_at < '2026-09-26 15:00+00'
          ORDER BY r.occurred_at DESC LIMIT 1) AS before_row,
        (SELECT r.row_data FROM history.row_versions r
          WHERE r.entity_type = 'file' AND r.row_id = h.id AND r.occurred_at >= '2026-09-26 15:00+00'
          ORDER BY r.occurred_at ASC LIMIT 1) AS after_row,
        (SELECT count(*) FROM history.row_versions r
          WHERE r.entity_type = 'file' AND r.row_id = h.id AND r.occurred_at >= '2026-09-26 15:00+00') AS n_after
    FROM hit h
),
safe AS (
    SELECT x.id, (x.before_row ->> 'updated_at')::timestamptz AS real_updated_at
    FROM x
    WHERE x.n_after = 1
      AND x.before_row ? 'updated_at'
      AND (x.before_row ->> 'canonical_processed_document_id') IS DISTINCT FROM (x.after_row ->> 'canonical_processed_document_id')
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_each(x.after_row) e(k, v)
          WHERE x.before_row ? e.k
            AND (x.before_row -> e.k) IS DISTINCT FROM e.v
            AND e.k NOT IN ('updated_at', 'version', 'updated_by', 'canonical_processed_document_id'))
)
UPDATE files.files f
   SET updated_at = s.real_updated_at
  FROM safe s
 WHERE f.id = s.id
   AND s.real_updated_at IS NOT NULL;
