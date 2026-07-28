-- D82.3: 'prompt'/'builtin'/'prompt_app' branches referenced deleted tables
-- (prompt_versions, prompt_builtin_versions, prompt_app_versions) and raised at runtime.
-- The dead frontend feature (features/versioning) that passed them was deleted in the same change.
-- Applied live via Supabase MCP 2026-07-28.
CREATE OR REPLACE FUNCTION public.get_version_history(p_entity_type text, p_entity_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(version_id uuid, version_number integer, name text, changed_at timestamp with time zone, change_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    IF p_entity_type = 'tool_ui_component' THEN
        RETURN QUERY SELECT cv.id, cv.version_number, cv.display_name::text, cv.changed_at, cv.change_note
        FROM tool.ui_version cv WHERE cv.component_id = p_entity_id
        ORDER BY cv.version_number DESC LIMIT p_limit OFFSET p_offset;
    ELSIF p_entity_type = 'tool' THEN
        RETURN QUERY SELECT tv.id, tv.version_number, tv.name::text, tv.changed_at, tv.change_note
        FROM tool.definition_version tv WHERE tv.tool_id = p_entity_id
        ORDER BY tv.version_number DESC LIMIT p_limit OFFSET p_offset;
    ELSIF p_entity_type = 'agent' THEN
        RETURN QUERY SELECT agv.id, agv.version_number, agv.name::text, agv.changed_at, agv.change_note
        FROM agent.definition_version agv WHERE agv.agent_id = p_entity_id
        ORDER BY agv.version_number DESC LIMIT p_limit OFFSET p_offset;
    ELSIF p_entity_type = 'code_file' THEN
        -- CANONICAL: read from history.row_versions (bespoke table retired).
        RETURN QUERY
        SELECT md5(rv.entity_type || rv.row_id::text || rv.version::text)::uuid,
               rv.version, (rv.row_data->>'name')::text, rv.occurred_at, (rv.row_data->>'_change_note')::text
        FROM history.row_versions rv
        WHERE rv.entity_type='code_file' AND rv.row_id = p_entity_id
        -- `rv.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        ORDER BY rv.version DESC, rv.id DESC LIMIT p_limit OFFSET p_offset;
    ELSE
        RAISE EXCEPTION 'Unknown entity_type: %', p_entity_type;
    END IF;
END;
$function$;
