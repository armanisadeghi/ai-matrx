-- RC-A5d round 2, last door — THE AGENT A SHORTCUT (OR A MANDATE RUNG) NAMES IS ASKED TOO.
-- Register row RC-A5d. Follows rca5d_c (the shortcut loaders asked about the project/task, not the agent).
--
-- THE DEFECT (measured on production 2026-09-26 as test@test.com, rolled back): agx_get_shortcuts_initial
-- returned 81 shortcuts to a plain member; 79 of them run one agent in an organization she is not in, and
-- she read that agent's NAME. agx_get_shortcuts_for_context(_m) and agx_get_user_shortcuts(_m) return the
-- same column unasked. agent_mandate_rungs (Agent Change Impact) asks about the mandate row and returned
-- 46 holder names and 57 lineage-path names of agents she may not open (other people's copies).
--
-- THE FIX: each door asks the per-row kernel ONCE PER DISTINCT AGENT it is about to name (a shortcut list
-- names ~3 agents; the kernel's whole-set form cost 80–230 ms a call and was rejected) and nulls the name
-- it may not show. The shortcut, its label and the agent id stay — running it is the server's own
-- question. agent_mandate_rungs asks iam.has_access_for(v_uid, 'agent', …) for the person the read answers
-- for, after its own per-rung filter, and nulls holder_agent_name and each path entry's agentName.
-- Every body is the live body with the query wrapped; output columns and order unchanged.
-- Guard: aidream db/tests/test_definer_doors_ask_each_record.py. Suite: test_rca5d_definer_doors_ask_each_record.py.
-- Inverse: migrations/inverse/rca5d_g_shortcut_and_rung_agent_names_follow_the_agent_down.sql.
-- based-on: public.agx_get_shortcuts_for_context(uuid, uuid) a69f524c7045255d1db738663db3f0b6ef09b8e7b8e3c8a8ce46a1c6243fdaab
-- based-on: public.agx_get_shortcuts_for_context_m(uuid, uuid) 089e5d4a7166146e1b8c0a64a998da024c2ba62a9ea4c26b61697950197f1bb1
-- based-on: public.agx_get_shortcuts_initial() b36a125a09fa854b32c3567aaf8062d4202f552cedc9d27e03c5dc8948bf892b
-- based-on: public.agx_get_user_shortcuts() 1c0a6ae626888db367f4ec2e240f018bad5a00228622adefe5e22ff7c2037b24
-- based-on: public.agx_get_user_shortcuts_m() 715b9d7a512c50da60b94cf266838de5af3298e5fb8dc08845f8d57134059e03
-- based-on: public.agent_mandate_rungs(uuid[], boolean, uuid, integer) 691da8a344f0968f00f7bb998ee5ee3bb3775b779fe620f743b9031cdffb8234

set local lock_timeout = '2s';

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

CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_for_context_m(p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid)
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
  FROM mandate.vw_shortcut s
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

CREATE OR REPLACE FUNCTION public.agx_get_user_shortcuts_m()
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
  from mandate.vw_shortcut s
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

CREATE OR REPLACE FUNCTION public.agent_mandate_rungs(p_agent_ids uuid[], p_include_descendants boolean DEFAULT true, p_as_user uuid DEFAULT NULL::uuid, p_max_depth integer DEFAULT 16)
 RETURNS TABLE(root_agent_id uuid, holder_kind text, row_id uuid, mandate_id uuid, mandate_key text, holder_type text, holder_agent_id uuid, holder_agent_name text, principal_kind text, organization_id uuid, subject_user_id uuid, pinned_version_id uuid, lineage_depth integer, lineage_path jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'mandate', 'agent', 'iam', 'platform'
AS $function$
declare
  v_uid    uuid;
  v_claims jsonb;
begin
  if p_agent_ids is null or cardinality(p_agent_ids) = 0 then
    return;
  end if;

  -- Bounded input. A caller that wants the whole estate is asking a different question and should
  -- say so as its own item, not smuggle it through a 10,000-element array.
  if cardinality(p_agent_ids) > 500 then
    raise exception
      'public.agent_mandate_rungs: % agent ids requested; the cap is 500. Remedy: page the list.',
      cardinality(p_agent_ids)
      using errcode = '22023';
  end if;

  if p_max_depth is null or p_max_depth < 0 or p_max_depth > 64 then
    raise exception
      'public.agent_mandate_rungs: p_max_depth must be between 0 and 64 (got %).', p_max_depth
      using errcode = '22023';
  end if;

  -- ── Who is asking (R26) ────────────────────────────────────────────────────
  v_uid := auth.uid();
  if v_uid is null then
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    -- Claims present but not the service role = an `anon` PostgREST request. Refuse.
    if v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
      raise exception
        'public.agent_mandate_rungs: no signed-in caller. Every row is scoped per-caller, so there '
        'is no anonymous answer. Remedy: call it from a signed-in session.'
        using errcode = '28000';
    end if;
    -- No claims at all = a direct database connection (aidream's pool, psql), or the service role.
    -- Both must name the person the read answers for; neither gets an unscoped sweep.
    if p_as_user is null then
      raise exception
        'public.agent_mandate_rungs: p_as_user is required when there is no signed-in caller — '
        'every row is scoped per-caller (R26, Agent Change Impact). Remedy: pass the id of the '
        'user this read answers for.'
        using errcode = '22023';
    end if;
    v_uid := p_as_user;
  end if;

  return query
  with recursive lineage as (
    -- The edited agents themselves.
    select
      a.id                as agent_id,
      a.name              as agent_name,
      a.id                as root_id,
      0                   as depth,
      array[a.id]         as visited,
      jsonb_build_array(jsonb_build_object(
        'agentId', a.id, 'agentName', a.name, 'relation', 'self'
      ))                  as path
    from agent.definition a
    where a.id = any(p_agent_ids)
      and a.deleted_at is null

    union all

    -- …and everything transitively duplicated from them. `c.source_agent_id` is a single parent,
    -- so this is a forest, not a DAG: no row is reached twice under one root. The visited guard is
    -- for a future cycle, not for today's data.
    select
      c.id,
      c.name,
      l.root_id,
      l.depth + 1,
      l.visited || c.id,
      l.path || jsonb_build_object(
        'agentId', c.id, 'agentName', c.name, 'relation', 'duplicated_from'
      )
    from lineage l
    join agent.definition c on c.source_agent_id = l.agent_id
    where p_include_descendants
      and c.deleted_at is null
      and l.depth < p_max_depth
      and not (c.id = any(l.visited))
  ),
  -- MATERIALIZED is a deliberate optimisation fence: it makes it impossible for any future plan to
  -- evaluate the COST 10000 `has_access_for` against more rows than the lineage walk matched.
  -- It costs nothing measurable today (see the R20 note in this file's header). Keep it.
  matched as materialized (
    select
      l.root_id                                              as root_agent_id,
      'mandate_default'::text                                as holder_kind,
      'mandate'::text                                        as access_token,
      d.id                                                   as row_id,
      d.id                                                   as mandate_id,
      d.mandate_key                                          as mandate_key,
      d.default_holder_type                                  as holder_type,
      coalesce(d.default_holder_id, dv.agent_id)             as holder_agent_id,
      l.agent_name                                           as holder_agent_name,
      'org'::text                                            as principal_kind,
      d.organization_id                                      as organization_id,
      null::uuid                                             as subject_user_id,
      d.default_holder_version_id                            as pinned_version_id,
      l.depth                                                as lineage_depth,
      l.path                                                 as lineage_path
    from lineage l
    -- A version-only pin (default_holder_id NULL, default_holder_version_id set) names its agent
    -- THROUGH the version. 36 live definitions were stored that way and got no verdict (2026-09-14).
    join mandate.definition d
      left join agent.definition_version dv on dv.id = d.default_holder_version_id
      on l.agent_id = coalesce(d.default_holder_id, dv.agent_id)
    where d.deleted_at is null

    union all

    select
      l.root_id,
      'binding'::text,
      'mandate_binding'::text,
      b.id,
      b.mandate_id,
      md.mandate_key,
      b.holder_type,
      coalesce(b.holder_id, bv.agent_id),
      l.agent_name,
      b.principal_type,
      b.organization_id,
      b.subject_user_id,
      b.holder_version_id,
      l.depth,
      l.path
    from lineage l
    join mandate.binding b
      left join agent.definition_version bv on bv.id = b.holder_version_id
      on l.agent_id = coalesce(b.holder_id, bv.agent_id)
    left join mandate.definition md on md.id = b.mandate_id
    where b.deleted_at is null
  ),
  visible as materialized (
    select m.* from matched m
     where iam.has_access_for(v_uid, m.access_token, m.row_id, 'viewer'::public.permission_level)
  ),
  -- rca5d_g: every agent a visible rung NAMES (the holder, and each agent on its lineage path) is asked
  -- for the person the read answers for — once per distinct agent. A copy somebody else made that she
  -- may not open keeps its id and its rung, never its name.
  named as (
    select d.aid, iam.has_access_for(v_uid, 'agent', d.aid, 'viewer'::public.permission_level) as ok
      from (select distinct (e ->> 'agentId')::uuid as aid
              from visible v cross join lateral jsonb_array_elements(v.lineage_path) e) d
  )
  select
    m.root_agent_id,
    m.holder_kind,
    m.row_id,
    m.mandate_id,
    m.mandate_key,
    m.holder_type,
    m.holder_agent_id,
    case when coalesce((select n.ok from named n where n.aid = m.holder_agent_id), false)
         then m.holder_agent_name end,
    m.principal_kind,
    m.organization_id,
    m.subject_user_id,
    m.pinned_version_id,
    m.lineage_depth,
    (select jsonb_agg(case when coalesce((select n.ok from named n where n.aid = (x.e ->> 'agentId')::uuid), false)
                           then x.e else x.e || jsonb_build_object('agentName', null) end order by x.o)
       from jsonb_array_elements(m.lineage_path) with ordinality as x(e, o))
  from visible m
  order by m.lineage_depth, m.mandate_key, m.holder_kind, m.row_id;
end;
$function$;
