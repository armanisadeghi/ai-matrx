-- Fix: repoint the two straggler canvas functions that were missed when
-- `shared_canvas_items` moved public -> canvas and `user_follows` moved public -> users
-- during the 2026 schema reorg.
--
-- The sibling canvas functions (cx_canvas_publish, update_canvas_like_count,
-- update_canvas_comment_count, update_canvas_high_score, update_canvas_view_count)
-- were already repointed to `canvas.shared_canvas_items`. These two were not, producing
-- live errors:
--   * cron job "update-trending-scores" (every 5 min): ERROR relation "shared_canvas_items" does not exist
--   * public.get_user_feed(): 500 whenever a user's feed RPC is invoked
--     (double bug — both `shared_canvas_items` AND `user_follows` were unqualified)
--
-- Bodies are otherwise byte-identical to the live definitions; only schema qualifiers added.
-- Idempotent: CREATE OR REPLACE, safe to re-apply.

CREATE OR REPLACE FUNCTION public.update_all_trending_scores()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE canvas.shared_canvas_items
    SET trending_score = calculate_trending_score(
        like_count,
        play_count,
        comment_count,
        share_count,
        fork_count,
        view_count,
        completion_rate,
        created_at,
        featured
    )
    WHERE visibility = 'public';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_feed(
    p_user_id uuid,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0)
 RETURNS TABLE(
    canvas_id uuid,
    title text,
    canvas_type text,
    creator_username text,
    like_count integer,
    view_count integer,
    created_at timestamp with time zone)
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
    ORDER BY sc.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$;
