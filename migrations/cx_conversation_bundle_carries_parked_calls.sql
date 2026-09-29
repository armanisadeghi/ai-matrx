-- based-on: public.get_cx_conversation_bundle(uuid, integer, smallint) 64b8c8044c36198190f55d8bb05f4bab38ffa78bd131d044ce18d4b094a64697
-- cx_conversation_bundle_carries_parked_calls.sql
--
-- A tool call PARKED ON A PERSON (a paid tool waiting on an `approve_spend`
-- request, aidream `action_requests/ledger.py`) is `status='delegated'` with
-- `message_id IS NULL`: `chat.tool_call.message_id` is back-filled only when the
-- call's tool-RESULT message is persisted, and a parked call has no result yet.
-- The bundle joined tool calls by `message_id = ANY(page)`, so a reopened chat
-- got no row for the waiting call, rendered it from the message stub alone and
-- told the person "Completed. No output was captured for this call." — about a
-- call waiting on them (OpenSEO Wave 1, Lane L, 2026-09-28).
--
-- The initial load (p_before_position IS NULL) now also carries this
-- conversation's delegated calls that have no message yet. Older pages are
-- unchanged: a waiting call belongs to the latest turn. The function stays
-- SECURITY INVOKER — RLS decides which rows come back exactly as before; no
-- grant, policy or access rule changes.

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
        FROM chat.tool_call t
        WHERE t.deleted_at IS NULL
          AND (t.message_id = ANY(v_message_ids)
               -- A call still waiting (parked on a person, or delegated to a
               -- client) has no result message yet, so no message_id.
               OR (p_before_position IS NULL
                   AND t.conversation_id = p_conversation_id
                   AND t.message_id IS NULL
                   AND t.status = 'delegated'));
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
