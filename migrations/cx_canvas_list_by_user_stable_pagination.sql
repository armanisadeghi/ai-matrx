-- cx_canvas_list_by_user: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated RPC whose ORDER BY is not a TOTAL order. Each LIMIT/OFFSET page is
-- a separate query execution and Postgres uses a bounded top-N sort, so tied
-- rows are ordered arbitrarily and differently on each page — rows get
-- duplicated onto one page and silently skipped from another. On agx_get_list,
-- paging a 365-row result 100 at a time returned only 306 DISTINCT ids.
--
-- FIX: append `id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION public.cx_canvas_list_by_user(p_user_id uuid, p_type text DEFAULT NULL::text, p_is_favorited boolean DEFAULT NULL::boolean, p_source_type text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS SETOF canvas.canvas_items
 LANGUAGE sql
 STABLE
AS $function$
  SELECT *
  FROM canvas.canvas_items
  WHERE user_id = p_user_id
    AND is_archived = false
    AND (p_type IS NULL OR type = p_type)
    AND (p_is_favorited IS NULL OR is_favorited = p_is_favorited)
    AND (p_source_type IS NULL OR source_type = p_source_type)
  -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
  ORDER BY updated_at DESC, id DESC
  LIMIT p_limit OFFSET p_offset;
$function$;
