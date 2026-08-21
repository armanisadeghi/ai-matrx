-- wfx_duplicate.sql
--
-- "anything you can view, you may duplicate and run" — Arman, for agents
-- (2026-08-12), extended to workflows (2026-08-20).
--
-- These mirror public.agx_duplicate_agent / public.agx_duplicate_version: same
-- SECURITY DEFINER posture, same auth check, same viewer-level access gate
-- (iam.has_access_for(..., 'viewer')), same "(Copy)" naming, same lineage
-- stamping, same "returns the new id" contract so the caller can hand the user
-- a door to the copy.
--
-- ONE deliberate difference from the agx pair: no `p_as_system` parameter.
-- On agents it flips agent_type to 'builtin'. workflow.definition has no
-- builtin tier — no such column, and 0 definitions live in the Matrx System org
-- (verified 2026-08-20). For workflows the starter catalogue is
-- workflow.template, a different table. Carrying a parameter with no referent
-- would be inventing a system-workflow concept nobody ruled on.
--
-- What a copy deliberately does NOT inherit:
--   visibility / card_visibility — a copy starts private, at the column
--     defaults. Inheriting reach would silently republish someone's work.
--   engram_state, confirmed_success_count, grounding_score, compiled_at,
--     demoted_at, demotion_reason, engram_version_tags, engram_counter_since —
--     earned reputation about the ORIGINAL. A copy has run zero times.
--   project_id / task_id — the original's context, not the copy's.
--   is_favorite / is_archived — the star is a statement about the original, and
--     inheriting "archived" files the copy straight into the view just left.
--   organization_id — left NULL so the _stamp_org_default BEFORE INSERT trigger
--     homes the copy in the DUPLICATOR's org. Copying it would hand your org's
--     id to an outsider's row (and fail RLS). Same as the agx pair.

-- ---------------------------------------------------------------- definition

CREATE OR REPLACE FUNCTION public.wfx_duplicate_definition(p_definition_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source record;
  v_new_id uuid;
  v_uid    uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source
  FROM workflow.definition
  WHERE id = p_definition_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found';
  END IF;

  -- THE RULING: viewer is enough. Not editor, not owner.
  IF NOT iam.has_access_for(v_uid, 'workflow', p_definition_id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_new_id := gen_random_uuid();

  INSERT INTO workflow.definition (
    id, name, description,
    nodes, edges, viewport, channels, strict_channels, entry_nodes,
    metadata, variables, category, tags, max_concurrent_runs,
    is_active, is_archived, is_favorite,
    created_by, organization_id, project_id, task_id,
    source_definition_id, source_snapshot_at
  )
  VALUES (
    v_new_id, v_source.name || ' (Copy)', v_source.description,
    v_source.nodes, v_source.edges, v_source.viewport, v_source.channels,
    v_source.strict_channels, v_source.entry_nodes,
    v_source.metadata, v_source.variables, v_source.category, v_source.tags,
    v_source.max_concurrent_runs,
    true, false, false,
    v_uid, NULL, NULL, NULL,
    p_definition_id, now()
  );

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.wfx_duplicate_definition(uuid) IS
  'Duplicate a workflow you can VIEW into a new workflow you own. Mirrors agx_duplicate_agent. Viewer-level gate per Arman''s 2026-08-20 ruling.';

REVOKE ALL ON FUNCTION public.wfx_duplicate_definition(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.wfx_duplicate_definition(uuid) TO authenticated;

-- ------------------------------------------------------------------ version

CREATE OR REPLACE FUNCTION public.wfx_duplicate_version(p_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ver    record;
  v_master record;
  v_new_id uuid;
  v_uid    uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_ver
  FROM workflow.definition_version
  WHERE id = p_version_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow version not found';
  END IF;

  SELECT * INTO v_master
  FROM workflow.definition
  WHERE id = v_ver.definition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master workflow not found for version';
  END IF;

  -- Access is judged on the MASTER, exactly as agx_duplicate_version does.
  IF NOT iam.has_access_for(v_uid, 'workflow', v_master.id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_new_id := gen_random_uuid();

  -- Version rows allow NULL on columns the definition requires, so every
  -- graph column falls back version -> master -> column default.
  INSERT INTO workflow.definition (
    id, name, description,
    nodes, edges, viewport, channels, strict_channels, entry_nodes,
    metadata, variables, category, tags, max_concurrent_runs,
    is_active, is_archived, is_favorite,
    created_by, organization_id, project_id, task_id,
    source_definition_id, source_snapshot_at
  )
  VALUES (
    v_new_id,
    coalesce(v_ver.name, v_master.name) || ' (Copy)',
    coalesce(v_ver.description, v_master.description),
    coalesce(v_ver.nodes, v_master.nodes, '[]'::jsonb),
    coalesce(v_ver.edges, v_master.edges, '[]'::jsonb),
    coalesce(v_ver.viewport, v_master.viewport, '{"x": 0, "y": 0, "zoom": 1}'::jsonb),
    coalesce(v_ver.channels, v_master.channels, '[]'::jsonb),
    coalesce(v_ver.strict_channels, v_master.strict_channels, false),
    coalesce(v_ver.entry_nodes, v_master.entry_nodes, '[]'::jsonb),
    coalesce(v_ver.metadata, v_master.metadata, '{}'::jsonb),
    coalesce(v_ver.variables, v_master.variables, '[]'::jsonb),
    coalesce(v_ver.category, v_master.category),
    coalesce(v_ver.tags, v_master.tags, ARRAY[]::text[]),
    v_master.max_concurrent_runs,
    true, false, false,
    v_uid, NULL, NULL, NULL,
    v_master.id, now()
  );

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.wfx_duplicate_version(uuid) IS
  'Duplicate a historical workflow version into a new workflow you own. Mirrors agx_duplicate_version. Access is judged on the master definition at viewer level.';

REVOKE ALL ON FUNCTION public.wfx_duplicate_version(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.wfx_duplicate_version(uuid) TO authenticated;
