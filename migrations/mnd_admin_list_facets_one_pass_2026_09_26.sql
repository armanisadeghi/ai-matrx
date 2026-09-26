-- based-on: public.mnd_admin_list(text, text, uuid, text, jsonb, text, text, integer, integer, jsonb) f8928430fdfb9e0445dcab57c3c11a098b4edffd8ec0e4364d9fae127d988814
--
-- mnd_admin_list_facets_one_pass_2026_09_26.sql
--
-- The admin mandate list's facets in ONE pass over the rows.
--
-- WHY (2026-09-26 outage on /administration/intelligence/mandates, 57014 on the
-- facets call): the facets branch cross-joined every column key with every
-- scoped row and called `mandate._admin_list_match` once per (column, row)
-- pair — ~30 columns x ~545 rows of a SQL function that cannot be inlined
-- (it aggregates) — even when the filter bag is empty, which it always is for
-- facets (lib/entity-list/useEntityList.ts hands facets an EMPTY bag). Measured
-- as admin@admin.com in the admin lane: 1,015 ms for the whole facets call.
--
-- NOW: each row's own `vals` keys are walked once (jsonb_each), and the
-- per-column match runs only when a filter bag is present. Same answer — the
-- md5 of the facets JSON was identical before/after on live data — in 532 ms,
-- most of which is the shared row build (`mandate._admin_list_rows`).
--
-- Only the facets branch changes. The body is patched IN PLACE from the live
-- definition (asserted to contain the exact old fragment), so no other lane's
-- change to this function can be reverted by a stale copy here.

DO $patch$
DECLARE
  v_def text := pg_get_functiondef(
    'public.mnd_admin_list(text, text, uuid, text, jsonb, text, text, integer, integer, jsonb)'::regprocedure);
  v_old text := E'        SELECT cols.col, v.val, count(*) AS n\n'
             || E'        FROM (SELECT DISTINCT jsonb_object_keys(r.vals) AS col FROM scoped r) cols\n'
             || E'        JOIN scoped r ON mandate._admin_list_match(r.vals, v_f, cols.col)\n'
             || E'        CROSS JOIN LATERAL (SELECT DISTINCT x AS val\n'
             || E'                            FROM jsonb_array_elements_text(r.vals->cols.col) x) v\n'
             || E'        WHERE cols.col NOT IN (''id'', ''goal'', ''updatedAt'', ''createdAt'')\n'
             || E'        GROUP BY cols.col, v.val';
  v_new text := E'        -- One pass: each row''s own keys, the match only when a filter is set.\n'
             || E'        SELECT e.key AS col, v.val, count(*) AS n\n'
             || E'        FROM scoped r\n'
             || E'        CROSS JOIN LATERAL jsonb_each(r.vals) e\n'
             || E'        CROSS JOIN LATERAL (SELECT DISTINCT x AS val\n'
             || E'                            FROM jsonb_array_elements_text(e.value) x) v\n'
             || E'        WHERE e.key NOT IN (''id'', ''goal'', ''updatedAt'', ''createdAt'')\n'
             || E'          AND (v_f = ''{}''::jsonb OR mandate._admin_list_match(r.vals, v_f, e.key))\n'
             || E'        GROUP BY e.key, v.val';
BEGIN
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'mnd_admin_list facets fragment not found — the live body moved; re-read it before patching';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$patch$;
