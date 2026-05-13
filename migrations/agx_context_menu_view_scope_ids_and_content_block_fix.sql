-- ---------------------------------------------------------------------------
-- agx_context_menu_view — scope-fix + content-block type fix
-- ---------------------------------------------------------------------------
-- Two bugs collapse into one migration:
--
-- 1.  The view emitted a derived `scope` discriminator ('user' | 'organization'
--     | 'project' | 'task' | 'global') but did NOT include the actual
--     `user_id`, `organization_id`, `project_id`, `task_id` UUID columns on
--     the JSON object for any of: categories, shortcut items, content-block
--     items. The client (`fetchUnifiedMenu` thunk → `extractScopeFromUnifiedItem`)
--     reads those id fields directly. They were `undefined` → coerced to
--     `null`, so every record in Redux ended up with `userId/orgId/projectId/
--     taskId = null` and was classified as `global`. Effect: every
--     scope-aware selector (`selectUserOwnedShortcuts`, `selectShortcutsByScope`,
--     `selectOrgShortcuts`, `selectCategoryTreeByScope`, dedupe-by-precedence)
--     returned wrong results. Personal and org shortcuts effectively
--     disappeared from the context menu.
--
-- 2.  Block items were emitted with `type: 'render_block'` but the client
--     filters with `type === 'content_block'`. Every content-block item
--     was silently dropped at fetch time.
--
-- The fix: emit the four scope id columns on every JSON object that carries
-- a derived scope, and switch the block item discriminator to
-- `'content_block'`. The derived `scope` string is kept (some legacy
-- consumers still read it) but the id columns are now the source of truth
-- on the client side.
--
-- The source tables are unchanged. This is a pure view rewrite, idempotent
-- (CREATE OR REPLACE) and reversible by re-running the previous migration.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.agx_context_menu_view AS
WITH shortcut_items AS (
  SELECT
    sc_1.id AS category_id,
    sc_1.placement_type,
    COALESCE(
      json_agg(
        json_build_object(
          'type', 'agent_shortcut',
          'id', s.id,
          'category_id', s.category_id,
          'label', s.label,
          'description', s.description,
          'icon_name', s.icon_name,
          'sort_order', s.sort_order,
          'keyboard_shortcut', s.keyboard_shortcut,
          'scope_mappings', s.scope_mappings,
          'context_mappings', s.context_mappings,
          'enabled_features', s.enabled_features,
          'display_mode', s.display_mode,
          'auto_run', s.auto_run,
          'allow_chat', s.allow_chat,
          'show_variable_panel', s.show_variable_panel,
          'variables_panel_style', s.variables_panel_style,
          'show_definition_messages', s.show_definition_messages,
          'show_definition_message_content', s.show_definition_message_content,
          'hide_reasoning', s.hide_reasoning,
          'hide_tool_results', s.hide_tool_results,
          'response_density', s.response_density,
          'show_pre_execution_gate', s.show_pre_execution_gate,
          'pre_execution_message', s.pre_execution_message,
          'bypass_gate_seconds', s.bypass_gate_seconds,
          'default_user_input', s.default_user_input,
          'default_variables', s.default_variables,
          'context_overrides', s.context_overrides,
          'llm_overrides', s.llm_overrides,
          'json_extraction', s.json_extraction,
          'agent_id', s.agent_id,
          'agent_version_id', s.agent_version_id,
          'use_latest', s.use_latest,
          'is_active', s.is_active,
          -- Scope id columns — THE FIX. The client reads these directly.
          'user_id', s.user_id,
          'organization_id', s.organization_id,
          'project_id', s.project_id,
          'task_id', s.task_id,
          -- Kept for legacy callers; superseded by the id columns above.
          'scope',
            CASE
              WHEN s.user_id IS NOT NULL THEN 'user'::text
              WHEN s.organization_id IS NOT NULL THEN 'organization'::text
              WHEN s.project_id IS NOT NULL THEN 'project'::text
              WHEN s.task_id IS NOT NULL THEN 'task'::text
              ELSE 'global'::text
            END,
          'agent',
            CASE
              WHEN s.agent_id IS NOT NULL THEN json_build_object(
                'id', s.agent_id,
                'name', COALESCE(v.name, a.name),
                'description', a.description,
                'variable_definitions',
                  CASE
                    WHEN s.use_latest = false AND v.id IS NOT NULL THEN v.variable_definitions
                    ELSE a.variable_definitions
                  END,
                'context_slots',
                  CASE
                    WHEN s.use_latest = false AND v.id IS NOT NULL THEN v.context_slots
                    ELSE a.context_slots
                  END
              )
              ELSE NULL::json
            END
        ) ORDER BY s.sort_order
      ) FILTER (WHERE s.id IS NOT NULL),
      '[]'::json
    ) AS items
  FROM shortcut_categories sc_1
    LEFT JOIN agx_shortcut s ON s.category_id = sc_1.id AND s.is_active = true
    LEFT JOIN agx_agent a ON a.id = s.agent_id
    LEFT JOIN agx_version v ON v.id = s.agent_version_id
  WHERE sc_1.is_active = true
  GROUP BY sc_1.id, sc_1.placement_type
),
block_items AS (
  SELECT
    sc_1.id AS category_id,
    sc_1.placement_type,
    COALESCE(
      json_agg(
        json_build_object(
          -- Discriminator FIX: client filters with type === 'content_block'.
          'type', 'content_block',
          'id', rd.id,
          'category_id', rd.category_id,
          'label', rd.label,
          'description', rd.description,
          'icon_name', rd.icon_name,
          'sort_order', rd.sort_order,
          'template', rd.template,
          'block_id', rd.block_id,
          'is_active', rd.is_active,
          -- Scope id columns
          'user_id', rd.user_id,
          'organization_id', rd.organization_id,
          'project_id', rd.project_id,
          'task_id', rd.task_id,
          -- Legacy derived discriminator
          'scope',
            CASE
              WHEN rd.user_id IS NOT NULL THEN 'user'::text
              WHEN rd.organization_id IS NOT NULL THEN 'organization'::text
              WHEN rd.project_id IS NOT NULL THEN 'project'::text
              WHEN rd.task_id IS NOT NULL THEN 'task'::text
              ELSE 'global'::text
            END
        ) ORDER BY rd.sort_order
      ) FILTER (WHERE rd.id IS NOT NULL),
      '[]'::json
    ) AS items
  FROM shortcut_categories sc_1
    LEFT JOIN skl_render_definitions rd ON rd.category_id = sc_1.id AND rd.is_active = true
  WHERE sc_1.is_active = true
  GROUP BY sc_1.id, sc_1.placement_type
)
SELECT
  sc.placement_type,
  json_agg(
    json_build_object(
      'category', json_build_object(
        'id', sc.id,
        'placement_type', sc.placement_type,
        'parent_category_id', sc.parent_category_id,
        'label', sc.label,
        'description', sc.description,
        'icon_name', sc.icon_name,
        'color', sc.color,
        'sort_order', sc.sort_order,
        'is_active', sc.is_active,
        'metadata', sc.metadata,
        'enabled_features', sc.enabled_features,
        -- Scope id columns on the category
        'user_id', sc.user_id,
        'organization_id', sc.organization_id,
        'project_id', sc.project_id,
        'task_id', sc.task_id,
        'scope',
          CASE
            WHEN sc.user_id IS NOT NULL THEN 'user'::text
            WHEN sc.organization_id IS NOT NULL THEN 'organization'::text
            WHEN sc.project_id IS NOT NULL THEN 'project'::text
            WHEN sc.task_id IS NOT NULL THEN 'task'::text
            ELSE 'global'::text
          END
      ),
      'items', (
        SELECT COALESCE(
          json_agg(combined.elem ORDER BY ((combined.elem ->> 'sort_order'::text)::integer)),
          '[]'::json
        )
        FROM (
          SELECT json_array_elements(si.items) AS elem WHERE si.items::text <> '[]'::text
          UNION ALL
          SELECT json_array_elements(bi.items) AS elem WHERE bi.items::text <> '[]'::text
        ) combined
      )
    ) ORDER BY sc.sort_order
  ) AS categories_flat
FROM shortcut_categories sc
  LEFT JOIN shortcut_items si ON si.category_id = sc.id
  LEFT JOIN block_items bi ON bi.category_id = sc.id
WHERE sc.is_active = true
GROUP BY sc.placement_type;
