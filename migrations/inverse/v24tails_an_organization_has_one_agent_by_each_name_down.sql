-- chair-step: inverse of lane V24-TAILS's agent-name file: drops the refusal trigger and its function, puts both copy doors back byte-for-byte, drops the free-name helper.
-- lane: V24-TAILS
-- based-on: public.agx_duplicate_agent(uuid, boolean, uuid) 0153a294f01b320cf4c45ab9e88d69ff212ec4fca9394c9112143dad1073070f
-- based-on: public.agx_duplicate_version(uuid, boolean, uuid) d46838562acef7bc2264b914df47492b68c9060d977e2bc04a077ba73edb921f

DROP TRIGGER IF EXISTS zzz_refuse_duplicate_agent_name ON agent.definition;
DROP FUNCTION IF EXISTS agent._refuse_duplicate_agent_name();
CREATE OR REPLACE FUNCTION public.agx_duplicate_agent(p_agent_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid)
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
  ELSIF NOT iam.has_access_for(v_uid, 'agent', p_agent_id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT v_as_system THEN
    -- 🚨 THE CALLER NAMES THE ORGANIZATION (0929, 2026-09-19: the database never
    -- chooses a tenant). Until this function took p_organization_id it wrote NULL
    -- and leaned on the dropped `_stamp_org_default` trigger, so after 0929 every
    -- copy died on the NOT NULL constraint with a message nobody could act on.
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'Choose which organization the copy belongs to (p_organization_id is required).'
        USING ERRCODE = '22023';
    END IF;
    IF NOT iam.has_org_access_for(v_uid, p_organization_id) THEN
      RAISE EXCEPTION 'You are not a member of the organization you asked to put this copy in.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_policies,
      v_source.auto_context_disabled,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,
      v_source.category, v_source.tags, true, false, false,
      NULL, NULL, p_agent_id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_policies,
      v_source.auto_context_disabled,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,
      v_source.category, v_source.tags, true, false, false,
      v_uid, p_organization_id, NULL, p_agent_id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_duplicate_version(p_version_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid)
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
    OR v_master.agent_type = 'builtin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT v_as_system THEN
    -- 🚨 THE CALLER NAMES THE ORGANIZATION (0929, 2026-09-19: the database never
    -- chooses a tenant). Until this function took p_organization_id it wrote NULL
    -- and leaned on the dropped `_stamp_org_default` trigger, so after 0929 every
    -- copy died on the NOT NULL constraint with a message nobody could act on.
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'Choose which organization the copy belongs to (p_organization_id is required).'
        USING ERRCODE = '22023';
    END IF;
    IF NOT iam.has_org_access_for(v_uid, p_organization_id) THEN
      RAISE EXCEPTION 'You are not a member of the organization you asked to put this copy in.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_ver.name || ' (Copy)', v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_policies,
      v_ver.auto_context_disabled,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_ver.default_rag_boost, v_ver.rag_awareness_mode, v_ver.input_kind,
      v_ver.category, v_ver.tags, true, false, false,
      NULL, NULL, v_master.id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_ver.name || ' (Copy)', v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_policies,
      v_ver.auto_context_disabled,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_ver.default_rag_boost, v_ver.rag_awareness_mode, v_ver.input_kind,
      v_ver.category, v_ver.tags, true, false, false,
      v_uid, p_organization_id, NULL, v_master.id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

DROP FUNCTION IF EXISTS agent.next_free_agent_name(uuid, text, uuid);
