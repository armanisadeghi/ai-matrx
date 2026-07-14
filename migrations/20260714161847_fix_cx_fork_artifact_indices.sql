-- fix_cx_fork_artifact_indices.sql
--
-- `cx_fork_conversation` copies chat.artifact discovery rows for forked
-- messages. After `chat_artifact_discovery_index_artifact_index`, the
-- discovery natural key is:
--   (user_id, source_system, source_id, artifact_index, artifact_type, external_system)
--
-- The live fork RPC remapped `message_id` but omitted `source_*` and
-- `artifact_index`, letting the trigger fill the source id while leaving
-- artifact_index NULL. Messages with multiple artifacts that map to the same
-- discovery type (for example three data_table blocks) then collide in the
-- NULLS NOT DISTINCT unique index. Preserve the source identity explicitly.

CREATE OR REPLACE FUNCTION public.cx_fork_conversation(
  p_conversation_id uuid,
  p_at_position smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_src chat.conversation;
    v_new_conv_id uuid := gen_random_uuid();
    v_msg_map jsonb;
    v_tc_map jsonb;
    v_copied_count int := 0;
BEGIN
    SELECT * INTO v_src
    FROM chat.conversation
    WHERE id = p_conversation_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conversation not found: %', p_conversation_id;
    END IF;

    INSERT INTO chat.conversation (
        id, created_by, title, description, system_instruction,
        config, variables, overrides, metadata, keywords,
        status, visibility, is_ephemeral,
        source_app, source_feature,
        organization_id, project_id, task_id,
        initial_agent_id, initial_agent_version_id, last_model_id,
        forked_from_id, forked_at_position,
        parent_conversation_id, message_count
    ) VALUES (
        v_new_conv_id, v_src.created_by, v_src.title, v_src.description, v_src.system_instruction,
        v_src.config, v_src.variables, v_src.overrides, v_src.metadata, v_src.keywords,
        'active', v_src.visibility, v_src.is_ephemeral,
        v_src.source_app, v_src.source_feature,
        v_src.organization_id, v_src.project_id, v_src.task_id,
        v_src.initial_agent_id, v_src.initial_agent_version_id, v_src.last_model_id,
        p_conversation_id, p_at_position,
        NULL, 0
    );

    SELECT COALESCE(jsonb_object_agg(m.id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_msg_map
    FROM chat.message m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND m.position <= p_at_position;

    INSERT INTO chat.message (
        id, conversation_id, role, position, status,
        content, user_content, content_history,
        source, agent_id, is_visible_to_user, is_visible_to_model, metadata
    )
    SELECT (v_msg_map ->> m.id::text)::uuid, v_new_conv_id,
        m.role, m.position, m.status, m.content, m.user_content, m.content_history,
        m.source, m.agent_id, m.is_visible_to_user, m.is_visible_to_model, m.metadata
    FROM chat.message m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND m.position <= p_at_position;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;
    UPDATE chat.conversation
    SET message_count = v_copied_count
    WHERE id = v_new_conv_id;

    SELECT COALESCE(jsonb_object_agg(tc.id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_tc_map
    FROM chat.tool_call tc
    WHERE tc.conversation_id = p_conversation_id
      AND tc.deleted_at IS NULL
      AND tc.message_id IS NOT NULL
      AND v_msg_map ? tc.message_id::text;

    INSERT INTO chat.tool_call (
        id, conversation_id, message_id, user_request_id,
        user_id, tool_name, tool_type, call_id, status,
        arguments, success, output, output_type,
        is_error, error_type, error_message,
        duration_ms, started_at, completed_at,
        input_tokens, output_tokens, total_tokens, cost_usd,
        iteration, retry_count, parent_call_id, execution_events,
        persist_key, file_path, metadata
    )
    SELECT (v_tc_map ->> tc.id::text)::uuid, v_new_conv_id,
        (v_msg_map ->> tc.message_id::text)::uuid, NULL,
        tc.user_id, tc.tool_name, tc.tool_type, tc.call_id, tc.status,
        tc.arguments, tc.success, tc.output, tc.output_type,
        tc.is_error, tc.error_type, tc.error_message,
        tc.duration_ms, tc.started_at, tc.completed_at,
        tc.input_tokens, tc.output_tokens, tc.total_tokens, tc.cost_usd,
        tc.iteration, tc.retry_count,
        CASE WHEN tc.parent_call_id IS NOT NULL AND v_tc_map ? tc.parent_call_id::text
             THEN (v_tc_map ->> tc.parent_call_id::text)::uuid ELSE NULL END,
        tc.execution_events, tc.persist_key, tc.file_path, tc.metadata
    FROM chat.tool_call tc
    WHERE tc.conversation_id = p_conversation_id
      AND tc.deleted_at IS NULL
      AND tc.message_id IS NOT NULL
      AND v_msg_map ? tc.message_id::text;

    INSERT INTO chat.artifact (
        conversation_id, message_id, user_id, organization_id, project_id, task_id,
        source_system, source_id, artifact_index,
        artifact_type, status, external_system, external_id, external_url,
        title, description, thumbnail_url, metadata
    )
    SELECT v_new_conv_id, (v_msg_map ->> a.message_id::text)::uuid,
        a.user_id, a.organization_id, a.project_id, a.task_id,
        'cx_message', (v_msg_map ->> a.message_id::text)::uuid, a.artifact_index,
        a.artifact_type, a.status, a.external_system, a.external_id, a.external_url,
        a.title, a.description, a.thumbnail_url, a.metadata
    FROM chat.artifact a
    WHERE a.conversation_id = p_conversation_id
      AND a.deleted_at IS NULL
      AND a.message_id IS NOT NULL
      AND v_msg_map ? a.message_id::text;

    INSERT INTO chat.media (conversation_id, user_id, kind, url, file_uri, mime_type, file_size_bytes, metadata)
    SELECT v_new_conv_id, m.user_id, m.kind, m.url, m.file_uri, m.mime_type, m.file_size_bytes,
        CASE WHEN m.metadata ? 'message_id' AND v_msg_map ? (m.metadata->>'message_id')
             THEN jsonb_set(m.metadata, '{message_id}', to_jsonb(v_msg_map ->> (m.metadata->>'message_id')))
             ELSE m.metadata END
    FROM chat.media m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND (m.metadata->>'message_id' IS NULL OR v_msg_map ? (m.metadata->>'message_id'));

    RETURN get_cx_conversation_bundle(v_new_conv_id);
END;
$function$;
