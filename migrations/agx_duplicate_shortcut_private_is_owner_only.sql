-- based-on: public.agx_duplicate_shortcut(uuid, uuid) 68cce46eb92059db845c27a812cfd7af732536ec2b6e8ccc1b34b3b58d13c2df
-- based-on: public.agx_duplicate_shortcut_m(uuid, uuid) 5aed448e57b182b2b95774c5d90bc7849fe5845cf0bb16fb614659761d6e7543
-- A private shortcut is copied only by whoever can OPEN it.
--
-- Review finding, 2026-09-23 (on agx_wfx_duplicate_names_its_organization): the
-- DD-192 read gate in agx_duplicate_shortcut / _m let ANY member of a shortcut's
-- organization copy it, even a private one. agent.shortcut's own std_select only
-- admits org members at visibility >= 'internal'. The gate now says the same.
-- Same signatures (CREATE OR REPLACE), so doors and grants are untouched.

-- agx_duplicate_shortcut
CREATE OR REPLACE FUNCTION public.agx_duplicate_shortcut(p_shortcut_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
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
          OR (v_source.organization_id IS NOT NULL
              AND v_source.visibility >= 'internal'::platform.visibility
              AND iam.has_org_access_for(v_uid, v_source.organization_id))
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

-- agx_duplicate_shortcut_m
CREATE OR REPLACE FUNCTION public.agx_duplicate_shortcut_m(p_shortcut_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
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
          OR (v_source.organization_id IS NOT NULL
              AND v_source.visibility >= 'internal'::platform.visibility
              AND iam.has_org_access_for(v_uid, v_source.organization_id))
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
