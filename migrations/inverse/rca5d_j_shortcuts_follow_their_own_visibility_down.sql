-- chair-step: inverse of rca5d_j_shortcuts_follow_their_own_visibility — puts back the doors it closed (they name records the caller may not open again).
-- based-on: public.agx_get_shortcuts_initial() a9fe75b5ac9e7ade8067bc57cc1c7aaed2113e83702e01aa2e9a2357f0c61912
-- based-on: public.agx_get_shortcuts_for_context(uuid, uuid) 10ad056debc64780554ff58640be5f0421859ea4625f4a0391111643e87187ef
-- based-on: public.agx_get_user_shortcuts() daf519154c157030c0c4f163e7e0be94bd266682f07c7c2c1dee658f7cff17d0

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_initial()
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_policies jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  -- rca5d_g: the agent each returned shortcut runs is asked of the kernel — once per DISTINCT agent
  -- in the result — and its name is null when the caller may not open it. The shortcut, its label and
  -- the agent id stay (running it is the server's own question). Order is the inner query's order.
  WITH q AS MATERIALIZED (
    SELECT row_number() OVER () AS rn__, t.*
      FROM (
  WITH my_orgs AS (
    SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = (select auth.uid())
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
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_policies
         ELSE av.context_policies END
  FROM agent.shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
    AND (
      (s.created_by IS NULL AND s.organization_id IS NULL)
      OR s.created_by = (select auth.uid())
      OR s.organization_id IN (SELECT mo.organization_id FROM my_orgs mo)
    )
  ORDER BY s.category_id, s.sort_order
      ) AS t(o_shortcut_id, o_category_id, o_label, o_description, o_icon_name, o_keyboard_shortcut, o_sort_order, o_resolved_id, o_is_version, o_is_behind, o_agent_id, o_agent_version_id, o_current_version, o_use_latest, o_enabled_features, o_scope_mappings, o_context_mappings, o_display_mode, o_allow_chat, o_auto_run, o_show_variable_panel, o_variables_panel_style, o_show_definition_messages, o_show_definition_message_content, o_hide_reasoning, o_hide_tool_results, o_show_pre_execution_gate, o_pre_execution_message, o_bypass_gate_seconds, o_default_user_input, o_default_variables, o_context_overrides, o_llm_overrides, o_shortcut_user_id, o_shortcut_org_id, o_agent_name, o_agent_variable_definitions, o_agent_context_policies)
  ), ok AS (
    SELECT d.aid, iam.has_access('agent', d.aid, 'viewer'::public.permission_level) AS ok
      FROM (SELECT DISTINCT q.o_agent_id AS aid FROM q WHERE q.o_agent_id IS NOT NULL) d
  )
  SELECT q.o_shortcut_id,
         q.o_category_id,
         q.o_label,
         q.o_description,
         q.o_icon_name,
         q.o_keyboard_shortcut,
         q.o_sort_order,
         q.o_resolved_id,
         q.o_is_version,
         q.o_is_behind,
         q.o_agent_id,
         q.o_agent_version_id,
         q.o_current_version,
         q.o_use_latest,
         q.o_enabled_features,
         q.o_scope_mappings,
         q.o_context_mappings,
         q.o_display_mode,
         q.o_allow_chat,
         q.o_auto_run,
         q.o_show_variable_panel,
         q.o_variables_panel_style,
         q.o_show_definition_messages,
         q.o_show_definition_message_content,
         q.o_hide_reasoning,
         q.o_hide_tool_results,
         q.o_show_pre_execution_gate,
         q.o_pre_execution_message,
         q.o_bypass_gate_seconds,
         q.o_default_user_input,
         q.o_default_variables,
         q.o_context_overrides,
         q.o_llm_overrides,
         q.o_shortcut_user_id,
         q.o_shortcut_org_id,
         CASE WHEN ok.ok THEN q.o_agent_name END,
         q.o_agent_variable_definitions,
         q.o_agent_context_policies
    FROM q LEFT JOIN ok ON ok.aid = q.o_agent_id
   ORDER BY q.rn__;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_for_context(p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, shortcut_project_id uuid, shortcut_task_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_policies jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  -- rca5d_g: the agent each returned shortcut runs is asked of the kernel — once per DISTINCT agent
  -- in the result — and its name is null when the caller may not open it. The shortcut, its label and
  -- the agent id stay (running it is the server's own question). Order is the inner query's order.
  WITH q AS MATERIALIZED (
    SELECT row_number() OVER () AS rn__, t.*
      FROM (
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
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.name
         ELSE av.name END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.variable_definitions
         ELSE av.variable_definitions END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_policies
         ELSE av.context_policies END
  FROM agent.shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id AND a.deleted_at IS NULL
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
    ORDER BY x.created_at LIMIT 1
  ) st ON true
  WHERE s.is_active = true
    AND (
      -- RC-A5d (rca5d_c): the project / task a shortcut is attached to is asked (DD-205): naming a
      -- record you may not open lists none of its shortcuts (their labels and agent names leaked).
      (p_project_id IS NOT NULL AND sp.target_id = p_project_id AND iam.assoc_side_readable('project', sp.target_id))
      OR (p_task_id IS NOT NULL AND st.target_id = p_task_id AND iam.assoc_side_readable('task', st.target_id))
      OR EXISTS (
        SELECT 1 FROM iam.permissions p
        WHERE p.resource_type = 'agent_shortcut'
          AND p.resource_id = s.id
          AND (
            p.granted_to_user_id = (select auth.uid())
            OR p.granted_to_organization_id IN (
              SELECT organization_id FROM iam.organization_member WHERE user_id = (select auth.uid())
            )
          )
      )
    )
  ORDER BY s.category_id, s.sort_order
      ) AS t(o_shortcut_id, o_category_id, o_label, o_description, o_icon_name, o_keyboard_shortcut, o_sort_order, o_resolved_id, o_is_version, o_is_behind, o_agent_id, o_agent_version_id, o_current_version, o_use_latest, o_enabled_features, o_scope_mappings, o_context_mappings, o_display_mode, o_allow_chat, o_auto_run, o_show_variable_panel, o_variables_panel_style, o_show_definition_messages, o_show_definition_message_content, o_hide_reasoning, o_hide_tool_results, o_show_pre_execution_gate, o_pre_execution_message, o_bypass_gate_seconds, o_default_user_input, o_default_variables, o_context_overrides, o_llm_overrides, o_shortcut_user_id, o_shortcut_org_id, o_shortcut_project_id, o_shortcut_task_id, o_agent_name, o_agent_variable_definitions, o_agent_context_policies)
  ), ok AS (
    SELECT d.aid, iam.has_access('agent', d.aid, 'viewer'::public.permission_level) AS ok
      FROM (SELECT DISTINCT q.o_agent_id AS aid FROM q WHERE q.o_agent_id IS NOT NULL) d
  )
  SELECT q.o_shortcut_id,
         q.o_category_id,
         q.o_label,
         q.o_description,
         q.o_icon_name,
         q.o_keyboard_shortcut,
         q.o_sort_order,
         q.o_resolved_id,
         q.o_is_version,
         q.o_is_behind,
         q.o_agent_id,
         q.o_agent_version_id,
         q.o_current_version,
         q.o_use_latest,
         q.o_enabled_features,
         q.o_scope_mappings,
         q.o_context_mappings,
         q.o_display_mode,
         q.o_allow_chat,
         q.o_auto_run,
         q.o_show_variable_panel,
         q.o_variables_panel_style,
         q.o_show_definition_messages,
         q.o_show_definition_message_content,
         q.o_hide_reasoning,
         q.o_hide_tool_results,
         q.o_show_pre_execution_gate,
         q.o_pre_execution_message,
         q.o_bypass_gate_seconds,
         q.o_default_user_input,
         q.o_default_variables,
         q.o_context_overrides,
         q.o_llm_overrides,
         q.o_shortcut_user_id,
         q.o_shortcut_org_id,
         q.o_shortcut_project_id,
         q.o_shortcut_task_id,
         CASE WHEN ok.ok THEN q.o_agent_name END,
         q.o_agent_variable_definitions,
         q.o_agent_context_policies
    FROM q LEFT JOIN ok ON ok.aid = q.o_agent_id
   ORDER BY q.rn__;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_user_shortcuts()
 RETURNS TABLE(id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, category_id uuid, category_label text, agent_id uuid, agent_name text, agent_version_id uuid, use_latest boolean, scope_type text, scope_name text, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  return query
  -- rca5d_g: the agent each returned shortcut runs is asked of the kernel — once per DISTINCT agent
  -- in the result — and its name is null when the caller may not open it. The shortcut, its label and
  -- the agent id stay (running it is the server's own question). Order is the inner query's order.
  WITH q AS MATERIALIZED (
    SELECT row_number() OVER () AS rn__, t.*
      FROM (
  select
    s.id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.category_id, sc.name,
    s.agent_id, a.name, s.agent_version_id, s.use_latest,
    (case when st.target_id is not null then 'task' when sp.target_id is not null then 'project'
          when s.organization_id is not null then 'organization' when s.created_by is not null then 'personal'
          else 'system' end)::text,
    (case when st.target_id is not null then (select t.title from workspace.tasks t where t.id = st.target_id and iam.assoc_side_readable('task', t.id))
          when sp.target_id is not null then (select p.name from workspace.projects p where p.id = sp.target_id and iam.assoc_side_readable('project', p.id))
          when s.organization_id is not null then (select o.name from iam.organizations o where o.id = s.organization_id)
          when s.created_by is not null then 'Personal' else 'System' end)::text,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
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
  left join lateral (
    select x.target_id from platform.associations_live x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'project'
    order by x.created_at limit 1
  ) sp on true
  left join lateral (
    select x.target_id from platform.associations_live x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'task'
    order by x.created_at limit 1
  ) st on true
  where s.created_by = v_uid
     or s.organization_id in (select om.organization_id from iam.organization_member om
        where om.user_id = v_uid and om.role in ('owner','admin'))
     or sp.target_id in (select m.container_id from iam.memberships m
        where m.container_type='project' and m.user_id = v_uid and m.deleted_at is null and m.role in ('owner','admin'))
  order by case when s.created_by is not null then 0 when s.organization_id is not null then 1
                when sp.target_id is not null then 2 when st.target_id is not null then 3 else 4 end,
           s.sort_order, s.label
      ) AS t(o_id, o_label, o_description, o_icon_name, o_keyboard_shortcut, o_sort_order, o_category_id, o_category_label, o_agent_id, o_agent_name, o_agent_version_id, o_use_latest, o_scope_type, o_scope_name, o_user_id, o_organization_id, o_project_id, o_task_id, o_enabled_features, o_scope_mappings, o_context_mappings, o_display_mode, o_allow_chat, o_auto_run, o_show_variable_panel, o_variables_panel_style, o_show_definition_messages, o_show_definition_message_content, o_hide_reasoning, o_hide_tool_results, o_show_pre_execution_gate, o_pre_execution_message, o_bypass_gate_seconds, o_default_user_input, o_default_variables, o_context_overrides, o_llm_overrides, o_is_active, o_created_at, o_updated_at)
  ), ok AS (
    SELECT d.aid, iam.has_access('agent', d.aid, 'viewer'::public.permission_level) AS ok
      FROM (SELECT DISTINCT q.o_agent_id AS aid FROM q WHERE q.o_agent_id IS NOT NULL) d
  )
  SELECT q.o_id,
         q.o_label,
         q.o_description,
         q.o_icon_name,
         q.o_keyboard_shortcut,
         q.o_sort_order,
         q.o_category_id,
         q.o_category_label,
         q.o_agent_id,
         CASE WHEN ok.ok THEN q.o_agent_name END,
         q.o_agent_version_id,
         q.o_use_latest,
         q.o_scope_type,
         q.o_scope_name,
         q.o_user_id,
         q.o_organization_id,
         q.o_project_id,
         q.o_task_id,
         q.o_enabled_features,
         q.o_scope_mappings,
         q.o_context_mappings,
         q.o_display_mode,
         q.o_allow_chat,
         q.o_auto_run,
         q.o_show_variable_panel,
         q.o_variables_panel_style,
         q.o_show_definition_messages,
         q.o_show_definition_message_content,
         q.o_hide_reasoning,
         q.o_hide_tool_results,
         q.o_show_pre_execution_gate,
         q.o_pre_execution_message,
         q.o_bypass_gate_seconds,
         q.o_default_user_input,
         q.o_default_variables,
         q.o_context_overrides,
         q.o_llm_overrides,
         q.o_is_active,
         q.o_created_at,
         q.o_updated_at
    FROM q LEFT JOIN ok ON ok.aid = q.o_agent_id
   ORDER BY q.rn__;
end;
$function$;
