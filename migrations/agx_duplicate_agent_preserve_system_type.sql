-- Fix agx_duplicate_agent so the admin "duplicate system agent" flow does
-- the right thing.
--
-- Bug: the previous version always inserted the copy with `agent_type = 'user'`
-- and `user_id = v_uid`, so duplicating a builtin from /administration/system-agents
-- silently created a personal agent in the admin's catalogue instead of a new
-- system agent. It also dropped `mcp_servers` and `tool_config`, which then
-- defaulted to empty.
--
-- Fix:
--   * New optional `p_as_system` parameter (default false). When true, the
--     caller must pass `is_super_admin()`; the copy is inserted as a system
--     agent (`agent_type = 'builtin'`, `user_id = NULL`, `is_public = true`,
--     `source_agent_id = p_agent_id`).
--   * When `p_as_system = false`, behavior is unchanged: a personal `user`
--     copy under the caller. This preserves the legitimate "fork a builtin
--     into my workspace" flow on the user surface.
--   * `mcp_servers` and `tool_config` are now copied from the source so the
--     duplicate is faithful (they were silently dropping to defaults).
--
-- The function stays SECURITY DEFINER so it can read the source row and
-- write a builtin (which RLS would otherwise refuse on direct INSERT).

DROP FUNCTION IF EXISTS public.agx_duplicate_agent(uuid);

CREATE OR REPLACE FUNCTION public.agx_duplicate_agent(
  p_agent_id  uuid,
  p_as_system boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source     record;
  v_new_id     uuid;
  v_uid        uuid    := auth.uid();
  v_as_system  boolean := COALESCE(p_as_system, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source FROM agx_agent WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF NOT check_resource_access(
    'agx_agent', p_agent_id, 'viewer',
    v_source.user_id, NULL, v_source.project_id, v_source.organization_id
  ) AND v_source.is_public = false THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Promoting to a system agent is super-admin-only. Deliberately strict so
  -- a forged client param can never produce a builtin from a non-admin call.
  IF v_as_system AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agx_agent (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      category, tags,
      is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, project_id, task_id,
      source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
        v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_slots,
        v_source.mcp_servers, v_source.tool_config,
      v_source.category, v_source.tags,
      true,           -- is_active
      true,           -- is_public — system agents are visible to everyone
      false,          -- is_archived
      false,          -- is_favorite
      NULL,           -- user_id — system agents have no owner
      NULL,           -- organization_id
      NULL,           -- project_id
      NULL,           -- task_id
      p_agent_id,     -- source_agent_id — track lineage
      now()           -- source_snapshot_at
    );
  ELSE
    INSERT INTO agx_agent (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      category, tags,
      is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, project_id, task_id,
      source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
        v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_slots,
        v_source.mcp_servers, v_source.tool_config,
      v_source.category, v_source.tags,
      true, false, false, false,
      v_uid, NULL, NULL, NULL,
      p_agent_id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_duplicate_agent(uuid, boolean) TO authenticated;
