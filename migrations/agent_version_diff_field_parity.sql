-- Agent version/diff field-parity repair (2026-08-25).
--
-- Root incident: Growth Loop Collection Quality Judge v4 -> v5 added
-- output_schema.properties.__kind, but the frontend diff engine globally hid
-- underscore-prefixed keys and rendered "No changes". The field-by-field audit
-- then found three definition fields outside the historical snapshot contract:
-- default_rag_boost, rag_awareness_mode, and the newly introduced input_kind.
-- promote_version also restored only an older subset of the columns that the
-- snapshot RPC exposes.
--
-- This migration makes the version row, both snapshot triggers, the snapshot
-- RPC, restore, linked-agent sync, and both duplicate paths agree on the same
-- portable configuration. Existing input_kind history cannot be reconstructed;
-- only each agent's current/latest snapshot is backfilled. The two RAG fields
-- are safely backfilled to their measured live defaults (all current agents are
-- 0 / none). Future snapshots carry the exact values.

ALTER TABLE agent.definition_version
  ADD COLUMN IF NOT EXISTS default_rag_boost smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rag_awareness_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS input_kind text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'agent.definition_version'::regclass
      AND conname = 'definition_version_rag_awareness_mode_known'
  ) THEN
    ALTER TABLE agent.definition_version
      ADD CONSTRAINT definition_version_rag_awareness_mode_known
      CHECK (rag_awareness_mode = ANY (ARRAY['none'::text, 'hint'::text, 'inline_small'::text]));
  END IF;
END;
$constraint$;

-- A binding written before input_kind participated in versioning did not mint a
-- new version. Repair the latest snapshot only; older rows remain NULL (unknown
-- / pre-binding), rather than fabricating historical declarations.
UPDATE agent.definition_version v
SET input_kind = d.input_kind
FROM agent.definition d
WHERE d.id = v.agent_id
  AND v.version_number = (
    SELECT max(v2.version_number)
    FROM agent.definition_version v2
    WHERE v2.agent_id = v.agent_id
  )
  AND v.input_kind IS DISTINCT FROM d.input_kind;

CREATE OR REPLACE FUNCTION public.trg_agx_agent_create_v1_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO agent.definition_version (
    agent_id, version_number, agent_type, name, description, messages,
    variable_definitions, model_id, model_tiers, settings, output_schema,
    tools, custom_tools, context_policies, auto_context_disabled, category, tags, is_active,
    mcp_servers, tool_config, skill_config, matrx_actions, ui_gates,
    default_rag_boost, rag_awareness_mode, input_kind,
    changed_at, change_note
  )
  VALUES (
    NEW.id, 1, NEW.agent_type, NEW.name, NEW.description, NEW.messages,
    NEW.variable_definitions, NEW.model_id, NEW.model_tiers, NEW.settings, NEW.output_schema,
    NEW.tools, NEW.custom_tools, NEW.context_policies, NEW.auto_context_disabled, NEW.category, NEW.tags, NEW.is_active,
    NEW.mcp_servers, NEW.tool_config, NEW.skill_config, NEW.matrx_actions, NEW.ui_gates,
    NEW.default_rag_boost, NEW.rag_awareness_mode, NEW.input_kind,
    now(), 'Initial creation'
  );
  RETURN NEW;
END;
$function$;

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
      AND OLD.context_policies IS NOT DISTINCT FROM NEW.context_policies
      AND OLD.auto_context_disabled IS NOT DISTINCT FROM NEW.auto_context_disabled
      AND OLD.category IS NOT DISTINCT FROM NEW.category
      AND OLD.tags IS NOT DISTINCT FROM NEW.tags
      AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active
      AND OLD.mcp_servers IS NOT DISTINCT FROM NEW.mcp_servers
      AND OLD.tool_config IS NOT DISTINCT FROM NEW.tool_config
      AND OLD.skill_config IS NOT DISTINCT FROM NEW.skill_config
      AND OLD.matrx_actions IS NOT DISTINCT FROM NEW.matrx_actions
      AND OLD.ui_gates IS NOT DISTINCT FROM NEW.ui_gates
      AND OLD.default_rag_boost IS NOT DISTINCT FROM NEW.default_rag_boost
      AND OLD.rag_awareness_mode IS NOT DISTINCT FROM NEW.rag_awareness_mode
      AND OLD.input_kind IS NOT DISTINCT FROM NEW.input_kind) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next
  FROM agent.definition_version
  WHERE agent_id = OLD.id;
  BEGIN v_note := current_setting('app.change_note', true); EXCEPTION WHEN OTHERS THEN v_note := NULL; END;
  INSERT INTO agent.definition_version (
    agent_id, version_number, agent_type, name, description, messages,
    variable_definitions, model_id, model_tiers, settings, output_schema,
    tools, custom_tools, context_policies, auto_context_disabled, category, tags, is_active,
    mcp_servers, tool_config, skill_config, matrx_actions, ui_gates,
    default_rag_boost, rag_awareness_mode, input_kind,
    changed_at, change_note
  )
  VALUES (
    NEW.id, v_next, NEW.agent_type, NEW.name, NEW.description, NEW.messages,
    NEW.variable_definitions, NEW.model_id, NEW.model_tiers, NEW.settings, NEW.output_schema,
    NEW.tools, NEW.custom_tools, NEW.context_policies, NEW.auto_context_disabled, NEW.category, NEW.tags, NEW.is_active,
    NEW.mcp_servers, NEW.tool_config, NEW.skill_config, NEW.matrx_actions, NEW.ui_gates,
    NEW.default_rag_boost, NEW.rag_awareness_mode, NEW.input_kind,
    now(), v_note
  );
  NEW.version := v_next;
  RETURN NEW;
END;
$function$;

-- The OUT shape changes, so PostgreSQL requires a transactional drop/recreate.
DROP FUNCTION public.agx_get_version_snapshot(uuid, integer);

CREATE FUNCTION public.agx_get_version_snapshot(p_agent_id uuid, p_version_number integer)
RETURNS TABLE(
  version_id uuid, version_number integer, agent_type text, name text, description text,
  messages jsonb, variable_definitions jsonb, model_id uuid, model_tiers jsonb, settings jsonb,
  output_schema json, tools uuid[], mcp_servers uuid[], custom_tools jsonb,
  context_policies jsonb, auto_context_disabled boolean, tool_config jsonb,
  skill_config jsonb, matrx_actions jsonb, ui_gates jsonb,
  default_rag_boost smallint, rag_awareness_mode text, input_kind text,
  category text, tags text[], is_active boolean,
  changed_at timestamp with time zone, change_note text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    av.id, av.version_number, av.agent_type, av.name, av.description,
    av.messages, av.variable_definitions, av.model_id, av.model_tiers, av.settings,
    av.output_schema, av.tools, av.mcp_servers, av.custom_tools,
    av.context_policies, av.auto_context_disabled, av.tool_config,
    av.skill_config, av.matrx_actions, av.ui_gates,
    av.default_rag_boost, av.rag_awareness_mode, av.input_kind,
    av.category, av.tags, av.is_active, av.changed_at, av.change_note
  FROM agent.definition_version av
  WHERE av.agent_id = p_agent_id
    AND av.version_number = p_version_number;
$function$;

-- Preserve the pre-migration invocation surface exactly. The function is
-- SECURITY INVOKER and the underlying table's RLS remains the authorization.
GRANT EXECUTE ON FUNCTION public.agx_get_version_snapshot(uuid, integer)
  TO PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.promote_version(
  p_entity_type text,
  p_entity_id uuid,
  p_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'agent', 'tool', 'workbench', 'code', 'pg_temp'
AS $function$
DECLARE
  v_new_version integer;
  v_old_name text;
  v_snap jsonb;
BEGIN
  PERFORM set_config('app.change_note', 'Promoted version ' || p_version || ' to current', true);

  IF p_entity_type IN ('prompt', 'builtin', 'prompt_app', 'note') THEN
    RETURN jsonb_build_object('success', false, 'error', 'deprecated_entity_type',
      'message', p_entity_type || ' versioning was retired — use the generic version_restore(token,id,version) over history.row_versions');
  ELSIF p_entity_type = 'tool_ui_component' THEN
    SELECT cv.display_name::text INTO v_old_name
    FROM tool.ui_version cv
    WHERE cv.component_id = p_entity_id AND cv.version_number = p_version;
    IF v_old_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Version not found'); END IF;
    UPDATE tool.ui c SET
      tool_name = cv.tool_name, display_name = cv.display_name, results_label = cv.results_label,
      inline_code = cv.inline_code, overlay_code = cv.overlay_code, utility_code = cv.utility_code,
      header_extras_code = cv.header_extras_code, header_subtitle_code = cv.header_subtitle_code,
      keep_expanded_on_stream = cv.keep_expanded_on_stream, allowed_imports = cv.allowed_imports,
      language = cv.language, is_active = cv.is_active, notes = cv.notes
    FROM tool.ui_version cv
    WHERE c.id = p_entity_id AND cv.component_id = p_entity_id AND cv.version_number = p_version;
    SELECT version INTO v_new_version FROM tool.ui WHERE id = p_entity_id;
  ELSIF p_entity_type = 'tool' THEN
    SELECT tv.name::text INTO v_old_name
    FROM tool.definition_version tv
    WHERE tv.tool_id = p_entity_id AND tv.version_number = p_version;
    IF v_old_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Version not found'); END IF;
    UPDATE tool.definition t SET
      name = tv.name, description = tv.description, parameters = tv.parameters,
      output_schema = tv.output_schema, annotations = tv.annotations,
      category = tv.category, tags = tv.tags, icon = tv.icon,
      semver = COALESCE(tv.semver, t.semver), admin_only = COALESCE(tv.admin_only, t.admin_only),
      tier = tv.tier, gating = COALESCE(tv.gating, t.gating),
      dedupe_exempt = COALESCE(tv.dedupe_exempt, t.dedupe_exempt),
      validation_exempt = COALESCE(tv.validation_exempt, t.validation_exempt),
      source_kind = COALESCE(tv.source_kind, t.source_kind),
      tool_group = COALESCE(tv.tool_group, t.tool_group),
      is_active = COALESCE(tv.is_active, t.is_active)
    FROM tool.definition_version tv
    WHERE t.id = p_entity_id AND tv.tool_id = p_entity_id AND tv.version_number = p_version;
    SELECT version INTO v_new_version FROM tool.definition WHERE id = p_entity_id;
  ELSIF p_entity_type = 'agent' THEN
    SELECT agv.name::text INTO v_old_name
    FROM agent.definition_version agv
    WHERE agv.agent_id = p_entity_id AND agv.version_number = p_version;
    IF v_old_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Version not found'); END IF;
    UPDATE agent.definition a SET
      agent_type = agv.agent_type,
      name = agv.name,
      description = agv.description,
      messages = agv.messages,
      variable_definitions = agv.variable_definitions,
      model_id = agv.model_id,
      model_tiers = agv.model_tiers,
      settings = agv.settings,
      output_schema = agv.output_schema,
      tools = agv.tools,
      custom_tools = agv.custom_tools,
      context_policies = agv.context_policies,
      auto_context_disabled = agv.auto_context_disabled,
      mcp_servers = agv.mcp_servers,
      tool_config = agv.tool_config,
      skill_config = agv.skill_config,
      matrx_actions = agv.matrx_actions,
      ui_gates = agv.ui_gates,
      default_rag_boost = agv.default_rag_boost,
      rag_awareness_mode = agv.rag_awareness_mode,
      input_kind = agv.input_kind,
      category = agv.category,
      tags = agv.tags,
      is_active = agv.is_active
    FROM agent.definition_version agv
    WHERE a.id = p_entity_id AND agv.agent_id = p_entity_id AND agv.version_number = p_version;
    SELECT version INTO v_new_version FROM agent.definition WHERE id = p_entity_id;
  ELSIF p_entity_type = 'code_file' THEN
    SELECT rv.row_data INTO v_snap
    FROM history.row_versions rv
    WHERE rv.entity_type = 'code_file' AND rv.row_id = p_entity_id AND rv.version = p_version
    ORDER BY rv.id DESC LIMIT 1;
    IF v_snap IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Version not found'); END IF;
    v_old_name := v_snap->>'name';
    UPDATE code.code_files
    SET content = v_snap->>'content', name = v_snap->>'name', language = v_snap->>'language'
    WHERE id = p_entity_id;
    SELECT version INTO v_new_version FROM code.code_files WHERE id = p_entity_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unknown entity_type: ' || p_entity_type);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'promoted_from_version', p_version,
    'new_version', v_new_version,
    'entity_name', v_old_name
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_sync_linked_agents_reviewed(
  p_from_id uuid,
  p_to_id uuid,
  p_include_identity boolean,
  p_expected_from_updated_at timestamp with time zone,
  p_expected_to_updated_at timestamp with time zone
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from record;
  v_to record;
  v_uid uuid := auth.uid();
  v_derived_id uuid;
  v_identity boolean := COALESCE(p_include_identity, true);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_from_id = p_to_id THEN RAISE EXCEPTION 'Cannot sync an agent with itself'; END IF;

  PERFORM id
  FROM agent.definition
  WHERE id IN (p_from_id, p_to_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_from FROM agent.definition WHERE id = p_from_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source agent not found'; END IF;
  SELECT * INTO v_to FROM agent.definition WHERE id = p_to_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target agent not found'; END IF;

  IF p_expected_from_updated_at IS NOT NULL
     AND v_from.updated_at IS DISTINCT FROM p_expected_from_updated_at THEN
    RAISE EXCEPTION 'Source agent changed after review. Refresh the comparison and try again';
  END IF;
  IF p_expected_to_updated_at IS NOT NULL
     AND v_to.updated_at IS DISTINCT FROM p_expected_to_updated_at THEN
    RAISE EXCEPTION 'Target agent changed after review. Refresh the comparison and try again';
  END IF;

  IF v_to.source_agent_id = v_from.id THEN
    v_derived_id := v_to.id;
  ELSIF v_from.source_agent_id = v_to.id THEN
    v_derived_id := v_from.id;
  ELSE
    RAISE EXCEPTION 'Agents are not linked (no shared lineage)';
  END IF;

  IF NOT (v_from.agent_type = 'builtin' AND v_from.is_active)
     AND NOT iam.has_access_for(v_uid, 'agent', v_from.id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied to source agent';
  END IF;

  IF v_to.agent_type = 'builtin' THEN
    IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only super admins can sync into a system agent'; END IF;
  ELSIF v_to.created_by IS DISTINCT FROM v_uid AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'You can only sync into an agent you own';
  END IF;

  UPDATE agent.definition SET
    name = CASE WHEN v_identity THEN v_from.name ELSE name END,
    description = CASE WHEN v_identity THEN v_from.description ELSE description END,
    category = CASE WHEN v_identity THEN v_from.category ELSE category END,
    tags = CASE WHEN v_identity THEN v_from.tags ELSE tags END,
    messages = v_from.messages,
    variable_definitions = v_from.variable_definitions,
    model_id = v_from.model_id,
    model_tiers = v_from.model_tiers,
    settings = v_from.settings,
    output_schema = v_from.output_schema,
    tools = v_from.tools,
    custom_tools = v_from.custom_tools,
    context_policies = v_from.context_policies,
    auto_context_disabled = v_from.auto_context_disabled,
    mcp_servers = v_from.mcp_servers,
    tool_config = v_from.tool_config,
    skill_config = v_from.skill_config,
    matrx_actions = v_from.matrx_actions,
    ui_gates = v_from.ui_gates,
    default_rag_boost = v_from.default_rag_boost,
    rag_awareness_mode = v_from.rag_awareness_mode,
    input_kind = v_from.input_kind,
    updated_at = now()
  WHERE id = v_to.id;

  UPDATE agent.definition
  SET source_snapshot_at = now()
  WHERE id = v_derived_id;

  RETURN v_to.id;
END;
$function$;

-- Patch the duplicate routines in place so their current access and ownership
-- logic remains byte-for-byte intact while portable field parity is extended.
DO $duplicates$
DECLARE
  v_agent text := pg_get_functiondef('public.agx_duplicate_agent(uuid,boolean)'::regprocedure);
  v_version text := pg_get_functiondef('public.agx_duplicate_version(uuid,boolean)'::regprocedure);
BEGIN
  IF position('input_kind' IN v_agent) = 0 THEN
    v_agent := replace(
      v_agent,
      'default_rag_boost, rag_awareness_mode,',
      'default_rag_boost, rag_awareness_mode, input_kind,'
    );
    v_agent := replace(
      v_agent,
      'v_source.default_rag_boost, v_source.rag_awareness_mode,',
      'v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,'
    );
    IF position('v_source.input_kind' IN v_agent) = 0 THEN
      RAISE EXCEPTION 'agx_duplicate_agent input_kind patch pattern drifted';
    END IF;
    EXECUTE v_agent;
  END IF;

  IF position('input_kind' IN v_version) = 0 THEN
    v_version := replace(
      v_version,
      'default_rag_boost, rag_awareness_mode,',
      'default_rag_boost, rag_awareness_mode, input_kind,'
    );
    v_version := replace(
      v_version,
      'v_master.default_rag_boost, v_master.rag_awareness_mode,',
      'v_ver.default_rag_boost, v_ver.rag_awareness_mode, v_ver.input_kind,'
    );
    IF position('v_ver.input_kind' IN v_version) = 0
       OR position('v_master.default_rag_boost' IN v_version) > 0
       OR position('v_master.rag_awareness_mode' IN v_version) > 0 THEN
      RAISE EXCEPTION 'agx_duplicate_version portable-field patch pattern drifted';
    END IF;
    EXECUTE v_version;
  END IF;
END;
$duplicates$;

-- Fail the migration if any repaired path silently omits a contract field.
DO $verify$
DECLARE
  v_expected text[] := ARRAY[
    'messages', 'variable_definitions', 'model_id', 'model_tiers', 'settings',
    'output_schema', 'tools', 'custom_tools', 'context_policies',
    'auto_context_disabled', 'mcp_servers', 'tool_config', 'skill_config',
    'matrx_actions', 'ui_gates', 'default_rag_boost', 'rag_awareness_mode',
    'input_kind'
  ];
  v_field text;
  v_signature regprocedure;
  v_source text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.trg_agx_agent_create_v1_snapshot()'::regprocedure,
    'public.trg_agx_agent_snapshot_version()'::regprocedure,
    'public.agx_get_version_snapshot(uuid,integer)'::regprocedure,
    'public.promote_version(text,uuid,integer)'::regprocedure,
    'public.agx_sync_linked_agents_reviewed(uuid,uuid,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure,
    'public.agx_duplicate_agent(uuid,boolean)'::regprocedure,
    'public.agx_duplicate_version(uuid,boolean)'::regprocedure
  ]
  LOOP
    v_source := pg_get_functiondef(v_signature::oid);
    FOREACH v_field IN ARRAY v_expected LOOP
      IF position(v_field IN v_source) = 0 THEN
        RAISE EXCEPTION 'Agent portable-field parity failed: % omits %', v_signature, v_field;
      END IF;
    END LOOP;
  END LOOP;
END;
$verify$;
