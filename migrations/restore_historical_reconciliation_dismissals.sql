-- Repair one operator reconciliation run on 2026-08-11 that treated stored
-- historical URL relations as fresh observations. It temporarily revived 372
-- dismissed rows on datadestruction.com. Restore every original tombstone and
-- remove only the false final revival marker from that bounded invocation.

WITH affected AS (
  SELECT
    page.id,
    (page.metadata->'dismissals'->-1->>'dismissed_at')::timestamptz
      AS original_deleted_at,
    jsonb_array_length(page.metadata->'dismissals') - 1 AS marker_index
  FROM web.page AS page
  WHERE page.site_id = '38eff4c9-b021-451a-b995-7d9b3d17db5e'
    AND jsonb_typeof(page.metadata->'dismissals') = 'array'
    AND jsonb_array_length(page.metadata->'dismissals') > 0
    AND (page.metadata->'dismissals'->-1->>'revived_at')::timestamptz
      BETWEEN '2026-08-11 15:53:20+00'::timestamptz
          AND '2026-08-11 15:54:10+00'::timestamptz
)
UPDATE web.page AS page
SET
  deleted_at = affected.original_deleted_at,
  metadata = jsonb_set(
    page.metadata,
    '{dismissals}',
    (page.metadata->'dismissals') - affected.marker_index,
    true
  )
FROM affected
WHERE page.id = affected.id;

