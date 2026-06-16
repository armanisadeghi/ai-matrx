-- agx_duplicate_version — fork the EXACT pinned agx_version snapshot the server
-- runs, not the (possibly drifted/corrupted) master agx_agent row.
--
-- Why this exists:
--   Some agents are deployed by pinning a specific `agx_version` snapshot, NOT
--   the live master row. The research pipeline does this for all eight of its
--   system agents (aidream `research/agents.py` → `declare_pinned_agent(version_id=…)`
--   returns `AgentRecordSource(is_version=True)`). For two of them
--   (Tag Consolidation, Auto-Tagger) the pinned version is deliberately NOT the
--   master because the master's later versions were corrupted by a 2026-03-31
--   batch migration. So the existing `agx_duplicate_agent(master_id)` would hand
--   a user a DIFFERENT — and sometimes corrupted — agent than the one the server
--   actually runs. "Copy & Update" must duplicate the VERSION.
--
-- Contract: given a pinned `agx_version.id`, snapshot it into a new editable
-- agent. Versioned fields come from the version row; the three non-versioned
-- fields (skill_config, default_rag_boost, rag_awareness_mode) come from the
-- master so the copy matches what the executor loads.
--
-- Access: a caller may fork a version when they have viewer access to its
-- master, OR the master is public, OR the master is a builtin SYSTEM agent —
-- the research role agents are builtins the product is explicitly designed to
-- let any user fork via "Copy & Update". Forking only copies content into the
-- caller's own private agent; it does not expose the master in any listing.
--
-- SECURITY DEFINER so it can read the version + master rows and write the copy
-- (RLS would otherwise refuse the cross-owner read). Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.agx_duplicate_version(
  p_version_id uuid,
  p_as_system  boolean DEFAULT false
)
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

  -- viewer access OR public OR a builtin system agent (forkable by design).
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

  -- Promoting to a system agent stays super-admin-only (mirrors agx_duplicate_agent).
  IF v_as_system AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agx_agent (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, default_rag_boost, rag_awareness_mode,
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
      v_master.skill_config, v_master.default_rag_boost, v_master.rag_awareness_mode,
      v_ver.category, v_ver.tags,
      true,           -- is_active
      true,           -- is_public — system agents are visible to everyone
      false,          -- is_archived
      false,          -- is_favorite
      NULL,           -- user_id — system agents have no owner
      NULL, NULL, NULL,
      v_master.id,    -- source_agent_id — lineage to the master
      now()
    );
  ELSE
    INSERT INTO agx_agent (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_slots, mcp_servers, tool_config,
      skill_config, default_rag_boost, rag_awareness_mode,
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
      v_master.skill_config, v_master.default_rag_boost, v_master.rag_awareness_mode,
      v_ver.category, v_ver.tags,
      true, false, false, false,
      v_uid, NULL, NULL, NULL,
      v_master.id,    -- source_agent_id — lineage to the master
      now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_duplicate_version(uuid, boolean) TO authenticated;
