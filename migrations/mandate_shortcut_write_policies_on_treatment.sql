-- Write policies move onto the TREATMENT (workflow-mandate program, census #20).
--
-- Before: a shortcut's per-write-target apply-policy overrides rode inside the
-- `value_mappings` JSONB under a reserved `__write_policies` key, because
-- `agent.shortcut` had no other home for them. After 6.6 it does: a shortcut IS
-- a discovered mandate + a widget treatment + a pin binding, and a write policy
-- is treatment (THE-MODEL law 4 — treatment is the offered UI/interaction),
-- never a consumption entry.
--
-- This migration gives the compat surface the seam:
--   * `mandate.shortcut_treatment_config` carries `write_policies` into
--     `mandate.treatment.config`;
--   * `mandate.vw_shortcut` gains a first-class `write_policies` column
--     (readable AND writable — the INSTEAD OF trigger already round-trips the
--     whole NEW row through `shortcut_treatment_config`);
--   * the view's `value_mappings` stops carrying the reserved key, so there is
--     exactly ONE home for a policy.
--
-- Zero rows carry the legacy key today (verified live: 0/208 `agent.shortcut`,
-- 0/314 `mandate.binding`), so this is additive with nothing to backfill.
-- No new function and no new client-callable SECURITY DEFINER surface: both
-- objects are CREATE OR REPLACE of existing INVOKER-rights objects, so grants
-- and the `platform.client_callable_door` register are untouched.
--
-- Client half: `lib/supabase/shortcutStorage.ts` routes the read/write, and
-- `features/agents/redux/agent-shortcuts/converters.ts` speaks the column.
-- Idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION mandate.shortcut_treatment_config(p_row jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT
    jsonb_build_object(
      'schema_version', 1,
      'display_mode', coalesce(p_row->>'display_mode', 'modal-full'),
      'allow_chat', coalesce((p_row->>'allow_chat')::boolean, true),
      'auto_run', coalesce((p_row->>'auto_run')::boolean, true),
      'response_density', coalesce(p_row->>'response_density', 'comfortable'),
      'variables', jsonb_build_object(
        'show_panel', coalesce((p_row->>'show_variable_panel')::boolean, false),
        'panel_style', coalesce(p_row->>'variables_panel_style', 'inline')),
      'reveal', jsonb_build_object(
        'show_definition_messages', coalesce((p_row->>'show_definition_messages')::boolean, false),
        'show_definition_message_content', coalesce((p_row->>'show_definition_message_content')::boolean, false),
        'hide_reasoning', coalesce((p_row->>'hide_reasoning')::boolean, false),
        'hide_tool_results', coalesce((p_row->>'hide_tool_results')::boolean, false)),
      'gate', jsonb_build_object(
          'enabled', coalesce((p_row->>'show_pre_execution_gate')::boolean, false),
          'bypass_seconds', coalesce((p_row->>'bypass_gate_seconds')::int, 3))
        || CASE WHEN p_row->>'pre_execution_message' IS NOT NULL
                THEN jsonb_build_object('message', p_row->>'pre_execution_message')
                ELSE '{}'::jsonb END,
      'seeds', '{}'::jsonb
        || CASE WHEN p_row->>'default_user_input' IS NOT NULL
                THEN jsonb_build_object('default_user_input', p_row->>'default_user_input')
                ELSE '{}'::jsonb END
        || CASE WHEN jsonb_typeof(p_row->'default_variables') IS DISTINCT FROM NULL
                     AND jsonb_typeof(p_row->'default_variables') <> 'null'
                THEN jsonb_build_object('default_variables', p_row->'default_variables')
                ELSE '{}'::jsonb END
        || CASE WHEN jsonb_typeof(p_row->'context_overrides') IS DISTINCT FROM NULL
                     AND jsonb_typeof(p_row->'context_overrides') <> 'null'
                THEN jsonb_build_object('context_overrides', p_row->'context_overrides')
                ELSE '{}'::jsonb END
        || CASE WHEN jsonb_typeof(p_row->'llm_overrides') IS DISTINCT FROM NULL
                     AND jsonb_typeof(p_row->'llm_overrides') <> 'null'
                THEN jsonb_build_object('llm_overrides', p_row->'llm_overrides')
                ELSE '{}'::jsonb END,
      'menu', jsonb_build_object(
          'sort_order', coalesce((p_row->>'sort_order')::int, 0),
          'enabled_features', coalesce(NULLIF(p_row->'enabled_features', 'null'::jsonb), '["general"]'::jsonb))
        || CASE WHEN p_row->>'category_id' IS NOT NULL
                THEN jsonb_build_object('category_id', p_row->>'category_id')
                ELSE '{}'::jsonb END
        || CASE WHEN p_row->>'surface_name' IS NOT NULL
                THEN jsonb_build_object('surface_name', p_row->>'surface_name')
                ELSE '{}'::jsonb END
    )
    || CASE WHEN p_row->>'icon_name' IS NOT NULL
            THEN jsonb_build_object('icon_name', p_row->>'icon_name')
            ELSE '{}'::jsonb END
    || CASE WHEN p_row->>'keyboard_shortcut' IS NOT NULL
            THEN jsonb_build_object('keyboard_shortcut', p_row->>'keyboard_shortcut')
            ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(p_row->'json_extraction') IS DISTINCT FROM NULL
                 AND jsonb_typeof(p_row->'json_extraction') <> 'null'
            THEN jsonb_build_object('json_extraction', p_row->'json_extraction')
            ELSE '{}'::jsonb END
    -- Census #20: policies are treatment. An empty map stores nothing, so a
    -- shortcut with no overrides keeps a config byte-identical to before.
    || CASE WHEN jsonb_typeof(p_row->'write_policies') = 'object'
                 AND p_row->'write_policies' <> '{}'::jsonb
            THEN jsonb_build_object('write_policies', p_row->'write_policies')
            ELSE '{}'::jsonb END
$function$;

CREATE OR REPLACE VIEW mandate.vw_shortcut AS
 SELECT COALESCE((d.metadata ->> 'legacy_id'::text)::uuid, d.id) AS id,
    ((t.config -> 'menu'::text) ->> 'category_id'::text)::uuid AS category_id,
    d.label,
    d.description,
    t.config ->> 'icon_name'::text AS icon_name,
    t.config ->> 'keyboard_shortcut'::text AS keyboard_shortcut,
    COALESCE(((t.config -> 'menu'::text) ->> 'sort_order'::text)::integer, 0) AS sort_order,
    b.holder_id AS agent_id,
    COALESCE((t.config -> 'menu'::text) -> 'enabled_features'::text, '["general"]'::jsonb) AS enabled_features,
    b.metadata -> 'scope_mappings'::text AS scope_mappings,
    COALESCE(t.config ->> 'display_mode'::text, 'modal-full'::text) AS display_mode,
    COALESCE((t.config ->> 'allow_chat'::text)::boolean, true) AS allow_chat,
    COALESCE((t.config ->> 'auto_run'::text)::boolean, true) AS auto_run,
    COALESCE(((t.config -> 'gate'::text) ->> 'enabled'::text)::boolean, false) AS show_pre_execution_gate,
    d.is_enabled AS is_active,
    COALESCE((d.metadata ->> 'shortcut_created_at'::text)::timestamp with time zone, d.created_at) AS created_at,
    COALESCE((d.metadata ->> 'shortcut_updated_at'::text)::timestamp with time zone, d.updated_at) AS updated_at,
    d.organization_id,
    COALESCE(b.holder_version_id, (b.metadata ->> 'legacy_agent_version_id'::text)::uuid) AS agent_version_id,
    COALESCE((b.metadata ->> 'legacy_use_latest'::text)::boolean, b.holder_version_id IS NULL) AS use_latest,
    COALESCE(((t.config -> 'variables'::text) ->> 'show_panel'::text)::boolean, false) AS show_variable_panel,
    COALESCE((t.config -> 'variables'::text) ->> 'panel_style'::text, 'inline'::text) AS variables_panel_style,
    COALESCE(((t.config -> 'reveal'::text) ->> 'show_definition_messages'::text)::boolean, false) AS show_definition_messages,
    COALESCE(((t.config -> 'reveal'::text) ->> 'show_definition_message_content'::text)::boolean, false) AS show_definition_message_content,
    COALESCE(((t.config -> 'reveal'::text) ->> 'hide_reasoning'::text)::boolean, false) AS hide_reasoning,
    COALESCE(((t.config -> 'reveal'::text) ->> 'hide_tool_results'::text)::boolean, false) AS hide_tool_results,
    (t.config -> 'gate'::text) ->> 'message'::text AS pre_execution_message,
    COALESCE(((t.config -> 'gate'::text) ->> 'bypass_seconds'::text)::integer, 3) AS bypass_gate_seconds,
    (t.config -> 'seeds'::text) ->> 'default_user_input'::text AS default_user_input,
    (t.config -> 'seeds'::text) -> 'default_variables'::text AS default_variables,
    (t.config -> 'seeds'::text) -> 'context_overrides'::text AS context_overrides,
    (t.config -> 'seeds'::text) -> 'llm_overrides'::text AS llm_overrides,
    b.metadata -> 'context_mappings'::text AS context_mappings,
    COALESCE(t.config ->> 'response_density'::text, 'comfortable'::text) AS response_density,
    t.config -> 'json_extraction'::text AS json_extraction,
    (t.config -> 'menu'::text) ->> 'surface_name'::text AS surface_name,
    -- Consumption only. The reserved `__write_policies` key is stripped on the
    -- way out: policies have their own column below (census #20).
    b.consumption_map - '__write_policies'::text AS value_mappings,
    (d.metadata ->> 'shortcut_created_by'::text)::uuid AS created_by,
    (d.metadata ->> 'shortcut_updated_by'::text)::uuid AS updated_by,
    COALESCE((d.metadata ->> 'shortcut_version'::text)::integer, d.version) AS version,
    d.visibility,
    d.deleted_at,
    COALESCE(d.metadata -> 'shortcut_metadata'::text, '{}'::jsonb) AS metadata,
    d.id AS mandate_id,
    d.mandate_key,
    COALESCE(t.config -> 'write_policies'::text, '{}'::jsonb) AS write_policies
   FROM mandate.definition d
     JOIN mandate.treatment t ON t.mandate_id = d.id AND t.tier = 'widget'::text AND t.is_default AND t.deleted_at IS NULL
     JOIN mandate.binding b ON b.mandate_id = d.id AND (b.metadata ->> 'role'::text) = 'shortcut_pin'::text AND b.deleted_at IS NULL
  WHERE d.metadata ? 'shortcut_compat'::text;

COMMIT;
