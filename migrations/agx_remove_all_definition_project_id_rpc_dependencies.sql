-- agent.definition has no project_id column. Project linkage is represented by
-- platform.associations, but seven legacy RPCs still selected or inserted the
-- retired physical column. Patch the exact live definitions so later fixes in
-- those functions are preserved, and fail loudly if their source shape drifts.

DO $migration$
DECLARE
  v_create_from_template text :=
    pg_get_functiondef('public.agx_create_agent_from_template(uuid)'::regprocedure);
  v_duplicate_agent text :=
    pg_get_functiondef('public.agx_duplicate_agent(uuid,boolean)'::regprocedure);
  v_duplicate_version text :=
    pg_get_functiondef('public.agx_duplicate_version(uuid,boolean)'::regprocedure);
  v_get_access_level text :=
    pg_get_functiondef('public.agx_get_access_level(uuid)'::regprocedure);
  v_get_list text :=
    pg_get_functiondef('public.agx_get_list(integer,integer)'::regprocedure);
  v_get_list_full text :=
    pg_get_functiondef('public.agx_get_list_full()'::regprocedure);
  v_search text :=
    pg_get_functiondef('public.agx_search(text,boolean,integer,integer)'::regprocedure);
  v_patched text;
BEGIN
  -- Idempotent replay after all seven definitions have already been repaired.
  IF position('project_id' IN lower(v_create_from_template)) = 0
     AND position('project_id' IN lower(v_duplicate_agent)) = 0
     AND position('project_id' IN lower(v_duplicate_version)) = 0
     AND position('project_id' IN lower(v_get_access_level)) = 0
     AND position('project_id' IN lower(v_get_list)) = 0
     AND position('project_id' IN lower(v_get_list_full)) = 0
     AND position('project_id' IN lower(v_search)) = 0 THEN
    RETURN;
  END IF;

  -- Creation from a template always wrote NULL for the retired project column.
  v_patched := regexp_replace(
    v_create_from_template,
    'user_id,[[:space:]]*organization_id,[[:space:]]*project_id,[[:space:]]*task_id',
    'user_id, organization_id, task_id',
    'gi'
  );
  IF v_patched = v_create_from_template THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: create-from-template column pattern changed';
  END IF;
  v_create_from_template := v_patched;

  v_patched := regexp_replace(
    v_create_from_template,
    'v_uid,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*NULL[[:space:]]*\);',
    'v_uid, NULL, NULL, NULL, NULL);',
    'i'
  );
  IF v_patched = v_create_from_template THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: create-from-template VALUES pattern changed';
  END IF;
  v_create_from_template := v_patched;

  -- Both duplicate paths also always wrote NULL for project_id. Remove the
  -- column and its matching NULL without changing any ownership or lineage.
  v_patched := regexp_replace(
    v_duplicate_agent,
    'user_id,[[:space:]]*organization_id,[[:space:]]*project_id,[[:space:]]*task_id',
    'user_id, organization_id, task_id',
    'gi'
  );
  IF v_patched = v_duplicate_agent THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: duplicate-agent column pattern changed';
  END IF;
  v_duplicate_agent := v_patched;

  v_patched := regexp_replace(
    v_duplicate_agent,
    'NULL,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*p_agent_id,[[:space:]]*now\(\)',
    'NULL, NULL, NULL, p_agent_id, now()',
    'i'
  );
  IF v_patched = v_duplicate_agent THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: system duplicate-agent VALUES pattern changed';
  END IF;
  v_duplicate_agent := v_patched;

  v_patched := regexp_replace(
    v_duplicate_agent,
    'v_uid,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*p_agent_id,[[:space:]]*now\(\)',
    'v_uid, NULL, NULL, p_agent_id, now()',
    'i'
  );
  IF v_patched = v_duplicate_agent THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: user duplicate-agent VALUES pattern changed';
  END IF;
  v_duplicate_agent := v_patched;

  v_patched := regexp_replace(
    v_duplicate_version,
    'user_id,[[:space:]]*organization_id,[[:space:]]*project_id,[[:space:]]*task_id',
    'user_id, organization_id, task_id',
    'gi'
  );
  IF v_patched = v_duplicate_version THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: duplicate-version column pattern changed';
  END IF;
  v_duplicate_version := v_patched;

  v_patched := regexp_replace(
    v_duplicate_version,
    'NULL,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*v_master\.id,[[:space:]]*now\(\)',
    'NULL, NULL, NULL, v_master.id, now()',
    'i'
  );
  IF v_patched = v_duplicate_version THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: system duplicate-version VALUES pattern changed';
  END IF;
  v_duplicate_version := v_patched;

  v_patched := regexp_replace(
    v_duplicate_version,
    'v_uid,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*NULL,[[:space:]]*v_master\.id,[[:space:]]*now\(\)',
    'v_uid, NULL, NULL, v_master.id, now()',
    'i'
  );
  IF v_patched = v_duplicate_version THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: user duplicate-version VALUES pattern changed';
  END IF;
  v_duplicate_version := v_patched;

  -- Access-level lookup selected project_id but never used it.
  v_patched := regexp_replace(
    v_get_access_level,
    'a\.organization_id,[[:space:]]*a\.project_id,[[:space:]]*a\.is_public',
    'a.organization_id, a.is_public',
    'i'
  );
  IF v_patched = v_get_access_level THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: access-level SELECT pattern changed';
  END IF;
  v_get_access_level := v_patched;

  -- The list/search compatibility contracts still exposed project_id. A
  -- singular project is not representable in the association model, so remove
  -- the retired field instead of returning a fabricated or arbitrary value.
  v_patched := regexp_replace(
    v_get_list,
    'organization_id[[:space:]]+uuid,[[:space:]]*project_id[[:space:]]+uuid,[[:space:]]*task_id[[:space:]]+uuid',
    'organization_id uuid, task_id uuid',
    'i'
  );
  IF v_patched = v_get_list THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: get-list return pattern changed';
  END IF;
  v_get_list := regexp_replace(
    v_patched,
    'a\.organization_id,[[:space:]]*a\.project_id,[[:space:]]*a\.task_id',
    'a.organization_id, a.task_id',
    'gi'
  );

  v_patched := regexp_replace(
    v_get_list_full,
    'organization_id[[:space:]]+uuid,[[:space:]]*project_id[[:space:]]+uuid,[[:space:]]*task_id[[:space:]]+uuid',
    'organization_id uuid, task_id uuid',
    'i'
  );
  IF v_patched = v_get_list_full THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: get-list-full return pattern changed';
  END IF;
  v_get_list_full := regexp_replace(
    v_patched,
    'a\.organization_id,[[:space:]]*a\.project_id,[[:space:]]*a\.task_id',
    'a.organization_id, a.task_id',
    'gi'
  );

  v_patched := regexp_replace(
    v_search,
    'organization_id[[:space:]]+uuid,[[:space:]]*project_id[[:space:]]+uuid,[[:space:]]*task_id[[:space:]]+uuid',
    'organization_id uuid, task_id uuid',
    'i'
  );
  IF v_patched = v_search THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: search return pattern changed';
  END IF;
  v_search := regexp_replace(
    v_patched,
    'a\.organization_id,[[:space:]]*a\.project_id,[[:space:]]*a\.task_id',
    'a.organization_id, a.task_id',
    'gi'
  );
  v_search := regexp_replace(
    v_search,
    's\.organization_id,[[:space:]]*s\.project_id,[[:space:]]*s\.task_id',
    's.organization_id, s.task_id',
    'gi'
  );

  IF position('project_id' IN lower(v_create_from_template)) > 0
     OR position('project_id' IN lower(v_duplicate_agent)) > 0
     OR position('project_id' IN lower(v_duplicate_version)) > 0
     OR position('project_id' IN lower(v_get_access_level)) > 0
     OR position('project_id' IN lower(v_get_list)) > 0
     OR position('project_id' IN lower(v_get_list_full)) > 0
     OR position('project_id' IN lower(v_search)) > 0 THEN
    RAISE EXCEPTION
      'Agent RPC repair aborted: an unhandled project_id reference remains';
  END IF;

  -- Same-signature functions can be replaced in place.
  EXECUTE v_create_from_template;
  EXECUTE v_duplicate_agent;
  EXECUTE v_duplicate_version;
  EXECUTE v_get_access_level;

  -- Return-column changes require dropping the old result contracts first.
  DROP FUNCTION public.agx_get_list_full();
  DROP FUNCTION public.agx_get_list(integer, integer);
  DROP FUNCTION public.agx_search(text, boolean, integer, integer);

  EXECUTE v_get_list;
  EXECUTE v_get_list_full;
  EXECUTE v_search;
END;
$migration$;

-- Every function requires auth.uid(); keep the exposed RPC surface explicit.
REVOKE ALL ON FUNCTION public.agx_create_agent_from_template(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_create_agent_from_template(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agx_duplicate_agent(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_duplicate_agent(uuid, boolean)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agx_duplicate_version(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_duplicate_version(uuid, boolean)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agx_get_access_level(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_get_access_level(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agx_get_list(integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_get_list(integer, integer)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agx_get_list_full()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_get_list_full()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agx_search(text, boolean, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_search(text, boolean, integer, integer)
  TO authenticated, service_role;

DO $verify$
DECLARE
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.agx_create_agent_from_template(uuid)'::regprocedure,
    'public.agx_duplicate_agent(uuid,boolean)'::regprocedure,
    'public.agx_duplicate_version(uuid,boolean)'::regprocedure,
    'public.agx_get_access_level(uuid)'::regprocedure,
    'public.agx_get_list(integer,integer)'::regprocedure,
    'public.agx_get_list_full()'::regprocedure,
    'public.agx_search(text,boolean,integer,integer)'::regprocedure
  ]
  LOOP
    IF position('project_id' IN lower(pg_get_functiondef(v_signature::oid))) > 0 THEN
      RAISE EXCEPTION
        'Agent RPC repair failed: project_id remains in %', v_signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM platform.entity_relationships
    WHERE child_type = 'agent'
      AND parent_type = 'project'
      AND fk_column = 'project_id'
  ) THEN
    RAISE EXCEPTION
      'Agent RPC repair failed: stale agent/project FK metadata returned';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';
