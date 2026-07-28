-- Agent/project linkage is association-backed. The physical project_id column
-- was removed from agent.definition, but two live database contracts still
-- referenced it:
--   1. agx_list_scoped returned c.project_id.
--   2. platform.entity_relationships told iam.has_access to follow
--      agent.definition.project_id as a containment FK.
--
-- Patch the live function definition instead of replaying the older v3 source:
-- agx_search_score was added afterward and must remain intact.

DELETE FROM platform.entity_relationships
WHERE child_type = 'agent'
  AND parent_type = 'project'
  AND fk_column = 'project_id'
  AND kind = 'containment';

DO $migration$
DECLARE
  v_list_oid oid;
  v_counts_oid oid;
  v_facets_oid oid;
  v_list_definition text;
  v_counts_definition text;
  v_facets_definition text;
  v_patched_definition text;
BEGIN
  SELECT p.oid
  INTO v_list_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'agx_list_scoped'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_favorites_first boolean, p_archived text, p_filters jsonb, p_limit integer, p_offset integer';

  SELECT p.oid
  INTO v_counts_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'agx_list_scope_counts'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_search text, p_deep boolean, p_archived text, p_filters jsonb';

  SELECT p.oid
  INTO v_facets_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'agx_list_facets'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_archived text';

  IF v_list_oid IS NULL OR v_counts_oid IS NULL OR v_facets_oid IS NULL THEN
    RAISE EXCEPTION
      'Agent browse RPC repair aborted: expected list/count/facet functions are missing';
  END IF;

  v_list_definition := pg_get_functiondef(v_list_oid);

  -- Idempotent replay: the stale registry edge was still removed above.
  IF position('project_id' IN v_list_definition) = 0 THEN
    RETURN;
  END IF;

  v_counts_definition := pg_get_functiondef(v_counts_oid);
  v_facets_definition := pg_get_functiondef(v_facets_oid);

  v_patched_definition := regexp_replace(
    v_list_definition,
    'organization_name[[:space:]]+text,[[:space:]]*project_id[[:space:]]+uuid,[[:space:]]*task_id[[:space:]]+uuid',
    'organization_name text, task_id uuid',
    'i'
  );
  IF v_patched_definition = v_list_definition THEN
    RAISE EXCEPTION
      'Agent browse RPC repair aborted: project_id return column pattern changed';
  END IF;
  v_list_definition := v_patched_definition;

  v_patched_definition := regexp_replace(
    v_list_definition,
    'c\.organization_id,[[:space:]]*c\.s_org_name,[[:space:]]*c\.project_id,[[:space:]]*c\.task_id',
    'c.organization_id, c.s_org_name, c.task_id',
    'i'
  );
  IF v_patched_definition = v_list_definition THEN
    RAISE EXCEPTION
      'Agent browse RPC repair aborted: project_id SELECT pattern changed';
  END IF;
  v_list_definition := v_patched_definition;

  IF position('project_id' IN v_list_definition) > 0 THEN
    RAISE EXCEPTION
      'Agent browse RPC repair aborted: an unhandled project_id reference remains';
  END IF;

  DROP FUNCTION public.agx_list_scope_counts(text, boolean, text, jsonb);
  DROP FUNCTION public.agx_list_facets(text, uuid, text, boolean, text);
  DROP FUNCTION public.agx_list_scoped(
    text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer
  );

  EXECUTE v_list_definition;
  EXECUTE v_counts_definition;
  EXECUTE v_facets_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.agx_list_scoped(
  text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_list_scoped(
  text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agx_list_scope_counts(
  text, boolean, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_list_scope_counts(
  text, boolean, text, jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agx_list_facets(
  text, uuid, text, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_list_facets(
  text, uuid, text, boolean, text
) TO authenticated, service_role;

DO $verify$
DECLARE
  v_result text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM platform.entity_relationships
    WHERE child_type = 'agent'
      AND parent_type = 'project'
      AND fk_column = 'project_id'
      AND kind = 'containment'
  ) THEN
    RAISE EXCEPTION
      'Agent project containment repair failed: stale registry edge remains';
  END IF;

  SELECT pg_get_function_result(p.oid)
  INTO v_result
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'agx_list_scoped'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_scope text, p_org_id uuid, p_search text, p_deep boolean, p_sort text, p_dir text, p_favorites_first boolean, p_archived text, p_filters jsonb, p_limit integer, p_offset integer';

  IF v_result IS NULL OR position('project_id' IN v_result) > 0 THEN
    RAISE EXCEPTION
      'Agent browse RPC repair failed: project_id remains in the return contract';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';
