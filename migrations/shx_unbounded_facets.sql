-- Keep canonical Shape facets complete after the registry grows past 1,000 rows.
--
-- The first shx migration defensively capped list pages at 1,000 rows. That is
-- appropriate for a browser page but not for the facet aggregate, which asks
-- the same function for the whole scoped set. Patch the function definition in
-- place, with an exact guard so future definition drift fails loudly.

DO $migration$
DECLARE
  v_definition text;
  v_old_limit constant text :=
    'LIMIT least(greatest(coalesce(p_limit, 25), 1), 1000)';
  v_new_limit constant text :=
    'LIMIT greatest(coalesce(p_limit, 25), 1)';
BEGIN
  SELECT pg_get_functiondef(
    'public.shx_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer)'::regprocedure
  )
  INTO v_definition;

  IF position(v_old_limit IN v_definition) > 0 THEN
    EXECUTE replace(v_definition, v_old_limit, v_new_limit);
  ELSIF position(v_new_limit IN v_definition) = 0 THEN
    RAISE EXCEPTION 'shx_list_scoped limit clause no longer matches the expected definition';
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.shx_list_facets(
  p_scope text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_deep boolean DEFAULT false
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT result.*
    FROM public.shx_list_scoped(
      p_scope, p_org_id, p_search, p_deep, 'updated', 'desc', '{}'::jsonb, 1000000, 0
    ) result
  )
  SELECT 'family', coalesce(nullif(base.family, ''), '__none__'), count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'authoring_owner', base.authoring_owner, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'status', CASE WHEN base.is_active THEN 'active' ELSE 'inactive' END, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'component', CASE WHEN base.has_component THEN 'custom' ELSE 'generic' END, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'visibility', base.visibility, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'origin', base.origin, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'access_level', base.access_level, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'version', base.version::text, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'organization_name', coalesce(nullif(base.organization_name, ''), '__none__'), count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'owner_email', coalesce(nullif(base.owner_email, ''), '__none__'), count(*) FROM base GROUP BY 2;
$$;

REVOKE ALL ON FUNCTION public.shx_list_facets(text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shx_list_facets(text, uuid, text, boolean) TO authenticated, service_role;
