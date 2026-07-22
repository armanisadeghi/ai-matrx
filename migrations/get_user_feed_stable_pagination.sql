-- get_user_feed: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated RPC whose ORDER BY is not a TOTAL order. Each LIMIT/OFFSET page is
-- a separate query execution and Postgres uses a bounded top-N sort, so tied
-- rows are ordered arbitrarily and differently on each page — rows get
-- duplicated onto one page and silently skipped from another. On agx_get_list,
-- paging a 365-row result 100 at a time returned only 306 DISTINCT ids.
--
-- An infinite-scroll feed is the worst place for this: the user sees repeats
-- and never sees the skipped items at all.
--
-- FIX: append `sc.id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION public.get_user_feed(p_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(canvas_id uuid, title text, canvas_type text, creator_username text, like_count integer, view_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        sc.id,
        sc.title,
        sc.canvas_type,
        sc.creator_username,
        sc.like_count,
        sc.view_count,
        sc.created_at
    FROM canvas.shared_canvas_items sc
    WHERE sc.visibility = 'public'
    AND (
        -- From users you follow
        sc.created_by IN (
            SELECT following_id FROM users.user_follows WHERE follower_id = p_user_id
        )
        -- Or trending content
        OR sc.trending_score > 10
    )
    -- `sc.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
    ORDER BY sc.created_at DESC, sc.id DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$;
