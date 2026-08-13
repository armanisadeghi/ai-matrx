-- agent-schema legacy column cut (chip task_7ef8679f, 2026-08-12)
-- Cuts WARN-only legacy columns from five agent tables:
--   agent.template:              user_id, is_public   (created_by / visibility canonical)
--   agent.shortcut:              user_id              (created_by canonical; NULL = global scope, values identical)
--   agent.cmp_comparison_sets:   user_id
--   agent.cmp_response_feedback: user_id              (+ UNIQUE rebuilt on created_by)
--   agent.drift_alert:           user_id              (+ indexes rebuilt on created_by, SET NOT NULL)
-- agent.definition is deliberately untouched (owned by the Fork 2 session).
-- Idempotent: column drops are IF EXISTS; functions/view are CREATE OR REPLACE.

BEGIN;

-- ── 1. Repointed RPCs (12) ────────────────────────────────────────────────
-- ===== agx_create_agent_from_template =====
CREATE OR REPLACE FUNCTION public.agx_create_agent_from_template(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record;
  v_new_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source
  FROM agent.template
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  IF v_source.visibility <> 'public' THEN
    IF NOT iam.has_access_for(v_uid, 'agent_template', p_template_id, 'viewer') THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  v_new_id := gen_random_uuid();

  INSERT INTO agent.definition (
    id, agent_type, name, description, messages, variable_definitions, model_id,
    model_tiers, settings, output_schema, tools, custom_tools, context_slots,
    mcp_servers, category, tags, is_active, is_public, is_archived, is_favorite,
    user_id, organization_id, task_id, source_agent_id, source_snapshot_at
  )
  VALUES (
    v_new_id, 'user', v_source.name, v_source.description, v_source.messages,
    v_source.variable_definitions, v_source.model_id, v_source.model_tiers,
    v_source.settings, v_source.output_schema, v_source.tools, v_source.custom_tools,
    v_source.context_slots, v_source.mcp_servers, v_source.category, v_source.tags,
    true, false, false, false,
    v_uid, NULL, NULL, NULL, NULL);

  UPDATE agent.template
  SET use_count = use_count + 1
  WHERE id = p_template_id;

  RETURN v_new_id;
END;
$function$;

-- ===== agx_create_shortcut =====
CREATE OR REPLACE FUNCTION public.agx_create_shortcut(p_agent_id uuid, p_label text, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_use_latest boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_agent record;
  v_version_id uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_user_id is not null and p_user_id <> v_uid then
    raise exception 'cannot create a shortcut for another user' using errcode = '42501';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for organization %', p_organization_id using errcode = '42501';
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for project %', p_project_id using errcode = '42501';
  end if;
  if p_task_id is not null
     and coalesce(iam.has_access('task', p_task_id, 'editor'), false) is not true then
    raise exception 'not authorized for task %', p_task_id using errcode = '42501';
  end if;

  select a.id, a.name, a.version
  into v_agent
  from agent.definition a
  where a.id = p_agent_id;
  if not found then raise exception 'Agent not found'; end if;

  if not p_use_latest then
    select av.id into v_version_id
    from agent.definition_version av
    where av.agent_id = p_agent_id and av.version_number = v_agent.version;
  end if;

  if p_user_id is null and p_organization_id is null
     and p_project_id is null and p_task_id is null then
    p_user_id := v_uid;
  end if;

  v_new_id := gen_random_uuid();
  insert into agent.shortcut (
    id, category_id, label, agent_id, agent_version_id, use_latest,
    enabled_features, display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate,
    bypass_gate_seconds, is_active, created_by, organization_id, project_id, task_id
  ) values (
    v_new_id, p_category_id, p_label, p_agent_id, v_version_id, p_use_latest,
    '["general"]'::jsonb, 'modal-full', true, false,
    false, 'inline', false, false, false, false, false,
    3, true, p_user_id, p_organization_id, p_project_id, p_task_id
  );
  return v_new_id;
end;
$function$;

-- ===== agx_duplicate_shortcut =====
CREATE OR REPLACE FUNCTION public.agx_duplicate_shortcut(p_shortcut_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record;
  v_new_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_source FROM agent.shortcut WHERE id = p_shortcut_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shortcut not found'; END IF;

  v_new_id := gen_random_uuid();

  INSERT INTO agent.shortcut (
    id, category_id, label, description, icon_name, sort_order,
    agent_id, agent_version_id, use_latest,
    enabled_features, scope_mappings, context_mappings,
    display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id, project_id, task_id
  )
  VALUES (
    v_new_id, v_source.category_id, v_source.label || ' (Copy)',
    v_source.description, v_source.icon_name, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, v_uid, NULL, NULL, NULL
  );

  RETURN v_new_id;
END;
$function$;

-- ===== agx_get_shortcuts_for_context =====
CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_for_context(p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, shortcut_project_id uuid, shortcut_task_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_slots jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    CASE
      WHEN s.agent_id IS NULL THEN NULL
      WHEN s.use_latest THEN s.agent_id
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN s.agent_id
      ELSE s.agent_version_id
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN false
      ELSE true
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      ELSE a.version > COALESCE(av.version_number, a.version)
    END,
    s.agent_id, s.agent_version_id, a.version, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_by, s.organization_id, s.project_id, s.task_id,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.name
         ELSE av.name END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.variable_definitions
         ELSE av.variable_definitions END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_slots
         ELSE av.context_slots END
  FROM agent.shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  WHERE s.is_active = true
    AND (
      (p_project_id IS NOT NULL AND s.project_id = p_project_id)
      OR (p_task_id IS NOT NULL AND s.task_id = p_task_id)
      OR EXISTS (
        SELECT 1 FROM iam.permissions p
        WHERE p.resource_type = 'agent_shortcut'
          AND p.resource_id = s.id
          AND (
            p.granted_to_user_id = auth.uid()
            OR p.granted_to_organization_id IN (
              SELECT organization_id FROM iam.organization_member WHERE user_id = auth.uid()
            )
          )
      )
    )
  ORDER BY s.category_id, s.sort_order;
END;
$function$;

-- ===== agx_get_shortcuts_initial =====
CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_initial()
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_slots jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH my_orgs AS (
    SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = auth.uid()
  )
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    CASE
      WHEN s.agent_id IS NULL THEN NULL
      WHEN s.use_latest THEN s.agent_id
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN s.agent_id
      ELSE s.agent_version_id
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN false
      ELSE true
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      ELSE a.version > COALESCE(av.version_number, a.version)
    END,
    s.agent_id, s.agent_version_id, a.version, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_by, s.organization_id,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.name
         ELSE av.name END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.variable_definitions
         ELSE av.variable_definitions END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_slots
         ELSE av.context_slots END
  FROM agent.shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  WHERE s.is_active = true
    AND (
      (s.created_by IS NULL AND s.organization_id IS NULL)
      OR s.created_by = auth.uid()
      OR s.organization_id IN (SELECT mo.organization_id FROM my_orgs mo)
    )
  ORDER BY s.category_id, s.sort_order;
END;
$function$;

-- ===== agx_get_user_shortcuts =====
CREATE OR REPLACE FUNCTION public.agx_get_user_shortcuts()
 RETURNS TABLE(id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, category_id uuid, category_label text, agent_id uuid, agent_name text, agent_version_id uuid, use_latest boolean, scope_type text, scope_name text, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  return query
  select
    s.id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.category_id, sc.name,
    s.agent_id, a.name, s.agent_version_id, s.use_latest,
    (case when s.task_id is not null then 'task' when s.project_id is not null then 'project'
          when s.organization_id is not null then 'organization' when s.created_by is not null then 'personal'
          else 'system' end)::text,
    (case when s.task_id is not null then (select t.title from workspace.tasks t where t.id = s.task_id)
          when s.project_id is not null then (select p.name from workspace.projects p where p.id = s.project_id)
          when s.organization_id is not null then (select o.name from iam.organizations o where o.id = s.organization_id)
          when s.created_by is not null then 'Personal' else 'System' end)::text,
    s.created_by, s.organization_id, s.project_id, s.task_id,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.is_active, s.created_at, s.updated_at
  from agent.shortcut s
  left join agent.definition a on a.id = s.agent_id
  left join platform.categories sc on sc.id = s.category_id and sc.dimension = 'shortcut'
  where s.created_by = v_uid
     or s.organization_id in (select om.organization_id from iam.organization_member om
        where om.user_id = v_uid and om.role in ('owner','admin'))
     or s.project_id in (select m.container_id from iam.memberships m
        where m.container_type='project' and m.user_id = v_uid and m.deleted_at is null and m.role in ('owner','admin'))
  order by case when s.created_by is not null then 0 when s.organization_id is not null then 1
                when s.project_id is not null then 2 when s.task_id is not null then 3 else 4 end,
           s.sort_order, s.label;
end;
$function$;

-- ===== agx_list_non_global_shortcuts_for_admin =====
CREATE OR REPLACE FUNCTION public.agx_list_non_global_shortcuts_for_admin()
 RETURNS TABLE(id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, agent_id uuid, agent_version_id uuid, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, is_active boolean, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, display_mode text, show_variable_panel boolean, variables_panel_style text, auto_run boolean, allow_chat boolean, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, owner_email text, owner_display text, scope_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.agent_id, s.agent_version_id, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.is_active, s.created_by, s.organization_id, s.project_id, s.task_id,
    s.display_mode, s.show_variable_panel, s.variables_panel_style,
    s.auto_run, s.allow_chat,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_at, s.updated_at,
    u.email::text AS owner_email,
    COALESCE(u.email::text, o.name, s.project_id::text, s.task_id::text) AS owner_display,
    CASE
      WHEN s.created_by      IS NOT NULL THEN 'user'
      WHEN s.organization_id IS NOT NULL THEN 'organization'
      WHEN s.project_id      IS NOT NULL THEN 'project'
      WHEN s.task_id         IS NOT NULL THEN 'task'
      ELSE 'global'
    END AS scope_type
  FROM agent.shortcut s
  LEFT JOIN auth.users u ON u.id = s.created_by
  LEFT JOIN iam.organizations o ON o.id = s.organization_id
  WHERE NOT (
    s.created_by IS NULL AND s.organization_id IS NULL
    AND s.project_id IS NULL AND s.task_id IS NULL
  )
  ORDER BY s.updated_at DESC;
END;
$function$;

-- ===== agx_promote_shortcut_to_global =====
CREATE OR REPLACE FUNCTION public.agx_promote_shortcut_to_global(p_shortcut_id uuid, p_target_category_id uuid, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_source record; v_category record; v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can promote shortcuts to global'; END IF;

  SELECT * INTO v_source FROM agent.shortcut WHERE id = p_shortcut_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source shortcut % not found', p_shortcut_id; END IF;

  SELECT * INTO v_category FROM platform.categories WHERE id = p_target_category_id AND dimension = 'shortcut';
  IF NOT FOUND THEN RAISE EXCEPTION 'Target category % not found', p_target_category_id; END IF;

  IF v_category.organization_id IS NOT NULL
     OR (v_category.metadata->>'user_id')    IS NOT NULL
     OR (v_category.metadata->>'project_id') IS NOT NULL
     OR (v_category.metadata->>'task_id')    IS NOT NULL THEN
    RAISE EXCEPTION 'Target category must be global (all ownership columns NULL)';
  END IF;

  v_new_id := gen_random_uuid();

  INSERT INTO agent.shortcut (
    id, category_id, label, description, icon_name, keyboard_shortcut, sort_order,
    agent_id, agent_version_id, use_latest, enabled_features, scope_mappings, context_mappings,
    display_mode, allow_chat, auto_run, show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content, hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id, project_id, task_id)
  VALUES (
    v_new_id, p_target_category_id,
    COALESCE(NULLIF(btrim(p_label), ''), v_source.label),
    v_source.description, v_source.icon_name, NULL, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, NULL, NULL, NULL, NULL);

  RETURN v_new_id;
END;
$function$;

-- ===== create_shortcut_from_agent_surface =====
CREATE OR REPLACE FUNCTION public.create_shortcut_from_agent_surface(p_agent_surface_id uuid, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_agent_id       uuid;
  v_surface_name   text;
  v_value_maps     jsonb;
  v_write_policies jsonb;
  v_effective_maps jsonb;
  v_agent          record;
  v_new_id         uuid;
  v_label          text;
  v_description    text;
  v_icon_name      text;
begin
  select a.source_id,
         us.name,
         coalesce(a.payload->'value_mappings', a.metadata->'value_mappings', '{}'::jsonb),
         coalesce(a.payload->'write_policies', '{}'::jsonb)
    into v_agent_id, v_surface_name, v_value_maps, v_write_policies
    from platform.associations a
    join ui.ui_surface us on us.id = a.target_id
   where a.id = p_agent_surface_id
     and a.source_type = 'agent'
     and a.target_type = 'surface';

  if v_agent_id is null then
    raise exception 'agent-surface binding association % not found', p_agent_surface_id;
  end if;

  select id, name, description into v_agent
    from agent.definition where id = v_agent_id;
  if not found then
    raise exception 'agent.definition row % not found', v_agent_id;
  end if;

  v_label       := coalesce(p_overrides->>'label',       v_agent.name || ' Shortcut');
  v_description := coalesce(p_overrides->>'description', v_agent.description);
  v_icon_name   := coalesce(p_overrides->>'icon_name',   null);

  v_effective_maps := coalesce((p_overrides->'value_mappings')::jsonb, v_value_maps);
  if v_write_policies <> '{}'::jsonb
     and not (v_effective_maps ? '__write_policies') then
    v_effective_maps := coalesce(v_effective_maps, '{}'::jsonb)
      || jsonb_build_object('__write_policies', v_write_policies);
  end if;

  insert into agent.shortcut (
    category_id, label, description, icon_name, agent_id, surface_name,
    value_mappings, created_by, organization_id, project_id, task_id,
    keyboard_shortcut, display_mode, allow_chat, auto_run, show_variable_panel,
    variables_panel_style, show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate, pre_execution_message,
    bypass_gate_seconds, default_user_input, default_variables, context_overrides,
    llm_overrides, response_density, json_extraction, enabled_features, use_latest,
    agent_version_id, is_active
  ) values (
    p_category_id, v_label, v_description, v_icon_name, v_agent_id, v_surface_name,
    v_effective_maps,
    p_user_id, p_organization_id, p_project_id, p_task_id,
    p_overrides->>'keyboard_shortcut',
    coalesce(p_overrides->>'display_mode', 'modal-full'),
    coalesce((p_overrides->>'allow_chat')::boolean, true),
    coalesce((p_overrides->>'auto_run')::boolean, true),
    coalesce((p_overrides->>'show_variable_panel')::boolean, false),
    coalesce(p_overrides->>'variables_panel_style', 'inline'),
    coalesce((p_overrides->>'show_definition_messages')::boolean, false),
    coalesce((p_overrides->>'show_definition_message_content')::boolean, false),
    coalesce((p_overrides->>'hide_reasoning')::boolean, false),
    coalesce((p_overrides->>'hide_tool_results')::boolean, false),
    coalesce((p_overrides->>'show_pre_execution_gate')::boolean, false),
    p_overrides->>'pre_execution_message',
    coalesce((p_overrides->>'bypass_gate_seconds')::int, 3),
    p_overrides->>'default_user_input',
    (p_overrides->'default_variables')::jsonb,
    (p_overrides->'context_overrides')::jsonb,
    (p_overrides->'llm_overrides')::jsonb,
    coalesce(p_overrides->>'response_density', 'comfortable'),
    (p_overrides->'json_extraction')::jsonb,
    coalesce((p_overrides->'enabled_features')::jsonb, '["general"]'::jsonb),
    coalesce((p_overrides->>'use_latest')::boolean, true),
    nullif(p_overrides->>'agent_version_id', '')::uuid,
    true
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;


-- ===== agx_usage_scan_core =====
CREATE OR REPLACE FUNCTION public.agx_usage_scan_core(p_agent_id uuid, p_viewer uuid, p_scope text DEFAULT 'agent'::text)
 RETURNS TABLE(usage_type text, usage_id uuid, node_id text, label text, owner_user_id uuid, organization_id uuid, organization_name text, org_manager_user_ids uuid[], agent_id uuid, agent_name text, current_version integer, pin_mode text, pinned_version_id uuid, pinned_version_number integer, versions_behind integer, stale_pin boolean, is_usage_active boolean, severity text, findings jsonb, config jsonb, managed_by_caller boolean, usage_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'scheduler', 'communication', 'agent', 'iam', 'app', 'workflow', 'pg_temp'
AS $function$
WITH usages AS (
  SELECT
    'shortcut'::text AS usage_type, s.id AS usage_id, NULL::text AS node_id,
    s.label, s.created_by AS owner_user_id, s.organization_id,
    COALESCE(s.agent_id, sv.agent_id) AS target_agent_id,
    CASE WHEN NOT s.use_latest AND sv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END AS pin_mode,
    CASE WHEN NOT s.use_latest THEN sv.id END AS pinned_version_id,
    CASE WHEN NOT s.use_latest THEN sv.version_number END AS pinned_version_number,
    (public.agx_usage_jsonb_keys(s.default_variables)
      || CASE WHEN public.agx_usage_jsonb_keys(s.value_mappings) <> '{}'::text[]
              THEN public.agx_usage_jsonb_keys(s.value_mappings)
              ELSE public.agx_usage_jsonb_text_values(s.scope_mappings) END) AS stored_var_keys,
    (public.agx_usage_jsonb_keys(s.context_overrides)
      || public.agx_usage_jsonb_text_values(s.context_mappings)) AS stored_slot_keys,
    (NOT COALESCE(s.auto_run, false)) AS is_interactive,
    s.is_active AS is_usage_active,
    jsonb_build_object(
      'default_variables', s.default_variables, 'value_mappings', s.value_mappings,
      'context_mappings', s.context_mappings, 'context_overrides', s.context_overrides,
      'scope_mappings', s.scope_mappings, 'auto_run', s.auto_run,
      'surface_name', s.surface_name, 'use_latest', s.use_latest) AS config,
    s.updated_at AS usage_updated_at
  FROM agent.shortcut s
  LEFT JOIN agent.definition_version sv ON sv.id = s.agent_version_id

  UNION ALL
  SELECT
    'app', ap.id, NULL, ap.name, ap.user_id, ap.organization_id,
    COALESCE(ap.agent_id, av.agent_id),
    CASE WHEN NOT COALESCE(ap.use_latest, true) AND av.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    CASE WHEN NOT COALESCE(ap.use_latest, true) THEN av.id END,
    CASE WHEN NOT COALESCE(ap.use_latest, true) THEN av.version_number END,
    (SELECT c.var_names FROM public.agx_usage_contract(ap.variable_schema, '[]'::jsonb) c),
    (SELECT c.slot_keys FROM public.agx_usage_contract('[]'::jsonb, ap.shared_context_slots) c),
    false,
    (ap.status = 'published'),
    jsonb_build_object(
      'variable_schema', ap.variable_schema, 'shared_context_slots', ap.shared_context_slots,
      'pinned_version', ap.pinned_version, 'status', ap.status, 'slug', ap.slug,
      'use_latest', ap.use_latest),
    ap.updated_at
  FROM app.definition ap
  LEFT JOIN agent.definition_version av ON av.id = ap.agent_version_id

  UNION ALL
  SELECT
    'scheduled_task', st.id, NULL, st.title, st.user_id, NULL::uuid,
    COALESCE(ta.id, tv.agent_id),
    CASE WHEN tv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    tv.id, tv.version_number,
    public.agx_usage_jsonb_keys(sat.variables),
    '{}'::text[],
    false,
    (st.enabled AND st.deleted_at IS NULL),
    jsonb_build_object('variables', sat.variables, 'prompt', left(sat.prompt, 400), 'kind', st.kind),
    st.updated_at
  FROM scheduler.sch_agent_task sat
  JOIN scheduler.sch_task st ON st.id = sat.id
  LEFT JOIN agent.definition ta ON ta.id = sat.agent_id
  LEFT JOIN agent.definition_version tv ON tv.id = sat.agent_id
  WHERE st.kind = 'agent' AND st.deleted_at IS NULL AND sat.agent_id IS NOT NULL

  UNION ALL
  SELECT
    'surface_binding', sf.id, NULL, sfu.name,
    NULLIF(sf.metadata ->> 'user_id', '')::uuid, sf.organization_id,
    COALESCE(sa.id, sv2.agent_id),
    CASE WHEN sv2.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    sv2.id, sv2.version_number,
    public.agx_usage_jsonb_keys(COALESCE(sf.metadata -> 'value_mappings', '{}'::jsonb)),
    '{}'::text[],
    false,
    true,
    jsonb_build_object('value_mappings', COALESCE(sf.metadata -> 'value_mappings', '{}'::jsonb), 'surface_name', sfu.name),
    sf.created_at
  FROM platform.associations sf
  JOIN ui.ui_surface sfu ON sfu.id = sf.target_id
  LEFT JOIN agent.definition sa ON sa.id = sf.source_id
  LEFT JOIN agent.definition_version sv2 ON sv2.id = sf.source_id
  WHERE sf.source_type = 'agent' AND sf.target_type = 'surface'

  UNION ALL
  SELECT
    'sms_line', sc.id, NULL, COALESCE(sc.external_phone_number, 'SMS line'),
    sc.user_id, NULL::uuid,
    COALESCE(ma.id, mv.agent_id),
    CASE WHEN mv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    mv.id, mv.version_number,
    '{}'::text[], '{}'::text[],
    false,
    (sc.status = 'active'),
    jsonb_build_object('our_phone_number', sc.our_phone_number, 'conversation_type', sc.conversation_type),
    sc.updated_at
  FROM communication.sms_conversations sc
  CROSS JOIN LATERAL (
    SELECT CASE WHEN sc.ai_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN sc.ai_agent_id::uuid END AS ref_id
  ) rid
  LEFT JOIN agent.definition ma ON ma.id = rid.ref_id
  LEFT JOIN agent.definition_version mv ON mv.id = rid.ref_id
  WHERE rid.ref_id IS NOT NULL

  UNION ALL
  SELECT
    'workflow_node', w.id, n.elem ->> 'id',
    w.name || ' · ' || COALESCE(n.elem -> 'data' ->> 'label', n.elem ->> 'id'),
    w.created_by, w.organization_id,
    COALESCE(wa.id, wv.agent_id),
    CASE WHEN wv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    wv.id, wv.version_number,
    public.agx_usage_jsonb_keys(n.elem -> 'data' -> 'config' -> 'variables'),
    '{}'::text[],
    false,
    (NOT COALESCE(w.is_archived, false)),
    jsonb_build_object('workflow_id', w.id, 'node_label', n.elem -> 'data' ->> 'label',
                       'node_config', n.elem -> 'data' -> 'config'),
    NULL::timestamptz
  FROM workflow.definition w
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w.nodes) = 'array' THEN w.nodes ELSE '[]'::jsonb END) n(elem)
  CROSS JOIN LATERAL (
    SELECT CASE WHEN (n.elem -> 'data' -> 'config' ->> 'agent_id')
                     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (n.elem -> 'data' -> 'config' ->> 'agent_id')::uuid END AS ref_id
  ) rid
  LEFT JOIN agent.definition wa ON wa.id = rid.ref_id
  LEFT JOIN agent.definition_version wv ON wv.id = rid.ref_id
  WHERE rid.ref_id IS NOT NULL

  UNION ALL
  SELECT
    'derived_agent', d.id, NULL, d.name, d.user_id, d.organization_id,
    d.source_agent_id,
    'pinned',
    dpv.id, dpv.version_number,
    '{}'::text[], '{}'::text[],
    true,
    (d.is_active AND NOT d.is_archived),
    jsonb_build_object('source_snapshot_at', d.source_snapshot_at, 'derived_version', d.version),
    d.updated_at
  FROM agent.definition d
  LEFT JOIN LATERAL (
    SELECT v.id, v.version_number FROM agent.definition_version v
    WHERE v.agent_id = d.source_agent_id
      AND (d.source_snapshot_at IS NULL OR v.changed_at <= d.source_snapshot_at)
    ORDER BY v.version_number DESC LIMIT 1
  ) dpv ON true
  WHERE d.source_agent_id IS NOT NULL

  UNION ALL
  SELECT
    'comparison', e.id, NULL, COALESCE(cs.name, 'Comparison entry'),
    cs.created_by, cs.organization_id,
    COALESCE(ca.id, cv.agent_id),
    CASE WHEN e.agent_version_snapshot_id IS NOT NULL OR e.agent_version IS NOT NULL
         THEN 'pinned' ELSE 'follow_active' END,
    cv2.id, COALESCE(cv2.version_number, e.agent_version),
    '{}'::text[], '{}'::text[],
    true,
    true,
    jsonb_build_object('comparison_set_id', e.comparison_set_id, 'agent_version', e.agent_version),
    e.created_at
  FROM agent.cmp_comparison_entries e
  LEFT JOIN agent.cmp_comparison_sets cs ON cs.id = e.comparison_set_id
  LEFT JOIN agent.definition ca ON ca.id = e.agent_id
  LEFT JOIN agent.definition_version cv ON cv.id = e.agent_id
  LEFT JOIN agent.definition_version cv2 ON cv2.id = e.agent_version_snapshot_id

  UNION ALL
  SELECT
    'code', r.id, NULL, r.usage_key, NULL::uuid, NULL::uuid,
    COALESCE(r.agent_id, rv.agent_id),
    CASE WHEN r.ref_kind = 'version' THEN 'pinned' ELSE 'follow_active' END,
    rv.id, rv.version_number,
    '{}'::text[], '{}'::text[],
    false,
    true,
    jsonb_build_object('purpose', r.purpose, 'code_path', r.code_path,
                       'source_system', r.source_system, 'ref_kind', r.ref_kind),
    r.last_synced_at
  FROM agent.usage r
  LEFT JOIN agent.definition_version rv ON rv.id = r.agent_version_id
  WHERE r.status = 'active' AND r.ref_kind IN ('version', 'agent')
),
enriched AS (
  SELECT
    u.*,
    ag.name AS r_agent_name,
    ag.version AS r_current_version,
    (ag.is_archived OR NOT ag.is_active) AS agent_unavailable,
    lc.var_names AS live_vars, lc.required_var_names AS live_req, lc.slot_keys AS live_slots,
    pvrow.id AS pin_row_id,
    pc.var_names AS pin_vars, pc.required_var_names AS pin_req, pc.slot_keys AS pin_slots,
    org.name AS r_organization_name,
    (SELECT array_agg(om.user_id) FROM iam.organization_member om
      WHERE om.organization_id = u.organization_id AND om.role IN ('owner', 'admin')) AS r_org_managers,
    (u.pin_mode = 'pinned' AND u.pinned_version_number IS NOT NULL
      AND u.pinned_version_number <> ag.version) AS r_stale_pin
  FROM usages u
  JOIN agent.definition ag ON ag.id = u.target_agent_id
  CROSS JOIN LATERAL public.agx_usage_contract(ag.variable_definitions, ag.context_slots) lc
  LEFT JOIN agent.definition_version pvrow ON pvrow.id = u.pinned_version_id
  LEFT JOIN LATERAL (
    SELECT c.var_names, c.required_var_names, c.slot_keys
    FROM public.agx_usage_contract(pvrow.variable_definitions, pvrow.context_slots) c
    WHERE pvrow.id IS NOT NULL
  ) pc ON true
  LEFT JOIN iam.organizations org ON org.id = u.organization_id
  WHERE u.target_agent_id IS NOT NULL
    AND (p_scope = 'all' OR u.target_agent_id = p_agent_id)
),
evaluated AS (
  SELECT
    e.*,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_vars  ELSE e.live_vars  END AS eff_vars,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_req   ELSE e.live_req   END AS eff_req,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_slots ELSE e.live_slots END AS eff_slots,
    (e.pin_row_id IS NOT NULL AND NOT (
        e.pin_vars <@ e.live_vars AND e.pin_vars @> e.live_vars
        AND e.pin_req <@ e.live_req AND e.pin_req @> e.live_req
        AND e.pin_slots <@ e.live_slots AND e.pin_slots @> e.live_slots)) AS contract_changed
  FROM enriched e
),
finalized AS (
  SELECT
    v.*,
    CASE WHEN v.usage_type = 'comparison' THEN
      CASE WHEN v.r_stale_pin THEN jsonb_build_array(jsonb_build_object(
        'drift_class', 'stale_pin', 'severity', 'info', 'detail', '{}'::jsonb))
      ELSE '[]'::jsonb END
    ELSE
      public.agx_usage_eval(
        v.usage_type, v.stored_var_keys, v.stored_slot_keys,
        v.eff_vars, v.eff_req, v.eff_slots,
        v.is_interactive, v.pin_mode, v.r_stale_pin, v.contract_changed,
        (v.agent_unavailable AND v.is_usage_active))
    END AS r_findings
  FROM evaluated v
)
SELECT
  f.usage_type,
  f.usage_id,
  f.node_id,
  f.label,
  f.owner_user_id,
  f.organization_id,
  f.r_organization_name,
  f.r_org_managers,
  f.target_agent_id,
  f.r_agent_name,
  f.r_current_version,
  f.pin_mode,
  f.pinned_version_id,
  f.pinned_version_number,
  CASE WHEN f.pin_mode = 'pinned' AND f.pinned_version_number IS NOT NULL
       THEN GREATEST(f.r_current_version - f.pinned_version_number, 0) END,
  f.r_stale_pin,
  f.is_usage_active,
  CASE
    WHEN f.r_findings @> '[{"severity":"breaking"}]'::jsonb        THEN 'breaking'
    WHEN f.r_findings @> '[{"severity":"silent_breaking"}]'::jsonb THEN 'silent_breaking'
    WHEN f.r_findings @> '[{"severity":"warning"}]'::jsonb         THEN 'warning'
    WHEN f.r_findings @> '[{"severity":"info"}]'::jsonb            THEN 'info'
  END,
  f.r_findings,
  f.config || jsonb_build_object('effective', jsonb_build_object(
    'variables', to_jsonb(f.eff_vars),
    'required_variables', to_jsonb(f.eff_req),
    'context_slots', to_jsonb(f.eff_slots))),
  (p_viewer IS NOT NULL AND (
     f.owner_user_id = p_viewer
     OR (f.organization_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM iam.organization_member om
           WHERE om.organization_id = f.organization_id
             AND om.user_id = p_viewer AND om.role IN ('owner', 'admin'))))),
  f.usage_updated_at
FROM finalized f
$function$;

-- ===== agx_usage_report =====
CREATE OR REPLACE FUNCTION public.agx_usage_report()
 RETURNS TABLE(agent_id uuid, agent_name text, current_version integer, agent_is_active boolean, owned_by_caller boolean, my_usage_count integer, my_breaking integer, my_silent integer, my_warning integer, my_info integer, my_stale_pins integer, others_usage_count integer, others_redflag_count integer, by_type jsonb, alert_id uuid, alert_status text, alert_severity text, alert_detected_at timestamp with time zone, alert_last_scanned_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_report: not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.agx_usage_scan_core(NULL, v_uid, 'all')
  ),
  agent_scope AS (
    SELECT a.id, a.name, a.version, (a.is_active AND NOT a.is_archived) AS live,
           (a.user_id = v_uid
            OR (a.organization_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = a.organization_id
                    AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))) AS oversees
    FROM agent.definition a
    WHERE a.user_id = v_uid
       OR (a.organization_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM iam.organization_member om
             WHERE om.organization_id = a.organization_id
               AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))
       OR EXISTS (SELECT 1 FROM r WHERE r.agent_id = a.id AND r.managed_by_caller)
  )
  SELECT
    s.id, s.name, s.version, s.live, s.oversees,
    (count(*) FILTER (WHERE r.managed_by_caller))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.stale_pin))::integer,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller))::integer END,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller AND r.is_usage_active
                                AND r.severity IN ('breaking', 'silent_breaking', 'warning')))::integer END,
    COALESCE((SELECT jsonb_object_agg(t.usage_type, t.n) FROM (
       SELECT r2.usage_type, count(*) AS n FROM r r2
       WHERE r2.agent_id = s.id AND (r2.managed_by_caller OR s.oversees)
       GROUP BY r2.usage_type) t), '{}'::jsonb),
    al.id, al.status, al.severity, al.detected_at, al.last_scanned_at
  FROM agent_scope s
  LEFT JOIN r ON r.agent_id = s.id
  LEFT JOIN LATERAL (
    SELECT a2.id, a2.status, a2.severity, a2.detected_at, a2.last_scanned_at
    FROM agent.drift_alert a2
    WHERE a2.created_by = v_uid AND a2.agent_id = s.id
      AND a2.status IN ('pending', 'acknowledged')
    ORDER BY a2.detected_at DESC LIMIT 1
  ) al ON true
  GROUP BY s.id, s.name, s.version, s.live, s.oversees,
           al.id, al.status, al.severity, al.detected_at, al.last_scanned_at;
END;
$function$;

-- ===== agx_usage_update_to_active =====
CREATE OR REPLACE FUNCTION public.agx_usage_update_to_active(p_usage_type text, p_usage_id uuid, p_mode text DEFAULT 'repin_active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_super     boolean;
  v_owner     uuid;
  v_org       uuid;
  v_agent     uuid;
  v_live      integer;
  v_target    uuid;
  v_has_perm  boolean;
  v_res       jsonb;
  v_code_path text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_update_to_active: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('repin_active', 'follow_active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_mode');
  END IF;
  v_super := public.is_super_admin();

  -- Resolve owner / org / target agent per usage type --------------------------
  IF p_usage_type = 'shortcut' THEN
    SELECT s.created_by, s.organization_id, COALESCE(s.agent_id, sv.agent_id)
      INTO v_owner, v_org, v_agent
    FROM agent.shortcut s LEFT JOIN agent.definition_version sv ON sv.id = s.agent_version_id
    WHERE s.id = p_usage_id;
  ELSIF p_usage_type = 'app' THEN
    SELECT ap.user_id, ap.organization_id, COALESCE(ap.agent_id, av.agent_id)
      INTO v_owner, v_org, v_agent
    FROM app.definition ap LEFT JOIN agent.definition_version av ON av.id = ap.agent_version_id
    WHERE ap.id = p_usage_id;
  ELSIF p_usage_type = 'derived_agent' THEN
    SELECT d.user_id, d.organization_id, d.source_agent_id
      INTO v_owner, v_org, v_agent
    FROM agent.definition d WHERE d.id = p_usage_id AND d.source_agent_id IS NOT NULL;
  ELSIF p_usage_type IN ('scheduled_task', 'surface_binding', 'sms_line', 'comparison') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pinnable',
      'message', 'This usage always follows the active version — nothing to update.');
  ELSIF p_usage_type = 'workflow_node' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_remediable_in_sql',
      'workflow_id', p_usage_id,
      'message', 'Update the agent reference inside the workflow editor.');
  ELSIF p_usage_type = 'code' THEN
    SELECT r.code_path INTO v_code_path FROM agent.usage r WHERE r.id = p_usage_id;
    RETURN jsonb_build_object('success', false, 'error', 'code_managed',
      'code_path', v_code_path,
      'message', 'This usage is pinned in backend code — update the declaration and redeploy.');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_usage_type');
  END IF;

  IF v_agent IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  v_has_perm := v_super OR v_owner = v_uid OR (
    v_org IS NOT NULL AND EXISTS (
      SELECT 1 FROM iam.organization_member om
      WHERE om.organization_id = v_org AND om.user_id = v_uid
        AND om.role IN ('owner', 'admin')));
  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'agx_usage_update_to_active: not permitted for this usage' USING ERRCODE = '42501';
  END IF;

  SELECT a.version INTO v_live FROM agent.definition a WHERE a.id = v_agent;
  IF v_live IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agent_not_found');
  END IF;

  -- Apply ----------------------------------------------------------------------
  IF p_usage_type = 'shortcut' THEN
    IF p_mode = 'follow_active' THEN
      UPDATE agent.shortcut SET use_latest = true, agent_version_id = NULL WHERE id = p_usage_id;
    ELSE
      SELECT v.id INTO v_target FROM agent.definition_version v
        WHERE v.agent_id = v_agent AND v.version_number = v_live;
      IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_snapshot_for_active_version');
      END IF;
      UPDATE agent.shortcut SET agent_version_id = v_target, use_latest = false WHERE id = p_usage_id;
    END IF;

  ELSIF p_usage_type = 'app' THEN
    IF p_mode = 'follow_active' THEN
      UPDATE app.definition SET use_latest = true, agent_version_id = NULL, pinned_version = NULL
        WHERE id = p_usage_id;
    ELSE
      SELECT v.id INTO v_target FROM agent.definition_version v
        WHERE v.agent_id = v_agent AND v.version_number = v_live;
      IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_snapshot_for_active_version');
      END IF;
      UPDATE app.definition SET agent_version_id = v_target, use_latest = false, pinned_version = v_live
        WHERE id = p_usage_id;
    END IF;


  ELSIF p_usage_type = 'derived_agent' THEN
    BEGIN
      v_res := public.agx_update_from_source(p_usage_id);
      IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
        RETURN v_res;
      END IF;
      UPDATE agent.definition SET source_snapshot_at = now() WHERE id = p_usage_id;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', 'sync_failed', 'message', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'usage_type', p_usage_type,
    'usage_id', p_usage_id,
    'mode', p_mode,
    'pinned_version_number', CASE WHEN p_mode = 'repin_active' THEN v_live END);
END;
$function$;

-- ── 2. Repointed view ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW agent.context_menu_view AS
 WITH shortcut_items AS (
         SELECT sc_1.id AS category_id,
            sc_1.placement_type,
            COALESCE(json_agg(json_build_object('type', 'agent_shortcut', 'id', s.id, 'category_id', s.category_id, 'label', s.label, 'description', s.description, 'icon_name', s.icon_name, 'sort_order', s.sort_order, 'keyboard_shortcut', s.keyboard_shortcut, 'surface_name', s.surface_name, 'value_mappings', s.value_mappings, 'scope_mappings', s.scope_mappings, 'context_mappings', s.context_mappings, 'enabled_features', s.enabled_features, 'display_mode', s.display_mode, 'auto_run', s.auto_run, 'allow_chat', s.allow_chat, 'show_variable_panel', s.show_variable_panel, 'variables_panel_style', s.variables_panel_style, 'show_definition_messages', s.show_definition_messages, 'show_definition_message_content', s.show_definition_message_content, 'hide_reasoning', s.hide_reasoning, 'hide_tool_results', s.hide_tool_results, 'response_density', s.response_density, 'show_pre_execution_gate', s.show_pre_execution_gate, 'pre_execution_message', s.pre_execution_message, 'bypass_gate_seconds', s.bypass_gate_seconds, 'default_user_input', s.default_user_input, 'default_variables', s.default_variables, 'context_overrides', s.context_overrides, 'llm_overrides', s.llm_overrides, 'json_extraction', s.json_extraction, 'agent_id', s.agent_id, 'agent_version_id', s.agent_version_id, 'use_latest', s.use_latest, 'is_active', s.is_active, 'user_id', s.created_by, 'organization_id', s.organization_id, 'project_id', s.project_id, 'task_id', s.task_id, 'scope',
                CASE
                    WHEN s.created_by IS NOT NULL THEN 'user'::text
                    WHEN s.organization_id IS NOT NULL THEN 'organization'::text
                    WHEN s.project_id IS NOT NULL THEN 'project'::text
                    WHEN s.task_id IS NOT NULL THEN 'task'::text
                    ELSE 'global'::text
                END, 'agent',
                CASE
                    WHEN s.agent_id IS NOT NULL THEN json_build_object('id', s.agent_id, 'name', COALESCE(v.name, a.name), 'description', a.description, 'variable_definitions',
                    CASE
                        WHEN s.use_latest = false AND v.id IS NOT NULL THEN v.variable_definitions
                        ELSE a.variable_definitions
                    END, 'context_slots',
                    CASE
                        WHEN s.use_latest = false AND v.id IS NOT NULL THEN v.context_slots
                        ELSE a.context_slots
                    END)
                    ELSE NULL::json
                END) ORDER BY s.sort_order) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS items
           FROM platform.categories sc_1
             LEFT JOIN agent.shortcut s ON s.category_id = sc_1.id AND s.is_active = true
             LEFT JOIN agent.definition a ON a.id = s.agent_id
             LEFT JOIN agent.definition_version v ON v.id = s.agent_version_id
          WHERE sc_1.dimension = 'shortcut'::text AND sc_1.deleted_at IS NULL AND COALESCE((sc_1.metadata ->> 'is_active'::text)::boolean, true)
          GROUP BY sc_1.id, sc_1.placement_type
        ), block_items AS (
         SELECT sc_1.id AS category_id,
            sc_1.placement_type,
            COALESCE(json_agg(json_build_object('type', 'content_block', 'id', rd.id, 'category_id', rd.category_id, 'label', rd.label, 'description', rd.description, 'icon_name', rd.icon_name, 'sort_order', rd.sort_order, 'template', rd.template, 'block_id', rd.block_id, 'block_type', rd.block_type, 'skill_id', rd.skill_id, 'visibility', rd.visibility, 'is_active', rd.is_active, 'user_id', rd.created_by, 'organization_id', rd.organization_id, 'project_id', rd.project_id, 'task_id', rd.task_id, 'scope',
                CASE
                    WHEN rd.created_by IS NOT NULL THEN 'user'::text
                    WHEN rd.organization_id IS NOT NULL THEN 'organization'::text
                    WHEN rd.project_id IS NOT NULL THEN 'project'::text
                    WHEN rd.task_id IS NOT NULL THEN 'task'::text
                    ELSE 'global'::text
                END) ORDER BY rd.sort_order) FILTER (WHERE rd.id IS NOT NULL), '[]'::json) AS items
           FROM platform.categories sc_1
             LEFT JOIN skill.render_definition rd ON rd.category_id = sc_1.id AND rd.is_active = true
          WHERE sc_1.dimension = 'shortcut'::text AND sc_1.deleted_at IS NULL AND COALESCE((sc_1.metadata ->> 'is_active'::text)::boolean, true)
          GROUP BY sc_1.id, sc_1.placement_type
        )
 SELECT sc.placement_type,
    json_agg(json_build_object('category', json_build_object('id', sc.id, 'placement_type', sc.placement_type, 'parent_category_id', sc.parent_id, 'label', sc.name, 'description', sc.metadata ->> 'description'::text, 'icon_name', sc.icon, 'color', sc.color, 'sort_order', sc."position", 'is_active', COALESCE((sc.metadata ->> 'is_active'::text)::boolean, true), 'metadata', sc.metadata, 'enabled_features', COALESCE(sc.metadata -> 'enabled_features'::text, '[]'::jsonb), 'user_id', (sc.metadata ->> 'user_id'::text)::uuid, 'organization_id', sc.organization_id, 'project_id', (sc.metadata ->> 'project_id'::text)::uuid, 'task_id', (sc.metadata ->> 'task_id'::text)::uuid, 'scope',
        CASE
            WHEN (sc.metadata ->> 'user_id'::text) IS NOT NULL THEN 'user'::text
            WHEN sc.organization_id IS NOT NULL THEN 'organization'::text
            WHEN (sc.metadata ->> 'project_id'::text) IS NOT NULL THEN 'project'::text
            WHEN (sc.metadata ->> 'task_id'::text) IS NOT NULL THEN 'task'::text
            ELSE 'global'::text
        END), 'items', ( SELECT COALESCE(json_agg(combined.elem ORDER BY ((combined.elem ->> 'sort_order'::text)::integer)), '[]'::json) AS "coalesce"
           FROM ( SELECT json_array_elements(si.items) AS elem
                  WHERE si.items::text <> '[]'::text
                UNION ALL
                 SELECT json_array_elements(bi.items) AS elem
                  WHERE bi.items::text <> '[]'::text) combined)) ORDER BY sc."position") AS categories_flat
   FROM platform.categories sc
     LEFT JOIN shortcut_items si ON si.category_id = sc.id
     LEFT JOIN block_items bi ON bi.category_id = sc.id
  WHERE sc.dimension = 'shortcut'::text AND sc.deleted_at IS NULL AND COALESCE((sc.metadata ->> 'is_active'::text)::boolean, true)
  GROUP BY sc.placement_type;

-- ── 3. NOT NULL on created_by where user_id was NOT NULL (values backfilled identical) ──
ALTER TABLE agent.cmp_comparison_sets   ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE agent.cmp_response_feedback ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE agent.drift_alert           ALTER COLUMN created_by SET NOT NULL;

-- ── 4. Rebuild user_id-bearing constraints/indexes on created_by, then drop the columns ──
-- cmp_response_feedback: UNIQUE(user_id, conversation_id, request_id) → created_by
ALTER TABLE agent.cmp_response_feedback DROP CONSTRAINT IF EXISTS cmp_response_feedback_unique;
ALTER TABLE agent.cmp_response_feedback DROP COLUMN IF EXISTS user_id;
ALTER TABLE agent.cmp_response_feedback ADD CONSTRAINT cmp_response_feedback_unique
  UNIQUE (created_by, conversation_id, request_id);

-- drift_alert: open-alert uniqueness + status index → created_by
ALTER TABLE agent.drift_alert DROP COLUMN IF EXISTS user_id;  -- cascades its FK + 2 indexes
CREATE UNIQUE INDEX IF NOT EXISTS agx_drift_alert_open_unique
  ON agent.drift_alert (created_by, agent_id)
  WHERE status = ANY (ARRAY['pending'::text, 'acknowledged'::text]);
CREATE INDEX IF NOT EXISTS agx_drift_alert_created_status_idx
  ON agent.drift_alert (created_by, status);

-- cmp_comparison_sets: owner listing index → created_by
ALTER TABLE agent.cmp_comparison_sets DROP COLUMN IF EXISTS user_id;  -- drops idx_cmp_sets_by_user
CREATE INDEX IF NOT EXISTS idx_cmp_sets_by_creator
  ON agent.cmp_comparison_sets (created_by, created_at DESC);

-- shortcut: partial owner indexes → created_by
ALTER TABLE agent.shortcut DROP COLUMN IF EXISTS user_id;  -- drops idx_agx_shortcut_user + idx_agx_shortcut_user_id
CREATE INDEX IF NOT EXISTS idx_agx_shortcut_creator
  ON agent.shortcut (created_by, category_id, sort_order)
  WHERE is_active = true AND created_by IS NOT NULL;

-- template: owner index → created_by; legacy visibility boolean gone
ALTER TABLE agent.template DROP COLUMN IF EXISTS user_id;  -- drops idx_agx_agent_templates_user_id
ALTER TABLE agent.template DROP COLUMN IF EXISTS is_public;
CREATE INDEX IF NOT EXISTS idx_agx_template_creator ON agent.template (created_by);

COMMIT;
