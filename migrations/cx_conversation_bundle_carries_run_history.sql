-- based-on: public.get_cx_conversation_bundle(uuid, integer, smallint) 4f38f9e77f7f8ff67cb25762a22ee358310a490f1ac8426af5cecc671147f7fc
-- cx_conversation_bundle_carries_run_history.sql
--
-- get_cx_conversation_bundle returned the conversation, a page of messages and
-- the page's tool calls / artifacts / media, but not the conversation's run
-- history. The client's initial hydrate needs it to restore each run's tokens,
-- cost and timing and the completed-request state the Agent Battle
-- response-feedback bar requires after a reload, so since 2026-09-26 it has
-- been making two more round trips (chat.request, then chat.user_request) on
-- every reopen.
--
-- The bundle now carries both on the initial load (p_before_position IS NULL):
--   requests       chat.request rows for the conversation, deleted_at IS NULL,
--                  ordered by created_at
--   user_requests  the distinct parent chat.user_request rows, deleted_at IS
--                  NULL, ordered by created_at
-- Row shape is to_jsonb(row.*) — identical to the `select *` the client read
-- before, i.e. the generated chat.request / chat.user_request Row types.
-- Older pages (p_before_position set) omit both keys: the run history is
-- conversation-level and already hydrated. The function stays SECURITY
-- INVOKER, so RLS decides which rows come back exactly as it did for the
-- client's direct reads.

CREATE OR REPLACE FUNCTION public.get_cx_conversation_bundle(p_conversation_id uuid, p_message_limit integer DEFAULT 10, p_before_position smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_conversation jsonb; v_messages jsonb; v_message_ids uuid[];
    v_tool_calls jsonb; v_artifacts jsonb; v_media jsonb;
    v_oldest_position smallint; v_has_more boolean; v_effective_limit int;
    v_result jsonb; v_requests jsonb; v_user_requests jsonb;
BEGIN
    v_effective_limit := GREATEST(1, LEAST(COALESCE(p_message_limit, 10), 200));
    SELECT to_jsonb(c.*) INTO v_conversation FROM chat.conversation c WHERE c.id = p_conversation_id AND c.deleted_at IS NULL;
    IF v_conversation IS NULL THEN RETURN NULL; END IF;

    WITH page AS (
        SELECT m.* FROM chat.message m
        WHERE m.conversation_id = p_conversation_id AND m.deleted_at IS NULL AND m.is_visible_to_user = true
          AND (p_before_position IS NULL OR m.position < p_before_position)
        ORDER BY m.position DESC LIMIT v_effective_limit
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(page.*) ORDER BY page.position DESC), '[]'::jsonb),
           COALESCE(array_agg(page.id), ARRAY[]::uuid[]), MIN(page.position)
    INTO v_messages, v_message_ids, v_oldest_position FROM page;

    IF v_oldest_position IS NULL THEN v_has_more := false;
    ELSE
        SELECT EXISTS (SELECT 1 FROM chat.message m
            WHERE m.conversation_id = p_conversation_id AND m.deleted_at IS NULL
              AND m.is_visible_to_user = true AND m.position < v_oldest_position) INTO v_has_more;
    END IF;

    IF array_length(v_message_ids, 1) IS NULL THEN
        v_tool_calls := '[]'::jsonb; v_artifacts := '[]'::jsonb; v_media := '[]'::jsonb;
    ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(t.*) ORDER BY t.started_at ASC), '[]'::jsonb) INTO v_tool_calls
        FROM chat.tool_call t WHERE t.message_id = ANY(v_message_ids) AND t.deleted_at IS NULL;
        SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at ASC), '[]'::jsonb) INTO v_artifacts
        FROM chat.artifact a WHERE a.message_id = ANY(v_message_ids) AND a.deleted_at IS NULL;
        SELECT COALESCE(jsonb_agg(to_jsonb(m.*) ORDER BY m.created_at ASC), '[]'::jsonb) INTO v_media
        FROM chat.media m WHERE m.conversation_id = p_conversation_id AND m.deleted_at IS NULL
          AND ((m.metadata->>'message_id')::uuid = ANY(v_message_ids));
    END IF;

    v_result := jsonb_build_object(
        'conversation', v_conversation, 'messages', v_messages,
        'tool_calls', v_tool_calls, 'artifacts', v_artifacts, 'media', v_media,
        'pagination', jsonb_build_object(
            'limit', v_effective_limit,
            'returned_count', COALESCE(array_length(v_message_ids, 1), 0),
            'oldest_position', v_oldest_position, 'has_more', v_has_more
        )
    );

    -- Run history: initial load only (see header).
    IF p_before_position IS NULL THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at ASC), '[]'::jsonb) INTO v_requests
        FROM chat.request r WHERE r.conversation_id = p_conversation_id AND r.deleted_at IS NULL;

        SELECT COALESCE(jsonb_agg(to_jsonb(u.*) ORDER BY u.created_at ASC), '[]'::jsonb) INTO v_user_requests
        FROM chat.user_request u
        WHERE u.deleted_at IS NULL
          AND u.id IN (SELECT r.user_request_id FROM chat.request r
                       WHERE r.conversation_id = p_conversation_id AND r.deleted_at IS NULL
                         AND r.user_request_id IS NOT NULL);

        v_result := v_result || jsonb_build_object('requests', v_requests, 'user_requests', v_user_requests);
    END IF;

    RETURN v_result;
END; $function$;
