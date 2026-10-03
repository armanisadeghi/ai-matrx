-- chair-step: this file DROPS and re-CREATES education.fc_set_list_scoped (its RETURNS TABLE gains one trailing column,
-- custom_fields jsonb, which CREATE OR REPLACE cannot do), then re-grants EXECUTE to authenticated and
-- service_role. LOCK: the DROP takes ACCESS EXCLUSIVE on the FUNCTION only (no table) for the length of
-- this transaction; callers in flight wait. No body change beyond the new column. Its inverse drops it
-- and re-creates production's body byte for byte.
-- based-on: education.fc_set_list_scoped(text, uuid, text, jsonb, text, text, boolean, integer, integer) da159093268740a028fe1b603cde35cb90b1b7666a291320f44a5d18f988f5ff
--
-- LANE 7 · STANDARD-TABLES · W5 — the flashcard decks list's custom-field columns have values. The value is
-- returned only where the seat may read the row's fields: its maker, or a member of its organization
-- (else NULL); it is read as the person (this function is invoker), so the row's own rules decide.
-- Added at the END of the row, so positional callers keep their columns. Based on PRODUCTION's body.

set local lock_timeout = '3s';

DROP FUNCTION IF EXISTS education.fc_set_list_scoped(text, uuid, text, jsonb, text, text, boolean, integer, integer);

CREATE OR REPLACE FUNCTION education.fc_set_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'::text, p_sort text DEFAULT 'updated'::text, p_ascending boolean DEFAULT false, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, organization_id uuid, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone, visibility text, name text, description text, topic text, lesson text, difficulty text, folder_ids uuid[], total_count bigint, custom_fields jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH base AS (
    SELECT s.id AS s_id, s.organization_id AS s_org, s.created_by AS s_by,
           s.created_at AS s_created, s.updated_at AS s_updated, s.deleted_at AS s_deleted,
           s.visibility::text AS s_vis, s.name AS s_name, s.description AS s_desc,
           s.topic AS s_topic, s.lesson AS s_lesson, s.difficulty AS s_diff,
           -- Folders are read per row only when the folder filter needs them; the page's
           -- folder_ids are read below, for the returned rows alone.
           CASE WHEN p_filters ? 'folders' THEN education.fc_set_folder_ids(s.id) END AS s_folders,
           s.shown_to AS s_shown, s.visibility AS s_visibility
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
      AND (p_scope IS DISTINCT FROM 'team' OR (b.s_org, b.s_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show.
      -- My Orgs includes my OWN decks always (like 'all'), so All = Mine + My Orgs + Shared holds.
      AND (lower(coalesce(p_scope, '')) NOT IN ('orgs', 'team')
           OR (p_scope = 'orgs' AND b.s_by = (SELECT auth.uid()))
           OR platform.shown_to_lists(b.s_shown, b.s_visibility, b.s_by, b.s_org, (SELECT auth.uid()), (SELECT platform.shown_to_context('fc_set'))))
      -- 'all' (active-org law): my own rows and directly-shared rows always show; the org arm honours Shown to
      AND (p_scope IS DISTINCT FROM 'all'
           OR b.s_by = (SELECT auth.uid())
           OR platform.shown_to_lists(b.s_shown, b.s_visibility, b.s_by, b.s_org, (SELECT auth.uid()), (SELECT platform.shown_to_context('fc_set')))
           OR EXISTS (
             SELECT 1 FROM iam.permissions p
             WHERE p.resource_type = 'fc_set' AND p.resource_id = b.s_id
               AND (p.granted_to_user_id = (SELECT auth.uid())
                    OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
               AND p.status <> 'rejected'
               AND (p.expires_at IS NULL OR p.expires_at > now())))
  ),
  page AS (
    SELECT h.*, count(*) OVER () AS total_count
    FROM hit h
    ORDER BY
      CASE WHEN p_ascending THEN h.sort_key END ASC NULLS LAST,
      CASE WHEN NOT p_ascending THEN h.sort_key END DESC NULLS LAST,
      h.s_id
    LIMIT greatest(1, least(coalesce(p_limit, 25), 500))
    OFFSET greatest(0, coalesce(p_offset, 0))
  )
  SELECT pg.s_id, pg.s_org, pg.s_by, pg.s_created, pg.s_updated, pg.s_deleted,
         pg.s_vis, pg.s_name, pg.s_desc, pg.s_topic, pg.s_lesson, pg.s_diff,
         coalesce(pg.s_folders, education.fc_set_folder_ids(pg.s_id)),
         pg.total_count,
         CASE WHEN pg.s_by = (SELECT auth.uid()) OR pg.s_org IN (SELECT iam.my_orgs()) THEN (SELECT x.custom_fields FROM education.fc_set x WHERE x.id = pg.s_id) END
  FROM page pg
  ORDER BY
    CASE WHEN p_ascending THEN pg.sort_key END ASC NULLS LAST,
    CASE WHEN NOT p_ascending THEN pg.sort_key END DESC NULLS LAST,
    pg.s_id
$function$;

GRANT EXECUTE ON FUNCTION education.fc_set_list_scoped(text, uuid, text, jsonb, text, text, boolean, integer, integer) TO authenticated, service_role;
