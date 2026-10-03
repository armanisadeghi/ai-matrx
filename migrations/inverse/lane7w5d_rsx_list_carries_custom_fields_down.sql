-- chair-step: inverse of migrations/campaign/lane7w5d_rsx_list_carries_custom_fields.sql — drops public.rsx_list_scoped and re-creates
-- production's body without custom_fields, byte for byte, and its grants.
-- based-on: public.rsx_list_scoped(text, uuid, text, text, text, jsonb, integer, integer, text) e9ca51efaf8b837c02b169badc99fbb74e89aeb19fec38618a743827744cdd78

set local lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.rsx_list_scoped(text, uuid, text, text, text, jsonb, integer, integer, text);

CREATE OR REPLACE FUNCTION public.rsx_list_scoped(p_scope text DEFAULT 'orgs'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'updated_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, name text, description text, status text, autonomy_level text, organization_id uuid, organization_name text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, template_id uuid, project_id uuid, project_name text, archived_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb := platform.shown_to_context('research_topic');  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, 'orgs'));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated_at'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_arch text := lower(coalesce(p_archived, 'active'));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'rsx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('all','mine','team','orgs') THEN
    RAISE EXCEPTION 'rsx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_arch NOT IN ('active','archived','all') THEN v_arch := 'active'; END IF;
  IF v_sort NOT IN ('name','status','autonomy_level','created_at','updated_at',
                    'project','organization_name') THEN
    v_sort := 'updated_at';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    WHERE om.user_id = v_uid
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  -- 'all' = Mine U My team U My Orgs. A topic is one row, so the union needs no dedupe: the
  -- lanes are OR-ed inside one WHERE. (Research has no per-person share lane.)
  -- p_org_id (the page's ORGANIZATION FILTER, NULL = all organizations) narrows every lane.
  scoped AS (
    SELECT t.* FROM research.rs_topic t
    WHERE (CASE v_arch WHEN 'archived' THEN t.deleted_at IS NOT NULL
                       WHEN 'all' THEN true
                       ELSE t.deleted_at IS NULL END)
      AND (p_org_id IS NULL OR t.organization_id = p_org_id)
      AND ((v_scope IN ('mine','all') AND t.created_by = v_uid)
        OR (v_scope IN ('orgs','team','all') AND t.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
            -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
            AND (v_scope <> 'team' OR (t.organization_id, t.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))))
            -- access ladder T-11: and only what each row's Shown to lets this person's lists show
            AND platform.shown_to_lists(t.shown_to, t.visibility, t.created_by, t.organization_id, v_uid, v_ctx)
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, pl.s_project_id, p.name AS s_project_name
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    -- The project is a research_topic -> project association edge. An archived
    -- topic's edge is soft-deleted WITH it (deleted_via = this topic), so the
    -- archived view reads that edge too.
    LEFT JOIN LATERAL (
      SELECT a.target_id AS s_project_id FROM platform.associations a
      WHERE a.source_type = 'research_topic' AND a.source_id = s.id
        AND a.target_type = 'project'
        AND (a.deleted_at IS NULL
          OR (s.deleted_at IS NOT NULL AND a.deleted_via_type = 'research_topic' AND a.deleted_via_id = s.id))
      ORDER BY a.created_at, a.id LIMIT 1
    ) pl ON true
    LEFT JOIN projects.projects p ON p.id = pl.s_project_id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR coalesce(j.description,'') ILIKE '%'||v_search||'%'
        OR j.id::text = lower(v_search))
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'status'
           OR j.status IN (SELECT jsonb_array_elements_text(v_f->'status'->'values')))
      AND (NOT v_f ? 'autonomy_level'
           OR j.autonomy_level IN (SELECT jsonb_array_elements_text(v_f->'autonomy_level'->'values')))
      AND (NOT v_f ? 'project'
           OR coalesce(j.s_project_id::text, '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'project'->'values')))
      AND (NOT v_f ? 'organization_name'
           OR j.organization_id::text IN (SELECT jsonb_array_elements_text(v_f->'organization_name'->'values')))
      AND (NOT v_f ? 'updated_at' OR j.updated_at >= (
             SELECT min(public.agx_since_bucket(b)) FROM jsonb_array_elements_text(v_f->'updated_at'->'values') b))
      AND (NOT v_f ? 'created_at' OR j.created_at >= (
             SELECT min(public.agx_since_bucket(b)) FROM jsonb_array_elements_text(v_f->'created_at'->'values') b))
  ),
  counted AS (SELECT f.*, count(*) OVER () AS s_total FROM filtered f)
  SELECT c.id, c.name, c.description, c.status::text, c.autonomy_level::text,
    c.organization_id, c.s_org_name, c.created_by, c.created_at, c.updated_at,
    c.template_id, c.s_project_id, c.s_project_name, c.deleted_at, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN
      CASE WHEN lower(c.name) = lower(v_search) THEN 0
           WHEN c.name ILIKE v_search||'%' THEN 1
           WHEN c.name ILIKE '%'||v_search||'%' THEN 2 ELSE 3 END END ASC NULLS LAST,
    CASE WHEN v_sort='updated_at' AND v_dir='desc' THEN c.updated_at END DESC NULLS LAST,
    CASE WHEN v_sort='updated_at' AND v_dir='asc' THEN c.updated_at END ASC NULLS LAST,
    CASE WHEN v_sort='created_at' AND v_dir='desc' THEN c.created_at END DESC NULLS LAST,
    CASE WHEN v_sort='created_at' AND v_dir='asc' THEN c.created_at END ASC NULLS LAST,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='status' AND v_dir='desc' THEN c.status END DESC,
    CASE WHEN v_sort='status' AND v_dir='asc' THEN c.status END ASC,
    CASE WHEN v_sort='autonomy_level' AND v_dir='desc' THEN c.autonomy_level END DESC,
    CASE WHEN v_sort='autonomy_level' AND v_dir='asc' THEN c.autonomy_level END ASC,
    CASE WHEN v_sort='project' AND v_dir='desc' THEN lower(c.s_project_name) END DESC NULLS LAST,
    CASE WHEN v_sort='project' AND v_dir='asc' THEN lower(c.s_project_name) END ASC NULLS LAST,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(c.s_org_name) END DESC NULLS LAST,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(c.s_org_name) END ASC NULLS LAST,
    c.id
  LIMIT greatest(coalesce(p_limit,50),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rsx_list_scoped(text, uuid, text, text, text, jsonb, integer, integer, text) TO authenticated, service_role;
