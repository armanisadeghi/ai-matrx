-- D82.2 — `public.get_user_feed` accepted any `p_user_id` with no actor check.
--
-- It is SECURITY INVOKER, takes the subject as a PARAMETER, and both `anon` and
-- `authenticated` hold EXECUTE — so any caller could pass any user id and get
-- that user's feed. Its siblings (`list_trash`, `search_files`,
-- `get_user_file_tree`) all guard the identical shape with an `auth.uid()`
-- check; this one never got it.
--
-- ⚠️ HONEST SEVERITY: this is a LATENT pattern defect, not a live data leak.
-- Everything the function returns is already public by design — it selects only
-- `visibility='public'` canvas items, and `users.user_follows` carries a
-- `USING (true)` SELECT policy ("Follows are viewable by everyone"). Nothing is
-- disclosed today that an anonymous caller could not read directly. What the
-- missing guard costs is the invariant: the moment the follow graph or the feed
-- gains any non-public dimension, this becomes a real actor-spoof primitive with
-- no code change. Fix the shape now, while it is free.
--
-- Guard is stricter than the siblings' on purpose. Theirs is
-- `auth.uid() IS NOT NULL AND auth.uid() <> p_user_id`, which lets a NULL
-- `auth.uid()` — i.e. anon — pass ANY id. That is fine for a SECURITY DEFINER
-- RPC reachable only by service_role, but `get_user_feed` is granted to `anon`,
-- so the NULL branch IS the hole. Here: the subject must be the caller, with an
-- explicit service_role bypass for server-side use.
--
-- Idempotent: CREATE OR REPLACE + REVOKE IF the grant exists.

CREATE OR REPLACE FUNCTION public.get_user_feed(
    p_user_id uuid,
    p_limit   integer DEFAULT 20,
    p_offset  integer DEFAULT 0
)
RETURNS TABLE(
    canvas_id        uuid,
    title            text,
    canvas_type      text,
    creator_username text,
    like_count       integer,
    view_count       integer,
    created_at       timestamp with time zone
)
LANGUAGE plpgsql
AS $function$
BEGIN
    -- The subject is a PARAMETER, so it must be proven to be the caller.
    -- service_role runs server-side with no auth.uid() and is trusted.
    IF current_user <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    p_limit  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
    p_offset := GREATEST(COALESCE(p_offset, 0), 0);

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

-- An anonymous caller has no "my feed" — it is defined by a follow graph that
-- requires an identity. Removing the grant closes the spoof surface entirely
-- rather than relying on the in-body guard alone.
REVOKE EXECUTE ON FUNCTION public.get_user_feed(uuid, integer, integer) FROM anon;
