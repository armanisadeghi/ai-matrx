-- get_version_history: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated RPC whose ORDER BY is not a TOTAL order. Each LIMIT/OFFSET page is
-- a separate query execution and Postgres uses a bounded top-N sort, so tied
-- rows are ordered arbitrarily and differently on each page — rows get
-- duplicated onto one page and silently skipped from another. On agx_get_list,
-- paging a 365-row result 100 at a time returned only 306 DISTINCT ids.
--
-- Here the 'code_file' branch reads history.row_versions and orders by
-- `rv.version DESC`, which is not unique per row for a given entity.
--
-- FIX: append `rv.id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.
--
-- NOTE: the 'prompt' / 'builtin' / 'prompt_app' branches reference tables that
-- no longer exist. They are LEFT EXACTLY AS-IS on purpose — tracked separately.

CREATE OR REPLACE FUNCTION public.get_version_history(p_entity_type text, p_entity_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(version_id uuid, version_number integer, name text, changed_at timestamp with time zone, change_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    IF p_entity_type = 'prompt' THEN
        RETURN QUERY SELECT pv.id, pv.version_number, pv.name::text, pv.changed_at, pv.change_note
        FROM public.prompt_versions pv WHERE pv.prompt_id = p_entity_id
        ORDER BY pv.version_number DESC LIMIT p_limit OFFSET p_offset;
    ELSIF p_entity_type = 'builtin' THEN
        RETURN QUERY SELECT bv.id, bv.version_number, bv.name::text, bv.changed_at, bv.change_note
        FROM public.prompt_builtin_versions bv WHERE bv.builtin_id = p_entity_id
        ORDER BY bv.version_number DESC LIMIT p_limit OFFSET p_offset;
    ELSIF p_entity_type = 'prompt_app' THEN
        RETURN QUERY SELECT av.id, av.version_number, av.name::text, av.changed_at, av.change_note
        FROM public.prompt_app_versions av WHERE av.app_id = p_entity_id
        ORDER BY av.version_number DESC LIMIT p_limit OFFSET p_offset;
    ELSIF p_entity_type = 'tool_ui_component' THEN
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
