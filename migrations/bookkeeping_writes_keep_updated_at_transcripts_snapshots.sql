-- A Source pointer written onto a transcript or a crawl snapshot is bookkeeping, not a modification.
--
-- Sibling of migrations/platform_bookkeeping_writes_keep_updated_at.sql (files.files), same
-- primitive: platform._keep_updated_at_for_bookkeeping(<bookkeeping columns>), attached as
-- `_touch_row_bookkeeping` so it fires right after `_touch_row`.
--
-- Census of the 2026-09-26 SOURCE-CONVERGENCE backfills (rows created before that day whose
-- updated_at moved that day, compared column by column against history.row_versions):
--   transcripts.transcripts  292  — the only change: processed_document_id (the Source pointer).
--                                    The transcripts list sorts by updated_at desc and shows
--                                    "Updated", so months-old transcripts read "updated today".
--   web.snapshot            5,870  — the only allowed update on an immutable snapshot is that same
--                                    pointer; SnapshotDetail shows "Updated". Snapshots are not
--                                    versioned in history, so their prior value is unprovable and
--                                    is NOT repaired here — the trigger stops the next one.
--   (Not attached, not person-facing: web.page 3,993 pointer writes — no surface shows or sorts by
--    its updated_at; research.rs_source/rs_content ~980 each — not versioned, no surface reads
--    their updated_at; docproc.processed_documents 330 — aidream 1309's visibility change, a real
--    change, not the backfill.)

CREATE TRIGGER _touch_row_bookkeeping
    BEFORE UPDATE ON transcripts.transcripts
    FOR EACH ROW
    EXECUTE FUNCTION platform._keep_updated_at_for_bookkeeping('processed_document_id');

CREATE TRIGGER _touch_row_bookkeeping
    BEFORE UPDATE ON web.snapshot
    FOR EACH ROW
    EXECUTE FUNCTION platform._keep_updated_at_for_bookkeeping('processed_document_id');

-- Repair: put back the real "Updated" on every transcript whose ONLY change since
-- 2026-09-26 13:00 UTC was the backfill's pointer write (measured: 284 of 292 — exactly one
-- history row after 13:00, still the current version, differing from the prior version only in
-- processed_document_id; custom_fields null→{} is the history column's own default, not a change).
-- The prior value comes from history.row_versions. relabel_keeps_updated_at stops _touch_row
-- from re-stamping the restored value.
SET LOCAL app.relabel_keeps_updated_at = 'on';

WITH hit AS (
    SELECT t.id, t.version
    FROM transcripts.transcripts t
    WHERE t.updated_at >= '2026-09-26 13:00+00'
      AND t.updated_at <  '2026-09-26 19:00+00'
      AND t.created_at <  '2026-09-26 00:00+00'
),
x AS (
    SELECT h.id, h.version AS cur_v,
        (SELECT r.row_data FROM history.row_versions r
          WHERE r.entity_type = 'transcript' AND r.row_id = h.id AND r.occurred_at < '2026-09-26 13:00+00'
          ORDER BY r.occurred_at DESC LIMIT 1) AS before_row,
        (SELECT r.row_data FROM history.row_versions r
          WHERE r.entity_type = 'transcript' AND r.row_id = h.id AND r.occurred_at >= '2026-09-26 13:00+00'
          ORDER BY r.occurred_at ASC LIMIT 1) AS after_row,
        (SELECT count(*) FROM history.row_versions r
          WHERE r.entity_type = 'transcript' AND r.row_id = h.id AND r.occurred_at >= '2026-09-26 13:00+00') AS n_after
    FROM hit h
),
safe AS (
    SELECT x.id, (x.before_row ->> 'updated_at')::timestamptz AS real_updated_at
    FROM x
    WHERE x.n_after = 1
      AND x.before_row ? 'updated_at'
      AND (x.after_row ->> 'version')::int = x.cur_v
      AND (x.after_row ->> 'processed_document_id') IS NOT NULL
      AND (x.after_row ->> 'processed_document_id') IS DISTINCT FROM (x.before_row ->> 'processed_document_id')
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_each(x.after_row) e(k, v)
          WHERE e.k NOT IN ('updated_at', 'version', 'updated_by', 'processed_document_id')
            AND (x.before_row -> e.k) IS DISTINCT FROM e.v
            AND NOT (e.k = 'custom_fields'
                     AND coalesce(x.before_row -> e.k, 'null'::jsonb) IN ('null'::jsonb, '{}'::jsonb)
                     AND e.v IN ('null'::jsonb, '{}'::jsonb)))
)
UPDATE transcripts.transcripts t
   SET updated_at = s.real_updated_at
  FROM safe s
 WHERE t.id = s.id
   AND s.real_updated_at IS NOT NULL;
