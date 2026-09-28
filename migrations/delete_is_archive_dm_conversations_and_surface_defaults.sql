-- based-on: public.delete_conversation_for_user(uuid) 7845b55befdab9ae2555c243742a2568e1ce2a1b3d6697c55ce4e76aa0c21d15
-- based-on: public.tool_resolve_for_request(uuid, text, text, text[]) 1f4fedfb4eebc30b98b1f27ba46f37bd621480b73e4f2c9a746dc67e54c51a1c
-- Delete means archive (Arman, 2026-09-27).
--
-- 1. Direct messages: public.delete_conversation_for_user hard-deleted the
--    caller's participant row and, when the conversation emptied, the whole
--    conversation (cascading to every message). It now archives: the caller's
--    participation gets deleted_at; when at most one live participant remains
--    the conversation itself gets deleted_at, and its messages and remaining
--    participants follow through the soft-delete cascade edges declared here.
--    Restoring the conversation from Trash brings them back.
-- 2. tool_resolve_for_request: surface defaults moved to Trash (they follow an
--    archived ui.ui_surface through its cascade edge) no longer apply.

select platform.declare_soft_delete_edge('communication','dm_conversations','communication','dm_messages','conversation_id','cascade',
  'A message is part of the conversation it was sent in', 'delete-is-archive 2026-09-27', 'conversation');
select platform.declare_soft_delete_edge('communication','dm_conversations','communication','dm_conversation_participants','conversation_id','cascade',
  'A participation row is part of its conversation', 'delete-is-archive 2026-09-27', 'conversation');

CREATE OR REPLACE FUNCTION public.delete_conversation_for_user(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_remaining_participants int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Move this user's participation to Trash (delete means archive).
  UPDATE communication.dm_conversation_participants
     SET deleted_at = now()
   WHERE conversation_id = p_conversation_id
     AND user_id = v_user_id
     AND deleted_at IS NULL;

  -- How many live participants remain
  SELECT count(*) INTO v_remaining_participants
  FROM communication.dm_conversation_participants
  WHERE conversation_id = p_conversation_id
    AND deleted_at IS NULL;

  -- If at most one participant is left, the conversation itself moves to
  -- Trash; its messages and participants follow via the cascade edges.
  IF v_remaining_participants <= 1 THEN
    UPDATE communication.dm_conversations
       SET deleted_at = now()
     WHERE id = p_conversation_id
       AND deleted_at IS NULL;
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tool_resolve_for_request(p_user_id uuid, p_client_executor text, p_surface_name text, p_active_server_executors text[] DEFAULT ARRAY[]::text[])
 RETURNS TABLE(tool_id uuid, tool_name text, description text, parameters jsonb, annotations jsonb, arg_defaults jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_applicable text[];
    v_universe   uuid[];
    v_surface    record;
    v_arg_def    jsonb := '{}'::jsonb;
    v_force_inc  text[] := ARRAY[]::text[];
    v_force_exc  text[] := ARRAY[]::text[];
BEGIN
    SELECT COALESCE(array_agg(te.name), ARRAY[]::text[]) INTO v_applicable
    FROM tool.executor_walk_parents(p_client_executor) te
    WHERE te.is_active = true;

    v_applicable := v_applicable || COALESCE(
        (SELECT array_agg(te.name) FROM tool.executor te
         WHERE te.name = ANY(p_active_server_executors) AND te.is_active = true),
        ARRAY[]::text[]);

    v_applicable := v_applicable || COALESCE(
        (SELECT array_agg(te.name)
         FROM tool.executor te
         JOIN tool.mcp_user_conn c ON c.server_id = te.mcp_server_id
         WHERE te.mcp_server_id IS NOT NULL AND te.is_active = true
           AND c.created_by = p_user_id AND c.deleted_at IS NULL
           AND c.status = 'connected'::public.mcp_connection_status),
        ARRAY[]::text[]);

    SELECT COALESCE(array_agg(DISTINCT d.id), ARRAY[]::uuid[]) INTO v_universe
    FROM tool.definition d
    JOIN tool.binding b ON b.tool_id = d.id
    WHERE b.executor_name = ANY(v_applicable) AND d.is_active = true AND b.is_active = true
      AND d.deleted_at IS NULL AND b.deleted_at IS NULL;

    FOR v_surface IN
        SELECT sd.surface_name, sd.always_include_tools, sd.always_include_bundles,
               sd.never_include_tools, sd.never_include_bundles, sd.arg_defaults
        FROM public.tool_surface_walk_parents(p_surface_name) s
        JOIN tool.surface_defaults sd ON sd.surface_name = s.name
        WHERE sd.is_active = true
          AND sd.deleted_at IS NULL
    LOOP
        v_force_inc := v_force_inc || v_surface.always_include_tools;
        v_force_exc := v_force_exc || v_surface.never_include_tools;

        v_force_inc := v_force_inc || COALESCE(
            (SELECT array_agg(DISTINCT d.name)
             FROM tool.bundle b
             JOIN platform.associations_live a ON a.target_id = b.id AND a.target_type = 'tool_bundle'
                                          AND a.source_type = 'tool' AND a.role = 'member'
             JOIN tool.definition d ON d.id = a.source_id
             WHERE b.name = ANY(v_surface.always_include_bundles)
               AND b.is_system = true AND b.is_active = true AND d.is_active = true
               AND d.deleted_at IS NULL),
            ARRAY[]::text[]);

        v_force_exc := v_force_exc || COALESCE(
            (SELECT array_agg(DISTINCT d.name)
             FROM tool.bundle b
             JOIN platform.associations_live a ON a.target_id = b.id AND a.target_type = 'tool_bundle'
                                          AND a.source_type = 'tool' AND a.role = 'member'
             JOIN tool.definition d ON d.id = a.source_id
             WHERE b.name = ANY(v_surface.never_include_bundles) AND b.is_active = true),
            ARRAY[]::text[]);

        v_arg_def := v_arg_def || COALESCE(v_surface.arg_defaults, '{}'::jsonb);
    END LOOP;

    RETURN QUERY
    WITH base AS (
        SELECT d.id, d.name, d.description, d.parameters, d.annotations
        FROM tool.definition d
        WHERE (d.id = ANY(v_universe) OR d.name = ANY(v_force_inc))
          AND NOT (d.name = ANY(v_force_exc))
          AND d.is_active = true
          AND d.deleted_at IS NULL
    )
    SELECT b.id, b.name, b.description, b.parameters, b.annotations,
           COALESCE(v_arg_def -> b.name, '{}'::jsonb)
    FROM base b
    ORDER BY b.name;
END;
$function$;
