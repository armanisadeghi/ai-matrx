-- based-on: mandate.vw_shortcut_write() 8c7f9b43c80c96dbc374dd1c80c70244d2a054fffcf9281db8e96dcff90717bf
-- Delete means archive (Arman, 2026-09-27) for agent shortcuts. Shortcuts live
-- as compat mandates behind the updatable view mandate.vw_shortcut.
--  1. The view's INSTEAD OF DELETE branch hard-deleted mandate.definition; it now
--     sets deleted_at, so every DELETE door on the view archives.
--  2. The view shows live shortcuts only (d.deleted_at IS NULL). Every reader —
--     the menu, context, user and admin RPCs, mandate.context_menu_view and the
--     client table reads — stops showing a shortcut the moment it is in Trash.
--     Restore goes through Trash on mandate.definition, never through this view.
--     Same columns, same order; security_invoker kept.

CREATE OR REPLACE FUNCTION mandate.vw_shortcut_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_def_id uuid;
  v_actor uuid;
  v_org uuid;
  v_key text;
  v_treatment_config jsonb;
  v_old_version int;
BEGIN
  v_actor := (SELECT auth.uid());

  IF TG_OP = 'DELETE' THEN
    -- Delete means archive (Arman, 2026-09-27): a DELETE through the view moves
    -- the shortcut's mandate to Trash; Trash restores it.
    UPDATE mandate.definition d SET deleted_at = now()
    WHERE d.metadata ? 'shortcut_compat'
      AND COALESCE((d.metadata->>'legacy_id')::uuid, d.id) = OLD.id
      AND d.deleted_at IS NULL;
    RETURN OLD;
  END IF;

  v_treatment_config := mandate.shortcut_treatment_config(to_jsonb(NEW));

  IF TG_OP = 'INSERT' THEN
    v_def_id := gen_random_uuid();
    v_org := NEW.organization_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'vw_shortcut insert needs an explicit organization_id. The personal-organization fallback was removed on 2026-09-19: the database never chooses a tenant. Set organization_id on the insert.'
        USING ERRCODE = '23502';
    END IF;
    v_key := mandate.generate_shortcut_mandate_key(NEW.label, NEW.surface_name);

    INSERT INTO mandate.definition (
      id, goal, goal_grounding, mandate_key, label, description,
      origin, input_source,
      default_holder_type, default_holder_id, default_holder_version_id,
      default_consumption_map,
      is_enabled, organization_id, visibility, deleted_at,
      created_by, updated_by, metadata
    ) VALUES (
      v_def_id,
      COALESCE(NULLIF(btrim(NEW.description), ''), NEW.label),
      'A', v_key, NEW.label, NEW.description,
      'user', 'known_values',
      'agent', NEW.agent_id,
      CASE WHEN COALESCE(NEW.use_latest, false) THEN NULL ELSE NEW.agent_version_id END,
      NEW.value_mappings,
      COALESCE(NEW.is_active, true), v_org,
      COALESCE(NEW.visibility, 'internal'::platform.visibility),
      NEW.deleted_at,
      COALESCE(NEW.created_by, v_actor), COALESCE(NEW.created_by, v_actor),
      jsonb_strip_nulls(jsonb_build_object(
        'shortcut_compat', true,
        'shortcut_created_by', COALESCE(NEW.created_by, v_actor),
        'shortcut_updated_by', COALESCE(NEW.updated_by, NEW.created_by, v_actor),
        'shortcut_created_at', now(),
        'shortcut_updated_at', now(),
        'shortcut_version', 1))
      || jsonb_build_object('shortcut_metadata', COALESCE(NEW.metadata, '{}'::jsonb))
      || CASE WHEN NEW.scope_mappings IS NOT NULL
              THEN jsonb_build_object('shortcut_scope_mappings', NEW.scope_mappings) ELSE '{}'::jsonb END
      || CASE WHEN NEW.context_mappings IS NOT NULL
              THEN jsonb_build_object('shortcut_context_mappings', NEW.context_mappings) ELSE '{}'::jsonb END
    );

    INSERT INTO mandate.treatment (
      mandate_id, tier, name, is_default, config,
      is_enabled, organization_id, visibility, created_by, updated_by, metadata
    ) VALUES (
      v_def_id, 'widget', NEW.label, true, v_treatment_config,
      true, v_org, COALESCE(NEW.visibility, 'internal'::platform.visibility),
      COALESCE(NEW.created_by, v_actor), COALESCE(NEW.created_by, v_actor),
      '{}'::jsonb
    );

    -- 1042: NO pin binding. A shortcut's answer for everybody is its mandate's
    -- own default (D39); the menu reads the definition, and a run resolves the
    -- mandate on the server (user -> org -> system default). A binding is a
    -- person's or an organization's choice, made through the binding door.

    NEW.id := v_def_id;
    RETURN NEW;
  END IF;

  SELECT d.id, COALESCE((d.metadata->>'shortcut_version')::int, d.version)
    INTO v_def_id, v_old_version
  FROM mandate.definition d
  WHERE d.metadata ? 'shortcut_compat'
    AND COALESCE((d.metadata->>'legacy_id')::uuid, d.id) = OLD.id;
  IF v_def_id IS NULL THEN
    RAISE EXCEPTION 'vw_shortcut update: no compat mandate behind shortcut id %', OLD.id;
  END IF;

  UPDATE mandate.definition d SET
    goal = COALESCE(NULLIF(btrim(NEW.description), ''), NEW.label),
    label = NEW.label,
    description = NEW.description,
    default_holder_id = NEW.agent_id,
    default_holder_version_id =
      CASE WHEN COALESCE(NEW.use_latest, false) THEN NULL ELSE NEW.agent_version_id END,
    default_consumption_map = NEW.value_mappings,
    is_enabled = COALESCE(NEW.is_active, true),
    visibility = COALESCE(NEW.visibility, d.visibility),
    deleted_at = NEW.deleted_at,
    metadata = (d.metadata - 'shortcut_scope_mappings' - 'shortcut_context_mappings')
      || jsonb_strip_nulls(jsonb_build_object(
           'shortcut_updated_by', v_actor,
           'shortcut_updated_at', now(),
           'shortcut_version', v_old_version + 1))
      || jsonb_build_object('shortcut_metadata', COALESCE(NEW.metadata, '{}'::jsonb))
      || CASE WHEN NEW.scope_mappings IS NOT NULL
              THEN jsonb_build_object('shortcut_scope_mappings', NEW.scope_mappings) ELSE '{}'::jsonb END
      || CASE WHEN NEW.context_mappings IS NOT NULL
              THEN jsonb_build_object('shortcut_context_mappings', NEW.context_mappings) ELSE '{}'::jsonb END
  WHERE d.id = v_def_id;

  UPDATE mandate.treatment t SET
    name = NEW.label,
    config = v_treatment_config
  WHERE t.mandate_id = v_def_id AND t.tier = 'widget' AND t.is_default AND t.deleted_at IS NULL;

  -- A personal shortcut still carries its owner's user-rung pin (pre-1042 rows).
  -- It is kept IDENTICAL to the default on every edit, so the owner's own rung
  -- can never answer differently from what the menu shows.
  UPDATE mandate.binding b SET
    holder_id = NEW.agent_id,
    holder_version_id =
      CASE WHEN COALESCE(NEW.use_latest, false) THEN NULL ELSE NEW.agent_version_id END,
    consumption_map = NEW.value_mappings,
    config_overrides =
      CASE WHEN NEW.agent_id IS NULL
                AND (COALESCE(NEW.use_latest, false) OR NEW.agent_version_id IS NULL)
                AND NEW.value_mappings IS NULL
           THEN '{}'::jsonb ELSE b.config_overrides END,
    metadata = (b.metadata - 'scope_mappings' - 'context_mappings'
                - 'legacy_agent_version_id' - 'legacy_use_latest')
      || jsonb_strip_nulls(jsonb_build_object(
           'legacy_agent_version_id',
             CASE WHEN COALESCE(NEW.use_latest, false) THEN NEW.agent_version_id END,
           'legacy_use_latest',
             CASE WHEN NOT COALESCE(NEW.use_latest, false) AND NEW.agent_version_id IS NULL
                  THEN false END))
      || CASE WHEN NEW.scope_mappings IS NOT NULL
              THEN jsonb_build_object('scope_mappings', NEW.scope_mappings) ELSE '{}'::jsonb END
      || CASE WHEN NEW.context_mappings IS NOT NULL
              THEN jsonb_build_object('context_mappings', NEW.context_mappings) ELSE '{}'::jsonb END
  WHERE b.mandate_id = v_def_id AND b.metadata->>'role' = 'shortcut_pin' AND b.deleted_at IS NULL;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE VIEW mandate.vw_shortcut WITH (security_invoker = true) AS
 SELECT COALESCE(((d.metadata ->> 'legacy_id'::text))::uuid, d.id) AS id,
    (((t.config -> 'menu'::text) ->> 'category_id'::text))::uuid AS category_id,
    d.label,
    d.description,
    (t.config ->> 'icon_name'::text) AS icon_name,
    (t.config ->> 'keyboard_shortcut'::text) AS keyboard_shortcut,
    COALESCE((((t.config -> 'menu'::text) ->> 'sort_order'::text))::integer, 0) AS sort_order,
    d.default_holder_id AS agent_id,
    COALESCE(((t.config -> 'menu'::text) -> 'enabled_features'::text), '["general"]'::jsonb) AS enabled_features,
    (d.metadata -> 'shortcut_scope_mappings'::text) AS scope_mappings,
    COALESCE((t.config ->> 'display_mode'::text), 'modal-full'::text) AS display_mode,
    COALESCE(((t.config ->> 'allow_chat'::text))::boolean, true) AS allow_chat,
    COALESCE(((t.config ->> 'auto_run'::text))::boolean, true) AS auto_run,
    COALESCE((((t.config -> 'gate'::text) ->> 'enabled'::text))::boolean, false) AS show_pre_execution_gate,
    d.is_enabled AS is_active,
    COALESCE(((d.metadata ->> 'shortcut_created_at'::text))::timestamp with time zone, d.created_at) AS created_at,
    COALESCE(((d.metadata ->> 'shortcut_updated_at'::text))::timestamp with time zone, d.updated_at) AS updated_at,
    d.organization_id,
    d.default_holder_version_id AS agent_version_id,
    (d.default_holder_version_id IS NULL) AS use_latest,
    COALESCE((((t.config -> 'variables'::text) ->> 'show_panel'::text))::boolean, false) AS show_variable_panel,
    COALESCE(((t.config -> 'variables'::text) ->> 'panel_style'::text), 'inline'::text) AS variables_panel_style,
    COALESCE((((t.config -> 'reveal'::text) ->> 'show_definition_messages'::text))::boolean, false) AS show_definition_messages,
    COALESCE((((t.config -> 'reveal'::text) ->> 'show_definition_message_content'::text))::boolean, false) AS show_definition_message_content,
    COALESCE((((t.config -> 'reveal'::text) ->> 'hide_reasoning'::text))::boolean, false) AS hide_reasoning,
    COALESCE((((t.config -> 'reveal'::text) ->> 'hide_tool_results'::text))::boolean, false) AS hide_tool_results,
    ((t.config -> 'gate'::text) ->> 'message'::text) AS pre_execution_message,
    COALESCE((((t.config -> 'gate'::text) ->> 'bypass_seconds'::text))::integer, 3) AS bypass_gate_seconds,
    ((t.config -> 'seeds'::text) ->> 'default_user_input'::text) AS default_user_input,
    ((t.config -> 'seeds'::text) -> 'default_variables'::text) AS default_variables,
    ((t.config -> 'seeds'::text) -> 'context_overrides'::text) AS context_overrides,
    ((t.config -> 'seeds'::text) -> 'llm_overrides'::text) AS llm_overrides,
    (d.metadata -> 'shortcut_context_mappings'::text) AS context_mappings,
    COALESCE((t.config ->> 'response_density'::text), 'comfortable'::text) AS response_density,
    (t.config -> 'json_extraction'::text) AS json_extraction,
    ((t.config -> 'menu'::text) ->> 'surface_name'::text) AS surface_name,
    (d.default_consumption_map - '__write_policies'::text) AS value_mappings,
    ((d.metadata ->> 'shortcut_created_by'::text))::uuid AS created_by,
    ((d.metadata ->> 'shortcut_updated_by'::text))::uuid AS updated_by,
    COALESCE(((d.metadata ->> 'shortcut_version'::text))::integer, d.version) AS version,
    d.visibility,
    d.deleted_at,
    COALESCE((d.metadata -> 'shortcut_metadata'::text), '{}'::jsonb) AS metadata,
    d.id AS mandate_id,
    d.mandate_key,
    COALESCE((t.config -> 'write_policies'::text), '{}'::jsonb) AS write_policies
   FROM (mandate.definition d
     JOIN mandate.treatment t ON (((t.mandate_id = d.id) AND (t.tier = 'widget'::text) AND t.is_default AND (t.deleted_at IS NULL))))
  WHERE ((d.metadata ? 'shortcut_compat'::text) AND (d.deleted_at IS NULL));
