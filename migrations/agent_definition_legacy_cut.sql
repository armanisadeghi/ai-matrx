-- agent_definition_legacy_cut.sql
-- Drops agent.definition.user_id and agent.definition.is_public (2026-08-12, chip task_12bab8f1).
-- Pre-verified: created_by agrees with user_id on every non-null row; all 189 is_public=true rows
-- are Matrx System org (global_readable) so viewer-level access already covers them.
-- Arman's ratified ruling: is_public checks become VIEWER-LEVEL ACCESS (iam.has_access_for viewer);
-- agx_get_access_level's 'public' tier derives from visibility, never the flag.
-- agent_definition_body_not_public_chk and card_visibility are deliberately untouched.
-- Idempotent: function CREATE OR REPLACE; DROPs guarded.

-- ── agx_get_access_level (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_get_access_level(p_agent_id uuid)
 RETURNS TABLE(agent_id uuid, agent_name text, owner_id uuid, owner_email text, access_level text, is_owner boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_agent record; v_level text := NULL; v_email text;
BEGIN
  SELECT a.id, a.name, a.created_by, a.organization_id, a.visibility INTO v_agent FROM agent.definition a WHERE a.id = p_agent_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_agent.created_by;
  IF v_agent.created_by = v_uid THEN v_level := 'owner';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'admin') THEN v_level := 'admin';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'editor') THEN v_level := 'editor';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'viewer') THEN v_level := 'viewer';
  ELSIF v_agent.visibility = 'public'::platform.visibility THEN v_level := 'public';
  ELSE v_level := 'none'; END IF;
  RETURN QUERY SELECT v_agent.id, v_agent.name, v_agent.created_by, v_email, v_level, (v_agent.created_by = v_uid);
END;
$function$
;

-- ── agx_create_agent_from_template (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_create_agent_from_template(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record;
  v_new_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source
  FROM agent.template
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  IF v_source.visibility <> 'public' THEN
    IF NOT iam.has_access_for(v_uid, 'agent_template', p_template_id, 'viewer') THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  v_new_id := gen_random_uuid();

  INSERT INTO agent.definition (
    id, agent_type, name, description, messages, variable_definitions, model_id,
    model_tiers, settings, output_schema, tools, custom_tools, context_slots,
    mcp_servers, category, tags, is_active, is_archived, is_favorite,
    created_by, organization_id, task_id, source_agent_id, source_snapshot_at
  )
  VALUES (
    v_new_id, 'user', v_source.name, v_source.description, v_source.messages,
    v_source.variable_definitions, v_source.model_id, v_source.model_tiers,
    v_source.settings, v_source.output_schema, v_source.tools, v_source.custom_tools,
    v_source.context_slots, v_source.mcp_servers, v_source.category, v_source.tags,
    true, false, false,
    v_uid, NULL, NULL, NULL, NULL);

  UPDATE agent.template
  SET use_count = use_count + 1
  WHERE id = p_template_id;

  RETURN v_new_id;
END;
$function$
;

-- ── agx_duplicate_agent (repointed to created_by / visibility)
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

  SELECT * INTO v_source
  FROM agent.definition
  WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF v_as_system THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
    END IF;
  ELSIF NOT iam.has_access_for(v_uid, 'agent', p_agent_id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags, is_active, is_archived, is_favorite,
      organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_slots,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode,
      v_source.category, v_source.tags, true, false, false,
      NULL, NULL, p_agent_id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags, is_active, is_archived, is_favorite,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_source.name || ' (Copy)', v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_slots,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode,
      v_source.category, v_source.tags, true, false, false,
      v_uid, NULL, NULL, p_agent_id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$
;

-- ── agx_duplicate_version (repointed to created_by / visibility)
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

  SELECT * INTO v_ver
  FROM agent.definition_version
  WHERE id = p_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent version not found';
  END IF;

  SELECT * INTO v_master
  FROM agent.definition
  WHERE id = v_ver.agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master agent not found for version';
  END IF;

  IF v_as_system THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
    END IF;
  ELSIF NOT (
    iam.has_access_for(v_uid, 'agent', v_master.id, 'viewer')
    OR v_master.agent_type = 'builtin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags, is_active, is_archived, is_favorite,
      organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', v_ver.name || ' (Copy)', v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_slots,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_master.default_rag_boost, v_master.rag_awareness_mode,
      v_ver.category, v_ver.tags, true, false, false,
      NULL, NULL, v_master.id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode,
      category, tags, is_active, is_archived, is_favorite,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', v_ver.name || ' (Copy)', v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_slots,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_master.default_rag_boost, v_master.rag_awareness_mode,
      v_ver.category, v_ver.tags, true, false, false,
      v_uid, NULL, NULL, v_master.id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$
;

-- ── agx_sync_linked_agents_reviewed (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_sync_linked_agents_reviewed(p_from_id uuid, p_to_id uuid, p_include_identity boolean, p_expected_from_updated_at timestamp with time zone, p_expected_to_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from        record;
  v_to          record;
  v_uid         uuid := auth.uid();
  v_derived_id  uuid;
  v_identity    boolean := COALESCE(p_include_identity, true);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'Cannot sync an agent with itself';
  END IF;

  -- Stable lock order prevents reverse-direction syncs from deadlocking.
  PERFORM id
  FROM agent.definition
  WHERE id IN (p_from_id, p_to_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_from FROM agent.definition WHERE id = p_from_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source agent not found';
  END IF;

  SELECT * INTO v_to FROM agent.definition WHERE id = p_to_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target agent not found';
  END IF;

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

  IF NOT (v_from.agent_type = 'builtin' AND v_from.is_active) THEN
    IF NOT iam.has_access_for(v_uid, 'agent', v_from.id, 'viewer') THEN
      RAISE EXCEPTION 'Access denied to source agent';
    END IF;
  END IF;

  IF v_to.agent_type = 'builtin' THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can sync into a system agent';
    END IF;
  ELSE
    IF v_to.created_by IS DISTINCT FROM v_uid AND NOT is_super_admin() THEN
      RAISE EXCEPTION 'You can only sync into an agent you own';
    END IF;
  END IF;

  UPDATE agent.definition SET
    name                 = CASE WHEN v_identity THEN v_from.name         ELSE name        END,
    description          = CASE WHEN v_identity THEN v_from.description ELSE description END,
    category             = CASE WHEN v_identity THEN v_from.category    ELSE category    END,
    tags                 = CASE WHEN v_identity THEN v_from.tags        ELSE tags        END,
    messages             = v_from.messages,
    variable_definitions = v_from.variable_definitions,
    model_id             = v_from.model_id,
    model_tiers          = v_from.model_tiers,
    settings             = v_from.settings,
    output_schema        = v_from.output_schema,
    tools                = v_from.tools,
    custom_tools         = v_from.custom_tools,
    context_slots        = v_from.context_slots,
    mcp_servers          = v_from.mcp_servers,
    tool_config          = v_from.tool_config,
    skill_config         = v_from.skill_config,
    matrx_actions        = v_from.matrx_actions,
    ui_gates             = v_from.ui_gates,
    default_rag_boost    = v_from.default_rag_boost,
    rag_awareness_mode   = v_from.rag_awareness_mode,
    updated_at           = now()
  WHERE id = v_to.id;

  UPDATE agent.definition
  SET source_snapshot_at = now()
  WHERE id = v_derived_id;

  RETURN v_to.id;
END;
$function$
;

-- ── agx_get_shared_for_chat (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_get_shared_for_chat()
 RETURNS TABLE(id uuid, name text, permission_level text, owner_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, perm.permission_level::text, u.email
  FROM agent.definition a
  INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = auth.uid()
  LEFT JOIN auth.users u ON u.id = a.created_by
  WHERE a.created_by != auth.uid() AND a.is_active AND NOT a.is_archived
  ORDER BY a.name;
$function$
;

-- ── agx_get_shared_with_me (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_get_shared_with_me()
 RETURNS TABLE(id uuid, name text, description text, agent_type text, category text, tags text[], owner_id uuid, owner_email text, permission_level text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, a.description, a.agent_type, a.category, a.tags, a.created_by, u.email, perm.permission_level::text, a.created_at, a.updated_at
  FROM agent.definition a
  INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = auth.uid()
  LEFT JOIN auth.users u ON u.id = a.created_by
  WHERE a.created_by != auth.uid() AND NOT a.is_archived
  ORDER BY a.name;
$function$
;

-- ── agx_purge_versions (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_purge_versions(p_agent_id uuid, p_keep_count integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_owner        uuid;
  v_live_version integer;
  v_deleted      integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_purge_versions: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT a.created_by, a.version INTO v_owner, v_live_version
  FROM agent.definition a WHERE a.id = p_agent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found');
  END IF;
  IF v_owner IS DISTINCT FROM v_uid AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'agx_purge_versions: only the agent owner may purge versions' USING ERRCODE = '42501';
  END IF;

  WITH to_delete AS (
    SELECT av.id
    FROM agent.definition_version av
    WHERE av.agent_id = p_agent_id
      AND av.version_number <> 1
      AND av.version_number <> v_live_version
      AND av.id NOT IN (SELECT s.agent_version_id  FROM agent.shortcut s  WHERE s.agent_version_id  IS NOT NULL)
      AND av.id NOT IN (SELECT ap.agent_version_id FROM app.definition ap     WHERE ap.agent_version_id IS NOT NULL)
      AND av.id NOT IN (SELECT v2.agent_version_id FROM app.definition_version v2 WHERE v2.agent_version_id IS NOT NULL)
      AND av.id NOT IN (SELECT e.agent_version_snapshot_id FROM agent.cmp_comparison_entries e
                        WHERE e.agent_version_snapshot_id IS NOT NULL)
      AND av.id NOT IN (SELECT r.agent_version_id FROM agent.usage r
                        WHERE r.agent_version_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM app.definition ap
                      WHERE ap.agent_id = p_agent_id
                        AND NOT COALESCE(ap.use_latest, true)
                        AND COALESCE(ap.pinned_version, 1) = av.version_number)
    ORDER BY av.version_number DESC
    OFFSET p_keep_count
  )
  DELETE FROM agent.definition_version WHERE id IN (SELECT td.id FROM to_delete td);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted, 'kept_count', p_keep_count);
END;
$function$
;

-- ── agx_usage_scan_core (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_usage_scan_core(p_agent_id uuid, p_viewer uuid, p_scope text DEFAULT 'agent'::text)
 RETURNS TABLE(usage_type text, usage_id uuid, node_id text, label text, owner_user_id uuid, organization_id uuid, organization_name text, org_manager_user_ids uuid[], agent_id uuid, agent_name text, current_version integer, pin_mode text, pinned_version_id uuid, pinned_version_number integer, versions_behind integer, stale_pin boolean, is_usage_active boolean, severity text, findings jsonb, config jsonb, managed_by_caller boolean, usage_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'scheduler', 'communication', 'agent', 'iam', 'app', 'workflow', 'pg_temp'
AS $function$
WITH usages AS (
  SELECT
    'shortcut'::text AS usage_type, s.id AS usage_id, NULL::text AS node_id,
    s.label, s.created_by AS owner_user_id, s.organization_id,
    COALESCE(s.agent_id, sv.agent_id) AS target_agent_id,
    CASE WHEN NOT s.use_latest AND sv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END AS pin_mode,
    CASE WHEN NOT s.use_latest THEN sv.id END AS pinned_version_id,
    CASE WHEN NOT s.use_latest THEN sv.version_number END AS pinned_version_number,
    (public.agx_usage_jsonb_keys(s.default_variables)
      || CASE WHEN public.agx_usage_jsonb_keys(s.value_mappings) <> '{}'::text[]
              THEN public.agx_usage_jsonb_keys(s.value_mappings)
              ELSE public.agx_usage_jsonb_text_values(s.scope_mappings) END) AS stored_var_keys,
    (public.agx_usage_jsonb_keys(s.context_overrides)
      || public.agx_usage_jsonb_text_values(s.context_mappings)) AS stored_slot_keys,
    (NOT COALESCE(s.auto_run, false)) AS is_interactive,
    s.is_active AS is_usage_active,
    jsonb_build_object(
      'default_variables', s.default_variables, 'value_mappings', s.value_mappings,
      'context_mappings', s.context_mappings, 'context_overrides', s.context_overrides,
      'scope_mappings', s.scope_mappings, 'auto_run', s.auto_run,
      'surface_name', s.surface_name, 'use_latest', s.use_latest) AS config,
    s.updated_at AS usage_updated_at
  FROM agent.shortcut s
  LEFT JOIN agent.definition_version sv ON sv.id = s.agent_version_id

  UNION ALL
  SELECT
    'app', ap.id, NULL, ap.name, ap.user_id, ap.organization_id,
    COALESCE(ap.agent_id, av.agent_id),
    CASE WHEN NOT COALESCE(ap.use_latest, true) AND av.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    CASE WHEN NOT COALESCE(ap.use_latest, true) THEN av.id END,
    CASE WHEN NOT COALESCE(ap.use_latest, true) THEN av.version_number END,
    (SELECT c.var_names FROM public.agx_usage_contract(ap.variable_schema, '[]'::jsonb) c),
    (SELECT c.slot_keys FROM public.agx_usage_contract('[]'::jsonb, ap.shared_context_slots) c),
    false,
    (ap.status = 'published'),
    jsonb_build_object(
      'variable_schema', ap.variable_schema, 'shared_context_slots', ap.shared_context_slots,
      'pinned_version', ap.pinned_version, 'status', ap.status, 'slug', ap.slug,
      'use_latest', ap.use_latest),
    ap.updated_at
  FROM app.definition ap
  LEFT JOIN agent.definition_version av ON av.id = ap.agent_version_id

  UNION ALL
  SELECT
    'scheduled_task', st.id, NULL, st.title, st.user_id, NULL::uuid,
    COALESCE(ta.id, tv.agent_id),
    CASE WHEN tv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    tv.id, tv.version_number,
    public.agx_usage_jsonb_keys(sat.variables),
    '{}'::text[],
    false,
    (st.enabled AND st.deleted_at IS NULL),
    jsonb_build_object('variables', sat.variables, 'prompt', left(sat.prompt, 400), 'kind', st.kind),
    st.updated_at
  FROM scheduler.sch_agent_task sat
  JOIN scheduler.sch_task st ON st.id = sat.id
  LEFT JOIN agent.definition ta ON ta.id = sat.agent_id
  LEFT JOIN agent.definition_version tv ON tv.id = sat.agent_id
  WHERE st.kind = 'agent' AND st.deleted_at IS NULL AND sat.agent_id IS NOT NULL

  UNION ALL
  SELECT
    'surface_binding', sf.id, NULL, sfu.name,
    NULLIF(sf.metadata ->> 'user_id', '')::uuid, sf.organization_id,
    COALESCE(sa.id, sv2.agent_id),
    CASE WHEN sv2.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    sv2.id, sv2.version_number,
    public.agx_usage_jsonb_keys(COALESCE(sf.metadata -> 'value_mappings', '{}'::jsonb)),
    '{}'::text[],
    false,
    true,
    jsonb_build_object('value_mappings', COALESCE(sf.metadata -> 'value_mappings', '{}'::jsonb), 'surface_name', sfu.name),
    sf.created_at
  FROM platform.associations sf
  JOIN ui.ui_surface sfu ON sfu.id = sf.target_id
  LEFT JOIN agent.definition sa ON sa.id = sf.source_id
  LEFT JOIN agent.definition_version sv2 ON sv2.id = sf.source_id
  WHERE sf.source_type = 'agent' AND sf.target_type = 'surface'

  UNION ALL
  SELECT
    'sms_line', sc.id, NULL, COALESCE(sc.external_phone_number, 'SMS line'),
    sc.user_id, NULL::uuid,
    COALESCE(ma.id, mv.agent_id),
    CASE WHEN mv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    mv.id, mv.version_number,
    '{}'::text[], '{}'::text[],
    false,
    (sc.status = 'active'),
    jsonb_build_object('our_phone_number', sc.our_phone_number, 'conversation_type', sc.conversation_type),
    sc.updated_at
  FROM communication.sms_conversations sc
  CROSS JOIN LATERAL (
    SELECT CASE WHEN sc.ai_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN sc.ai_agent_id::uuid END AS ref_id
  ) rid
  LEFT JOIN agent.definition ma ON ma.id = rid.ref_id
  LEFT JOIN agent.definition_version mv ON mv.id = rid.ref_id
  WHERE rid.ref_id IS NOT NULL

  UNION ALL
  SELECT
    'workflow_node', w.id, n.elem ->> 'id',
    w.name || ' · ' || COALESCE(n.elem -> 'data' ->> 'label', n.elem ->> 'id'),
    w.created_by, w.organization_id,
    COALESCE(wa.id, wv.agent_id),
    CASE WHEN wv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    wv.id, wv.version_number,
    public.agx_usage_jsonb_keys(n.elem -> 'data' -> 'config' -> 'variables'),
    '{}'::text[],
    false,
    (NOT COALESCE(w.is_archived, false)),
    jsonb_build_object('workflow_id', w.id, 'node_label', n.elem -> 'data' ->> 'label',
                       'node_config', n.elem -> 'data' -> 'config'),
    NULL::timestamptz
  FROM workflow.definition w
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w.nodes) = 'array' THEN w.nodes ELSE '[]'::jsonb END) n(elem)
  CROSS JOIN LATERAL (
    SELECT CASE WHEN (n.elem -> 'data' -> 'config' ->> 'agent_id')
                     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (n.elem -> 'data' -> 'config' ->> 'agent_id')::uuid END AS ref_id
  ) rid
  LEFT JOIN agent.definition wa ON wa.id = rid.ref_id
  LEFT JOIN agent.definition_version wv ON wv.id = rid.ref_id
  WHERE rid.ref_id IS NOT NULL

  UNION ALL
  SELECT
    'derived_agent', d.id, NULL, d.name, d.created_by, d.organization_id,
    d.source_agent_id,
    'pinned',
    dpv.id, dpv.version_number,
    '{}'::text[], '{}'::text[],
    true,
    (d.is_active AND NOT d.is_archived),
    jsonb_build_object('source_snapshot_at', d.source_snapshot_at, 'derived_version', d.version),
    d.updated_at
  FROM agent.definition d
  LEFT JOIN LATERAL (
    SELECT v.id, v.version_number FROM agent.definition_version v
    WHERE v.agent_id = d.source_agent_id
      AND (d.source_snapshot_at IS NULL OR v.changed_at <= d.source_snapshot_at)
    ORDER BY v.version_number DESC LIMIT 1
  ) dpv ON true
  WHERE d.source_agent_id IS NOT NULL

  UNION ALL
  SELECT
    'comparison', e.id, NULL, COALESCE(cs.name, 'Comparison entry'),
    cs.created_by, cs.organization_id,
    COALESCE(ca.id, cv.agent_id),
    CASE WHEN e.agent_version_snapshot_id IS NOT NULL OR e.agent_version IS NOT NULL
         THEN 'pinned' ELSE 'follow_active' END,
    cv2.id, COALESCE(cv2.version_number, e.agent_version),
    '{}'::text[], '{}'::text[],
    true,
    true,
    jsonb_build_object('comparison_set_id', e.comparison_set_id, 'agent_version', e.agent_version),
    e.created_at
  FROM agent.cmp_comparison_entries e
  LEFT JOIN agent.cmp_comparison_sets cs ON cs.id = e.comparison_set_id
  LEFT JOIN agent.definition ca ON ca.id = e.agent_id
  LEFT JOIN agent.definition_version cv ON cv.id = e.agent_id
  LEFT JOIN agent.definition_version cv2 ON cv2.id = e.agent_version_snapshot_id

  UNION ALL
  SELECT
    'code', r.id, NULL, r.usage_key, NULL::uuid, NULL::uuid,
    COALESCE(r.agent_id, rv.agent_id),
    CASE WHEN r.ref_kind = 'version' THEN 'pinned' ELSE 'follow_active' END,
    rv.id, rv.version_number,
    '{}'::text[], '{}'::text[],
    false,
    true,
    jsonb_build_object('purpose', r.purpose, 'code_path', r.code_path,
                       'source_system', r.source_system, 'ref_kind', r.ref_kind),
    r.last_synced_at
  FROM agent.usage r
  LEFT JOIN agent.definition_version rv ON rv.id = r.agent_version_id
  WHERE r.status = 'active' AND r.ref_kind IN ('version', 'agent')
),
enriched AS (
  SELECT
    u.*,
    ag.name AS r_agent_name,
    ag.version AS r_current_version,
    (ag.is_archived OR NOT ag.is_active) AS agent_unavailable,
    lc.var_names AS live_vars, lc.required_var_names AS live_req, lc.slot_keys AS live_slots,
    pvrow.id AS pin_row_id,
    pc.var_names AS pin_vars, pc.required_var_names AS pin_req, pc.slot_keys AS pin_slots,
    org.name AS r_organization_name,
    (SELECT array_agg(om.user_id) FROM iam.organization_member om
      WHERE om.organization_id = u.organization_id AND om.role IN ('owner', 'admin')) AS r_org_managers,
    (u.pin_mode = 'pinned' AND u.pinned_version_number IS NOT NULL
      AND u.pinned_version_number <> ag.version) AS r_stale_pin
  FROM usages u
  JOIN agent.definition ag ON ag.id = u.target_agent_id
  CROSS JOIN LATERAL public.agx_usage_contract(ag.variable_definitions, ag.context_slots) lc
  LEFT JOIN agent.definition_version pvrow ON pvrow.id = u.pinned_version_id
  LEFT JOIN LATERAL (
    SELECT c.var_names, c.required_var_names, c.slot_keys
    FROM public.agx_usage_contract(pvrow.variable_definitions, pvrow.context_slots) c
    WHERE pvrow.id IS NOT NULL
  ) pc ON true
  LEFT JOIN iam.organizations org ON org.id = u.organization_id
  WHERE u.target_agent_id IS NOT NULL
    AND (p_scope = 'all' OR u.target_agent_id = p_agent_id)
),
evaluated AS (
  SELECT
    e.*,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_vars  ELSE e.live_vars  END AS eff_vars,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_req   ELSE e.live_req   END AS eff_req,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_slots ELSE e.live_slots END AS eff_slots,
    (e.pin_row_id IS NOT NULL AND NOT (
        e.pin_vars <@ e.live_vars AND e.pin_vars @> e.live_vars
        AND e.pin_req <@ e.live_req AND e.pin_req @> e.live_req
        AND e.pin_slots <@ e.live_slots AND e.pin_slots @> e.live_slots)) AS contract_changed
  FROM enriched e
),
finalized AS (
  SELECT
    v.*,
    CASE WHEN v.usage_type = 'comparison' THEN
      CASE WHEN v.r_stale_pin THEN jsonb_build_array(jsonb_build_object(
        'drift_class', 'stale_pin', 'severity', 'info', 'detail', '{}'::jsonb))
      ELSE '[]'::jsonb END
    ELSE
      public.agx_usage_eval(
        v.usage_type, v.stored_var_keys, v.stored_slot_keys,
        v.eff_vars, v.eff_req, v.eff_slots,
        v.is_interactive, v.pin_mode, v.r_stale_pin, v.contract_changed,
        (v.agent_unavailable AND v.is_usage_active))
    END AS r_findings
  FROM evaluated v
)
SELECT
  f.usage_type,
  f.usage_id,
  f.node_id,
  f.label,
  f.owner_user_id,
  f.organization_id,
  f.r_organization_name,
  f.r_org_managers,
  f.target_agent_id,
  f.r_agent_name,
  f.r_current_version,
  f.pin_mode,
  f.pinned_version_id,
  f.pinned_version_number,
  CASE WHEN f.pin_mode = 'pinned' AND f.pinned_version_number IS NOT NULL
       THEN GREATEST(f.r_current_version - f.pinned_version_number, 0) END,
  f.r_stale_pin,
  f.is_usage_active,
  CASE
    WHEN f.r_findings @> '[{"severity":"breaking"}]'::jsonb        THEN 'breaking'
    WHEN f.r_findings @> '[{"severity":"silent_breaking"}]'::jsonb THEN 'silent_breaking'
    WHEN f.r_findings @> '[{"severity":"warning"}]'::jsonb         THEN 'warning'
    WHEN f.r_findings @> '[{"severity":"info"}]'::jsonb            THEN 'info'
  END,
  f.r_findings,
  f.config || jsonb_build_object('effective', jsonb_build_object(
    'variables', to_jsonb(f.eff_vars),
    'required_variables', to_jsonb(f.eff_req),
    'context_slots', to_jsonb(f.eff_slots))),
  (p_viewer IS NOT NULL AND (
     f.owner_user_id = p_viewer
     OR (f.organization_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM iam.organization_member om
           WHERE om.organization_id = f.organization_id
             AND om.user_id = p_viewer AND om.role IN ('owner', 'admin'))))),
  f.usage_updated_at
FROM finalized f
$function$
;

-- ── agx_usage_report (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_usage_report()
 RETURNS TABLE(agent_id uuid, agent_name text, current_version integer, agent_is_active boolean, owned_by_caller boolean, my_usage_count integer, my_breaking integer, my_silent integer, my_warning integer, my_info integer, my_stale_pins integer, others_usage_count integer, others_redflag_count integer, by_type jsonb, alert_id uuid, alert_status text, alert_severity text, alert_detected_at timestamp with time zone, alert_last_scanned_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_report: not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.agx_usage_scan_core(NULL, v_uid, 'all')
  ),
  agent_scope AS (
    SELECT a.id, a.name, a.version, (a.is_active AND NOT a.is_archived) AS live,
           (a.created_by = v_uid
            OR (a.organization_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = a.organization_id
                    AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))) AS oversees
    FROM agent.definition a
    WHERE a.created_by = v_uid
       OR (a.organization_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM iam.organization_member om
             WHERE om.organization_id = a.organization_id
               AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))
       OR EXISTS (SELECT 1 FROM r WHERE r.agent_id = a.id AND r.managed_by_caller)
  )
  SELECT
    s.id, s.name, s.version, s.live, s.oversees,
    (count(*) FILTER (WHERE r.managed_by_caller))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.stale_pin))::integer,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller))::integer END,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller AND r.is_usage_active
                                AND r.severity IN ('breaking', 'silent_breaking', 'warning')))::integer END,
    COALESCE((SELECT jsonb_object_agg(t.usage_type, t.n) FROM (
       SELECT r2.usage_type, count(*) AS n FROM r r2
       WHERE r2.agent_id = s.id AND (r2.managed_by_caller OR s.oversees)
       GROUP BY r2.usage_type) t), '{}'::jsonb),
    al.id, al.status, al.severity, al.detected_at, al.last_scanned_at
  FROM agent_scope s
  LEFT JOIN r ON r.agent_id = s.id
  LEFT JOIN LATERAL (
    SELECT a2.id, a2.status, a2.severity, a2.detected_at, a2.last_scanned_at
    FROM agent.drift_alert a2
    WHERE a2.created_by = v_uid AND a2.agent_id = s.id
      AND a2.status IN ('pending', 'acknowledged')
    ORDER BY a2.detected_at DESC LIMIT 1
  ) al ON true
  GROUP BY s.id, s.name, s.version, s.live, s.oversees,
           al.id, al.status, al.severity, al.detected_at, al.last_scanned_at;
END;
$function$
;

-- ── agx_usage_report_admin (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_usage_report_admin()
 RETURNS TABLE(agent_id uuid, agent_name text, current_version integer, agent_is_active boolean, agent_owner_id uuid, agent_owner_email text, usage_count integer, breaking integer, silent integer, warning integer, info integer, stale_pins integer, affected_users integer, owners jsonb, by_type jsonb, open_alerts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'agx_usage_report_admin: super admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.agx_usage_scan_core(NULL, NULL, 'all')
  )
  SELECT
    a.id, a.name, a.version, (a.is_active AND NOT a.is_archived),
    a.created_by, u.email::text,
    count(r.usage_id)::integer,
    (count(*) FILTER (WHERE r.is_usage_active AND r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.is_usage_active AND r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.is_usage_active AND r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.is_usage_active AND r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.stale_pin))::integer,
    (count(DISTINCT r.owner_user_id))::integer,
    COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('user_id', r2.owner_user_id))
              FROM r r2 WHERE r2.agent_id = a.id AND r2.owner_user_id IS NOT NULL), '[]'::jsonb),
    COALESCE((SELECT jsonb_object_agg(t.usage_type, t.n) FROM (
       SELECT r3.usage_type, count(*) AS n FROM r r3
       WHERE r3.agent_id = a.id GROUP BY r3.usage_type) t), '{}'::jsonb),
    (SELECT count(*) FROM agent.drift_alert al
      WHERE al.agent_id = a.id AND al.status IN ('pending', 'acknowledged'))::integer
  FROM agent.definition a
  JOIN r ON r.agent_id = a.id
  LEFT JOIN auth.users u ON u.id = a.created_by
  GROUP BY a.id, a.name, a.version, a.is_active, a.is_archived, a.created_by, u.email;
END;
$function$
;

-- ── agx_usage_update_to_active (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.agx_usage_update_to_active(p_usage_type text, p_usage_id uuid, p_mode text DEFAULT 'repin_active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_super     boolean;
  v_owner     uuid;
  v_org       uuid;
  v_agent     uuid;
  v_live      integer;
  v_target    uuid;
  v_has_perm  boolean;
  v_res       jsonb;
  v_code_path text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_update_to_active: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('repin_active', 'follow_active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_mode');
  END IF;
  v_super := public.is_super_admin();

  -- Resolve owner / org / target agent per usage type --------------------------
  IF p_usage_type = 'shortcut' THEN
    SELECT s.created_by, s.organization_id, COALESCE(s.agent_id, sv.agent_id)
      INTO v_owner, v_org, v_agent
    FROM agent.shortcut s LEFT JOIN agent.definition_version sv ON sv.id = s.agent_version_id
    WHERE s.id = p_usage_id;
  ELSIF p_usage_type = 'app' THEN
    SELECT ap.user_id, ap.organization_id, COALESCE(ap.agent_id, av.agent_id)
      INTO v_owner, v_org, v_agent
    FROM app.definition ap LEFT JOIN agent.definition_version av ON av.id = ap.agent_version_id
    WHERE ap.id = p_usage_id;
  ELSIF p_usage_type = 'derived_agent' THEN
    SELECT d.created_by, d.organization_id, d.source_agent_id
      INTO v_owner, v_org, v_agent
    FROM agent.definition d WHERE d.id = p_usage_id AND d.source_agent_id IS NOT NULL;
  ELSIF p_usage_type IN ('scheduled_task', 'surface_binding', 'sms_line', 'comparison') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pinnable',
      'message', 'This usage always follows the active version — nothing to update.');
  ELSIF p_usage_type = 'workflow_node' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_remediable_in_sql',
      'workflow_id', p_usage_id,
      'message', 'Update the agent reference inside the workflow editor.');
  ELSIF p_usage_type = 'code' THEN
    SELECT r.code_path INTO v_code_path FROM agent.usage r WHERE r.id = p_usage_id;
    RETURN jsonb_build_object('success', false, 'error', 'code_managed',
      'code_path', v_code_path,
      'message', 'This usage is pinned in backend code — update the declaration and redeploy.');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_usage_type');
  END IF;

  IF v_agent IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  v_has_perm := v_super OR v_owner = v_uid OR (
    v_org IS NOT NULL AND EXISTS (
      SELECT 1 FROM iam.organization_member om
      WHERE om.organization_id = v_org AND om.user_id = v_uid
        AND om.role IN ('owner', 'admin')));
  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'agx_usage_update_to_active: not permitted for this usage' USING ERRCODE = '42501';
  END IF;

  SELECT a.version INTO v_live FROM agent.definition a WHERE a.id = v_agent;
  IF v_live IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agent_not_found');
  END IF;

  -- Apply ----------------------------------------------------------------------
  IF p_usage_type = 'shortcut' THEN
    IF p_mode = 'follow_active' THEN
      UPDATE agent.shortcut SET use_latest = true, agent_version_id = NULL WHERE id = p_usage_id;
    ELSE
      SELECT v.id INTO v_target FROM agent.definition_version v
        WHERE v.agent_id = v_agent AND v.version_number = v_live;
      IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_snapshot_for_active_version');
      END IF;
      UPDATE agent.shortcut SET agent_version_id = v_target, use_latest = false WHERE id = p_usage_id;
    END IF;

  ELSIF p_usage_type = 'app' THEN
    IF p_mode = 'follow_active' THEN
      UPDATE app.definition SET use_latest = true, agent_version_id = NULL, pinned_version = NULL
        WHERE id = p_usage_id;
    ELSE
      SELECT v.id INTO v_target FROM agent.definition_version v
        WHERE v.agent_id = v_agent AND v.version_number = v_live;
      IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_snapshot_for_active_version');
      END IF;
      UPDATE app.definition SET agent_version_id = v_target, use_latest = false, pinned_version = v_live
        WHERE id = p_usage_id;
    END IF;


  ELSIF p_usage_type = 'derived_agent' THEN
    BEGIN
      v_res := public.agx_update_from_source(p_usage_id);
      IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
        RETURN v_res;
      END IF;
      UPDATE agent.definition SET source_snapshot_at = now() WHERE id = p_usage_id;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', 'sync_failed', 'message', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'usage_type', p_usage_type,
    'usage_id', p_usage_id,
    'mode', p_mode,
    'pinned_version_number', CASE WHEN p_mode = 'repin_active' THEN v_live END);
END;
$function$
;

-- ── get_agent_core_batch (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.get_agent_core_batch(p_ids uuid[], p_sources text[])
 RETURNS TABLE(id uuid, source text, name text, description text, tags text[], category text, is_archived boolean, is_favorite boolean, is_active boolean, output_format text, created_at timestamp with time zone, updated_at timestamp with time zone, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prompt_ids uuid[];
  builtin_ids uuid[];
BEGIN
  SELECT array_agg(p_ids[i])
    INTO prompt_ids
    FROM generate_subscripts(p_ids, 1) AS i
    WHERE p_sources[i] = 'prompts';

  SELECT array_agg(p_ids[i])
    INTO builtin_ids
    FROM generate_subscripts(p_ids, 1) AS i
    WHERE p_sources[i] IN ('builtins', 'shared');

  IF prompt_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT
      d.id,
      CASE WHEN d.created_by = auth.uid() THEN 'prompts' ELSE 'shared' END::text,
      d.name::text,
      d.description,
      d.tags,
      d.category,
      d.is_archived,
      d.is_favorite,
      false AS is_active,
      NULL::text AS output_format,
      d.created_at,
      d.updated_at,
      d.version
    FROM agent.definition d
    WHERE d.id = ANY(prompt_ids)
      AND d.agent_type = 'user'
      AND (d.created_by = auth.uid() OR has_permission('agent', d.id, 'viewer'));
  END IF;

  IF builtin_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT
      d.id,
      'builtins'::text,
      d.name::text,
      d.description,
      d.tags,
      d.category,
      d.is_archived,
      d.is_favorite,
      d.is_active,
      NULL::text AS output_format,
      d.created_at,
      d.updated_at,
      d.version
    FROM agent.definition d
    WHERE d.id = ANY(builtin_ids) AND d.agent_type = 'builtin';
  END IF;
END;
$function$
;

-- ── get_agent_operational (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.get_agent_operational(p_id uuid, p_source text)
 RETURNS TABLE(id uuid, source text, variable_defaults jsonb, dynamic_model boolean, settings jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_source IN ('prompts', 'shared') THEN
    RETURN QUERY
    SELECT
      d.id,
      p_source::text,
      d.variable_definitions AS variable_defaults,
      NULL::boolean AS dynamic_model,
      d.settings
    FROM agent.definition d
    WHERE d.id = p_id
      AND d.agent_type = 'user'
      AND (d.created_by = auth.uid() OR has_permission('agent', d.id, 'viewer'));
  ELSE
    RETURN QUERY
    SELECT
      d.id,
      'builtins'::text,
      d.variable_definitions AS variable_defaults,
      NULL::boolean AS dynamic_model,
      d.settings
    FROM agent.definition d
    WHERE d.id = p_id AND d.agent_type = 'builtin';
  END IF;
END;
$function$
;

-- ── get_agents_for_chat (repointed to created_by / visibility)
CREATE OR REPLACE FUNCTION public.get_agents_for_chat(p_limit integer DEFAULT 50, p_cursor uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT d.id, d.name::text, 'prompts'::text AS source
  FROM agent.definition d
  WHERE d.agent_type = 'user'
    AND d.created_by = auth.uid()
    AND NOT d.is_archived
    AND (p_cursor IS NULL OR d.id > p_cursor)
  ORDER BY d.id
  LIMIT p_limit;

  RETURN QUERY
  SELECT d.id, d.name::text, 'builtins'::text AS source
  FROM agent.definition d
  WHERE d.agent_type = 'builtin' AND d.is_active = true AND NOT d.is_archived
  ORDER BY d.name;
END;
$function$
;

-- ── OUT-column renames (user_id -> created_by): rename requires DROP + CREATE + re-GRANT
DROP FUNCTION IF EXISTS public.agx_get_list_full();
DROP FUNCTION IF EXISTS public.agx_get_list(integer, integer);
DROP FUNCTION IF EXISTS public.agx_search(text, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer);

-- ── agx_get_list (recreated: OUT col created_by)
CREATE OR REPLACE FUNCTION public.agx_get_list(p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, created_by uuid, organization_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  WITH all_agents AS (
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           true AS is_owner, 'owner'::text AS access_level, NULL::text AS shared_by_email
    FROM agent.definition a
    WHERE a.created_by = v_uid AND a.agent_type = 'user'
      AND a.deleted_at IS NULL   -- D101: a deleted agent is not in anyone's list
    UNION ALL
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = v_uid
    LEFT JOIN auth.users u_owner ON u_owner.id = a.created_by
    WHERE a.created_by != v_uid
      AND a.deleted_at IS NULL   -- D101
    UNION ALL
    SELECT DISTINCT ON (a.id) a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id
      AND perm.granted_to_organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = v_uid)
    LEFT JOIN auth.users u_owner ON u_owner.id = a.created_by
    WHERE a.created_by != v_uid
      AND a.deleted_at IS NULL   -- D101
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type = 'agent' AND p2.resource_id = a.id AND p2.granted_to_user_id = v_uid)
  )
  SELECT * FROM all_agents
  -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
  ORDER BY all_agents.is_favorite DESC, all_agents.updated_at DESC, all_agents.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$
;

-- ── agx_get_list_full (recreated: OUT col created_by)
CREATE OR REPLACE FUNCTION public.agx_get_list_full()
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, created_by uuid, organization_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM agx_get_list();
  RETURN QUERY SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags, a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at, false, 'system'::text, NULL::text
  FROM agent.definition a WHERE a.agent_type = 'builtin' AND a.is_active = true;
END;
$function$
;

-- ── agx_search (recreated: OUT col created_by)
CREATE OR REPLACE FUNCTION public.agx_search(p_query text, p_deep boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, created_by uuid, organization_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text, match_score integer, match_field text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_q    text := lower(btrim(coalesce(p_query, '')));
  v_like text;
BEGIN
  IF v_uid IS NULL OR v_q = '' THEN RETURN; END IF;

  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  WITH accessible AS (
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           true AS is_owner, 'owner'::text AS access_level, NULL::text AS shared_by_email,
           a.messages
    FROM agent.definition a
    WHERE a.created_by = v_uid AND a.agent_type = 'user'
      AND a.deleted_at IS NULL   -- D101: search must not resurrect a deleted agent
    UNION ALL
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email, a.messages
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = v_uid
    LEFT JOIN auth.users u_owner ON u_owner.id = a.created_by
    WHERE a.created_by != v_uid
      AND a.deleted_at IS NULL   -- D101
    UNION ALL
    SELECT DISTINCT ON (a.id) a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email, a.messages
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id
      AND perm.granted_to_organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = v_uid)
    LEFT JOIN auth.users u_owner ON u_owner.id = a.created_by
    WHERE a.created_by != v_uid
      AND a.deleted_at IS NULL   -- D101
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type = 'agent' AND p2.resource_id = a.id AND p2.granted_to_user_id = v_uid)
  ),
  scored AS (
    SELECT c.*,
      ( CASE WHEN lower(c.id::text) = v_q THEN 100000
             WHEN lower(c.id::text) LIKE v_like THEN 5000 ELSE 0 END
      + CASE WHEN lower(coalesce(c.name,'')) = v_q THEN 10000
             WHEN lower(coalesce(c.name,'')) LIKE v_q || '%' THEN 5000
             WHEN lower(coalesce(c.name,'')) LIKE v_like THEN 2000 ELSE 0 END
      + CASE WHEN lower(coalesce(c.description,'')) = v_q THEN 1000
             WHEN lower(coalesce(c.description,'')) LIKE v_like THEN 500 ELSE 0 END
      + CASE WHEN lower(coalesce(c.category,'')) LIKE v_like THEN 300 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM unnest(coalesce(c.tags, '{}'::text[])) t WHERE lower(t) LIKE v_like) THEN 300 ELSE 0 END
      + CASE WHEN lower(coalesce(c.model_id::text,'')) LIKE v_like THEN 100 ELSE 0 END
      + CASE WHEN lower(coalesce(c.agent_type,'')) LIKE v_like THEN 100 ELSE 0 END
      + CASE WHEN lower(coalesce(c.shared_by_email,'')) LIKE v_like THEN 200 ELSE 0 END
      + CASE WHEN p_deep AND lower(coalesce(c.messages::text,'')) LIKE v_like THEN 50 ELSE 0 END
      )::integer AS match_score,
      CASE
        WHEN lower(c.id::text) = v_q OR lower(c.id::text) LIKE v_like THEN 'id'
        WHEN lower(coalesce(c.name,'')) LIKE v_like THEN 'name'
        WHEN lower(coalesce(c.description,'')) LIKE v_like THEN 'description'
        WHEN lower(coalesce(c.category,'')) LIKE v_like THEN 'category'
        WHEN EXISTS (SELECT 1 FROM unnest(coalesce(c.tags, '{}'::text[])) t WHERE lower(t) LIKE v_like) THEN 'tags'
        WHEN lower(coalesce(c.shared_by_email,'')) LIKE v_like THEN 'shared_by_email'
        WHEN lower(coalesce(c.model_id::text,'')) LIKE v_like THEN 'model'
        WHEN lower(coalesce(c.agent_type,'')) LIKE v_like THEN 'agent_type'
        WHEN p_deep AND lower(coalesce(c.messages::text,'')) LIKE v_like THEN 'prompt'
        ELSE NULL
      END AS match_field
    FROM accessible c
  )
  SELECT s.id, s.agent_type, s.name, s.description, s.model_id, s.category, s.tags,
         s.is_active, s.is_archived, s.is_favorite, s.created_by, s.organization_id, s.task_id, s.source_agent_id, s.created_at, s.updated_at,
         s.is_owner, s.access_level, s.shared_by_email, s.match_score, s.match_field
  FROM scored s
  WHERE s.match_score > 0
  -- `s.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
  ORDER BY s.match_score DESC, s.is_favorite DESC, s.updated_at DESC, s.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$
;

-- ── agx_list_scoped (recreated: OUT col created_by)
CREATE OR REPLACE FUNCTION public.agx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, created_by uuid, organization_id uuid, organization_name text, task_id uuid, source_agent_id uuid, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Column filters, keyed by column id. '__none__' is the sentinel for
  -- "has no value" (uncategorized / untagged).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public') THEN
    RAISE EXCEPTION 'agx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    -- Aliased to org_id on purpose: a bare `organization_id` resolves to the
    -- RETURNS TABLE OUT variable of the same name (42702 ambiguous reference).
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    JOIN iam.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_uid AND o.is_personal IS NOT TRUE
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  scoped AS (
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a WHERE v_scope='mine' AND a.created_by = v_uid
    UNION ALL
    SELECT a.*, false, 'org'::text FROM agent.definition a
    WHERE v_scope='orgs' AND a.created_by IS DISTINCT FROM v_uid
      AND a.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
      AND a.visibility IN ('internal','public')
    UNION ALL
    SELECT a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (a.id) a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='agent'
        AND p2.resource_id=a.id AND p2.granted_to_user_id=v_uid)
    UNION ALL
    SELECT a.*, false, 'public'::text FROM agent.definition a
    WHERE v_scope='public' AND a.created_by IS DISTINCT FROM v_uid AND a.visibility='public'
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN auth.users u ON u.id = s.created_by
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.agent_type='user' AND j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR (p_deep AND j.messages::text ILIKE '%'||v_search||'%'))
      -- Per-column TEXT filters
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- Per-column MULTI-SELECT filters
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      -- BOOLEAN filters
      AND (NOT v_f ? 'favorite'
           OR coalesce(j.is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.agx_search_score(
      v_search, f.id, f.name, f.description, f.category, f.tags,
      f.model_id, f.agent_type, f.s_owner_email,
      p_deep AND f.messages::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.agent_type, c.name, c.description, c.model_id, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, c.is_favorite,
    c.visibility::text, c.created_by, c.organization_id, c.s_org_name, c.task_id, c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST when searching. A name match must outrank a description
    -- match; ordering a search by updated_at buries the thing you asked for.
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    -- Favorites pinned to the top of EVERY sort. This is the product default:
    -- what you starred is what you reach for.
    CASE WHEN p_favorites_first THEN c.is_favorite END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.description,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.category,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='access_level' AND v_dir='desc' THEN lower(coalesce(c.s_access,'')) END DESC,
    CASE WHEN v_sort='access_level' AND v_dir='asc' THEN lower(coalesce(c.s_access,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='version' AND v_dir='desc' THEN c.version END DESC,
    CASE WHEN v_sort='version' AND v_dir='asc' THEN c.version END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.is_favorite END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN c.is_favorite END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$
;

GRANT EXECUTE ON FUNCTION public.agx_get_list(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agx_get_list_full() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agx_search(text, boolean, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) TO authenticated, service_role;

-- ── Indexes: legacy-column indexes die with the cut; created_by gets the owner index
DROP INDEX IF EXISTS agent.idx_agx_agent_public;
DROP INDEX IF EXISTS agent.idx_agx_agent_user;
DROP INDEX IF EXISTS agent.idx_agx_agent_user_id;
CREATE INDEX IF NOT EXISTS idx_agx_agent_created_by ON agent.definition (created_by) WHERE created_by IS NOT NULL;

-- ── The cut (plain DROP, no CASCADE: any surviving dependent must error loudly here)
ALTER TABLE agent.definition DROP COLUMN IF EXISTS user_id;
ALTER TABLE agent.definition DROP COLUMN IF EXISTS is_public;
