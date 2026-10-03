-- chair-step: this file DROPS and re-CREATES public.ivw_list_scoped (its RETURNS TABLE gains one trailing column,
-- custom_fields jsonb, which CREATE OR REPLACE cannot do), then re-grants EXECUTE to authenticated and
-- service_role. LOCK: the DROP takes ACCESS EXCLUSIVE on the FUNCTION only (no table) for the length of
-- this transaction; callers in flight wait. No body change beyond the new column. Its inverse drops it
-- and re-creates production's body byte for byte.
-- based-on: public.ivw_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) 78fdf2e18f872756f7c5ad0faf8b6414dade761ea6bb9951a411c92a041a6efb
--
-- LANE 7 · STANDARD-TABLES · W5 — the vision interviews list's custom-field columns have values. The value is
-- returned only where the seat may read the row's fields: its maker, or a member of its organization
-- (else NULL); it is read as the person (this function is invoker), so the row's own rules decide.
-- Added at the END of the row, so positional callers keep their columns. Based on PRODUCTION's body.

set local lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.ivw_list_scoped(text, uuid, text, text, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.ivw_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, vision_statement text, stage text, current_round integer, open_questions bigint, visibility text, user_id uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint, custom_fields jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('interview_session')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- The Shown-to context is read only by the organization / team / all lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team', 'all') THEN
    v_ctx := platform.shown_to_context('interview_session');
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ivw_list_scoped: not authenticated'; END IF;

  -- INTERNAL LANE MODE (p_scope = '_lanes'), used only by ivw_list_scope_counts: ONE statement that returns, for
  -- every lane (all, mine, team, orgs, shared, public), the ids this same list would show (access_level carries
  -- the lane name, one row per lane and interview), so sessions are read under row security once instead of
  -- once per lane, and the open-question counts a count never needs are skipped. Same lane predicates and
  -- filters as below; nothing is sorted, scored or paged. Never a lane a page asks for.
  IF v_scope = '_lanes' THEN
    DECLARE v_need_names boolean := v_f ?| ARRAY['owner_email','organization_name'];
    BEGIN
      v_ctx := platform.shown_to_context('interview_session');
      RETURN QUERY
      WITH unified AS MATERIALIZED (
        SELECT s.id AS u_id,
          coalesce(nullif(s.title,''),'Untitled interview') AS u_title,
          coalesce(s.vision_statement,'') AS u_vision,
          s.stage::text AS u_stage,
          s.visibility::text AS u_visibility,
          s.created_by AS u_user_id,
          s.organization_id AS u_org_id,
          s.created_at AS u_created,
          s.updated_at AS u_updated,
          s.shown_to AS u_shown
        FROM interview.session s
        WHERE s.deleted_at IS NULL
          AND (p_org_id IS NULL OR s.organization_id = p_org_id)
      ),
      mine AS (SELECT u.u_id, u.u_org_id FROM unified u WHERE u.u_user_id = v_uid),
      orgs AS (
        SELECT u.u_id, u.u_org_id, u.u_user_id FROM unified u
        WHERE (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
          AND platform.shown_to_lists(u.u_shown, u.u_visibility::platform.visibility, u.u_user_id, u.u_org_id, v_uid, v_ctx)
      ),
      team AS (
        SELECT o.u_id, o.u_org_id FROM orgs o
        WHERE (o.u_org_id, o.u_user_id) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r)
      ),
      shared AS (
        SELECT u.u_id, u.u_org_id FROM unified u
        JOIN iam.permissions perm
          ON perm.resource_type = 'interview_session'
          AND perm.resource_id = u.u_id
          AND perm.granted_to_user_id = v_uid
        WHERE u.u_user_id IS DISTINCT FROM v_uid
        UNION ALL
        SELECT os.u_id, os.u_org_id FROM (
          SELECT DISTINCT ON (u.u_id) u.u_id, u.u_org_id
          FROM unified u
          JOIN iam.permissions perm
            ON perm.resource_type = 'interview_session'
            AND perm.resource_id = u.u_id
            AND perm.granted_to_organization_id IN (
              SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
          WHERE u.u_user_id IS DISTINCT FROM v_uid
            AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
              WHERE p2.resource_type = 'interview_session'
                AND p2.resource_id = u.u_id
                AND p2.granted_to_user_id = v_uid)
          ORDER BY u.u_id, perm.permission_level::text
        ) os
      ),
      pub AS (
        SELECT u.u_id, u.u_org_id FROM unified u
        WHERE u.u_user_id IS DISTINCT FROM v_uid AND u.u_visibility='public'
      ),
      lane_rows AS (
        SELECT DISTINCT x.lane, x.u_id, x.u_org_id FROM (
          SELECT 'mine'::text AS lane, m.u_id, m.u_org_id FROM mine m
          UNION ALL SELECT 'orgs', o.u_id, o.u_org_id FROM orgs o
          UNION ALL SELECT 'team', t.u_id, t.u_org_id FROM team t
          UNION ALL SELECT 'shared', s.u_id, s.u_org_id FROM shared s
          UNION ALL SELECT 'public', p.u_id, p.u_org_id FROM pub p
          UNION ALL SELECT 'all', m.u_id, m.u_org_id FROM mine m
          UNION ALL SELECT 'all', o.u_id, o.u_org_id FROM orgs o
          UNION ALL SELECT 'all', s.u_id, s.u_org_id FROM shared s
        ) x
      ),
      cand AS (SELECT u.* FROM unified u WHERE u.u_id IN (SELECT lr.u_id FROM lane_rows lr)),
      joined AS (
        SELECT c.*, o.name AS s_org_name, au.email::text AS s_owner_email
        FROM cand c
        LEFT JOIN iam.organizations o ON o.id = c.u_org_id
        LEFT JOIN platform.visible_user_identity au ON au.id = c.u_user_id AND v_need_names
      ),
      ok AS (
        SELECT DISTINCT j.u_id FROM joined j
    WHERE (v_search IS NULL
        OR j.u_title ILIKE '%'||v_search||'%'
        OR j.u_vision ILIKE '%'||v_search||'%')
      AND (NOT v_f ? 'title' OR j.u_title ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'vision_statement' OR j.u_vision ILIKE '%'||(v_f->'vision_statement'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'stage'
           OR j.u_stage IN (SELECT jsonb_array_elements_text(v_f->'stage'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.u_visibility IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'updated'
           OR j.u_updated >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.u_created >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      )
      SELECT lr.u_id, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::bigint, NULL::text, NULL::uuid,
        lr.u_org_id, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::boolean, lr.lane, NULL::text, 0::bigint, NULL::jsonb
      FROM lane_rows lr JOIN ok ON ok.u_id = lr.u_id;
      RETURN;
    END;
  END IF;
  IF v_scope NOT IN ('all','mine','team','orgs','shared','public') THEN
    RAISE EXCEPTION 'ivw_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','title','stage','current_round',
                    'open_questions','organization_name','owner_email','visibility') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT s.id AS u_id,
      coalesce(nullif(s.title,''),'Untitled interview') AS u_title,
      coalesce(s.vision_statement,'') AS u_vision,
      s.stage::text AS u_stage,
      s.current_round AS u_round,
      (SELECT count(*) FROM interview.question q
        WHERE q.session_id = s.id
          AND q.state IN ('open','partially_answered','dodged')) AS u_open_q,
      s.visibility::text AS u_visibility,
      s.created_by AS u_user_id,
      s.organization_id AS u_org_id,
      s.created_at AS u_created,
      s.updated_at AS u_updated,
      s.shown_to AS u_shown
    FROM interview.session s
    WHERE s.deleted_at IS NULL
      -- The page's ORGANIZATION FILTER (NULL = all organizations) narrows every lane.
      AND (p_org_id IS NULL OR s.organization_id = p_org_id)
  ),
  scoped_raw AS (
    SELECT u.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM unified u WHERE v_scope IN ('mine','all') AND u.u_user_id = v_uid
    UNION ALL
    SELECT u.*, (u.u_user_id = v_uid), CASE WHEN u.u_user_id = v_uid THEN 'owner' ELSE 'org' END::text FROM unified u
    WHERE v_scope IN ('orgs','team','all') AND (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (u.u_org_id, u.u_user_id) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(u.u_shown, u.u_visibility::platform.visibility, u.u_user_id, u.u_org_id, v_uid, v_ctx)
    UNION ALL
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = 'interview_session'
      AND perm.resource_id = u.u_id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope IN ('shared','all') AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (u.u_id) u.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM unified u
      JOIN iam.permissions perm
        ON perm.resource_type = 'interview_session'
        AND perm.resource_id = u.u_id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope IN ('shared','all') AND u.u_user_id IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
          WHERE p2.resource_type = 'interview_session'
            AND p2.resource_id = u.u_id
            AND p2.granted_to_user_id = v_uid)
      ORDER BY u.u_id, perm.permission_level::text
    ) org_shared
    UNION ALL
    SELECT u.*, false, 'public'::text FROM unified u
    WHERE v_scope='public' AND u.u_user_id IS DISTINCT FROM v_uid AND u.u_visibility='public'
  ),
  -- 'all' = Mine U My team U My Orgs U Shared: one row per id, most privileged label kept.
  scoped AS (
    SELECT DISTINCT ON (r.u_id) r.*
    FROM scoped_raw r
    ORDER BY r.u_id,
      CASE r.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, au.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.u_org_id
    LEFT JOIN platform.visible_user_identity au ON au.id = s.u_user_id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (v_search IS NULL
        OR j.u_title ILIKE '%'||v_search||'%'
        OR j.u_vision ILIKE '%'||v_search||'%')
      AND (NOT v_f ? 'title' OR j.u_title ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'vision_statement' OR j.u_vision ILIKE '%'||(v_f->'vision_statement'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'stage'
           OR j.u_stage IN (SELECT jsonb_array_elements_text(v_f->'stage'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.u_visibility IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'updated'
           OR j.u_updated >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.u_created >= public.agx_since_bucket(v_f->'created'->'values'->>0))
  ),
  scored AS (
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.ivw_search_score(
        v_search, f.u_id, f.u_title, f.u_vision, f.u_stage, f.s_owner_email)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.u_id, c.u_title, c.u_vision, c.u_stage, c.u_round, c.u_open_q,
    c.u_visibility, c.u_user_id, c.u_org_id, c.s_org_name,
    c.u_created, c.u_updated,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total,
    CASE WHEN c.u_user_id = v_uid OR c.u_org_id IN (SELECT iam.my_orgs()) THEN (SELECT x.custom_fields FROM interview.session x WHERE x.id = c.u_id) END
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.u_updated END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.u_updated END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.u_created END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(c.u_title) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(c.u_title) END ASC,
    CASE WHEN v_sort='stage' AND v_dir='desc' THEN c.u_stage END DESC,
    CASE WHEN v_sort='stage' AND v_dir='asc' THEN c.u_stage END ASC,
    CASE WHEN v_sort='current_round' AND v_dir='desc' THEN c.u_round END DESC,
    CASE WHEN v_sort='current_round' AND v_dir='asc' THEN c.u_round END ASC,
    CASE WHEN v_sort='open_questions' AND v_dir='desc' THEN c.u_open_q END DESC,
    CASE WHEN v_sort='open_questions' AND v_dir='asc' THEN c.u_open_q END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN c.u_visibility END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN c.u_visibility END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ivw_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) TO authenticated, service_role;
