-- based-on: public.agx_duplicate_agent(uuid, boolean, uuid) 0153a294f01b320cf4c45ab9e88d69ff212ec4fca9394c9112143dad1073070f
-- based-on: public.agx_duplicate_version(uuid, boolean, uuid) d46838562acef7bc2264b914df47492b68c9060d977e2bc04a077ba73edb921f
--
-- A copy of an agent carries what is ATTACHED to its definition (builder-universal-support
-- audit 2026-09-26, gap #5). Term lists (`agent_term_list -> agent`, role `term_list`) and
-- attached resources (`<resource> -> agent`, role `agent_resource`) live as association edges
-- targeting the agent id, not in the definition row, so both duplicate RPCs copied the row and
-- silently dropped them: the copy of the translation agent lost "All Green brand terms".
-- Version restore (`agx_promote_version`) keeps the same agent id, so its edges were never at risk.
--
-- The ONE list of roles that travel with a definition lives in private.copy_agent_definition_attachments.
-- An edge is carried only when the person making the copy can see what it points at.

create or replace function private.copy_agent_definition_attachments(
  p_from_agent_id uuid,
  p_to_agent_id uuid,
  p_uid uuid
)
returns integer
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_org uuid;
  v_count integer;
begin
  select d.organization_id into v_org from agent.definition d where d.id = p_to_agent_id;

  insert into platform.associations (
    source_type, source_id, target_type, target_id, organization_id,
    role, label, position, metadata, payload_kind, payload, created_by
  )
  select a.source_type, a.source_id, 'agent', p_to_agent_id,
         coalesce(v_org, a.organization_id),
         a.role, a.label, a.position, coalesce(a.metadata, '{}'::jsonb),
         a.payload_kind, a.payload, p_uid
    from platform.associations a
   where a.target_type = 'agent'
     and a.target_id = p_from_agent_id
     and a.role in ('term_list', 'agent_resource')
     and a.deleted_at is null
     and (p_uid is null or iam.has_access_for(p_uid, a.source_type, a.source_id, 'viewer'))
  on conflict (source_type, source_id, target_type, target_id, role) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;


comment on function private.copy_agent_definition_attachments(uuid, uuid, uuid) is
  'Copies the association edges attached to an agent definition (term lists, agent resources) onto its copy. Called only by agx_duplicate_agent / agx_duplicate_version.';

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
      v_new_id, 'builtin', agent.next_free_agent_name(NULL, v_source.name || ' (Copy)'), v_source.description,
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
      v_new_id, 'user', agent.next_free_agent_name(p_organization_id, v_source.name || ' (Copy)'), v_source.description,
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

  -- Carry what is attached to the definition (term lists, agent resources).
  PERFORM private.copy_agent_definition_attachments(p_agent_id, v_new_id, v_uid);

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
      v_new_id, 'builtin', agent.next_free_agent_name(NULL, v_ver.name || ' (Copy)'), v_ver.description,
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
      v_new_id, 'user', agent.next_free_agent_name(p_organization_id, v_ver.name || ' (Copy)'), v_ver.description,
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

  -- Carry what is attached to the definition (term lists, agent resources).
  PERFORM private.copy_agent_definition_attachments(v_master.id, v_new_id, v_uid);

  RETURN v_new_id;
END;
$function$;
