-- chair-step: inverse of campaign/templates7_b_a_template_copy_follows_its_source.sql — puts agx_duplicate_agent back to its three-argument body and door row, drops agx_reset_agent_to_source and the zz_follows_source_stops_on_edit trigger, and drops the follows_source / source_version columns (every copy then runs its own content again).
set local statement_timeout = '60s';

drop trigger if exists zz_follows_source_stops_on_edit on agent.definition;
drop function if exists agent._follows_source_stops_on_edit();
drop function if exists public.agx_reset_agent_to_source(uuid);

drop function if exists public.agx_duplicate_agent(uuid, boolean, uuid, boolean);

CREATE FUNCTION public.agx_duplicate_agent(p_agent_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid)
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
      category, tags, is_active, is_archived, metadata,
      organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', agent.next_free_agent_name(NULL, v_source.name || ' (Copy)'), v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_policies,
      v_source.auto_context_disabled,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,
      v_source.category, v_source.tags, true, false, jsonb_build_object('tools_declared', true),
      NULL, NULL, p_agent_id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, metadata,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', agent.next_free_agent_name(p_organization_id, v_source.name || ' (Copy)'), v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_policies,
      v_source.auto_context_disabled,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,
      v_source.category, v_source.tags, true, false, jsonb_build_object('tools_declared', true),
      v_uid, p_organization_id, NULL, p_agent_id, now()
    );
  END IF;

  -- Carry what is attached to the definition (term lists, agent resources).
  PERFORM private.copy_agent_definition_attachments(p_agent_id, v_new_id, v_uid);

  RETURN v_new_id;
END;
$function$;

update platform.client_callable_door
   set identity_args     = 'p_agent_id uuid, p_as_system boolean, p_organization_id uuid',
       identity_argtypes = array[2950, 16, 2950]::oid[],
       argument_rules    = argument_rules #- '{arguments,p_follows_source}',
       reason            = replace(reason, ' 2026-10-04 (templates7_b): gained p_follows_source — a template install marks its copy as following the source agent.', '')
 where schema_name = 'public' and function_name = 'agx_duplicate_agent';

revoke all on function public.agx_duplicate_agent(uuid, boolean, uuid) from public, anon;
grant execute on function public.agx_duplicate_agent(uuid, boolean, uuid) to authenticated, service_role;

alter table agent.definition
  drop column if exists follows_source,
  drop column if exists source_version;
