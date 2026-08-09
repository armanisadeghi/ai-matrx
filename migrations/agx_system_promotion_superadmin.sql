-- A super-admin promoting a private personal/org agent into a builtin system
-- agent is an administrative operation on the platform's behalf. The old
-- viewer check ran before the p_as_system authorization gate, so legitimate
-- promotions failed unless the source agent was temporarily made public.
-- Keep normal user-copy access unchanged; bypass only for the already-gated
-- super-admin system-promotion path. Apply the same rule to version promotion.

CREATE OR REPLACE FUNCTION public.agx_duplicate_agent(
  p_agent_id uuid,
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

  SELECT * INTO v_source
  FROM agent.definition
  WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF v_as_system THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
    END IF;
  ELSIF NOT iam.has_access_for(v_uid, 'agent', p_agent_id, 'viewer')
        AND v_source.is_public = false THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags, is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_slots,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode,
      v_source.category, v_source.tags, true, true, false, false,
      NULL, NULL, NULL, p_agent_id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags, is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_slots,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode,
      v_source.category, v_source.tags, true, false, false, false,
      v_uid, NULL, NULL, p_agent_id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_duplicate_version(
  p_version_id uuid,
  p_as_system boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ver        record;
  v_master     record;
  v_new_id     uuid;
  v_uid        uuid    := auth.uid();
  v_as_system  boolean := COALESCE(p_as_system, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_ver
  FROM agent.definition_version
  WHERE id = p_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent version not found';
  END IF;

  SELECT * INTO v_master
  FROM agent.definition
  WHERE id = v_ver.agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master agent not found for version';
  END IF;

  IF v_as_system THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
    END IF;
  ELSIF NOT (
    iam.has_access_for(v_uid, 'agent', v_master.id, 'viewer')
    OR v_master.is_public
    OR v_master.agent_type = 'builtin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags, is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_ver.name || ' (Copy)', v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_slots,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_master.default_rag_boost, v_master.rag_awareness_mode,
      v_ver.category, v_ver.tags, true, true, false, false,
      NULL, NULL, NULL, v_master.id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags, is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_ver.name || ' (Copy)', v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_slots,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_master.default_rag_boost, v_master.rag_awareness_mode,
      v_ver.category, v_ver.tags, true, false, false, false,
      v_uid, NULL, NULL, v_master.id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

DO $verify$
DECLARE
  v_agent text := pg_get_functiondef(
    'public.agx_duplicate_agent(uuid,boolean)'::regprocedure
  );
  v_version text := pg_get_functiondef(
    'public.agx_duplicate_version(uuid,boolean)'::regprocedure
  );
BEGIN
  IF position('IF v_as_system THEN' IN v_agent) = 0
     OR position('ELSIF NOT iam.has_access_for' IN v_agent) = 0 THEN
    RAISE EXCEPTION 'agx_duplicate_agent promotion authorization repair failed';
  END IF;
  IF position('IF v_as_system THEN' IN v_version) = 0
     OR position('ELSIF NOT (' IN v_version) = 0 THEN
    RAISE EXCEPTION 'agx_duplicate_version promotion authorization repair failed';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';
