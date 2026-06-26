-- agx_config_normalization_matrx_actions_ui_gates.sql
--
-- Agent config storage normalization (DDL half; backfill is a sibling migration).
--
-- Adds two dedicated columns to agx_agent + agx_version:
--   * matrx_actions jsonb  — the agent's Matrx Actions apply config (was the
--     polluting settings["output_apply"] key; full rebrand output_apply→matrx_actions).
--   * ui_gates      jsonb  — FE-only model-gated UI flags (file_urls/image_urls/
--     youtube_videos/tools-bool). NEVER sent to the server.
-- Also closes pre-existing version-snapshot drift in the SAME sweep:
--   * adds skill_config to agx_version (column was agx_agent-only),
--   * makes tool_config / skill_config / matrx_actions / ui_gates fully versioned
--     (change-detection + v1 snapshot + update snapshot + promote + duplicate +
--      version-snapshot projection), so editing any of them creates/restores a version.
--
-- settings remains the JSONB blob of ONLY server-consumed model params.
-- Idempotent: ADD COLUMN IF NOT EXISTS, guarded CONSTRAINT, CREATE OR REPLACE,
-- DROP ... IF EXISTS before the two RETURNS TABLE functions (return-type change).

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.agx_agent
  ADD COLUMN IF NOT EXISTS matrx_actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ui_gates      jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.agx_version
  ADD COLUMN IF NOT EXISTS matrx_actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ui_gates      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skill_config  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Mirror the agx_agent skill_config structural CHECK onto agx_version.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agx_version_skill_config_valid'
      AND conrelid = 'public.agx_version'::regclass
  ) THEN
    ALTER TABLE public.agx_version ADD CONSTRAINT agx_version_skill_config_valid CHECK (
      (jsonb_typeof(skill_config) = 'object')
      AND (NOT (skill_config ?| ARRAY['priority','ordering','overrides','category','meta','description','context','system']))
      AND ((NOT (skill_config ? 'included'))  OR (jsonb_typeof(skill_config -> 'included')  = 'array'))
      AND ((NOT (skill_config ? 'listed'))    OR (jsonb_typeof(skill_config -> 'listed')    = 'array'))
      AND ((NOT (skill_config ? 'forbidden')) OR (jsonb_typeof(skill_config -> 'forbidden') = 'array'))
      AND ((NOT (skill_config ? 'disabled'))  OR (jsonb_typeof(skill_config -> 'disabled')  = 'boolean'))
    );
  END IF;
END $$;

-- ── 2. v1 snapshot trigger (AFTER INSERT) — now carries mcp_servers, tool_config,
--       skill_config, matrx_actions, ui_gates ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_agx_agent_create_v1_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.agx_version (
    agent_id, version_number, agent_type, name, description, messages,
    variable_definitions, model_id, model_tiers, settings, output_schema,
    tools, custom_tools, context_slots, category, tags, is_active,
    mcp_servers, tool_config, skill_config, matrx_actions, ui_gates,
    changed_at, change_note
  )
  VALUES (
    NEW.id, 1, NEW.agent_type, NEW.name, NEW.description, NEW.messages,
    NEW.variable_definitions, NEW.model_id, NEW.model_tiers, NEW.settings, NEW.output_schema,
    NEW.tools, NEW.custom_tools, NEW.context_slots, NEW.category, NEW.tags, NEW.is_active,
    NEW.mcp_servers, NEW.tool_config, NEW.skill_config, NEW.matrx_actions, NEW.ui_gates,
    now(), 'Initial creation'
  );
  RETURN NEW;
END;
$function$;

-- ── 3. Update snapshot trigger (BEFORE UPDATE) — detect + snapshot the newly
--       versioned columns (tool_config / skill_config / matrx_actions / ui_gates;
--       mcp_servers was already present) ──────────────────────────────────────
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
  IF (OLD.agent_type IS NOT DISTINCT FROM NEW.agent_type
      AND OLD.name IS NOT DISTINCT FROM NEW.name
      AND OLD.description IS NOT DISTINCT FROM NEW.description
      AND OLD.messages IS NOT DISTINCT FROM NEW.messages
      AND OLD.variable_definitions IS NOT DISTINCT FROM NEW.variable_definitions
      AND OLD.model_id IS NOT DISTINCT FROM NEW.model_id
      AND OLD.model_tiers IS NOT DISTINCT FROM NEW.model_tiers
      AND OLD.settings IS NOT DISTINCT FROM NEW.settings
      AND OLD.output_schema::text IS NOT DISTINCT FROM NEW.output_schema::text
      AND OLD.tools IS NOT DISTINCT FROM NEW.tools
      AND OLD.custom_tools IS NOT DISTINCT FROM NEW.custom_tools
      AND OLD.context_slots IS NOT DISTINCT FROM NEW.context_slots
      AND OLD.category IS NOT DISTINCT FROM NEW.category
      AND OLD.tags IS NOT DISTINCT FROM NEW.tags
      AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active
      AND OLD.mcp_servers IS NOT DISTINCT FROM NEW.mcp_servers
      AND OLD.tool_config IS NOT DISTINCT FROM NEW.tool_config
      AND OLD.skill_config IS NOT DISTINCT FROM NEW.skill_config
      AND OLD.matrx_actions IS NOT DISTINCT FROM NEW.matrx_actions
      AND OLD.ui_gates IS NOT DISTINCT FROM NEW.ui_gates) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next FROM public.agx_version WHERE agent_id = OLD.id;
  BEGIN v_note := current_setting('app.change_note', true); EXCEPTION WHEN OTHERS THEN v_note := NULL; END;
  INSERT INTO public.agx_version (
    agent_id, version_number, agent_type, name, description, messages,
    variable_definitions, model_id, model_tiers, settings, output_schema,
    tools, custom_tools, context_slots, category, tags, is_active,
    mcp_servers, tool_config, skill_config, matrx_actions, ui_gates,
    changed_at, change_note
  )
  VALUES (
    NEW.id, v_next, NEW.agent_type, NEW.name, NEW.description, NEW.messages,
    NEW.variable_definitions, NEW.model_id, NEW.model_tiers, NEW.settings, NEW.output_schema,
    NEW.tools, NEW.custom_tools, NEW.context_slots, NEW.category, NEW.tags, NEW.is_active,
    NEW.mcp_servers, NEW.tool_config, NEW.skill_config, NEW.matrx_actions, NEW.ui_gates,
    now(), v_note
  );
  NEW.version := v_next;
  RETURN NEW;
END;
$function$;

-- ── 4. Promote — restore the full versioned column set (adds mcp_servers,
--       tool_config, skill_config, matrx_actions, ui_gates) ───────────────────
CREATE OR REPLACE FUNCTION public.agx_promote_version(p_agent_id uuid, p_version_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ver record;
BEGIN
  SELECT * INTO v_ver FROM agx_version WHERE agent_id = p_agent_id AND version_number = p_version_number;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Version not found'); END IF;
  PERFORM set_config('app.skip_version_snapshot', 'true', true);
  UPDATE agx_agent SET
    name = v_ver.name, description = v_ver.description, messages = v_ver.messages,
    variable_definitions = v_ver.variable_definitions, model_id = v_ver.model_id,
    model_tiers = v_ver.model_tiers, settings = v_ver.settings, output_schema = v_ver.output_schema,
    tools = v_ver.tools, custom_tools = v_ver.custom_tools, context_slots = v_ver.context_slots,
    category = v_ver.category, tags = v_ver.tags, is_active = v_ver.is_active,
    mcp_servers = v_ver.mcp_servers, tool_config = v_ver.tool_config, skill_config = v_ver.skill_config,
    matrx_actions = v_ver.matrx_actions, ui_gates = v_ver.ui_gates,
    version = p_version_number
  WHERE id = p_agent_id;
  RETURN jsonb_build_object('success', true, 'promoted_version', p_version_number, 'agent_id', p_agent_id);
END;
$function$;

-- ── 5. Version snapshot projection (RETURNS TABLE → drop+recreate) — add
--       skill_config, tool_config, matrx_actions, ui_gates ────────────────────
DROP FUNCTION IF EXISTS public.agx_get_version_snapshot(uuid, integer);
CREATE FUNCTION public.agx_get_version_snapshot(p_agent_id uuid, p_version_number integer)
 RETURNS TABLE(version_id uuid, version_number integer, agent_type text, name text, description text,
   messages jsonb, variable_definitions jsonb, model_id uuid, model_tiers jsonb, settings jsonb,
   output_schema json, tools uuid[], mcp_servers uuid[], custom_tools jsonb, context_slots jsonb,
   tool_config jsonb, skill_config jsonb, matrx_actions jsonb, ui_gates jsonb,
   category text, tags text[], is_active boolean, changed_at timestamp with time zone, change_note text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        av.id, av.version_number, av.agent_type, av.name, av.description,
        av.messages, av.variable_definitions, av.model_id, av.model_tiers,
        av.settings, av.output_schema, av.tools, av.mcp_servers,
        av.custom_tools, av.context_slots,
        av.tool_config, av.skill_config, av.matrx_actions, av.ui_gates,
        av.category, av.tags,
        av.is_active, av.changed_at, av.change_note
    FROM agx_version av
    WHERE av.agent_id = p_agent_id AND av.version_number = p_version_number;
$function$;

-- ── 6. Execution-full projection (RETURNS TABLE → drop+recreate) — add ui_gates
--       so the chat/execution path can gate attachment UI (was read from settings) ─
DROP FUNCTION IF EXISTS public.agx_get_execution_full(uuid);
CREATE FUNCTION public.agx_get_execution_full(p_agent_id uuid)
 RETURNS TABLE(id uuid, variable_definitions jsonb, model_id uuid, settings jsonb,
   tools uuid[], custom_tools jsonb, context_slots jsonb, ui_gates jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.variable_definitions, a.model_id, a.settings, a.tools, a.custom_tools, a.context_slots, a.ui_gates
  FROM agx_agent a WHERE a.id = p_agent_id;
$function$;

-- ── 7. Duplicate agent — copy the two new columns (skill_config/tool_config/
--       mcp_servers already copied) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agx_duplicate_agent(p_agent_id uuid, p_as_system boolean DEFAULT false)
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

  SELECT * INTO v_source FROM agx_agent WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF NOT check_resource_access(
    'agx_agent', p_agent_id, 'viewer',
    v_source.user_id, NULL, v_source.project_id, v_source.organization_id
  ) AND v_source.is_public = false THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_as_system AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agx_agent (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags,
      is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, project_id, task_id,
      source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
        v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_slots,
        v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
        v_source.default_rag_boost, v_source.rag_awareness_mode,
      v_source.category, v_source.tags,
      true, true, false, false,
      NULL, NULL, NULL, NULL,
      p_agent_id, now()
    );
  ELSE
    INSERT INTO agx_agent (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags,
      is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, project_id, task_id,
      source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
        v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_slots,
        v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
        v_source.default_rag_boost, v_source.rag_awareness_mode,
      v_source.category, v_source.tags,
      true, false, false, false,
      v_uid, NULL, NULL, NULL,
      p_agent_id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

-- ── 8. Duplicate version — copy the two new columns; skill_config now comes
--       FROM the version (it is versioned), not the master ───────────────────
CREATE OR REPLACE FUNCTION public.agx_duplicate_version(p_version_id uuid, p_as_system boolean DEFAULT false)
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

  SELECT * INTO v_ver FROM agx_version WHERE id = p_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent version not found';
  END IF;

  SELECT * INTO v_master FROM agx_agent WHERE id = v_ver.agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master agent not found for version';
  END IF;

  IF NOT (
    check_resource_access(
      'agx_agent', v_master.id, 'viewer',
      v_master.user_id, NULL, v_master.project_id, v_master.organization_id
    )
    OR v_master.is_public
    OR v_master.agent_type = 'builtin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_as_system AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agx_agent (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags,
      is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, project_id, task_id,
      source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_ver.name || ' (Copy)', v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
        v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_slots,
        v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
        v_master.default_rag_boost, v_master.rag_awareness_mode,
      v_ver.category, v_ver.tags,
      true, true, false, false,
      NULL, NULL, NULL, NULL,
      v_master.id, now()
    );
  ELSE
    INSERT INTO agx_agent (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags,
      is_active, is_public, is_archived, is_favorite,
      user_id, organization_id, project_id, task_id,
      source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_ver.name || ' (Copy)', v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
        v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_slots,
        v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
        v_master.default_rag_boost, v_master.rag_awareness_mode,
      v_ver.category, v_ver.tags,
      true, false, false, false,
      v_uid, NULL, NULL, NULL,
      v_master.id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;
