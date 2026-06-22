-- output_schema_json_comparison_fix.sql
--
-- REQUIRED follow-up to the jsonb -> json flips (agx_output_schema_preserve_key_order.sql
-- + output_schema_preserve_key_order_remaining.sql).
--
-- BUG IT FIXES (caught live — agent save failed with "operator does not exist:
-- json = json"): the `json` type has NO equality operator (unlike `jsonb`), so the
-- version-snapshot triggers' change-detection guard
--   OLD.output_schema IS NOT DISTINCT FROM NEW.output_schema
-- now raises on EVERY update of these tables, blocking all saves.
--
-- FIX: cast just that one comparison to text in each snapshot trigger. Text
-- comparison keeps change-detection working AND (unlike a jsonb recast) correctly
-- treats a property-key REORDER as a meaningful change worth versioning — which is
-- the whole reason these columns are now `json`. All other column comparisons and
-- the INSERT bodies are reproduced verbatim.
--
-- Affected triggers: agents, prompts, prompt builtins, tool_def.
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.trg_agx_agent_snapshot_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_next integer; v_note text; v_skip text;
BEGIN
  BEGIN v_skip := current_setting('app.skip_version_snapshot', true); EXCEPTION WHEN OTHERS THEN v_skip := NULL; END;
  IF v_skip = 'true' THEN RETURN NEW; END IF;
  IF (OLD.agent_type IS NOT DISTINCT FROM NEW.agent_type AND OLD.name IS NOT DISTINCT FROM NEW.name AND OLD.description IS NOT DISTINCT FROM NEW.description AND OLD.messages IS NOT DISTINCT FROM NEW.messages AND OLD.variable_definitions IS NOT DISTINCT FROM NEW.variable_definitions AND OLD.model_id IS NOT DISTINCT FROM NEW.model_id AND OLD.model_tiers IS NOT DISTINCT FROM NEW.model_tiers AND OLD.settings IS NOT DISTINCT FROM NEW.settings AND OLD.output_schema::text IS NOT DISTINCT FROM NEW.output_schema::text AND OLD.tools IS NOT DISTINCT FROM NEW.tools AND OLD.custom_tools IS NOT DISTINCT FROM NEW.custom_tools AND OLD.context_slots IS NOT DISTINCT FROM NEW.context_slots AND OLD.category IS NOT DISTINCT FROM NEW.category AND OLD.tags IS NOT DISTINCT FROM NEW.tags AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active AND OLD.mcp_servers IS NOT DISTINCT FROM NEW.mcp_servers) THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next FROM public.agx_version WHERE agent_id = OLD.id;
  BEGIN v_note := current_setting('app.change_note', true); EXCEPTION WHEN OTHERS THEN v_note := NULL; END;
  INSERT INTO public.agx_version (agent_id, version_number, agent_type, name, description, messages, variable_definitions, model_id, model_tiers, settings, output_schema, tools, custom_tools, context_slots, category, tags, is_active, mcp_servers, changed_at, change_note)
  VALUES (NEW.id, v_next, NEW.agent_type, NEW.name, NEW.description, NEW.messages, NEW.variable_definitions, NEW.model_id, NEW.model_tiers, NEW.settings, NEW.output_schema, NEW.tools, NEW.custom_tools, NEW.context_slots, NEW.category, NEW.tags, NEW.is_active, NEW.mcp_servers, now(), v_note);
  NEW.version := v_next;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_prompts_snapshot_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_next_version INTEGER;
  v_change_note  TEXT;
BEGIN
  IF (
    OLD.messages          IS NOT DISTINCT FROM NEW.messages          AND
    OLD.variable_defaults IS NOT DISTINCT FROM NEW.variable_defaults AND
    OLD.tools             IS NOT DISTINCT FROM NEW.tools             AND
    OLD.settings          IS NOT DISTINCT FROM NEW.settings          AND
    OLD.name              IS NOT DISTINCT FROM NEW.name              AND
    OLD.description       IS NOT DISTINCT FROM NEW.description       AND
    OLD.category          IS NOT DISTINCT FROM NEW.category          AND
    OLD.tags              IS NOT DISTINCT FROM NEW.tags              AND
    OLD.output_schema::text IS NOT DISTINCT FROM NEW.output_schema::text AND
    OLD.dynamic_model     IS NOT DISTINCT FROM NEW.dynamic_model     AND
    OLD.context_slots     IS NOT DISTINCT FROM NEW.context_slots
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM public.prompt_versions
  WHERE prompt_id = OLD.id;

  BEGIN
    v_change_note := current_setting('app.change_note', true);
  EXCEPTION WHEN OTHERS THEN
    v_change_note := NULL;
  END;

  INSERT INTO public.prompt_versions (
    prompt_id, version_number,
    name, description, messages, variable_defaults, tools,
    settings, model_id, output_format, output_schema,
    category, tags, dynamic_model, context_slots,
    changed_at, change_note
  ) VALUES (
    OLD.id, v_next_version,
    OLD.name, OLD.description, OLD.messages, OLD.variable_defaults, OLD.tools,
    OLD.settings, OLD.model_id, OLD.output_format, OLD.output_schema,
    OLD.category, OLD.tags, OLD.dynamic_model, OLD.context_slots,
    now(), v_change_note
  );

  NEW.version := v_next_version + 1;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_builtins_snapshot_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_next_version INTEGER;
  v_change_note  TEXT;
BEGIN
  IF (
    OLD.messages          IS NOT DISTINCT FROM NEW.messages          AND
    OLD.variable_defaults IS NOT DISTINCT FROM NEW.variable_defaults AND
    OLD.tools             IS NOT DISTINCT FROM NEW.tools             AND
    OLD.settings          IS NOT DISTINCT FROM NEW.settings          AND
    OLD.name              IS NOT DISTINCT FROM NEW.name              AND
    OLD.description       IS NOT DISTINCT FROM NEW.description       AND
    OLD.category          IS NOT DISTINCT FROM NEW.category          AND
    OLD.tags              IS NOT DISTINCT FROM NEW.tags              AND
    OLD.output_schema::text IS NOT DISTINCT FROM NEW.output_schema::text AND
    OLD.is_active         IS NOT DISTINCT FROM NEW.is_active         AND
    OLD.dynamic_model     IS NOT DISTINCT FROM NEW.dynamic_model     AND
    OLD.context_slots     IS NOT DISTINCT FROM NEW.context_slots
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM public.prompt_builtin_versions
  WHERE builtin_id = OLD.id;

  BEGIN
    v_change_note := current_setting('app.change_note', true);
  EXCEPTION WHEN OTHERS THEN
    v_change_note := NULL;
  END;

  INSERT INTO public.prompt_builtin_versions (
    builtin_id, version_number,
    name, description, messages, variable_defaults, tools,
    settings, model_id, output_format, output_schema,
    category, tags, is_active, dynamic_model, context_slots,
    changed_at, change_note
  ) VALUES (
    OLD.id, v_next_version,
    OLD.name, OLD.description, OLD.messages, OLD.variable_defaults, OLD.tools,
    OLD.settings, OLD.model_id, OLD.output_format, OLD.output_schema,
    OLD.category, OLD.tags, OLD.is_active, OLD.dynamic_model, OLD.context_slots,
    now(), v_change_note
  );

  NEW.version := v_next_version + 1;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_tool_def_snapshot_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_next integer; v_note text;
BEGIN
    IF (OLD.name IS NOT DISTINCT FROM NEW.name AND OLD.description IS NOT DISTINCT FROM NEW.description
        AND OLD.parameters IS NOT DISTINCT FROM NEW.parameters AND OLD.output_schema::text IS NOT DISTINCT FROM NEW.output_schema::text
        AND OLD.annotations IS NOT DISTINCT FROM NEW.annotations AND OLD.category IS NOT DISTINCT FROM NEW.category
        AND OLD.tags IS NOT DISTINCT FROM NEW.tags AND OLD.icon IS NOT DISTINCT FROM NEW.icon
        AND OLD.semver IS NOT DISTINCT FROM NEW.semver AND OLD.admin_only IS NOT DISTINCT FROM NEW.admin_only
        AND OLD.tier IS NOT DISTINCT FROM NEW.tier AND OLD.gating IS NOT DISTINCT FROM NEW.gating
        AND OLD.dedupe_exempt IS NOT DISTINCT FROM NEW.dedupe_exempt AND OLD.validation_exempt IS NOT DISTINCT FROM NEW.validation_exempt
        AND OLD.source_kind IS NOT DISTINCT FROM NEW.source_kind AND OLD.tool_group IS NOT DISTINCT FROM NEW.tool_group
        AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active) THEN RETURN NEW; END IF;
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next FROM public.tool_def_version WHERE tool_id = OLD.id;
    BEGIN v_note := current_setting('app.change_note', true); EXCEPTION WHEN OTHERS THEN v_note := NULL; END;
    INSERT INTO public.tool_def_version (
        tool_id, version_number, name, description, parameters, output_schema, annotations,
        category, tags, icon, semver, admin_only, tier, gating, dedupe_exempt, validation_exempt,
        source_kind, tool_group, is_active, changed_at, change_note
    ) VALUES (
        OLD.id, v_next, OLD.name, OLD.description, OLD.parameters, OLD.output_schema, OLD.annotations,
        OLD.category, OLD.tags, OLD.icon, OLD.semver, OLD.admin_only, OLD.tier, OLD.gating,
        OLD.dedupe_exempt, OLD.validation_exempt, OLD.source_kind, OLD.tool_group, OLD.is_active,
        now(), v_note
    );
    NEW.version := v_next + 1;
    RETURN NEW;
END; $function$;
