-- chair-step: replaces six copy RPCs with org-taking signatures; the DROP removes
-- only the superseded overload of each (the same name is re-created below with a
-- trailing DEFAULT argument), and each function's client_callable_door row is
-- MOVED onto the new signature (a door follows its function) so its signed-in
-- grant survives the guard.
-- Copying an agent, agent version, shortcut, or workflow names its organization.
--
-- DEFECT (Arman, 2026-09-23): a normal user opening a system agent from chat could
-- not "make my own copy" — Duplicate failed with a bare "Failed to duplicate agent."
-- Live error: 23502 null value in column "organization_id" of relation "definition".
--
-- ROOT CAUSE: aidream 0929 (2026-09-19) dropped every trigger that stamped a
-- personal organization onto an org-less insert — correctly: the database never
-- chooses a tenant. These six copy RPCs still inserted a literal NULL organization
-- and relied on that trigger, so every non-system copy has failed since 0929.
--
-- FIX: each takes p_organization_id (DEFAULT NULL so existing callers keep their
-- current behaviour until they pass one), refuses a missing one in a sentence, and
-- refuses an organization the caller does not belong to. System-agent copies
-- (p_as_system) are unchanged: agent._enforce_builtin_system_org places them.
-- agx_duplicate_shortcut_m also gains the DD-192 read gate its sibling already had.
--
-- Old signatures are DROPPED (no overloads): PostgREST resolves by named args,
-- and the new trailing DEFAULT keeps every existing named-arg call valid.

-- agx_duplicate_agent ---------------------------------------------------
DROP FUNCTION IF EXISTS public.agx_duplicate_agent(uuid, boolean);
CREATE OR REPLACE FUNCTION public.agx_duplicate_agent(p_agent_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL)
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
UPDATE platform.client_callable_door
   SET identity_args = 'p_agent_id uuid, p_as_system boolean, p_organization_id uuid',
       identity_argtypes = '{2950,16,2950}'::oid[],
       declared_by = 'agx_wfx_duplicate_names_its_organization',
       reason = reason || ' 2026-09-23: gained p_organization_id — required for a personal copy (NULL is refused in a sentence); a FOREIGN organization the caller does not belong to is refused 42501.'
 WHERE schema_name = 'public' AND function_name = 'agx_duplicate_agent' AND identity_args = 'p_agent_id uuid, p_as_system boolean';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'public' AND function_name = 'agx_duplicate_agent' AND identity_args = 'p_agent_id uuid, p_as_system boolean, p_organization_id uuid') THEN RAISE EXCEPTION 'door for agx_duplicate_agent was not moved'; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.agx_duplicate_agent(uuid, boolean, uuid) TO authenticated, service_role;

-- agx_duplicate_version -------------------------------------------------
DROP FUNCTION IF EXISTS public.agx_duplicate_version(uuid, boolean);
CREATE OR REPLACE FUNCTION public.agx_duplicate_version(p_version_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL)
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
UPDATE platform.client_callable_door
   SET identity_args = 'p_version_id uuid, p_as_system boolean, p_organization_id uuid',
       identity_argtypes = '{2950,16,2950}'::oid[],
       declared_by = 'agx_wfx_duplicate_names_its_organization',
       reason = reason || ' 2026-09-23: gained p_organization_id — required for a personal copy (NULL is refused in a sentence); a FOREIGN organization the caller does not belong to is refused 42501.'
 WHERE schema_name = 'public' AND function_name = 'agx_duplicate_version' AND identity_args = 'p_version_id uuid, p_as_system boolean';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'public' AND function_name = 'agx_duplicate_version' AND identity_args = 'p_version_id uuid, p_as_system boolean, p_organization_id uuid') THEN RAISE EXCEPTION 'door for agx_duplicate_version was not moved'; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.agx_duplicate_version(uuid, boolean, uuid) TO authenticated, service_role;

-- agx_duplicate_shortcut ------------------------------------------------
DROP FUNCTION IF EXISTS public.agx_duplicate_shortcut(uuid);
CREATE OR REPLACE FUNCTION public.agx_duplicate_shortcut(p_shortcut_id uuid, p_organization_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record; v_new_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_source FROM agent.shortcut WHERE id = p_shortcut_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shortcut not found'; END IF;
  -- 🚨 DD-192: DUPLICATING IS READING. This function is SECURITY DEFINER, so the
  -- SELECT above ignores RLS entirely: until 2026-09-13 any signed-in caller
  -- holding a shortcut's uuid got a personal copy of ANY shortcut in the
  -- database — its bound agent and version, its scope, context and value
  -- mappings, its default input and variables, its LLM overrides. The copy being
  -- "personal" is not a gate; the read is. The test is the same one
  -- `agent.shortcut`'s own std_select policy applies, so what can be duplicated
  -- is exactly what can be opened.
  IF NOT (v_source.created_by = v_uid
          OR v_source.visibility = 'public'::platform.visibility
          OR (v_source.organization_id IS NOT NULL AND iam.has_org_access_for(v_uid, v_source.organization_id))
          OR iam.has_access('agent_shortcut', p_shortcut_id, 'viewer'::public.permission_level)
          OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'You cannot duplicate a shortcut you cannot open. Ask whoever owns it to share it with you first.'
      USING ERRCODE = '42501';
  END IF;
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
  v_new_id := gen_random_uuid();
  -- the copy lives in the caller's named organization; no scoping edges copied
  INSERT INTO agent.shortcut (
    id, category_id, label, description, icon_name, sort_order,
    agent_id, agent_version_id, use_latest,
    enabled_features, scope_mappings, context_mappings, value_mappings,
    display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id
  ) VALUES (
    v_new_id, v_source.category_id, v_source.label || ' (Copy)',
    v_source.description, v_source.icon_name, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings, v_source.value_mappings,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, v_uid, p_organization_id
  );
  RETURN v_new_id;
END;
$function$;
UPDATE platform.client_callable_door
   SET identity_args = 'p_shortcut_id uuid, p_organization_id uuid',
       identity_argtypes = '{2950,2950}'::oid[],
       declared_by = 'agx_wfx_duplicate_names_its_organization',
       reason = reason || ' 2026-09-23: gained p_organization_id — required for a personal copy (NULL is refused in a sentence); a FOREIGN organization the caller does not belong to is refused 42501.'
 WHERE schema_name = 'public' AND function_name = 'agx_duplicate_shortcut' AND identity_args = 'p_shortcut_id uuid';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'public' AND function_name = 'agx_duplicate_shortcut' AND identity_args = 'p_shortcut_id uuid, p_organization_id uuid') THEN RAISE EXCEPTION 'door for agx_duplicate_shortcut was not moved'; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.agx_duplicate_shortcut(uuid, uuid) TO authenticated, service_role;

-- agx_duplicate_shortcut_m ----------------------------------------------
DROP FUNCTION IF EXISTS public.agx_duplicate_shortcut_m(uuid);
CREATE OR REPLACE FUNCTION public.agx_duplicate_shortcut_m(p_shortcut_id uuid, p_organization_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record; v_new_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_source FROM mandate.vw_shortcut WHERE id = p_shortcut_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shortcut not found'; END IF;
  -- 🚨 DD-192, the SAME gate agx_duplicate_shortcut carries: this function is
  -- SECURITY DEFINER, so the SELECT above ignores RLS. Without this test any
  -- signed-in caller holding a uuid could copy ANY shortcut in the database.
  IF NOT (v_source.created_by = v_uid
          OR v_source.visibility = 'public'::platform.visibility
          OR (v_source.organization_id IS NOT NULL AND iam.has_org_access_for(v_uid, v_source.organization_id))
          OR iam.has_access('agent_shortcut', p_shortcut_id, 'viewer'::public.permission_level)
          OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'You cannot duplicate a shortcut you cannot open. Ask whoever owns it to share it with you first.'
      USING ERRCODE = '42501';
  END IF;
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
  -- the copy lives in the caller's named organization; no scoping edges copied
  INSERT INTO mandate.vw_shortcut (
    category_id, label, description, icon_name, sort_order,
    agent_id, agent_version_id, use_latest,
    enabled_features, scope_mappings, context_mappings, value_mappings, write_policies,
    display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id
  ) VALUES (
    v_source.category_id, v_source.label || ' (Copy)',
    v_source.description, v_source.icon_name, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings, v_source.value_mappings, v_source.write_policies,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, v_uid, p_organization_id
  )
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$function$;
UPDATE platform.client_callable_door
   SET identity_args = 'p_shortcut_id uuid, p_organization_id uuid',
       identity_argtypes = '{2950,2950}'::oid[],
       declared_by = 'agx_wfx_duplicate_names_its_organization',
       reason = reason || ' 2026-09-23: gained p_organization_id — required for a personal copy (NULL is refused in a sentence); a FOREIGN organization the caller does not belong to is refused 42501.'
 WHERE schema_name = 'public' AND function_name = 'agx_duplicate_shortcut_m' AND identity_args = 'p_shortcut_id uuid';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'public' AND function_name = 'agx_duplicate_shortcut_m' AND identity_args = 'p_shortcut_id uuid, p_organization_id uuid') THEN RAISE EXCEPTION 'door for agx_duplicate_shortcut_m was not moved'; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.agx_duplicate_shortcut_m(uuid, uuid) TO authenticated, service_role;

-- wfx_duplicate_definition ----------------------------------------------
DROP FUNCTION IF EXISTS public.wfx_duplicate_definition(uuid);
CREATE OR REPLACE FUNCTION public.wfx_duplicate_definition(p_definition_id uuid, p_organization_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record;
  v_new_id uuid;
  v_uid    uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source
  FROM workflow.definition
  WHERE id = p_definition_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found';
  END IF;

  IF NOT iam.has_access_for(v_uid, 'workflow', p_definition_id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

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
  v_new_id := gen_random_uuid();

  INSERT INTO workflow.definition (
    id, name, description,
    nodes, edges, viewport, channels, strict_channels, entry_nodes,
    metadata, variables, category, tags, max_concurrent_runs,
    is_active, is_archived, is_favorite,
    created_by, organization_id, project_id, task_id,
    source_definition_id, source_snapshot_at
  )
  VALUES (
    v_new_id, v_source.name || ' (Copy)', v_source.description,
    v_source.nodes, v_source.edges, v_source.viewport, v_source.channels,
    v_source.strict_channels, v_source.entry_nodes,
    v_source.metadata, v_source.variables, v_source.category, v_source.tags,
    v_source.max_concurrent_runs,
    true, false, false,
    v_uid, p_organization_id, NULL, NULL,
    p_definition_id, now()
  );

  RETURN v_new_id;
END;
$function$;
UPDATE platform.client_callable_door
   SET identity_args = 'p_definition_id uuid, p_organization_id uuid',
       identity_argtypes = '{2950,2950}'::oid[],
       declared_by = 'agx_wfx_duplicate_names_its_organization',
       reason = reason || ' 2026-09-23: gained p_organization_id — required for a personal copy (NULL is refused in a sentence); a FOREIGN organization the caller does not belong to is refused 42501.'
 WHERE schema_name = 'public' AND function_name = 'wfx_duplicate_definition' AND identity_args = 'p_definition_id uuid';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'public' AND function_name = 'wfx_duplicate_definition' AND identity_args = 'p_definition_id uuid, p_organization_id uuid') THEN RAISE EXCEPTION 'door for wfx_duplicate_definition was not moved'; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.wfx_duplicate_definition(uuid, uuid) TO authenticated, service_role;

-- wfx_duplicate_version -------------------------------------------------
DROP FUNCTION IF EXISTS public.wfx_duplicate_version(uuid);
CREATE OR REPLACE FUNCTION public.wfx_duplicate_version(p_version_id uuid, p_organization_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ver    record;
  v_master record;
  v_new_id uuid;
  v_uid    uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_ver
  FROM workflow.definition_version
  WHERE id = p_version_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow version not found';
  END IF;

  SELECT * INTO v_master
  FROM workflow.definition
  WHERE id = v_ver.definition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master workflow not found for version';
  END IF;

  IF NOT iam.has_access_for(v_uid, 'workflow', v_master.id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

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
  v_new_id := gen_random_uuid();

  INSERT INTO workflow.definition (
    id, name, description,
    nodes, edges, viewport, channels, strict_channels, entry_nodes,
    metadata, variables, category, tags, max_concurrent_runs,
    is_active, is_archived, is_favorite,
    created_by, organization_id, project_id, task_id,
    source_definition_id, source_snapshot_at
  )
  VALUES (
    v_new_id,
    coalesce(v_ver.name, v_master.name) || ' (Copy)',
    coalesce(v_ver.description, v_master.description),
    coalesce(v_ver.nodes, v_master.nodes, '[]'::jsonb),
    coalesce(v_ver.edges, v_master.edges, '[]'::jsonb),
    coalesce(v_ver.viewport, v_master.viewport, '{"x": 0, "y": 0, "zoom": 1}'::jsonb),
    coalesce(v_ver.channels, v_master.channels, '[]'::jsonb),
    coalesce(v_ver.strict_channels, v_master.strict_channels, false),
    coalesce(v_ver.entry_nodes, v_master.entry_nodes, '[]'::jsonb),
    coalesce(v_ver.metadata, v_master.metadata, '{}'::jsonb),
    coalesce(v_ver.variables, v_master.variables, '[]'::jsonb),
    coalesce(v_ver.category, v_master.category),
    coalesce(v_ver.tags, v_master.tags, ARRAY[]::text[]),
    v_master.max_concurrent_runs,
    true, false, false,
    v_uid, p_organization_id, NULL, NULL,
    v_master.id, now()
  );

  RETURN v_new_id;
END;
$function$;
UPDATE platform.client_callable_door
   SET identity_args = 'p_version_id uuid, p_organization_id uuid',
       identity_argtypes = '{2950,2950}'::oid[],
       declared_by = 'agx_wfx_duplicate_names_its_organization',
       reason = reason || ' 2026-09-23: gained p_organization_id — required for a personal copy (NULL is refused in a sentence); a FOREIGN organization the caller does not belong to is refused 42501.'
 WHERE schema_name = 'public' AND function_name = 'wfx_duplicate_version' AND identity_args = 'p_version_id uuid';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'public' AND function_name = 'wfx_duplicate_version' AND identity_args = 'p_version_id uuid, p_organization_id uuid') THEN RAISE EXCEPTION 'door for wfx_duplicate_version was not moved'; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.wfx_duplicate_version(uuid, uuid) TO authenticated, service_role;
