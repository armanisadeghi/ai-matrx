-- context_menu_view_emit_block_type.sql
-- Render-blocks canonicalization follow-up (2026-08-08): agent.context_menu_view
-- reads skill.render_definition but did not emit the classification columns the
-- canonicalized table now carries. Add block_type (render_kind|xml|markdown),
-- skill_id, and visibility to each content_block item so unified-menu hydration
-- (fetchUnifiedMenu -> renderDefinitionsMerged) carries the full row instead of
-- relying on the frontend merge to preserve fields the wire didn't send.
-- Only the block_items CTE changes; column list/order of the view is unchanged.

CREATE OR REPLACE VIEW agent.context_menu_view AS
 WITH shortcut_items AS (
         SELECT sc_1.id AS category_id,
            sc_1.placement_type,
            COALESCE(json_agg(json_build_object('type', 'agent_shortcut', 'id', s.id, 'category_id', s.category_id, 'label', s.label, 'description', s.description, 'icon_name', s.icon_name, 'sort_order', s.sort_order, 'keyboard_shortcut', s.keyboard_shortcut, 'surface_name', s.surface_name, 'value_mappings', s.value_mappings, 'scope_mappings', s.scope_mappings, 'context_mappings', s.context_mappings, 'enabled_features', s.enabled_features, 'display_mode', s.display_mode, 'auto_run', s.auto_run, 'allow_chat', s.allow_chat, 'show_variable_panel', s.show_variable_panel, 'variables_panel_style', s.variables_panel_style, 'show_definition_messages', s.show_definition_messages, 'show_definition_message_content', s.show_definition_message_content, 'hide_reasoning', s.hide_reasoning, 'hide_tool_results', s.hide_tool_results, 'response_density', s.response_density, 'show_pre_execution_gate', s.show_pre_execution_gate, 'pre_execution_message', s.pre_execution_message, 'bypass_gate_seconds', s.bypass_gate_seconds, 'default_user_input', s.default_user_input, 'default_variables', s.default_variables, 'context_overrides', s.context_overrides, 'llm_overrides', s.llm_overrides, 'json_extraction', s.json_extraction, 'agent_id', s.agent_id, 'agent_version_id', s.agent_version_id, 'use_latest', s.use_latest, 'is_active', s.is_active, 'user_id', s.user_id, 'organization_id', s.organization_id, 'project_id', s.project_id, 'task_id', s.task_id, 'scope',
                CASE
                    WHEN s.user_id IS NOT NULL THEN 'user'::text
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
