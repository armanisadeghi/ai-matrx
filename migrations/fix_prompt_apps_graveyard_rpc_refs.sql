-- fix_prompt_apps_graveyard_rpc_refs.sql
--
-- prompt_apps (+ prompt_app_* children) were moved to graveyard during the 2026
-- schema reorg; all live data migrated to app.definition (formerly aga_apps).
-- Several public RPCs still referenced bare prompt_apps and 404'd at runtime
-- (e.g. agx_usage_report → agx_usage_scan_core). Repoint or retire those refs.
--
-- Applied via Supabase MCP 2026-06-29.

-- ---------------------------------------------------------------------------
-- 1) agx_usage_scan_core — drop the deprecated prompt_app surface (now 'app')
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def  text;
  v_start int;
  v_end   int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'agx_usage_scan_core';

  v_start := position(E'  UNION ALL\n  SELECT\n    ''prompt_app''' in v_def);
  v_end   := position(E'  UNION ALL\n  SELECT\n    ''scheduled_task''' in v_def);

  IF v_start = 0 OR v_end = 0 OR v_end <= v_start THEN
    RAISE EXCEPTION 'agx_usage_scan_core: prompt_app block markers not found — aborting';
  END IF;

  v_def := substring(v_def from 1 for v_start - 1)
        || substring(v_def from v_end);

  -- Other surfaces moved out of public during the reorg; qualify so CREATE OR REPLACE validates.
  v_def := replace(v_def, 'FROM sch_agent_task sat', 'FROM scheduler.sch_agent_task sat');
  v_def := replace(v_def, 'JOIN sch_task st ON', 'JOIN scheduler.sch_task st ON');
  v_def := replace(v_def, 'FROM sms_conversations sc', 'FROM communication.sms_conversations sc');
  v_def := replace(v_def, 'FROM cmp_comparison_entries e', 'FROM agent.cmp_comparison_entries e');
  v_def := replace(v_def, 'LEFT JOIN cmp_comparison_sets cs ON', 'LEFT JOIN agent.cmp_comparison_sets cs ON');
  v_def := replace(v_def, 'FROM organization_members om', 'FROM iam.organization_member om');
  v_def := replace(v_def, 'SELECT 1 FROM organization_members om', 'SELECT 1 FROM iam.organization_member om');
  v_def := replace(v_def, 'LEFT JOIN organizations org ON', 'LEFT JOIN iam.organizations org ON');
  v_def := replace(
    v_def,
    'SET search_path TO ''public'', ''scheduler'', ''pg_temp''',
    'SET search_path TO ''public'', ''scheduler'', ''communication'', ''agent'', ''iam'', ''app'', ''workflow'', ''pg_temp'''
  );

  EXECUTE v_def;
END $$;

-- ---------------------------------------------------------------------------
-- 2) agx_usage_update_to_active — remove prompt_app lookup/update branches
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'agx_usage_update_to_active';

  v_def := regexp_replace(
    v_def,
    E'  ELSIF p_usage_type = ''prompt_app'' THEN\\n    SELECT pa\\.user_id, pa\\.organization_id, pa\\.prompt_id\\n      INTO v_owner, v_org, v_agent\\n    FROM prompt_apps pa WHERE pa\\.id = p_usage_id;\\n',
    '',
    'g'
  );

  v_def := regexp_replace(
    v_def,
    E'  ELSIF p_usage_type = ''prompt_app'' THEN\\n    -- prompt apps pin by version NUMBER only; both modes accept the active one\\n    UPDATE prompt_apps SET pinned_version = v_live WHERE id = p_usage_id;\\n',
    '',
    'g'
  );

  EXECUTE v_def;
END $$;

-- ---------------------------------------------------------------------------
-- 3) agx_usage_update_all_to_active — prompt_app is no longer a usage type
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'agx_usage_update_all_to_active';

  v_def := replace(
    v_def,
    '''shortcut'', ''app'', ''prompt_app'', ''derived_agent''',
    '''shortcut'', ''app'', ''derived_agent'''
  );

  EXECUTE v_def;
END $$;

-- ---------------------------------------------------------------------------
-- 4) agx_purge_versions — pin holders live on app.definition now
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'agx_purge_versions';

  v_def := replace(
    v_def,
    E'      AND NOT EXISTS (SELECT 1 FROM prompt_apps pa\n                      WHERE pa.prompt_id = p_agent_id\n                        AND COALESCE(pa.pinned_version, 1) = av.version_number)',
    E'      AND NOT EXISTS (SELECT 1 FROM app.definition ap\n                      WHERE ap.agent_id = p_agent_id\n                        AND NOT COALESCE(ap.use_latest, true)\n                        AND COALESCE(ap.pinned_version, 1) = av.version_number)'
  );

  EXECUTE v_def;
END $$;

-- ---------------------------------------------------------------------------
-- 5) validate_slugs — slug uniqueness on app.definition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_slugs(slug_array text[])
RETURNS TABLE(slug text, is_available boolean, is_format_valid boolean, error text)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'app', 'pg_temp'
AS $fn$
  SELECT
    s.slug,
    NOT EXISTS (SELECT 1 FROM app.definition d WHERE d.slug = s.slug) AS is_available,
    (s.slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$'::text
      AND length(s.slug) >= 3
      AND length(s.slug) <= 50) AS is_format_valid,
    CASE
      WHEN length(s.slug) < 3 OR length(s.slug) > 50 THEN 'Slug must be 3-50 characters'
      WHEN NOT (s.slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$'::text) THEN 'Invalid format'
      ELSE NULL
    END AS error
  FROM unnest(slug_array) s(slug);
$fn$;

-- ---------------------------------------------------------------------------
-- 6) check_rate_limit — app.definition + app.rate_limit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_app_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_fingerprint text DEFAULT NULL,
  p_ip_address inet DEFAULT NULL
)
RETURNS TABLE(allowed boolean, remaining integer, reset_at timestamptz, is_blocked boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'app', 'pg_temp'
AS $fn$
DECLARE
  v_app app.definition%ROWTYPE;
  v_limit_record app.rate_limit%ROWTYPE;
  v_max_executions integer;
  v_window_hours integer;
BEGIN
  SELECT * INTO v_app FROM app.definition WHERE id = p_app_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'App not found';
  END IF;

  IF p_user_id IS NOT NULL THEN
    v_max_executions := COALESCE(v_app.rate_limit_authenticated, 100);
  ELSE
    v_max_executions := COALESCE(v_app.rate_limit_per_ip, 20);
  END IF;

  v_window_hours := GREATEST(COALESCE(v_app.rate_limit_window_hours, 24), 1);

  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_limit_record FROM app.rate_limit
    WHERE app_id = p_app_id AND user_id = p_user_id;
  ELSIF p_fingerprint IS NOT NULL THEN
    SELECT * INTO v_limit_record FROM app.rate_limit
    WHERE app_id = p_app_id AND user_id IS NULL AND fingerprint = p_fingerprint;
  ELSIF p_ip_address IS NOT NULL THEN
    SELECT * INTO v_limit_record FROM app.rate_limit
    WHERE app_id = p_app_id AND user_id IS NULL AND fingerprint IS NULL AND ip_address = p_ip_address;
  END IF;

  IF v_limit_record IS NULL THEN
    RETURN QUERY SELECT true, v_max_executions - 1, now() + make_interval(hours => v_window_hours), false;
    RETURN;
  END IF;

  IF v_limit_record.is_blocked AND (v_limit_record.blocked_until IS NULL OR v_limit_record.blocked_until > now()) THEN
    RETURN QUERY SELECT false, 0, v_limit_record.blocked_until, true;
    RETURN;
  END IF;

  IF v_limit_record.window_start_at + make_interval(hours => v_window_hours) < now() THEN
    RETURN QUERY SELECT true, v_max_executions - 1, now() + make_interval(hours => v_window_hours), false;
    RETURN;
  END IF;

  IF v_limit_record.execution_count >= v_max_executions THEN
    RETURN QUERY SELECT
      false,
      0,
      v_limit_record.window_start_at + make_interval(hours => v_window_hours),
      false;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    v_max_executions - v_limit_record.execution_count - 1,
    v_limit_record.window_start_at + make_interval(hours => v_window_hours),
    false;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 7) Legacy prompt-app RPCs — thin wrappers over app.definition / agent.*
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_prompt_app_public_data(
  p_slug text DEFAULT NULL,
  p_app_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, slug text, name text, tagline text, description text,
  category text, tags text[], preview_image_url text, favicon_url text,
  component_code text, component_language text, variable_schema jsonb,
  allowed_imports jsonb, layout_config jsonb, styling_config jsonb,
  total_executions integer, success_rate numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'app', 'pg_temp'
AS $fn$
  SELECT
    a.id, a.slug, a.name, a.tagline, a.description,
    a.category, a.tags, a.preview_image_url, a.favicon_url,
    a.component_code, a.component_language, a.variable_schema,
    a.allowed_imports, a.layout_config, a.styling_config,
    a.total_executions, a.success_rate
  FROM app.definition a
  WHERE a.status = 'published'
    AND a.is_public = true
    AND (
      (p_app_id IS NOT NULL AND a.id = p_app_id)
      OR (p_slug IS NOT NULL AND a.slug = p_slug)
    )
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.get_published_app_with_prompt(
  p_slug text DEFAULT NULL,
  p_app_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, user_id uuid, prompt_id uuid, slug text, name text, tagline text,
  description text, category text, tags text[], preview_image_url text,
  favicon_url text, component_code text, component_language text,
  variable_schema jsonb, allowed_imports jsonb, layout_config jsonb,
  styling_config jsonb, status text, total_executions integer, success_rate numeric,
  prompt_messages jsonb, prompt_settings jsonb, prompt_variable_defaults jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'app', 'agent', 'pg_temp'
AS $fn$
  SELECT
    a.id,
    a.user_id,
    a.agent_id AS prompt_id,
    a.slug, a.name, a.tagline, a.description, a.category, a.tags,
    a.preview_image_url, a.favicon_url, a.component_code, a.component_language,
    a.variable_schema, a.allowed_imports, a.layout_config, a.styling_config,
    a.status, a.total_executions, a.success_rate,
    COALESCE(av.messages, ag.messages) AS prompt_messages,
    COALESCE(av.settings, ag.settings) AS prompt_settings,
    COALESCE(av.variable_definitions, ag.variable_definitions) AS prompt_variable_defaults
  FROM app.definition a
  JOIN agent.definition ag ON ag.id = a.agent_id
  LEFT JOIN agent.definition_version av ON av.id = a.agent_version_id
  WHERE a.status = 'published'
    AND (
      (p_app_id IS NOT NULL AND a.id = p_app_id)
      OR (p_slug IS NOT NULL AND a.slug = p_slug)
    )
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.get_prompt_app_execution_payload(p_app_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'app', 'agent', 'pg_temp'
AS $fn$
DECLARE
  v_app record;
  v_result jsonb;
BEGIN
  SELECT agent_id, agent_version_id, use_latest
  INTO v_app
  FROM app.definition
  WHERE id = p_app_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'App not found');
  END IF;

  IF v_app.agent_version_id IS NOT NULL AND NOT COALESCE(v_app.use_latest, true) THEN
    SELECT jsonb_build_object(
      'messages', av.messages,
      'variable_defaults', av.variable_definitions,
      'tools', av.tools,
      'settings', av.settings,
      'model_id', av.model_id,
      'output_format', av.output_format,
      'output_schema', av.output_schema,
      'source_type', 'agent',
      'source_id', av.agent_id,
      'version_number', av.version_number
    ) INTO v_result
    FROM agent.definition_version av
    WHERE av.id = v_app.agent_version_id;
  END IF;

  IF v_result IS NULL THEN
    SELECT jsonb_build_object(
      'messages', ag.messages,
      'variable_defaults', ag.variable_definitions,
      'tools', ag.tools,
      'settings', ag.settings,
      'model_id', ag.model_id,
      'output_format', ag.output_format,
      'output_schema', ag.output_schema,
      'source_type', 'agent',
      'source_id', ag.id,
      'version_number', ag.version,
      '_fallback', true
    ) INTO v_result
    FROM agent.definition ag
    WHERE ag.id = v_app.agent_id;
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'No agent data found'));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.check_prompt_app_drift(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  app_id uuid, app_name text, prompt_id uuid, prompt_source_type text,
  pinned_version integer, current_version integer, versions_behind integer,
  prompt_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'app', 'agent', 'pg_temp'
AS $fn$
  SELECT
    a.id,
    a.name::text,
    a.agent_id,
    'agent'::text,
    COALESCE(a.pinned_version, av.version_number, ag.version),
    ag.version,
    GREATEST(ag.version - COALESCE(a.pinned_version, av.version_number, ag.version), 0),
    ag.name::text
  FROM app.definition a
  JOIN agent.definition ag ON ag.id = a.agent_id
  LEFT JOIN agent.definition_version av ON av.id = a.agent_version_id
  WHERE (p_user_id IS NULL OR a.user_id = p_user_id)
    AND NOT COALESCE(a.use_latest, true)
    AND COALESCE(a.pinned_version, av.version_number, 1) < ag.version;
$fn$;

CREATE OR REPLACE FUNCTION public.pin_prompt_app_to_version(p_app_id uuid, p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app', 'agent', 'pg_temp'
AS $fn$
DECLARE
  v_app record;
  v_version_num integer;
BEGIN
  SELECT a.id, a.agent_id, a.user_id, a.organization_id
  INTO v_app
  FROM app.definition a
  WHERE a.id = p_app_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'App not found');
  END IF;

  SELECT v.version_number INTO v_version_num
  FROM agent.definition_version v
  WHERE v.id = p_version_id AND v.agent_id = v_app.agent_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Version not found for this app agent');
  END IF;

  UPDATE app.definition
  SET agent_version_id = p_version_id,
      use_latest = false,
      pinned_version = v_version_num
  WHERE id = p_app_id;

  RETURN jsonb_build_object(
    'success', true,
    'app_id', p_app_id,
    'pinned_version', v_version_num,
    'agent_version_id', p_version_id
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 8) promote_version — drop graveyarded entity types (prompt/builtin/prompt_app)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_version(
  p_entity_type text,
  p_entity_id uuid,
  p_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'agent', 'tool', 'workbench', 'code', 'pg_temp'
AS $fn$
DECLARE
  v_new_version integer;
  v_old_name text;
BEGIN
  PERFORM set_config('app.change_note', 'Promoted version ' || p_version || ' to current', true);

  IF p_entity_type IN ('prompt', 'builtin', 'prompt_app') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'deprecated_entity_type',
      'message', p_entity_type || ' versioning was retired — use agent or app.definition'
    );
  ELSIF p_entity_type = 'tool_ui_component' THEN
    SELECT cv.display_name::text INTO v_old_name
    FROM tool.ui_version cv
    WHERE cv.component_id = p_entity_id AND cv.version_number = p_version;
    IF v_old_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Version not found');
    END IF;
    UPDATE tool.ui c SET
      tool_name = cv.tool_name, display_name = cv.display_name,
      results_label = cv.results_label, inline_code = cv.inline_code,
      overlay_code = cv.overlay_code, utility_code = cv.utility_code,
      header_extras_code = cv.header_extras_code,
      header_subtitle_code = cv.header_subtitle_code,
      keep_expanded_on_stream = cv.keep_expanded_on_stream,
      allowed_imports = cv.allowed_imports, language = cv.language,
      is_active = cv.is_active, notes = cv.notes
    FROM tool.ui_version cv
    WHERE c.id = p_entity_id
      AND cv.component_id = p_entity_id
      AND cv.version_number = p_version;
    SELECT version INTO v_new_version FROM tool.ui WHERE id = p_entity_id;

  ELSIF p_entity_type = 'tool' THEN
    SELECT tv.name::text INTO v_old_name
    FROM tool.definition_version tv
    WHERE tv.tool_id = p_entity_id AND tv.version_number = p_version;
    IF v_old_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Version not found');
    END IF;
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
    WHERE t.id = p_entity_id
      AND tv.tool_id = p_entity_id
      AND tv.version_number = p_version;
    SELECT version INTO v_new_version FROM tool.definition WHERE id = p_entity_id;

  ELSIF p_entity_type = 'note' THEN
    SELECT nv.label::text INTO v_old_name
    FROM public.note_versions nv
    WHERE nv.note_id = p_entity_id AND nv.version_number = p_version;
    IF v_old_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Version not found');
    END IF;
    UPDATE workbench.notes n SET content = nv.content, label = nv.label
    FROM public.note_versions nv
    WHERE n.id = p_entity_id
      AND nv.note_id = p_entity_id
      AND nv.version_number = p_version;
    SELECT version INTO v_new_version FROM workbench.notes WHERE id = p_entity_id;

  ELSIF p_entity_type = 'agent' THEN
    SELECT agv.name::text INTO v_old_name
    FROM agent.definition_version agv
    WHERE agv.agent_id = p_entity_id AND agv.version_number = p_version;
    IF v_old_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Version not found');
    END IF;
    UPDATE agent.definition a SET
      agent_type = agv.agent_type, name = agv.name, description = agv.description,
      messages = agv.messages, variable_definitions = agv.variable_definitions,
      model_id = agv.model_id, model_tiers = agv.model_tiers, settings = agv.settings,
      output_schema = agv.output_schema, tools = agv.tools, custom_tools = agv.custom_tools,
      context_slots = agv.context_slots, category = agv.category, tags = agv.tags,
      is_active = agv.is_active
    FROM agent.definition_version agv
    WHERE a.id = p_entity_id
      AND agv.agent_id = p_entity_id
      AND agv.version_number = p_version;
    SELECT version INTO v_new_version FROM agent.definition WHERE id = p_entity_id;

  ELSIF p_entity_type = 'code_file' THEN
    SELECT cfv.name::text INTO v_old_name
    FROM code.code_file_versions cfv
    WHERE cfv.code_file_id = p_entity_id AND cfv.version_number = p_version;
    IF v_old_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Version not found');
    END IF;
    UPDATE code.code_files cf SET content = cfv.content, name = cfv.name, language = cfv.language
    FROM code.code_file_versions cfv
    WHERE cf.id = p_entity_id
      AND cfv.code_file_id = p_entity_id
      AND cfv.version_number = p_version;
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
$fn$;

-- Drop index on graveyarded table if it still exists in public
DROP INDEX IF EXISTS public.prompt_apps_prompt_idx;
