-- education.fc_set_list_* — the scoped-list RPC family for /education/flashcards.
-- Applied to brsgrqvjdzwihsvnfqkf through the Supabase MCP on 2026-09-27 (page-pass); idempotent (CREATE OR REPLACE).
--
-- Hand-written from the template in lib/list-scope/FEATURE.md (worked refs:
-- public.wfx_list_scoped, public.agx_list_scoped). SECURITY INVOKER: the
-- table's RLS stays the ceiling, and every call DECLARES its lane on top of it
-- (THE VIEW LAW) — a platform admin, whom RLS lets read every org's decks,
-- still sees only decks from HIS organizations under "My Orgs".
--
--   fc_set_list_match   — the one predicate (lane + archive + search + filters)
--   fc_set_list_scoped  — one page of rows + the true total
--   fc_set_list_counts  — every lane's true total
--   fc_set_list_facets  — filter options with counts (difficulty, visibility, folders)
--
-- Owner column: created_by. Lanes:
--   mine   → created_by = me
--   orgs   → someone else's deck at visibility >= internal in one of my orgs
--            (p_org_id narrows to one)
--   shared → someone else's deck granted to me or one of my orgs (iam.permissions)
--   public → someone else's public deck
-- Folders are platform.associations edges fc_set → category, role 'theme'.

-- A select/text filter entry passes (or is absent / skipped).
CREATE OR REPLACE FUNCTION education.fc_set_list_filter_ok(
  p_filters jsonb, p_key text, p_value text, p_skip text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_skip = p_key OR p_filters IS NULL OR NOT (p_filters ? p_key) THEN true
    WHEN p_filters -> p_key ->> 'kind' = 'select' THEN
      jsonb_array_length(coalesce(p_filters -> p_key -> 'values', '[]'::jsonb)) = 0
      OR coalesce(nullif(btrim(p_value), ''), '__none__') IN (
        SELECT jsonb_array_elements_text(p_filters -> p_key -> 'values'))
    WHEN p_filters -> p_key ->> 'kind' = 'text' THEN
      coalesce(p_filters -> p_key ->> 'value', '') = ''
      OR position(lower(p_filters -> p_key ->> 'value') IN lower(coalesce(p_value, ''))) > 0
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION education.fc_set_list_match(
  p_created_by uuid,
  p_organization_id uuid,
  p_visibility text,
  p_id uuid,
  p_deleted_at timestamptz,
  p_name text, p_topic text, p_lesson text, p_description text, p_difficulty text,
  p_folder_ids uuid[],
  p_scope text, p_org_id uuid, p_search text, p_filters jsonb, p_archived text,
  p_skip text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT
    -- lane
    (CASE p_scope
      WHEN 'mine' THEN p_created_by = (SELECT auth.uid())
      WHEN 'orgs' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility IN ('internal', 'link', 'public')
        AND p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
      WHEN 'shared' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM iam.permissions p
          WHERE p.resource_type = 'fc_set' AND p.resource_id = p_id
            AND (p.granted_to_user_id = (SELECT auth.uid())
                 OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
            AND p.status <> 'rejected'
            AND (p.expires_at IS NULL OR p.expires_at > now()))
      WHEN 'public' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility = 'public'
      ELSE false
    END)
    -- archive axis
    AND (CASE coalesce(p_archived, 'active')
      WHEN 'all' THEN true
      WHEN 'archived' THEN p_deleted_at IS NOT NULL
      ELSE p_deleted_at IS NULL
    END)
    -- search
    AND (coalesce(btrim(p_search), '') = ''
      OR position(lower(btrim(p_search)) IN lower(concat_ws(' ', p_name, p_topic, p_lesson, p_description))) > 0)
    -- column filters
    AND education.fc_set_list_filter_ok(p_filters, 'name', p_name, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'topic', p_topic, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'lesson', p_lesson, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'description', p_description, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'difficulty', p_difficulty, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'visibility', p_visibility, p_skip)
    AND (p_skip = 'folders' OR p_filters IS NULL OR NOT (p_filters ? 'folders')
      OR jsonb_array_length(coalesce(p_filters -> 'folders' -> 'values', '[]'::jsonb)) = 0
      OR (cardinality(p_folder_ids) = 0 AND (p_filters -> 'folders' -> 'values') ? '__none__')
      OR EXISTS (SELECT 1 FROM unnest(p_folder_ids) f
                 WHERE f::text IN (SELECT jsonb_array_elements_text(p_filters -> 'folders' -> 'values'))))
$$;

-- The folder ids one deck is filed under.
CREATE OR REPLACE FUNCTION education.fc_set_folder_ids(p_set_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(a.target_id ORDER BY a.position NULLS LAST, a.target_id), '{}'::uuid[])
  FROM platform.associations_live a
  WHERE a.source_type = 'fc_set' AND a.source_id = p_set_id
    AND a.target_type = 'category' AND a.role = 'theme'
$$;

CREATE OR REPLACE FUNCTION education.fc_set_list_scoped(
  p_scope text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT '',
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_archived text DEFAULT 'active',
  p_sort text DEFAULT 'updated',
  p_ascending boolean DEFAULT false,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  visibility text,
  name text,
  description text,
  topic text,
  lesson text,
  difficulty text,
  folder_ids uuid[],
  total_count bigint
)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT s.id AS s_id, s.organization_id AS s_org, s.created_by AS s_by,
           s.created_at AS s_created, s.updated_at AS s_updated, s.deleted_at AS s_deleted,
           s.visibility::text AS s_vis, s.name AS s_name, s.description AS s_desc,
           s.topic AS s_topic, s.lesson AS s_lesson, s.difficulty AS s_diff,
           education.fc_set_folder_ids(s.id) AS s_folders
    FROM education.fc_set s
  ),
  hit AS (
    SELECT b.*,
      CASE p_sort
        WHEN 'name' THEN lower(b.s_name)
        WHEN 'topic' THEN lower(nullif(btrim(b.s_topic), ''))
        WHEN 'lesson' THEN lower(nullif(btrim(b.s_lesson), ''))
        WHEN 'description' THEN lower(nullif(btrim(b.s_desc), ''))
        WHEN 'difficulty' THEN CASE lower(b.s_diff) WHEN 'easy' THEN '1' WHEN 'medium' THEN '2' WHEN 'hard' THEN '3' END
        WHEN 'visibility' THEN b.s_vis
        WHEN 'created' THEN to_char(b.s_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
        ELSE to_char(b.s_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
      END AS sort_key
    FROM base b
    WHERE education.fc_set_list_match(
      b.s_by, b.s_org, b.s_vis, b.s_id, b.s_deleted,
      b.s_name, b.s_topic, b.s_lesson, b.s_desc, b.s_diff, b.s_folders,
      p_scope, p_org_id, p_search, p_filters, p_archived)
  )
  SELECT h.s_id, h.s_org, h.s_by, h.s_created, h.s_updated, h.s_deleted,
         h.s_vis, h.s_name, h.s_desc, h.s_topic, h.s_lesson, h.s_diff, h.s_folders,
         count(*) OVER () AS total_count
  FROM hit h
  ORDER BY
    CASE WHEN p_ascending THEN h.sort_key END ASC NULLS LAST,
    CASE WHEN NOT p_ascending THEN h.sort_key END DESC NULLS LAST,
    h.s_id
  LIMIT greatest(1, least(coalesce(p_limit, 25), 500))
  OFFSET greatest(0, coalesce(p_offset, 0))
$$;

CREATE OR REPLACE FUNCTION education.fc_set_list_counts(
  p_search text DEFAULT '',
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_archived text DEFAULT 'active'
)
RETURNS TABLE (scope text, total bigint)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT s.*, s.visibility::text AS vis, education.fc_set_folder_ids(s.id) AS folders
    FROM education.fc_set s
  )
  SELECT l.lane, (
    SELECT count(*) FROM base b
    WHERE education.fc_set_list_match(
      b.created_by, b.organization_id, b.vis, b.id, b.deleted_at,
      b.name, b.topic, b.lesson, b.description, b.difficulty, b.folders,
      l.lane, NULL, p_search, p_filters, p_archived)
  )
  FROM unnest(ARRAY['mine', 'orgs', 'shared', 'public']) AS l(lane)
$$;

CREATE OR REPLACE FUNCTION education.fc_set_list_facets(
  p_scope text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT '',
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_archived text DEFAULT 'active'
)
RETURNS TABLE (facet text, value text, total bigint)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT s.*, s.visibility::text AS vis, education.fc_set_folder_ids(s.id) AS folders
    FROM education.fc_set s
  ),
  keyed AS (
    SELECT 'difficulty'::text AS f, coalesce(nullif(btrim(b.difficulty), ''), '__none__') AS v
    FROM base b
    WHERE education.fc_set_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at,
      b.name, b.topic, b.lesson, b.description, b.difficulty, b.folders,
      p_scope, p_org_id, p_search, p_filters, p_archived, 'difficulty')
    UNION ALL
    SELECT 'visibility', b.vis
    FROM base b
    WHERE education.fc_set_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at,
      b.name, b.topic, b.lesson, b.description, b.difficulty, b.folders,
      p_scope, p_org_id, p_search, p_filters, p_archived, 'visibility')
    UNION ALL
    SELECT 'folders', coalesce(f.fid::text, '__none__')
    FROM base b
    LEFT JOIN LATERAL unnest(CASE WHEN cardinality(b.folders) = 0 THEN ARRAY[NULL::uuid] ELSE b.folders END) AS f(fid) ON true
    WHERE education.fc_set_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at,
      b.name, b.topic, b.lesson, b.description, b.difficulty, b.folders,
      p_scope, p_org_id, p_search, p_filters, p_archived, 'folders')
  )
  SELECT k.f, k.v, count(*) FROM keyed k GROUP BY k.f, k.v ORDER BY k.f, count(*) DESC, k.v
$$;

REVOKE ALL ON FUNCTION education.fc_set_list_scoped(text, uuid, text, jsonb, text, text, boolean, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION education.fc_set_list_counts(text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION education.fc_set_list_facets(text, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION education.fc_set_list_scoped(text, uuid, text, jsonb, text, text, boolean, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION education.fc_set_list_counts(text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION education.fc_set_list_facets(text, uuid, text, jsonb, text) TO authenticated, service_role;
