-- education.assessment_list_* — the scoped-list RPC family for /education/quizzes
-- Applied to brsgrqvjdzwihsvnfqkf with `pnpm db:apply` on 2026-09-27 (page-pass pp3-quizzes); idempotent (CREATE OR REPLACE).
-- Copied from the live
-- education.fc_set_list_* family (the template in lib/list-scope/FEATURE.md).
--
-- SECURITY INVOKER: the table's RLS stays the ceiling, and every call DECLARES
-- its lane on top of it (THE VIEW LAW).
--
--   assessment_list_match   — the one predicate (kind + lane + archive + search + filters)
--   assessment_list_scoped  — one page of rows + the true total
--   assessment_list_counts  — every lane's true total
--   assessment_list_facets  — filter options with counts (depth, exam_type, status, visibility)
--
-- Owner column: created_by. Lanes:
--   mine   → created_by = me
--   orgs   → someone else's assessment at visibility >= internal in one of my orgs
--   shared → someone else's assessment granted to me or one of my orgs (iam.permissions)
--   public → someone else's public assessment
-- question_count is the live count of the assessment's questions, never the
-- stored metadata copy.

CREATE OR REPLACE FUNCTION education.assessment_list_match(
  p_created_by uuid, p_organization_id uuid, p_visibility text, p_id uuid,
  p_deleted_at timestamptz, p_kind_row text,
  p_title text, p_topic text, p_description text, p_exam_type text,
  p_depth text, p_status text,
  p_kind text, p_scope text, p_org_id uuid, p_search text, p_filters jsonb,
  p_archived text, p_skip text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT
    (p_kind IS NULL OR p_kind_row = p_kind)
    AND (CASE p_scope
      WHEN 'mine' THEN p_created_by = (SELECT auth.uid())
      WHEN 'orgs' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility IN ('internal', 'link', 'public')
        AND p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
      WHEN 'shared' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM iam.permissions p
          WHERE p.resource_type = 'assessment' AND p.resource_id = p_id
            AND (p.granted_to_user_id = (SELECT auth.uid())
                 OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
            AND p.status <> 'rejected'
            AND (p.expires_at IS NULL OR p.expires_at > now()))
      WHEN 'public' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility = 'public'
      ELSE false
    END)
    AND (CASE coalesce(p_archived, 'active')
      WHEN 'all' THEN true
      WHEN 'archived' THEN p_deleted_at IS NOT NULL
      ELSE p_deleted_at IS NULL
    END)
    AND (coalesce(btrim(p_search), '') = ''
      OR position(lower(btrim(p_search)) IN lower(concat_ws(' ', p_title, p_topic, p_description, p_exam_type))) > 0)
    AND education.fc_set_list_filter_ok(p_filters, 'title', p_title, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'topic', p_topic, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'description', p_description, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'exam_type', p_exam_type, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'depth', p_depth, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'status', p_status, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'visibility', p_visibility, p_skip)
$$;

CREATE OR REPLACE FUNCTION education.assessment_list_scoped(
  p_kind text DEFAULT NULL, p_scope text DEFAULT 'mine', p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT '', p_filters jsonb DEFAULT '{}'::jsonb,
  p_archived text DEFAULT 'active', p_sort text DEFAULT 'updated',
  p_ascending boolean DEFAULT false, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid, organization_id uuid, created_by uuid, created_at timestamptz,
  updated_at timestamptz, deleted_at timestamptz, visibility text,
  assessment_kind text, title text, description text, status text,
  topic text, source_title text, exam_type text, depth text,
  time_limit_seconds integer, question_count bigint, total_count bigint
)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT a.id AS a_id, a.organization_id AS a_org, a.created_by AS a_by,
           a.created_at AS a_created, a.updated_at AS a_updated, a.deleted_at AS a_deleted,
           a.visibility::text AS a_vis, a.assessment_kind AS a_kind, a.title AS a_title,
           a.description AS a_desc, a.status AS a_status, a.topic AS a_topic,
           a.source_title AS a_source, a.exam_type AS a_exam, a.depth AS a_depth,
           a.time_limit_seconds AS a_limit
    FROM education.assessment a
  ),
  hit AS (
    SELECT b.*,
      (SELECT count(*) FROM education.assessment_item i
        WHERE i.assessment_id = b.a_id AND i.deleted_at IS NULL) AS a_count
    FROM base b
    WHERE education.assessment_list_match(
      b.a_by, b.a_org, b.a_vis, b.a_id, b.a_deleted, b.a_kind,
      b.a_title, b.a_topic, b.a_desc, b.a_exam, b.a_depth, b.a_status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived)
  ),
  keyed AS (
    SELECT h.*,
      CASE p_sort
        WHEN 'title' THEN lower(h.a_title)
        WHEN 'topic' THEN lower(nullif(btrim(h.a_topic), ''))
        WHEN 'exam_type' THEN lower(nullif(btrim(h.a_exam), ''))
        WHEN 'depth' THEN CASE h.a_depth WHEN 'recall' THEN '1' WHEN 'applied' THEN '2' WHEN 'exam' THEN '3' END
        WHEN 'status' THEN h.a_status
        WHEN 'visibility' THEN h.a_vis
        WHEN 'questions' THEN lpad(h.a_count::text, 10, '0')
        WHEN 'created' THEN to_char(h.a_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
        ELSE to_char(h.a_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
      END AS sort_key
    FROM hit h
  )
  SELECT k.a_id, k.a_org, k.a_by, k.a_created, k.a_updated, k.a_deleted,
         k.a_vis, k.a_kind, k.a_title, k.a_desc, k.a_status, k.a_topic,
         k.a_source, k.a_exam, k.a_depth, k.a_limit, k.a_count,
         count(*) OVER () AS total_count
  FROM keyed k
  ORDER BY
    CASE WHEN p_ascending THEN k.sort_key END ASC NULLS LAST,
    CASE WHEN NOT p_ascending THEN k.sort_key END DESC NULLS LAST,
    k.a_id
  LIMIT greatest(1, least(coalesce(p_limit, 25), 500))
  OFFSET greatest(0, coalesce(p_offset, 0))
$$;

CREATE OR REPLACE FUNCTION education.assessment_list_counts(
  p_kind text DEFAULT NULL, p_search text DEFAULT '',
  p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'
) RETURNS TABLE(scope text, total bigint)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT a.*, a.visibility::text AS vis FROM education.assessment a
  )
  SELECT l.lane, (
    SELECT count(*) FROM base b
    WHERE education.assessment_list_match(
      b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, l.lane, NULL, p_search, p_filters, p_archived)
  )
  FROM unnest(ARRAY['mine', 'orgs', 'shared', 'public']) AS l(lane)
$$;

CREATE OR REPLACE FUNCTION education.assessment_list_facets(
  p_kind text DEFAULT NULL, p_scope text DEFAULT 'mine', p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT '', p_filters jsonb DEFAULT '{}'::jsonb,
  p_archived text DEFAULT 'active'
) RETURNS TABLE(facet text, value text, total bigint)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT a.*, a.visibility::text AS vis FROM education.assessment a
  ),
  keyed AS (
    SELECT 'depth'::text AS f, coalesce(nullif(btrim(b.depth), ''), '__none__') AS v
    FROM base b
    WHERE education.assessment_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived, 'depth')
    UNION ALL
    SELECT 'exam_type', coalesce(nullif(btrim(b.exam_type), ''), '__none__')
    FROM base b
    WHERE education.assessment_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived, 'exam_type')
    UNION ALL
    SELECT 'status', coalesce(nullif(btrim(b.status), ''), '__none__')
    FROM base b
    WHERE education.assessment_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived, 'status')
    UNION ALL
    SELECT 'visibility', b.vis
    FROM base b
    WHERE education.assessment_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived, 'visibility')
  )
  SELECT k.f, k.v, count(*) FROM keyed k GROUP BY k.f, k.v ORDER BY k.f, count(*) DESC, k.v
$$;

GRANT EXECUTE ON FUNCTION education.assessment_list_match(uuid, uuid, text, uuid, timestamptz, text, text, text, text, text, text, text, text, text, uuid, text, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION education.assessment_list_scoped(text, text, uuid, text, jsonb, text, text, boolean, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION education.assessment_list_counts(text, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION education.assessment_list_facets(text, text, uuid, text, jsonb, text) TO authenticated, service_role;
