-- chair-step: inverse of migrations/campaign/lane7w5d_assessment_list_carries_custom_fields.sql — drops education.assessment_list_scoped and re-creates
-- production's body without custom_fields, byte for byte, and its grants.
-- based-on: education.assessment_list_scoped(text, text, uuid, text, jsonb, text, text, boolean, integer, integer) dfe65f4dacd40e5516f5df5bd88aeb1e439131efb249a8b6b8ad984c435b92ac

set local lock_timeout = '3s';

DROP FUNCTION IF EXISTS education.assessment_list_scoped(text, text, uuid, text, jsonb, text, text, boolean, integer, integer);

CREATE OR REPLACE FUNCTION education.assessment_list_scoped(p_kind text DEFAULT NULL::text, p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'::text, p_sort text DEFAULT 'updated'::text, p_ascending boolean DEFAULT false, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, organization_id uuid, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone, visibility text, assessment_kind text, title text, description text, status text, topic text, source_title text, exam_type text, depth text, time_limit_seconds integer, question_count bigint, my_attempts bigint, my_best_score numeric, my_last_result_id uuid, my_can_edit boolean, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH base AS (
    SELECT a.id AS a_id, a.organization_id AS a_org, a.created_by AS a_by,
           a.created_at AS a_created, a.updated_at AS a_updated, a.deleted_at AS a_deleted,
           a.visibility::text AS a_vis, a.assessment_kind AS a_kind, a.title AS a_title,
           a.description AS a_desc, a.status AS a_status, a.topic AS a_topic,
           a.source_title AS a_source, a.exam_type AS a_exam, a.depth AS a_depth,
           a.time_limit_seconds AS a_limit,
           a.shown_to AS a_shown, a.visibility AS a_visibility
    FROM education.assessment a
  ),
  hit AS (
    SELECT b.*
    FROM base b
    WHERE education.assessment_list_match(
      b.a_by, b.a_org, b.a_vis, b.a_id, b.a_deleted, b.a_kind,
      b.a_title, b.a_topic, b.a_desc, b.a_exam, b.a_depth, b.a_status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived)
      AND (p_scope IS DISTINCT FROM 'team' OR (b.a_org, b.a_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND (lower(coalesce(p_scope, '')) NOT IN ('orgs', 'team')
           OR platform.shown_to_lists(b.a_shown, b.a_visibility, b.a_by, b.a_org, (SELECT auth.uid()), (SELECT platform.shown_to_context('assessment'))))
      -- 'all' (active-org law): my own rows and directly-shared rows always show; the org arm honours Shown to
      AND (p_scope IS DISTINCT FROM 'all'
           OR b.a_by = (SELECT auth.uid())
           OR platform.shown_to_lists(b.a_shown, b.a_visibility, b.a_by, b.a_org, (SELECT auth.uid()), (SELECT platform.shown_to_context('assessment')))
           OR EXISTS (
             SELECT 1 FROM iam.permissions p
             WHERE p.resource_type = 'assessment' AND p.resource_id = b.a_id
               AND (p.granted_to_user_id = (SELECT auth.uid())
                    OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
               AND p.status <> 'rejected'
               AND (p.expires_at IS NULL OR p.expires_at > now())))
  ),
  keyed AS (
    -- The per-row counts are read here only when the sort key needs them; the returned
    -- page's values are read below, for its rows alone.
    SELECT h.*,
      CASE p_sort
        WHEN 'title' THEN lower(h.a_title)
        WHEN 'topic' THEN lower(nullif(btrim(h.a_topic), ''))
        WHEN 'exam_type' THEN lower(nullif(btrim(h.a_exam), ''))
        WHEN 'depth' THEN CASE h.a_depth WHEN 'recall' THEN '1' WHEN 'applied' THEN '2' WHEN 'exam' THEN '3' END
        WHEN 'status' THEN h.a_status
        WHEN 'visibility' THEN h.a_vis
        WHEN 'questions' THEN lpad((SELECT count(*) FROM education.assessment_item i
                                     WHERE i.assessment_id = h.a_id AND i.deleted_at IS NULL)::text, 10, '0')
        WHEN 'attempts' THEN lpad((SELECT count(*) FROM education.assessment_result r
                                    WHERE r.assessment_id = h.a_id AND r.created_by = (SELECT auth.uid())
                                      AND r.deleted_at IS NULL AND r.status = 'completed')::text, 10, '0')
        WHEN 'best_score' THEN (SELECT CASE WHEN max(r.score_value) IS NULL THEN NULL
                                            ELSE lpad(to_char(max(r.score_value) * 1000, 'FM0000000000'), 10, '0') END
                                  FROM education.assessment_result r
                                 WHERE r.assessment_id = h.a_id AND r.created_by = (SELECT auth.uid())
                                   AND r.deleted_at IS NULL AND r.status = 'completed')
        WHEN 'created' THEN to_char(h.a_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
        ELSE to_char(h.a_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
      END AS sort_key
    FROM hit h
  ),
  page AS (
    SELECT k.*, count(*) OVER () AS total_count
    FROM keyed k
    ORDER BY
      CASE WHEN p_ascending THEN k.sort_key END ASC NULLS LAST,
      CASE WHEN NOT p_ascending THEN k.sort_key END DESC NULLS LAST,
      k.a_id
    LIMIT greatest(1, least(coalesce(p_limit, 25), 500))
    OFFSET greatest(0, coalesce(p_offset, 0))
  )
  -- Question count, my attempts and edit rights are read only for the page's rows.
  SELECT pg.a_id, pg.a_org, pg.a_by, pg.a_created, pg.a_updated, pg.a_deleted,
         pg.a_vis, pg.a_kind, pg.a_title, pg.a_desc, pg.a_status, pg.a_topic,
         pg.a_source, pg.a_exam, pg.a_depth, pg.a_limit,
         (SELECT count(*) FROM education.assessment_item i
           WHERE i.assessment_id = pg.a_id AND i.deleted_at IS NULL),
         mine.n, mine.best, mine.last_id,
         (pg.a_by = (SELECT auth.uid())
           OR iam.has_access('assessment', pg.a_id, 'editor'::public.permission_level)) AS my_can_edit,
         pg.total_count
  FROM page pg
  LEFT JOIN LATERAL (
    SELECT count(*) AS n, max(r.score_value) AS best,
           (array_agg(r.id ORDER BY r.completed_at DESC NULLS LAST, r.id DESC))[1] AS last_id
    FROM education.assessment_result r
    WHERE r.assessment_id = pg.a_id AND r.created_by = (SELECT auth.uid())
      AND r.deleted_at IS NULL AND r.status = 'completed'
  ) mine ON true
  ORDER BY
    CASE WHEN p_ascending THEN pg.sort_key END ASC NULLS LAST,
    CASE WHEN NOT p_ascending THEN pg.sort_key END DESC NULLS LAST,
    pg.a_id
$function$;

GRANT EXECUTE ON FUNCTION education.assessment_list_scoped(text, text, uuid, text, jsonb, text, text, boolean, integer, integer) TO authenticated, service_role;
