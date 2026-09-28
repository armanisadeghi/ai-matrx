-- team_list_scope_everywhere — every scoped list answers "My team" (2026-09-27, access-ladder T-29).
--
-- The access ladder's "my team or department" list value, made a list SCOPE on every list that
-- offers Mine + My Orgs. A team is list-filter input, never row security: the "team" arm is the
-- "orgs" arm's own rows (same membership and visibility tests), narrowed to (organization,
-- creator) pairs from iam.my_team_reach(p_org_id) — evaluated once per query, never per row
-- (aidream 1422; teams FEATURE.md). A person on no team sees exactly their own items there.
--
-- Each body below is the LIVE definition read 2026-09-27 with only the team arm added:
--   · the scope vocabulary check gains 'team';
--   · the orgs arm becomes IN ('orgs','team') plus one reach clause for 'team';
--   · every *_scope_counts / *_counts returns a 'team' total, and a 'team' narrow row per
--     organization where the caller shares a team with someone;
--   · education match functions gain a 'team' arm without the reach (their callers narrow once).
-- Companion client change: lib/list-scope withTeamScope + EntityScopeTabs "My team".
-- based-on: education.assessment_list_match(uuid, uuid, text, uuid, timestamp with time zone, text, text, text, text, text, text, text, text, text, uuid, text, jsonb, text, text) f1d05ba736604aecc5c086d00d388d34b34d555a5a1a71343f0d69c157e89a87
-- based-on: education.fc_set_list_match(uuid, uuid, text, uuid, timestamp with time zone, text, text, text, text, text, uuid[], text, uuid, text, jsonb, text, text) 9c5d9354b94a5924c94f1aab70f2e752f7a5e2627a1bcff6f7f9586ff4e68a50
-- based-on: public.edu_library_scope_rows(text) 364cfdd6a457b63943e4380a17e5161e517020b716674844ae09d755ac5bf83d
-- based-on: education.assessment_list_scoped(text, text, uuid, text, jsonb, text, text, boolean, integer, integer) 73995116ad495964a2be1ebba5fcb0b5de3a0177f71a3a5ea47e68fcf4ad915f
-- based-on: education.fc_set_list_scoped(text, uuid, text, jsonb, text, text, boolean, integer, integer) 852db91e783521df830d1c0c8f5087b4fa128fd2a654926184f70e57f4f82c50
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) b3f4aabc83fd007b620375770cccecc7da04847b029f54976b771e2e42f7a9c2
-- based-on: public.crm_chasebox_items(text, text, uuid, integer, integer) 96cc52c505619e1d7248498af49030fa5213dc46a593c0ffc9b08d64fe132f8c
-- based-on: public.crm_inbox_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 7958f51504cac7f4b50a95c6f4ced47c912e57b59be0540678ea0d7e3e81c2a7
-- based-on: public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) cbd92ddd13e3358821dad4d8368463b75501499f61b57b5c8d73ef29fac4f437
-- based-on: public.ivw_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) e3ba30e6c781551938dfacaccd297f8fff5631bb69e6f86ee57bce3a21dd7af4
-- based-on: public.mkt_initiative_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 6f34dee09886f5e3079859e7bbeaa2012242c4201084ef65223f2b3c7b4bdc31
-- based-on: public.rsx_list_scoped(text, uuid, text, text, text, jsonb, integer, integer, text) 12c3103947f75d0f5d093b3a66c8d69c93ad0236cd128a694cd4321a79c5dc1d
-- based-on: public.seo_rank_target_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) 6c915a073bdb3a4cbde02b61160139b7fe1fa51b3ef54a6421d5b0c5c5aafe80
-- based-on: public.shx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) c24aff3fcff2750f78f8008edf6da55b0a16c6b063cefe3af1db7d1d75291f70
-- based-on: public.trx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 31c80d61eab664f5a88f637ad08540c558e14319cac17ff146475d1aea0f288e
-- based-on: public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 746042ca415a35c9c7daec13d9fcf239f5338989c7f45294890d4994fdb38554
-- based-on: education.assessment_list_counts(text, text, jsonb, text) a9f1f54725bd98187d4efd2a28054d4d55825eb2787f66f6880378664a0182c3
-- based-on: education.assessment_list_facets(text, text, uuid, text, jsonb, text) 06002d3a22d28d56aefed495c9592f4ba5cc41f9d4276a4ae215958e21a1c650
-- based-on: education.fc_set_list_counts(text, jsonb, text) 102e1cbc2a1dc9aea2d05dca5c00f6c3eafa7058bcdc651ca47cf6fc02cba4c4
-- based-on: education.fc_set_list_facets(text, uuid, text, jsonb, text) cb10846a9050fd4cd70d4fea7b96a201f9dafe75805a8844f20a458134bb5686
-- based-on: public.agx_list_scope_counts(text, boolean, text, jsonb) c199d0e7dda21cdfba356f14dec6620c063e9896a2fffb082bb1786669898649
-- based-on: public.crm_inbox_list_scope_counts(text, boolean, jsonb) c3cdf48dc00ffc0ed77ebb917beeb1cb781c57f79e5ed8d7c015fcc6803db3b5
-- based-on: public.cvx_list_scope_counts(text, boolean, text, jsonb) a756892f6db60e0c507dbd328cd34c5d37f6748c47de79477eeb9f934ff5ab29
-- based-on: public.edu_library_scope_counts(text, jsonb) 4e0db2873870ecd89ec6cd571dedc6385d6bc775df9e185cb26f6c7cde344645
-- based-on: public.ivw_list_scope_counts(text, jsonb) 529cb4d98acdbe215a22ad74a67a9fd42950cb10dc83da41b2828ce4b0624313
-- based-on: public.mkt_initiative_list_scope_counts(text, boolean, jsonb) 721110b2c956f9c69777c93ae9d2559017874f6de7e0651c542095dfadf8c219
-- based-on: public.rsx_list_scope_counts(text, jsonb, text) 55ae91a5c06cd40118a22bb67e249642ad0b29ab6b56dbfbdaa73304e1937df5
-- based-on: public.seo_rank_target_list_scope_counts(text, jsonb) 54b2d35d3db0a39dbf20c50d041b4ddd49ff9173f85af12a1d8cbaf7c675f462
-- based-on: public.shx_list_scope_counts(text, boolean, jsonb) 46ef3fc5568f7bd7aafec34b20e342f9cb6b34842f791740aac8ef2f230044bb
-- based-on: public.trx_list_scope_counts(text, boolean, jsonb) 6e092bd88316c170c31cc57d4f510a8c56d6316f3afc0dcf723d7ffbecbd13f2
-- based-on: public.wfx_list_scope_counts(text, boolean, text, jsonb) 0fb85f84e169e8b2afef7e85b95f755c44a3d874c02b9d69cc6de02f391cec92
SELECT set_config('app.actor_tier', 'code', true);
SELECT set_config('app.actor_system', 'migration:team_list_scope_everywhere', true);

-- ── education.assessment_list_match ──
CREATE OR REPLACE FUNCTION education.assessment_list_match(p_created_by uuid, p_organization_id uuid, p_visibility text, p_id uuid, p_deleted_at timestamp with time zone, p_kind_row text, p_title text, p_topic text, p_description text, p_exam_type text, p_depth text, p_status text, p_kind text, p_scope text, p_org_id uuid, p_search text, p_filters jsonb, p_archived text, p_skip text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    (p_kind IS NULL OR p_kind_row = p_kind)
    AND (CASE p_scope
      WHEN 'mine' THEN p_created_by = (SELECT auth.uid())
      WHEN 'orgs' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility IN ('internal', 'link', 'public')
        AND p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
      -- MY TEAM (T-29): my own rows in the organization plus what "orgs" admits; the caller
      -- narrows the others to my teammates once per query through iam.my_team_reach.
      WHEN 'team' THEN p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
        AND (p_created_by = (SELECT auth.uid()) OR p_visibility IN ('internal', 'link', 'public'))
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
$function$;

-- ── education.fc_set_list_match ──
CREATE OR REPLACE FUNCTION education.fc_set_list_match(p_created_by uuid, p_organization_id uuid, p_visibility text, p_id uuid, p_deleted_at timestamp with time zone, p_name text, p_topic text, p_lesson text, p_description text, p_difficulty text, p_folder_ids uuid[], p_scope text, p_org_id uuid, p_search text, p_filters jsonb, p_archived text, p_skip text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    (CASE p_scope
      WHEN 'mine' THEN p_created_by = (SELECT auth.uid())
      WHEN 'orgs' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility IN ('internal', 'link', 'public')
        AND p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
      -- MY TEAM (T-29): my own rows in the organization plus what "orgs" admits; the caller
      -- narrows the others to my teammates once per query through iam.my_team_reach.
      WHEN 'team' THEN p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
        AND (p_created_by = (SELECT auth.uid()) OR p_visibility IN ('internal', 'link', 'public'))
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
    AND (CASE coalesce(p_archived, 'active')
      WHEN 'all' THEN true
      WHEN 'archived' THEN p_deleted_at IS NOT NULL
      ELSE p_deleted_at IS NULL
    END)
    AND (coalesce(btrim(p_search), '') = ''
      OR position(lower(btrim(p_search)) IN lower(concat_ws(' ', p_name, p_topic, p_lesson, p_description))) > 0)
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
$function$;

-- ── public.edu_library_scope_rows ──
CREATE OR REPLACE FUNCTION public.edu_library_scope_rows(p_scope text DEFAULT 'mine'::text)
 RETURNS TABLE(id uuid, kind text, subtype text, title text, description text, status text, visibility text, created_by uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  -- THE NARROWEST OF THE FOUR TOKENS THIS LIST UNIONS. `min` over ('mine','orgs') is 'mine', which
  -- is the rule spelled as arithmetic: one token that opens on itself keeps the whole library on
  -- itself. `platform.entity_default_list_scope` is the one mapper from the registry word
  -- `organization` to this vocabulary's `orgs` (§3.3 item 4 — we do not rename a live parameter
  -- vocabulary to make a new column prettier).
  v_default text := (
    SELECT min(platform.entity_default_list_scope(t))
      FROM unnest(ARRAY['fc_set','assessment','study_media','note']) AS t);
  v_scope text := lower(coalesce(p_scope, v_default));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'edu_library_scope_rows: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('mine', 'team', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'edu_library_scope_rows: unknown scope %', v_scope USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT
      s.id AS u_id,
      'fc_set'::text AS u_kind,
      'flashcards'::text AS u_subtype,
      coalesce(nullif(s.name, ''), 'Untitled flashcard deck') AS u_title,
      coalesce(s.description, '') AS u_description,
      'ready'::text AS u_status,
      s.visibility::text AS u_visibility,
      s.created_by AS u_created_by,
      s.organization_id AS u_organization_id,
      s.created_at AS u_created_at,
      s.updated_at AS u_updated_at
    FROM education.fc_set s
    WHERE s.deleted_at IS NULL

    UNION ALL

    SELECT
      a.id,
      'assessment'::text,
      a.assessment_kind,
      coalesce(nullif(a.title, ''), 'Untitled assessment'),
      coalesce(a.description, ''),
      coalesce(nullif(a.status, ''), 'draft'),
      a.visibility::text,
      a.created_by,
      a.organization_id,
      a.created_at,
      a.updated_at
    FROM education.assessment a
    WHERE a.deleted_at IS NULL

    UNION ALL

    SELECT
      m.id,
      'study_media'::text,
      m.media_kind,
      coalesce(nullif(m.title, ''), 'Untitled study media'),
      coalesce(m.description, ''),
      coalesce(nullif(m.status, ''), 'draft'),
      m.visibility::text,
      m.created_by,
      m.organization_id,
      m.created_at,
      m.updated_at
    FROM education.study_media m
    WHERE m.deleted_at IS NULL

    UNION ALL

    SELECT
      n.id,
      'note'::text,
      'notes'::text,
      coalesce(nullif(n.label, ''), 'Untitled note'),
      coalesce(nullif(n.folder_name, ''), 'Study note'),
      'ready'::text,
      n.visibility::text,
      n.created_by,
      n.organization_id,
      n.created_at,
      n.updated_at
    FROM workbench.notes n
    WHERE n.deleted_at IS NULL
      -- ONLY notes marked for Education (the Study Notes folder). A plain note is the Notes app's.
      AND n.folder_name = 'Study Notes'
  ),
  scoped AS (
    SELECT
      u.*,
      true AS s_is_owner,
      'owner'::text AS s_access_level
    FROM unified u
    WHERE v_scope = 'mine'
      AND u.u_created_by = v_uid

    UNION ALL

    -- ORGS — NO PREDICATE. This arm is the whole point of DD-137c: the organization's library is
    -- whatever RLS already lets this person read, the viewer's own rows included. It carries no
    -- membership test (RLS decides membership), no visibility test (RLS decides visibility), and no
    -- `created_by IS DISTINCT FROM` (excluding your own work from "everyone's" is the bug).
    SELECT
      u.*,
      (u.u_created_by = v_uid),
      CASE WHEN u.u_created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM unified u
    WHERE v_scope IN ('orgs', 'team')
      -- DD-137c7: the organization tab shows the organizations this person belongs to,
      -- personal included. No visibility test, no owner test — RLS decided both already.
      AND u.u_organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (u.u_organization_id, u.u_created_by) IN
           (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(NULL) r))

    UNION ALL

    SELECT
      u.*,
      false,
      'shared'::text
    FROM unified u
    WHERE v_scope = 'shared'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND EXISTS (
        SELECT 1
        FROM iam.permissions p
        WHERE p.resource_type = u.u_kind
          AND p.resource_id = u.u_id
          AND p.status = 'active'
          AND (p.expires_at IS NULL OR p.expires_at > now())
          AND (
            p.granted_to_user_id = v_uid
            OR p.granted_to_organization_id IN (
              SELECT om.organization_id
              FROM iam.organization_member om
              WHERE om.user_id = v_uid
            )
          )
      )

    UNION ALL

    SELECT
      u.*,
      false,
      'public'::text
    FROM unified u
    WHERE v_scope = 'public'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND u.u_visibility = 'public'
  )
  SELECT
    s.u_id,
    s.u_kind,
    s.u_subtype,
    s.u_title,
    s.u_description,
    s.u_status,
    s.u_visibility,
    s.u_created_by,
    s.u_organization_id,
    o.name,
    s.u_created_at,
    s.u_updated_at,
    s.s_is_owner,
    s.s_access_level,
    au.email::text
  FROM scoped s
  LEFT JOIN iam.organizations o ON o.id = s.u_organization_id
  LEFT JOIN platform.visible_user_identity au ON au.id = s.u_created_by;
END;
$function$;

-- ── education.assessment_list_scoped ──
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
           a.time_limit_seconds AS a_limit
    FROM education.assessment a
  ),
  hit AS (
    SELECT b.*,
      (SELECT count(*) FROM education.assessment_item i
        WHERE i.assessment_id = b.a_id AND i.deleted_at IS NULL) AS a_count,
      mine.n AS a_attempts, mine.best AS a_best, mine.last_id AS a_last
    FROM base b
    LEFT JOIN LATERAL (
      SELECT count(*) AS n, max(r.score_value) AS best,
             (array_agg(r.id ORDER BY r.completed_at DESC NULLS LAST, r.id DESC))[1] AS last_id
      FROM education.assessment_result r
      WHERE r.assessment_id = b.a_id AND r.created_by = (SELECT auth.uid())
        AND r.deleted_at IS NULL AND r.status = 'completed'
    ) mine ON true
    WHERE education.assessment_list_match(
      b.a_by, b.a_org, b.a_vis, b.a_id, b.a_deleted, b.a_kind,
      b.a_title, b.a_topic, b.a_desc, b.a_exam, b.a_depth, b.a_status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived)
      AND (p_scope IS DISTINCT FROM 'team' OR (b.a_org, b.a_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
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
        WHEN 'attempts' THEN lpad(h.a_attempts::text, 10, '0')
        WHEN 'best_score' THEN CASE WHEN h.a_best IS NULL THEN NULL ELSE lpad(to_char(h.a_best * 1000, 'FM0000000000'), 10, '0') END
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
  -- Edit rights follow the person's access, checked only for the page's rows.
  SELECT pg.a_id, pg.a_org, pg.a_by, pg.a_created, pg.a_updated, pg.a_deleted,
         pg.a_vis, pg.a_kind, pg.a_title, pg.a_desc, pg.a_status, pg.a_topic,
         pg.a_source, pg.a_exam, pg.a_depth, pg.a_limit, pg.a_count,
         pg.a_attempts, pg.a_best, pg.a_last,
         (pg.a_by = (SELECT auth.uid())
           OR iam.has_access('assessment', pg.a_id, 'editor'::public.permission_level)) AS my_can_edit,
         pg.total_count
  FROM page pg
  ORDER BY
    CASE WHEN p_ascending THEN pg.sort_key END ASC NULLS LAST,
    CASE WHEN NOT p_ascending THEN pg.sort_key END DESC NULLS LAST,
    pg.a_id
$function$;

-- ── education.fc_set_list_scoped ──
CREATE OR REPLACE FUNCTION education.fc_set_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'::text, p_sort text DEFAULT 'updated'::text, p_ascending boolean DEFAULT false, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, organization_id uuid, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, deleted_at timestamp with time zone, visibility text, name text, description text, topic text, lesson text, difficulty text, folder_ids uuid[], total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
      AND (p_scope IS DISTINCT FROM 'team' OR (b.s_org, b.s_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
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
$function$;

-- ── public.agx_list_scoped ──
CREATE OR REPLACE FUNCTION public.agx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, created_by uuid, organization_id uuid, organization_name text, task_id uuid, source_agent_id uuid, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('agent')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Column filters, keyed by column id. '__none__' is the sentinel for
  -- "has no value" (uncategorized / untagged).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- The system scope is the only one that reads the builtin corpus; a platform
  -- admin reads all of it, everyone else the published built-ins. Resolved
  -- once so the scan is not per-row.
  v_is_admin boolean := public.is_platform_admin();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public','system','platform_orgs','platform_users','platform_all') THEN
    RAISE EXCEPTION 'agx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a WHERE v_scope='mine' AND a.created_by = v_uid
    UNION ALL
    SELECT a.*, (a.created_by = v_uid), CASE WHEN a.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM agent.definition a
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR a.organization_id = p_org_id) AND a.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (a.organization_id, a.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    -- DISTINCT ON needs its own ORDER BY (deterministic access_level when
    -- several org grants exist) — hence the subquery wrapper. (D134)
    SELECT * FROM (
      SELECT DISTINCT ON (a.id) a.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM agent.definition a
      JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='agent'
          AND p2.resource_id=a.id AND p2.granted_to_user_id=v_uid)
      ORDER BY a.id, perm.permission_level::text
    ) org_shared
    UNION ALL
    -- PUBLIC = what a tenant PUBLISHED: the agent's CARD is public (card_visibility, the one
    -- column the publish path writes; the body can never be public — CHECK). The card rows come
    -- through agent.public_card_rows(), a definer that projects card fields only, because RLS
    -- hides a stranger's agent body from this invoker function (2026-09-26).
    SELECT a.*, false, 'public'::text FROM agent.public_card_rows() a
    WHERE v_scope='public' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    -- SYSTEM: the platform's own builtin corpus. Every signed-in person reads
    -- the PUBLISHED built-ins (card_visibility = 'public', the one column the
    -- publish path writes) and does not own them; a platform admin also reads
    -- the unpublished rest and owns them — the row-level affordances (rename,
    -- favorite, delete) are what the System Agents page exists to give them.
    -- (2026-09-27: this arm was admin-only, so /agents/all never showed the
    -- 500+ public built-ins to anyone.)
    SELECT a.*, v_is_admin, 'system'::text FROM agent.definition a
    WHERE v_scope='system' AND (v_is_admin OR a.card_visibility = 'public'::platform.visibility)
    UNION ALL
    -- ADMIN PLATFORM SCOPES (Arman, 2026-09-26: "No one acts as themselves in
    -- admin"). The whole platform, never the viewer: every organization's
    -- agents, every person's own agents, or everything. Admin-only.
    SELECT a.*, (a.agent_type = 'builtin'), 'platform'::text FROM agent.definition a
    LEFT JOIN iam.organizations po ON po.id = a.organization_id
    WHERE v_is_admin AND (
         (v_scope='platform_orgs' AND a.organization_id IS NOT NULL
            AND a.organization_id IS DISTINCT FROM (SELECT so.organization_id FROM iam.system_orgs so WHERE so.key = 'system')
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR (v_scope='platform_users' AND a.organization_id IS NULL
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR v_scope='platform_all')
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
  ),
  filtered AS (
    SELECT j.* FROM joined j
    -- The corpus a scope reads. Every user-facing scope reads user agents;
    -- `system` reads the builtin corpus and NOTHING else, so a builtin can
    -- never leak into Mine/Orgs/Shared/Public and a user agent can never
    -- masquerade as a platform agent.
    WHERE (v_scope = 'platform_all' OR j.agent_type = (CASE WHEN v_scope='system' THEN 'builtin' ELSE 'user' END))
      AND j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR (p_deep AND j.messages::text ILIKE '%'||v_search||'%'))
      -- Per-column TEXT filters
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- Per-column MULTI-SELECT filters
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      -- BOOLEAN filters
      AND (NOT v_f ? 'favorite'
           OR platform.my_favorite('agent', j.id) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.agx_search_score(
      v_search, f.id, f.name, f.description, f.category, f.tags,
      f.model_id, f.agent_type, f.s_owner_email,
      p_deep AND f.messages::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.agent_type, c.name, c.description, c.model_id, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, platform.my_favorite('agent', c.id),
    c.visibility::text, c.created_by, c.organization_id, c.s_org_name, c.task_id, c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST when searching. A name match must outrank a description
    -- match; ordering a search by updated_at buries the thing you asked for.
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    -- Favorites pinned to the top of EVERY sort. This is the product default:
    -- what you starred is what you reach for.
    CASE WHEN p_favorites_first THEN platform.my_favorite('agent', c.id) END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.description,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.category,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='access_level' AND v_dir='desc' THEN lower(coalesce(c.s_access,'')) END DESC,
    CASE WHEN v_sort='access_level' AND v_dir='asc' THEN lower(coalesce(c.s_access,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='version' AND v_dir='desc' THEN c.version END DESC,
    CASE WHEN v_sort='version' AND v_dir='asc' THEN c.version END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN platform.my_favorite('agent', c.id) END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN platform.my_favorite('agent', c.id) END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

-- ── public.crm_chasebox_items ──
CREATE OR REPLACE FUNCTION public.crm_chasebox_items(p_queue text, p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(queue text, id uuid, interaction_id uuid, member_id uuid, party_id uuid, party_name text, employer_name text, outreach_list_id uuid, outreach_list_name text, outreach_list_status text, sending_identity_id uuid, sending_identity_label text, subject text, detail text, problem_code text, problem_message text, problem_fix text, step integer, occurred_at timestamp with time zone, organization_id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_queue text := lower(coalesce(p_queue, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_chasebox_items: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs') THEN
    RAISE EXCEPTION 'crm_chasebox_items: unsupported scope %', v_scope;
  END IF;
  IF v_queue NOT IN ('fresh_replies','pending_drafts','stalled_sequences',
                     'blocked_members','escalation_candidates') THEN
    RAISE EXCEPTION 'crm_chasebox_items: unknown queue %', v_queue;
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT DISTINCT m.container_id AS org_id
    FROM iam.memberships m
    WHERE m.user_id = v_uid AND m.container_type = 'organization'
      AND (p_org_id IS NULL OR m.container_id = p_org_id)
  ),
  -- THE RLS CEILING for the member half: crm.outreach_list_member's std_select
  -- keys on reach to its parent crm_outreach_list.
  reachable_lists AS (
    SELECT ol.id AS list_id, ol.name AS list_name, ol.status AS list_status,
           ol.lane AS list_lane, ol.sending_identity_id AS list_identity_id,
           ol.definition AS list_definition, ol.organization_id AS list_org_id,
           ol.created_by AS list_created_by, ol.paused_at AS list_paused_at,
           ol.pause_reason AS list_pause_reason
    FROM crm.outreach_list ol
    WHERE ol.deleted_at IS NULL
      AND ol.id IN (SELECT unnest(iam.accessible_entity_ids('crm_outreach_list'::text, 'viewer'::permission_level)))
      AND ((v_scope = 'mine' AND ol.created_by = v_uid)
        OR (v_scope IN ('orgs','team') AND ol.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
            -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
            AND (v_scope <> 'team' OR (ol.organization_id, ol.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))))
  ),
  reachable_parties AS (
    SELECT unnest(iam.accessible_entity_ids('party'::text, 'viewer'::permission_level)) AS pid
  ),

  -- ── 1. FRESH REPLIES ──────────────────────────────────────────────────────
  q_fresh AS (
    SELECT
      'fresh_replies'::text AS r_queue,
      r.id                  AS r_id,
      r.id                  AS r_interaction_id,
      r.member_id           AS r_member_id,
      r.party_id            AS r_party_id,
      r.party_name          AS r_party_name,
      r.employer_name       AS r_employer_name,
      r.outreach_list_id    AS r_list_id,
      r.outreach_list_name  AS r_list_name,
      r.outreach_list_status AS r_list_status,
      r.sending_identity_id AS r_identity_id,
      r.sending_identity_label AS r_identity_label,
      r.subject             AS r_subject,
      r.snippet             AS r_detail,
      coalesce(r.classification, 'unclassified') AS r_problem_code,
      coalesce(r.evidence, 'A real person replied and nobody has answered yet.') AS r_problem_message,
      'Read it and reply through the same governed send path.'::text AS r_problem_fix,
      r.step                AS r_step,
      r.occurred_at         AS r_occurred,
      r.organization_id     AS r_org_id
    FROM public.crm_inbox_list_scoped(v_scope, p_org_id, NULL, false, 'occurred', 'desc',
           jsonb_build_object('handled', jsonb_build_object('value', false)), 1000000, 0) r
    WHERE v_queue = 'fresh_replies'
  ),

  -- ── 2. DRAFTS AWAITING APPROVAL (IC-6) ────────────────────────────────────
  -- The sequence runner leaves a step `planned` whenever the earned-trust
  -- ladder says a human must approve it (D-W1-2). Surfacing those is a
  -- first-class Chasebox job — an unapproved draft is a stopped campaign.
  q_drafts AS (
    SELECT
      'pending_drafts'::text, i.id, i.id,
      nullif(i.attributes #>> '{outreach_single_send,member_id}', '')::uuid,
      i.party_id,
      pt.display_name,
      emp.display_name,
      i.outreach_list_id,
      ol.name, ol.status::text,
      ol.sending_identity_id,
      coalesce(nullif(si.from_name,''), si.from_address),
      coalesce(nullif(btrim(i.subject),''), '(no subject)'),
      left(coalesce(i.body,''), 400),
      'awaiting_approval'::text,
      'This message is written and waiting for a human to approve it.'::text,
      'Open it, read the exact rendered message, then approve and send.'::text,
      i.attempt_number::integer,
      coalesce(i.scheduled_at, i.created_at),
      i.organization_id
    FROM crm.interaction i
    LEFT JOIN crm.party pt          ON pt.id = i.party_id
    LEFT JOIN crm.party emp         ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.outreach_list ol  ON ol.id = i.outreach_list_id
    LEFT JOIN crm.sending_identity si ON si.id = ol.sending_identity_id
    WHERE v_queue = 'pending_drafts'
      AND i.deleted_at IS NULL
      AND i.direction = 'outbound'
      AND i.status = 'planned'
      AND i.attributes ? 'outreach_single_send'
      AND (i.party_id IN (SELECT rp.pid FROM reachable_parties rp)
           OR iam.has_access('crm_interaction'::text, i.id, 'viewer'::permission_level))
      AND ((v_scope = 'mine' AND (i.created_by = v_uid OR i.assigned_to = v_uid))
        OR (v_scope IN ('orgs','team') AND i.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
            -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
            AND (v_scope <> 'team' OR (i.organization_id, i.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))))
  ),

  -- ── 3. STALLED SEQUENCES ──────────────────────────────────────────────────
  -- Two ways a member stops moving: its own retry time passed and nothing
  -- happened, or the campaign/mailbox above it is paused. Both render the real
  -- pause_reason and a door to the thing that can resume it.
  q_stalled AS (
    SELECT
      'stalled_sequences'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      'Step ' || coalesce(m.current_step, 0)::text || ' · ' ||
        coalesce(m.attempt_count, 0)::text || ' attempt(s) · status ' || m.status,
      CASE
        WHEN rl.list_paused_at IS NOT NULL THEN 'campaign_paused'
        WHEN si.paused_at IS NOT NULL THEN 'mailbox_paused'
        ELSE 'overdue'
      END::text,
      CASE
        WHEN rl.list_paused_at IS NOT NULL
          THEN 'The campaign is paused' ||
               coalesce(' — ' || nullif(rl.list_pause_reason,''), '') || '.'
        WHEN si.paused_at IS NOT NULL
          THEN 'The sending mailbox is paused' ||
               coalesce(' — ' || nullif(si.pause_reason,''), '') || '.'
        ELSE 'This step was due ' || to_char(m.next_attempt_at, 'YYYY-MM-DD HH24:MI') ||
             ' and has not moved since.'
      END::text,
      CASE
        WHEN rl.list_paused_at IS NOT NULL THEN 'Open the campaign and resume it, or fix what paused it.'
        WHEN si.paused_at IS NOT NULL THEN 'Open the mailbox checklist and resume sending.'
        ELSE 'Open the campaign and advance or retire this member.'
      END::text,
      m.current_step::integer,
      m.next_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    WHERE v_queue = 'stalled_sequences'
      AND m.deleted_at IS NULL
      AND m.status NOT IN ('replied','not_interested','meeting_booked','suppressed','done','bounced')
      AND (
        (m.next_attempt_at IS NOT NULL AND m.next_attempt_at < now())
        OR rl.list_paused_at IS NOT NULL
        OR si.paused_at IS NOT NULL
      )
  ),

  -- ── 4. BLOCKED MEMBERS ────────────────────────────────────────────────────
  -- The send WOULD refuse. Cheap structural blocks are resolved in SQL; where a
  -- medium exists we ask crm.check_send_eligibility — THE ONE AUTHORITY — and
  -- render its own `fix`. Never a second copy of a compliance check.
  q_blocked AS (
    SELECT
      'blocked_members'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      coalesce(cm.display_value, 'No contact point attached'),
      blk.b_code, blk.b_message, blk.b_fix,
      m.current_step::integer,
      m.last_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    LEFT JOIN crm.party_contact_point cp ON cp.id = m.contact_point_id AND cp.deleted_at IS NULL
    LEFT JOIN crm.contact_medium cm ON cm.id = cp.medium_id AND cm.deleted_at IS NULL
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN m.contact_point_id IS NULL THEN 'recipient_not_in_list'
          WHEN cp.id IS NULL THEN 'contact_point_missing'
          WHEN pt.do_not_contact THEN 'party_do_not_contact'
          WHEN cp.opt_out_at IS NOT NULL THEN 'contact_point_opted_out'
          WHEN cm.id IS NULL THEN 'medium_missing'
          WHEN cm.is_contactable IS NOT TRUE THEN 'medium_not_contactable'
          ELSE nullif(v.v_first_block #>> '{code}', '')
        END AS b_code,
        CASE
          WHEN m.contact_point_id IS NULL
            THEN 'This member has no contact point, so eligibility always fails with recipient_not_in_list.'
          WHEN cp.id IS NULL THEN 'The attached contact point has been deleted.'
          WHEN pt.do_not_contact
            THEN 'This record is flagged do-not-contact. The send gate does not read that flag — the runner enforces it, so nothing will go out.'
          WHEN cp.opt_out_at IS NOT NULL THEN 'This person opted this address out.'
          WHEN cm.id IS NULL THEN 'The contact point points at a medium that no longer exists.'
          WHEN cm.is_contactable IS NOT TRUE
            THEN 'This address is suppressed, unsubscribed, complained, DNC-listed or hard-bounced.'
          ELSE coalesce(v.v_first_block #>> '{message}', 'The send gate refuses this recipient.')
        END AS b_message,
        CASE
          WHEN m.contact_point_id IS NULL
            THEN 'Open the record and attach the email address to use, then re-enroll.'
          WHEN cp.id IS NULL THEN 'Open the record and attach a live contact point.'
          WHEN pt.do_not_contact
            THEN 'Open the record — lift do-not-contact only if it was set by mistake.'
          WHEN cp.opt_out_at IS NOT NULL THEN 'An opt-out is not ours to lift. Remove this member from the campaign.'
          WHEN cm.id IS NULL THEN 'Open the record and re-add the address.'
          WHEN cm.is_contactable IS NOT TRUE
            THEN 'Open the record to see exactly what is on this value; a mistaken do-not-call is reversible, a legal opt-out is not.'
          ELSE coalesce(v.v_first_block #>> '{fix}', 'Open the sending checklist and resolve this item.')
        END AS b_fix
      FROM (
        SELECT CASE
          WHEN cm.id IS NULL OR cm.is_contactable IS NOT TRUE THEN NULL
          ELSE (crm.check_send_eligibility(cm.id, rl.list_id, rl.list_identity_id) -> 'blocks' -> 0)
        END AS v_first_block
      ) v
    ) blk
    WHERE v_queue = 'blocked_members'
      AND m.deleted_at IS NULL
      AND m.status NOT IN ('replied','not_interested','meeting_booked','done')
      AND blk.b_code IS NOT NULL
  ),

  -- ── 5. SECONDARY-CONTACT ESCALATION CANDIDATES ────────────────────────────
  -- The sequence finished and nobody replied. Rendered as a SUGGESTION only —
  -- research/03 is explicit that this never auto-sends.
  q_escalation AS (
    SELECT
      'escalation_candidates'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      coalesce(m.attempt_count, 0)::text || ' message(s) sent · last '
        || coalesce(to_char(m.last_attempt_at, 'YYYY-MM-DD'), 'unknown'),
      'no_reply_after_sequence'::text,
      'The whole sequence ran and this person never replied.'::text,
      'Consider a different person at the same company — review the record and enroll them deliberately. Nothing is sent automatically.'::text,
      m.current_step::integer,
      m.last_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    WHERE v_queue = 'escalation_candidates'
      AND m.deleted_at IS NULL
      AND m.status IN ('sent','delivered','opened','clicked','done')
      AND coalesce(m.attempt_count, 0) > 0
      -- Sequence exhausted: either the campaign itself is finished, or the
      -- member walked past the last step in definition.sequence.
      AND (rl.list_status = 'completed'
           OR (jsonb_typeof(rl.list_definition -> 'sequence') = 'array'
               AND coalesce(m.current_step, 0) >= jsonb_array_length(rl.list_definition -> 'sequence')))
      AND NOT EXISTS (
        SELECT 1 FROM crm.interaction ri
        WHERE ri.deleted_at IS NULL
          AND ri.direction = 'inbound'
          AND ri.party_id = m.party_id
          AND ri.outreach_list_id = m.outreach_list_id
      )
  ),

  merged AS (
    SELECT * FROM q_fresh
    UNION ALL SELECT * FROM q_drafts
    UNION ALL SELECT * FROM q_stalled
    UNION ALL SELECT * FROM q_blocked
    UNION ALL SELECT * FROM q_escalation
  ),
  counted AS (SELECT x.*, count(*) OVER () AS x_total FROM merged x)
  SELECT
    c.r_queue, c.r_id, c.r_interaction_id, c.r_member_id, c.r_party_id,
    c.r_party_name, c.r_employer_name, c.r_list_id, c.r_list_name, c.r_list_status,
    c.r_identity_id, c.r_identity_label, c.r_subject, c.r_detail,
    c.r_problem_code, c.r_problem_message, c.r_problem_fix, c.r_step,
    c.r_occurred, c.r_org_id, c.x_total
  FROM counted c
  -- Oldest pain first: the thing that has been stuck longest is the thing that
  -- most needs a human. Total order (ends in id) per the template.
  ORDER BY c.r_occurred ASC NULLS FIRST, c.r_id
  LIMIT greatest(coalesce(p_limit, 50), 1) OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

-- ── public.crm_inbox_list_scoped ──
CREATE OR REPLACE FUNCTION public.crm_inbox_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'occurred'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, occurred_at timestamp with time zone, created_at timestamp with time zone, channel_code text, subject text, snippet text, thread_key text, classification text, evidence text, handled boolean, handled_at timestamp with time zone, party_id uuid, party_name text, party_kind text, employer_id uuid, employer_name text, outreach_list_id uuid, outreach_list_name text, outreach_list_status text, member_id uuid, member_status text, step integer, outbound_id uuid, outbound_subject text, outbound_sent_at timestamp with time zone, sending_identity_id uuid, sending_identity_label text, reputation_case_id uuid, reputation_case_label text, reputation_case_site_id uuid, reputation_case_brand_id uuid, backlink_id uuid, backlink_label text, backlink_site_id uuid, backlink_brand_id uuid, organization_id uuid, organization_name text, is_owner boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_scope  text := lower(coalesce(p_scope, platform.entity_default_list_scope('crm_interaction')));
  v_dir    text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort   text := lower(coalesce(p_sort, 'occurred'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f      jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_inbox_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs') THEN
    RAISE EXCEPTION 'crm_inbox_list_scoped: unsupported scope % (this surface declares mine|orgs)', v_scope;
  END IF;
  IF v_sort NOT IN ('occurred','created','party_name','subject','snippet','classification',
                    'outreach_list_name','sending_identity_label','employer_name','step',
                    'handled','channel','organization_name','member_status','why') THEN
    v_sort := 'occurred';
  END IF;

  RETURN QUERY
  WITH reachable_parties AS (
    SELECT unnest(iam.accessible_entity_ids('party'::text, 'viewer'::permission_level)) AS party_id
  ),
  inbound AS (
    SELECT
      i.id                       AS u_id,
      coalesce(i.occurred_at, i.created_at) AS u_occurred,
      i.created_at               AS u_created,
      i.channel_code             AS u_channel,
      coalesce(nullif(btrim(i.subject), ''), '(no subject)') AS u_subject,
      left(coalesce(i.body, ''), 400) AS u_snippet,
      i.body                     AS u_body,
      i.thread_key               AS u_thread_key,
      public.crm_inbound_label(i.attributes)    AS u_classification,
      public.crm_inbound_evidence(i.attributes) AS u_evidence,
      (i.attributes #>> '{inbox,handled_at}')::timestamptz AS u_handled_at,
      i.party_id                 AS u_party_id,
      i.outreach_list_id         AS u_list_id,
      i.organization_id          AS u_org_id,
      i.created_by               AS u_created_by,
      i.assigned_to              AS u_assigned_to
    FROM crm.interaction i
    WHERE i.deleted_at IS NULL
      AND i.direction = 'inbound'
      -- THE RLS CEILING, RESTATED (crm.interaction std_select).
      AND (i.party_id IN (SELECT rp.party_id FROM reachable_parties rp)
           OR iam.has_access('crm_interaction'::text, i.id, 'viewer'::permission_level))
  ),
  scoped AS (
    -- MINE — the runner acts as the campaign owner (D-W1-3), so an ingested
    -- reply on my campaign carries created_by = me. Assignment counts too: a
    -- reply handed to me is mine to answer.
    SELECT b.*, true AS s_is_owner
    FROM inbound b
    WHERE v_scope = 'mine'
      AND (b.u_created_by = v_uid OR b.u_assigned_to = v_uid)
    UNION ALL
    SELECT b.*, (b.u_created_by = v_uid) AS s_is_owner
    FROM inbound b
    WHERE v_scope IN ('orgs','team')
      AND (p_org_id IS NULL OR b.u_org_id = p_org_id) AND b.u_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (b.u_org_id, b.u_created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
  ),
  -- The outbound step this reply answers: same Gmail thread, sent at or before
  -- the reply. D-W1-5 — correlation is by thread_key, never RFC822 Message-ID.
  contextual AS (
    SELECT
      s.*,
      ob.id           AS x_outbound_id,
      ob.subject      AS x_outbound_subject,
      coalesce(ob.occurred_at, ob.created_at) AS x_outbound_sent_at,
      ob.attempt_number::integer AS x_step,
      nullif(ob.attributes #>> '{outreach_single_send,reputation_case_id}', '')::uuid AS x_reputation_case_id,
      nullif(ob.attributes #>> '{outreach_single_send,backlink_id}', '')::uuid        AS x_backlink_id,
      nullif(ob.attributes #>> '{outreach_single_send,member_id}', '')::uuid          AS x_member_id
    FROM scoped s
    LEFT JOIN LATERAL (
      SELECT o.*
      FROM crm.interaction o
      WHERE o.deleted_at IS NULL
        AND o.direction = 'outbound'
        AND s.u_thread_key IS NOT NULL
        AND o.thread_key = s.u_thread_key
        AND coalesce(o.occurred_at, o.created_at) <= s.u_occurred
      ORDER BY coalesce(o.occurred_at, o.created_at) DESC, o.id
      LIMIT 1
    ) ob ON true
  ),
  joined AS (
    SELECT
      c.*,
      pt.display_name                AS j_party_name,
      pt.party_kind                  AS j_party_kind,
      pt.primary_employer_party_id   AS j_employer_id,
      emp.display_name               AS j_employer_name,
      ol.name                        AS j_list_name,
      ol.status                      AS j_list_status,
      ol.sending_identity_id         AS j_identity_id,
      coalesce(nullif(si.from_name, ''), si.from_address) AS j_identity_label,
      org.name                       AS j_org_name,
      mem.id                         AS j_member_id,
      mem.status                     AS j_member_status,
      coalesce(nullif(rc.headline,''), nullif(rc.source_title,''), rc.source_domain) AS j_case_label,
      rc.site_id                     AS j_case_site_id,
      rcs.brand_id                   AS j_case_brand_id,
      coalesce(nullif(bl.source_url,''), bl.source_domain) AS j_backlink_label,
      bl.site_id                     AS j_backlink_site_id,
      bls.brand_id                   AS j_backlink_brand_id,
      -- HANDLED. Two independent, honest signals; neither is a new table:
      --   (a) a human pressed "Mark handled" -> attributes.inbox.handled_at
      --   (b) we already answered -> a later outbound in the same thread
      -- (b) means replying through the ONE send primitive clears the row on its
      -- own, so the queue cannot rot behind a forgotten checkbox.
      (c.u_handled_at IS NOT NULL
       OR EXISTS (
            SELECT 1 FROM crm.interaction r
            WHERE r.deleted_at IS NULL
              AND r.direction = 'outbound'
              AND c.u_thread_key IS NOT NULL
              AND r.thread_key = c.u_thread_key
              AND coalesce(r.occurred_at, r.created_at) > c.u_occurred
          )) AS j_handled
    FROM contextual c
    LEFT JOIN crm.party pt              ON pt.id  = c.u_party_id
    LEFT JOIN crm.party emp             ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.outreach_list ol      ON ol.id  = c.u_list_id
    LEFT JOIN crm.sending_identity si   ON si.id  = ol.sending_identity_id
    LEFT JOIN iam.organizations org     ON org.id = c.u_org_id
    LEFT JOIN crm.outreach_list_member mem ON mem.id = c.x_member_id AND mem.deleted_at IS NULL
    LEFT JOIN seo.reputation_case rc    ON rc.id  = c.x_reputation_case_id
    LEFT JOIN web.site rcs              ON rcs.id = rc.site_id
    LEFT JOIN seo.backlink bl           ON bl.id  = c.x_backlink_id
    LEFT JOIN web.site bls              ON bls.id = bl.site_id
  ),
  filtered AS (
    SELECT j.*,
      (p_deep AND v_search IS NOT NULL AND coalesce(j.u_body,'') ILIKE '%'||v_search||'%') AS f_deep_hit
    FROM joined j
    WHERE (v_search IS NULL
        OR coalesce(j.j_party_name,'')   ILIKE '%'||v_search||'%'
        OR j.u_subject                   ILIKE '%'||v_search||'%'
        OR j.u_snippet                   ILIKE '%'||v_search||'%'
        OR coalesce(j.j_list_name,'')    ILIKE '%'||v_search||'%'
        OR coalesce(j.j_employer_name,'')ILIKE '%'||v_search||'%'
        OR (p_deep AND coalesce(j.u_body,'') ILIKE '%'||v_search||'%'))
      AND (NOT v_f ? 'party_name'  OR coalesce(j.j_party_name,'') ILIKE '%'||(v_f->'party_name'->>'value')||'%')
      AND (NOT v_f ? 'subject'     OR j.u_subject ILIKE '%'||(v_f->'subject'->>'value')||'%')
      AND (NOT v_f ? 'snippet'     OR j.u_snippet ILIKE '%'||(v_f->'snippet'->>'value')||'%')
      AND (NOT v_f ? 'employer_name' OR coalesce(j.j_employer_name,'') ILIKE '%'||(v_f->'employer_name'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.j_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- "Why we wrote" is a projection of the two motivating records; it filters
      -- and sorts like every other column rather than being the one exempt.
      AND (NOT v_f ? 'why'
           OR coalesce(j.j_case_label, j.j_backlink_label, '') ILIKE '%'||(v_f->'why'->>'value')||'%')
      AND (NOT v_f ? 'classification'
           OR coalesce(nullif(j.u_classification,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'classification'->'values')))
      AND (NOT v_f ? 'outreach_list_name'
           OR coalesce(nullif(j.j_list_name,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'outreach_list_name'->'values')))
      AND (NOT v_f ? 'sending_identity_label'
           OR coalesce(nullif(j.j_identity_label,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'sending_identity_label'->'values')))
      AND (NOT v_f ? 'member_status'
           OR coalesce(nullif(j.j_member_status,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'member_status'->'values')))
      AND (NOT v_f ? 'channel'
           OR j.u_channel IN (SELECT jsonb_array_elements_text(v_f->'channel'->'values')))
      AND (NOT v_f ? 'handled'
           OR j.j_handled IS NOT DISTINCT FROM (v_f->'handled'->>'value')::boolean)
      AND (NOT v_f ? 'step'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'step'->'values') b
                      WHERE public.crm_step_matches(j.x_step, b)))
      AND (NOT v_f ? 'occurred' OR j.u_occurred >= public.agx_since_bucket(v_f->'occurred'->'values'->>0))
      AND (NOT v_f ? 'created'  OR j.u_created  >= public.agx_since_bucket(v_f->'created'->'values'->>0))
  ),
  scored AS (
    -- Only a real page pays for per-row plpgsql scoring; the counts/facets
    -- callers come through with LIMIT 1 (same guard as trx_list_scoped).
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.crm_inbox_search_score(
        v_search, f.u_id, f.j_party_name, f.u_subject, f.u_snippet,
        f.j_list_name, f.j_employer_name, f.u_classification, f.f_deep_hit)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT
    c.u_id, c.u_occurred, c.u_created, c.u_channel, c.u_subject, c.u_snippet,
    c.u_thread_key, c.u_classification, c.u_evidence, c.j_handled, c.u_handled_at,
    c.u_party_id, c.j_party_name, c.j_party_kind::text, c.j_employer_id, c.j_employer_name,
    c.u_list_id, c.j_list_name, c.j_list_status::text,
    c.j_member_id, c.j_member_status::text, c.x_step,
    c.x_outbound_id, c.x_outbound_subject, c.x_outbound_sent_at,
    c.j_identity_id, c.j_identity_label,
    c.x_reputation_case_id, c.j_case_label, c.j_case_site_id, c.j_case_brand_id,
    c.x_backlink_id, c.j_backlink_label, c.j_backlink_site_id, c.j_backlink_brand_id,
    c.u_org_id, c.j_org_name, c.s_is_owner, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST while searching (lib/entity-list/FEATURE.md rule 4).
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='occurred'   AND v_dir='desc' THEN c.u_occurred END DESC,
    CASE WHEN v_sort='occurred'   AND v_dir='asc'  THEN c.u_occurred END ASC,
    CASE WHEN v_sort='created'    AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created'    AND v_dir='asc'  THEN c.u_created END ASC,
    CASE WHEN v_sort='party_name' AND v_dir='desc' THEN lower(coalesce(c.j_party_name,'')) END DESC,
    CASE WHEN v_sort='party_name' AND v_dir='asc'  THEN lower(coalesce(c.j_party_name,'')) END ASC,
    CASE WHEN v_sort='subject'    AND v_dir='desc' THEN lower(c.u_subject) END DESC,
    CASE WHEN v_sort='subject'    AND v_dir='asc'  THEN lower(c.u_subject) END ASC,
    CASE WHEN v_sort='snippet'    AND v_dir='desc' THEN lower(c.u_snippet) END DESC,
    CASE WHEN v_sort='snippet'    AND v_dir='asc'  THEN lower(c.u_snippet) END ASC,
    CASE WHEN v_sort='classification' AND v_dir='desc' THEN lower(coalesce(c.u_classification,'')) END DESC,
    CASE WHEN v_sort='classification' AND v_dir='asc'  THEN lower(coalesce(c.u_classification,'')) END ASC,
    CASE WHEN v_sort='outreach_list_name' AND v_dir='desc' THEN lower(coalesce(c.j_list_name,'')) END DESC,
    CASE WHEN v_sort='outreach_list_name' AND v_dir='asc'  THEN lower(coalesce(c.j_list_name,'')) END ASC,
    CASE WHEN v_sort='sending_identity_label' AND v_dir='desc' THEN lower(coalesce(c.j_identity_label,'')) END DESC,
    CASE WHEN v_sort='sending_identity_label' AND v_dir='asc'  THEN lower(coalesce(c.j_identity_label,'')) END ASC,
    CASE WHEN v_sort='employer_name' AND v_dir='desc' THEN lower(coalesce(c.j_employer_name,'')) END DESC,
    CASE WHEN v_sort='employer_name' AND v_dir='asc'  THEN lower(coalesce(c.j_employer_name,'')) END ASC,
    CASE WHEN v_sort='member_status' AND v_dir='desc' THEN lower(coalesce(c.j_member_status,'')) END DESC,
    CASE WHEN v_sort='member_status' AND v_dir='asc'  THEN lower(coalesce(c.j_member_status,'')) END ASC,
    CASE WHEN v_sort='channel'  AND v_dir='desc' THEN c.u_channel END DESC,
    CASE WHEN v_sort='channel'  AND v_dir='asc'  THEN c.u_channel END ASC,
    CASE WHEN v_sort='step'     AND v_dir='desc' THEN c.x_step END DESC NULLS LAST,
    CASE WHEN v_sort='step'     AND v_dir='asc'  THEN c.x_step END ASC NULLS LAST,
    CASE WHEN v_sort='handled'  AND v_dir='desc' THEN c.j_handled END DESC,
    CASE WHEN v_sort='handled'  AND v_dir='asc'  THEN c.j_handled END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.j_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc'  THEN lower(coalesce(c.j_org_name,'')) END ASC,
    CASE WHEN v_sort='why' AND v_dir='desc' THEN lower(coalesce(c.j_case_label, c.j_backlink_label,'')) END DESC,
    CASE WHEN v_sort='why' AND v_dir='asc'  THEN lower(coalesce(c.j_case_label, c.j_backlink_label,'')) END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

-- ── public.cvx_list_scoped ──
CREATE OR REPLACE FUNCTION public.cvx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'last_activity'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, conversation_type text, origin_class text, source_app text, source_feature text, status text, message_count integer, is_favorite boolean, is_archived boolean, visibility text, provider text, provider_session_id text, workspace_name text, provider_account text, title_source text, category text, fidelity text, binding_status text, binding_origin text, binding_last_seen_at timestamp with time zone, organization_id uuid, organization_name text, owner_email text, created_by uuid, initial_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, last_activity_at timestamp with time zone, is_owner boolean, access_level text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('conversation')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'last_activity'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- ONE rule for "is this search deep" (public.cvx_search_is_deep), shared
  -- with cvx_list_scope_counts. A caller that already ran the probe hands the
  -- hit set in as p_filters->'__deep_hits' and is deep by definition. The
  -- pass itself is the definer probe public.cvx_deep_hits — under this
  -- function's invoker policy the trigram index cannot be used (ILIKE is not
  -- leakproof) and the page timed out.
  v_deep boolean := public.cvx_search_is_deep(v_search, p_deep)
    OR (coalesce(p_filters, '{}'::jsonb) ? '__deep_hits');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'cvx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared') THEN
    RAISE EXCEPTION 'cvx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('last_activity','updated','created','title','conversation_type',
                    'origin_class','source_app','source_feature','message_count',
                    'provider','workspace_name','provider_account','title_source',
                    'category','fidelity','binding_status','binding_last_seen_at',
                    'organization_name','owner_email','visibility','favorite',
                    'archived') THEN
    v_sort := 'last_activity';
  END IF;

  RETURN QUERY
  WITH deep_hits AS (
    -- ONE indexed pass over message bodies, hashed once, probed per row.
    -- A caller that ran the probe already (cvx_list_scope_counts, fifteen
    -- calls per request) hands the set in as p_filters->'__deep_hits';
    -- otherwise the definer probe runs here. Never a correlated EXISTS: that
    -- is a scan per conversation, twice.
    SELECT (x)::uuid AS conversation_id
    FROM jsonb_array_elements_text(v_f->'__deep_hits') AS x
    WHERE v_f ? '__deep_hits'
    UNION ALL
    SELECT h AS conversation_id
    FROM public.cvx_deep_hits(v_search) AS h
    WHERE NOT (v_f ? '__deep_hits') AND v_deep AND v_search IS NOT NULL
  ),
  scoped AS (
    SELECT c.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM chat.conversation c
    WHERE v_scope='mine' AND c.created_by = v_uid
    UNION ALL
    SELECT c.*, (c.created_by = v_uid), CASE WHEN c.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM chat.conversation c
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR c.organization_id = p_org_id) AND c.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (c.organization_id, c.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT c.*, false, perm.permission_level::text FROM chat.conversation c
    JOIN iam.permissions perm ON perm.resource_type='conversation' AND perm.resource_id=c.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND c.created_by IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (c.id) c.*, false, perm.permission_level::text FROM chat.conversation c
    JOIN iam.permissions perm ON perm.resource_type='conversation' AND perm.resource_id=c.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope='shared' AND c.created_by IS DISTINCT FROM v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='conversation'
        AND p2.resource_id=c.id AND p2.granted_to_user_id=v_uid)
  ),
  joined AS (
    SELECT
      s.*,
      o.name AS s_org_name,
      u.email::text AS s_owner_email,
      cs.provider AS s_provider,
      cs.provider_session_id AS s_provider_session_id,
      cs.metadata->>'workspace_name' AS s_workspace_name,
      public.cvx_provider_account_display(cs.metadata) AS s_provider_account,
      cs.metadata->>'title_source' AS s_title_source,
      coalesce(
        s.metadata->'coding_session_bridge'->>'category',
        cs.metadata->>'provider_category'
      ) AS s_category,
      cs.fidelity AS s_fidelity,
      cs.status AS s_binding_status,
      cs.origin AS s_binding_origin,
      cs.last_seen_at AS s_binding_last_seen_at,
      coalesce(ues.is_favorite, false) AS s_is_favorite,
      public.cvx_audience(cs.provider, s.source_app, s.source_feature, s.origin_class, s.conversation_type)
        AS s_audience
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
    LEFT JOIN platform.user_entity_state ues
      ON ues.user_id = v_uid
     AND ues.entity_type = 'conversation'
     AND ues.entity_id = s.id
    LEFT JOIN LATERAL (
      SELECT b.provider, b.provider_session_id, b.metadata, b.fidelity,
             b.status, b.origin, b.last_seen_at
      FROM chat.coding_session b
      WHERE b.conversation_id = s.id AND b.deleted_at IS NULL
      ORDER BY b.last_seen_at DESC NULLS LAST, b.created_at DESC, b.id
      LIMIT 1
    ) cs ON true
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.deleted_at IS NULL
      AND j.is_ephemeral IS NOT TRUE
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.status = 'archived'
             WHEN 'all' THEN true
             ELSE j.status IS DISTINCT FROM 'archived' END)
      -- THE SEARCH FILTER ADMITS EVERY FIELD cvx_search_score RANKS. A field
      -- the scorer ranks but the filter drops scores 100000 and returns
      -- nothing — that is how a pasted conversation id found no row until
      -- 2026-09-18. Keep this list and the scorer's in lockstep.
      AND (v_search IS NULL
        OR coalesce(j.title,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.description,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.s_workspace_name,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.source_feature,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.source_app,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.s_provider_account,'') ILIKE '%'||v_search||'%'
        OR j.id::text ILIKE '%'||v_search||'%'
        -- EVERY live binding, not only the newest: a resumed Claude Code
        -- session carries several provider ids and each is a name someone
        -- was handed.
        OR EXISTS (
              SELECT 1 FROM chat.coding_session b
              WHERE b.conversation_id = j.id AND b.deleted_at IS NULL
                AND coalesce(b.provider_session_id,'') ILIKE '%'||v_search||'%')
        OR j.id IN (SELECT dh.conversation_id FROM deep_hits dh))
      AND (NOT v_f ? 'audience'
           OR j.s_audience IN (SELECT jsonb_array_elements_text(v_f->'audience'->'values')))
      AND (NOT v_f ? 'title' OR coalesce(j.title,'') ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'provider_session_id'
           OR coalesce(j.s_provider_session_id,'') ILIKE '%'||(v_f->'provider_session_id'->>'value')||'%')
      AND (NOT v_f ? 'organization_name'
           OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'conversation_type'
           OR j.conversation_type IN (SELECT jsonb_array_elements_text(v_f->'conversation_type'->'values')))
      AND (NOT v_f ? 'origin_class'
           OR j.origin_class IN (SELECT jsonb_array_elements_text(v_f->'origin_class'->'values')))
      AND (NOT v_f ? 'source_app'
           OR coalesce(nullif(j.source_app,''),'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'source_app'->'values')))
      AND (NOT v_f ? 'source_feature'
           OR coalesce(nullif(j.source_feature,''),'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'source_feature'->'values')))
      AND (NOT v_f ? 'provider'
           OR coalesce(j.s_provider,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'provider'->'values')))
      AND (NOT v_f ? 'workspace_name'
           OR coalesce(j.s_workspace_name,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'workspace_name'->'values')))
      AND (NOT v_f ? 'provider_account'
           OR coalesce(j.s_provider_account,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'provider_account'->'values')))
      AND (NOT v_f ? 'title_source'
           OR coalesce(j.s_title_source,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'title_source'->'values')))
      AND (NOT v_f ? 'category'
           OR coalesce(j.s_category,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'fidelity'
           OR coalesce(j.s_fidelity,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'fidelity'->'values')))
      AND (NOT v_f ? 'binding_status'
           OR coalesce(j.s_binding_status,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'binding_status'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'owner_email'
           OR coalesce(nullif(j.s_owner_email,''),'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'owner_email'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'message_count'
           OR public.cvx_size_band(j.message_count)
              IN (SELECT jsonb_array_elements_text(v_f->'message_count'->'values')))
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'binding_last_seen_at'
           OR j.s_binding_last_seen_at >= public.agx_since_bucket(v_f->'binding_last_seen_at'->'values'->>0))
      AND (NOT v_f ? 'favorite'
           OR coalesce(j.s_is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR (j.status = 'archived') IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  activity AS (
    SELECT
      f.*,
      greatest(
        coalesce(lm.last_at, f.created_at),
        coalesce(f.s_binding_last_seen_at, f.created_at),
        f.created_at
      ) AS s_last_activity
    FROM filtered f
    LEFT JOIN LATERAL (
      SELECT m.created_at AS last_at
      FROM chat.message m
      WHERE m.conversation_id = f.id
        AND m.deleted_at IS NULL
        AND m.is_visible_to_user = true
      ORDER BY m.created_at DESC
      LIMIT 1
    ) lm ON true
  ),
  activity_filtered AS (
    SELECT a.* FROM activity a
    WHERE (NOT v_f ? 'last_activity'
           OR a.s_last_activity >= public.agx_since_bucket(v_f->'last_activity'->'values'->>0))
  ),
  scored AS (
    SELECT f.*, public.cvx_search_score(
      v_search, f.id, f.title, f.description, f.s_workspace_name,
      f.source_feature, f.source_app, f.s_provider_account,
      f.s_provider_session_id,
      (f.id IN (SELECT dh.conversation_id FROM deep_hits dh))
    ) AS s_score
    FROM activity_filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT
    c.id, c.title, c.conversation_type, c.origin_class, c.source_app,
    c.source_feature, c.status, c.message_count, c.s_is_favorite,
    (c.status = 'archived'), c.visibility::text,
    c.s_provider, c.s_provider_session_id, c.s_workspace_name,
    c.s_provider_account, c.s_title_source, c.s_category, c.s_fidelity,
    c.s_binding_status, c.s_binding_origin, c.s_binding_last_seen_at,
    c.organization_id, c.s_org_name, c.s_owner_email, c.created_by,
    c.initial_agent_id, c.created_at, c.updated_at, c.s_last_activity,
    c.s_is_owner, c.s_access, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN p_favorites_first THEN c.s_is_favorite END DESC NULLS LAST,
    CASE WHEN v_sort='last_activity' AND v_dir='desc' THEN c.s_last_activity END DESC,
    CASE WHEN v_sort='last_activity' AND v_dir='asc' THEN c.s_last_activity END ASC,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(coalesce(c.title,'')) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(coalesce(c.title,'')) END ASC,
    CASE WHEN v_sort='conversation_type' AND v_dir='desc' THEN c.conversation_type END DESC,
    CASE WHEN v_sort='conversation_type' AND v_dir='asc' THEN c.conversation_type END ASC,
    CASE WHEN v_sort='origin_class' AND v_dir='desc' THEN c.origin_class END DESC,
    CASE WHEN v_sort='origin_class' AND v_dir='asc' THEN c.origin_class END ASC,
    CASE WHEN v_sort='source_app' AND v_dir='desc' THEN lower(coalesce(c.source_app,'')) END DESC,
    CASE WHEN v_sort='source_app' AND v_dir='asc' THEN lower(coalesce(c.source_app,'')) END ASC,
    CASE WHEN v_sort='source_feature' AND v_dir='desc' THEN lower(coalesce(c.source_feature,'')) END DESC,
    CASE WHEN v_sort='source_feature' AND v_dir='asc' THEN lower(coalesce(c.source_feature,'')) END ASC,
    CASE WHEN v_sort='message_count' AND v_dir='desc' THEN c.message_count END DESC,
    CASE WHEN v_sort='message_count' AND v_dir='asc' THEN c.message_count END ASC,
    CASE WHEN v_sort='provider' AND v_dir='desc' THEN lower(coalesce(c.s_provider,'')) END DESC,
    CASE WHEN v_sort='provider' AND v_dir='asc' THEN lower(coalesce(c.s_provider,'')) END ASC,
    CASE WHEN v_sort='workspace_name' AND v_dir='desc' THEN lower(coalesce(c.s_workspace_name,'')) END DESC,
    CASE WHEN v_sort='workspace_name' AND v_dir='asc' THEN lower(coalesce(c.s_workspace_name,'')) END ASC,
    CASE WHEN v_sort='provider_account' AND v_dir='desc' THEN lower(coalesce(c.s_provider_account,'')) END DESC,
    CASE WHEN v_sort='provider_account' AND v_dir='asc' THEN lower(coalesce(c.s_provider_account,'')) END ASC,
    CASE WHEN v_sort='title_source' AND v_dir='desc' THEN lower(coalesce(c.s_title_source,'')) END DESC,
    CASE WHEN v_sort='title_source' AND v_dir='asc' THEN lower(coalesce(c.s_title_source,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.s_category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.s_category,'')) END ASC,
    CASE WHEN v_sort='fidelity' AND v_dir='desc' THEN lower(coalesce(c.s_fidelity,'')) END DESC,
    CASE WHEN v_sort='fidelity' AND v_dir='asc' THEN lower(coalesce(c.s_fidelity,'')) END ASC,
    CASE WHEN v_sort='binding_status' AND v_dir='desc' THEN lower(coalesce(c.s_binding_status,'')) END DESC,
    CASE WHEN v_sort='binding_status' AND v_dir='asc' THEN lower(coalesce(c.s_binding_status,'')) END ASC,
    CASE WHEN v_sort='binding_last_seen_at' AND v_dir='desc' THEN c.s_binding_last_seen_at END DESC NULLS LAST,
    CASE WHEN v_sort='binding_last_seen_at' AND v_dir='asc' THEN c.s_binding_last_seen_at END ASC NULLS LAST,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.s_is_favorite END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN c.s_is_favorite END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN (c.status='archived') END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN (c.status='archived') END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

-- ── public.ivw_list_scoped ──
CREATE OR REPLACE FUNCTION public.ivw_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, vision_statement text, stage text, current_round integer, open_questions bigint, visibility text, user_id uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('interview_session')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ivw_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public') THEN
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
      s.updated_at AS u_updated
    FROM interview.session s
    WHERE s.deleted_at IS NULL
  ),
  scoped AS (
    SELECT u.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM unified u WHERE v_scope='mine' AND u.u_user_id = v_uid
    UNION ALL
    SELECT u.*, (u.u_user_id = v_uid), CASE WHEN u.u_user_id = v_uid THEN 'owner' ELSE 'org' END::text FROM unified u
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (u.u_org_id, u.u_user_id) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = 'interview_session'
      AND perm.resource_id = u.u_id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (u.u_id) u.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM unified u
      JOIN iam.permissions perm
        ON perm.resource_type = 'interview_session'
        AND perm.resource_id = u.u_id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
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
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
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

-- ── public.mkt_initiative_list_scoped ──
CREATE OR REPLACE FUNCTION public.mkt_initiative_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, brand_id uuid, brand_name text, status text, objective text, goal text, starts_on date, ends_on date, budget_amount numeric, budget_currency text, organization_id uuid, created_by uuid, visibility text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_scope text:=lower(coalesce(p_scope, platform.entity_default_list_scope('marketing_initiative')));
  v_sort text:=lower(coalesce(p_sort,'updated_at')); v_f jsonb:=coalesce(p_filters,'{}');
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
begin
  if v_uid is null then raise exception 'mkt_initiative_list_scoped: not authenticated'; end if;
  if v_scope not in ('mine','team','orgs','shared','public') then raise exception 'unknown scope %',v_scope; end if;
  if v_sort not in ('name','description','brand_name','status','objective','goal','starts_on','ends_on','budget_amount','budget_currency','created_at','updated_at') then v_sort:='updated_at'; end if;
  return query with scoped as (
    select i.* from marketing.initiative i where v_scope='mine' and i.created_by=v_uid
    union select i.* from marketing.initiative i where v_scope IN ('orgs','team')
      and (p_org_id is null or i.organization_id = p_org_id) and i.organization_id in (select iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (i.organization_id, i.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    union select i.* from marketing.initiative i join iam.permissions p on p.resource_type='marketing_initiative' and p.resource_id=i.id
      where v_scope='shared' and i.created_by is distinct from v_uid and (p.granted_to_user_id=v_uid or p.granted_to_organization_id in (
        select om.organization_id from iam.organization_member om where om.user_id=v_uid
      ))
    union select i.* from marketing.initiative i where v_scope='public' and i.created_by is distinct from v_uid and i.visibility='public'
  ), joined as (select s.*,b.name b_name from scoped s left join web.brand b on b.id=s.brand_id where s.deleted_at is null),
  filtered as (select j.*,public.mkt_initiative_search_score(v_search,j.id,j.name,j.description,j.goal,j.b_name) score
    from joined j where (v_search is null or public.mkt_initiative_search_score(v_search,j.id,j.name,j.description,j.goal,j.b_name)>0)
    and (not v_f?'name' or j.name ilike '%'||(v_f->'name'->>'value')||'%')
    and (not v_f?'description' or coalesce(j.description,'') ilike '%'||(v_f->'description'->>'value')||'%')
    and (not v_f?'brand_name' or coalesce(j.b_name,'') in (select jsonb_array_elements_text(v_f->'brand_name'->'values')))
    and (not v_f?'status' or j.status in (select jsonb_array_elements_text(v_f->'status'->'values')))
    and (not v_f?'objective' or j.objective in (select jsonb_array_elements_text(v_f->'objective'->'values')))
    and (not v_f?'goal' or coalesce(j.goal,'') ilike '%'||(v_f->'goal'->>'value')||'%')
    and (not v_f?'budget_currency' or j.budget_currency in (select jsonb_array_elements_text(v_f->'budget_currency'->'values')))
    and (not v_f?'starts_on' or j.starts_on>=public.mkt_initiative_since_bucket(v_f->'starts_on'->'values'->>0)::date)
    and (not v_f?'ends_on' or j.ends_on>=public.mkt_initiative_since_bucket(v_f->'ends_on'->'values'->>0)::date)
    and (not v_f?'created_at' or j.created_at>=public.mkt_initiative_since_bucket(v_f->'created_at'->'values'->>0))
    and (not v_f?'updated_at' or j.updated_at>=public.mkt_initiative_since_bucket(v_f->'updated_at'->'values'->>0))
    and (not v_f?'budget_amount' or case v_f->'budget_amount'->'values'->>0 when 'none' then j.budget_amount is null when 'lt1k' then j.budget_amount<1000 when '1k-10k' then j.budget_amount>=1000 and j.budget_amount<10000 when '10k+' then j.budget_amount>=10000 else true end)
  ), counted as (select f.*,count(*) over() n from filtered f)
  select c.id,c.name,c.description,c.brand_id,c.b_name,c.status,c.objective,c.goal,c.starts_on,c.ends_on,c.budget_amount,c.budget_currency,c.organization_id,c.created_by,c.visibility::text,c.version,c.created_at,c.updated_at,c.n
  from counted c order by
    case when v_search is not null then c.score end desc,
    case when v_sort='name' and lower(p_dir)='asc' then c.name end asc, case when v_sort='name' and lower(p_dir)<>'asc' then c.name end desc,
    case when v_sort='description' and lower(p_dir)='asc' then c.description end asc, case when v_sort='description' and lower(p_dir)<>'asc' then c.description end desc,
    case when v_sort='brand_name' and lower(p_dir)='asc' then c.b_name end asc, case when v_sort='brand_name' and lower(p_dir)<>'asc' then c.b_name end desc,
    case when v_sort='status' and lower(p_dir)='asc' then c.status end asc, case when v_sort='status' and lower(p_dir)<>'asc' then c.status end desc,
    case when v_sort='objective' and lower(p_dir)='asc' then c.objective end asc, case when v_sort='objective' and lower(p_dir)<>'asc' then c.objective end desc,
    case when v_sort='goal' and lower(p_dir)='asc' then c.goal end asc, case when v_sort='goal' and lower(p_dir)<>'asc' then c.goal end desc,
    case when v_sort='starts_on' and lower(p_dir)='asc' then c.starts_on end asc, case when v_sort='starts_on' and lower(p_dir)<>'asc' then c.starts_on end desc,
    case when v_sort='ends_on' and lower(p_dir)='asc' then c.ends_on end asc, case when v_sort='ends_on' and lower(p_dir)<>'asc' then c.ends_on end desc,
    case when v_sort='budget_amount' and lower(p_dir)='asc' then c.budget_amount end asc, case when v_sort='budget_amount' and lower(p_dir)<>'asc' then c.budget_amount end desc,
    case when v_sort='budget_currency' and lower(p_dir)='asc' then c.budget_currency end asc, case when v_sort='budget_currency' and lower(p_dir)<>'asc' then c.budget_currency end desc,
    case when v_sort='created_at' and lower(p_dir)='asc' then c.created_at end asc, case when v_sort='created_at' and lower(p_dir)<>'asc' then c.created_at end desc,
    case when v_sort='updated_at' and lower(p_dir)='asc' then c.updated_at end asc, case when v_sort='updated_at' and lower(p_dir)<>'asc' then c.updated_at end desc,c.id
  limit greatest(1,least(p_limit,200)) offset greatest(p_offset,0);
end $function$;

-- ── public.rsx_list_scoped ──
CREATE OR REPLACE FUNCTION public.rsx_list_scoped(p_scope text DEFAULT 'orgs'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'updated_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, name text, description text, status text, autonomy_level text, organization_id uuid, organization_name text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, template_id uuid, project_id uuid, project_name text, archived_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'orgs'));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated_at'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_arch text := lower(coalesce(p_archived, 'active'));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'rsx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs') THEN
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
  scoped AS (
    SELECT t.* FROM research.rs_topic t
    WHERE (CASE v_arch WHEN 'archived' THEN t.deleted_at IS NOT NULL
                       WHEN 'all' THEN true
                       ELSE t.deleted_at IS NULL END)
      AND ((v_scope = 'mine' AND t.created_by = v_uid)
        OR (v_scope IN ('orgs','team') AND t.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
            -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
            AND (v_scope <> 'team' OR (t.organization_id, t.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))))
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
    LEFT JOIN workspace.projects p ON p.id = pl.s_project_id
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

-- ── public.seo_rank_target_list_scoped ──
CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'created_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(target_id uuid, site_id uuid, site_name text, site_domain text, brand_id uuid, keyword_id uuid, keyword text, engine text, device text, search_type text, tracking_label text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, organization_id uuid, organization_name text, owner_email text, is_owner boolean, access_level text, latest_position integer, previous_position integer, movement integer, best_position integer, last_checked_at timestamp with time zone, history_observed_at timestamp with time zone[], history_organic_rank integer[], total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('seo_rank_target')));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'created_at'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'team','orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'keyword', 'site_name', 'tracking_label', 'device', 'latest_position',
    'movement', 'best_position', 'last_checked_at', 'is_active', 'created_at'
  ) THEN
    v_sort := 'created_at';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id AS b_target_id,
      coalesce(t.site_id, target_page.site_id) AS b_site_id,
      s.name AS b_site_name,
      s.domain AS b_site_domain,
      s.brand_id AS b_brand_id,
      s.visibility AS b_site_visibility,
      CASE
        WHEN s.id IS NOT NULL
        THEN iam.has_access('web_site', s.id, 'viewer')
        ELSE false
      END AS b_site_accessible,
      t.target_page_id AS b_target_page_id,
      t.keyword_id AS b_keyword_id,
      k.phrase AS b_keyword,
      t.engine AS b_engine,
      t.device AS b_device,
      t.search_type AS b_search_type,
      public.seo_rank_tracking_label(t.engine, t.search_type) AS b_tracking_label,
      t.is_active AS b_is_active,
      t.created_at AS b_created_at,
      t.updated_at AS b_updated_at,
      t.created_by AS b_created_by,
      t.organization_id AS b_org_id,
      o.name AS b_org_name,
      au.email::text AS b_owner_email
    FROM seo.rank_target t
    JOIN seo.keyword k ON k.id = t.keyword_id AND k.deleted_at IS NULL
    LEFT JOIN web.page target_page
      ON target_page.id = t.target_page_id AND target_page.deleted_at IS NULL
    LEFT JOIN web.site s
      ON s.id = coalesce(t.site_id, target_page.site_id) AND s.deleted_at IS NULL
    LEFT JOIN iam.organizations o ON o.id = t.organization_id
    LEFT JOIN platform.visible_user_identity au ON au.id = t.created_by
    WHERE t.deleted_at IS NULL
  ),
  scoped AS (
    SELECT b.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM base b
    WHERE v_scope = 'mine' AND b.b_created_by = v_uid

    UNION ALL

    SELECT b.*, (b.b_created_by = v_uid), CASE WHEN b.b_created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM base b
    WHERE v_scope IN ('orgs','team')
      AND (p_org_id IS NULL OR b.b_org_id = p_org_id) AND b.b_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (b.b_org_id, b.b_created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))

    UNION ALL

    SELECT b.*, false, 'shared'::text
    FROM base b
    WHERE v_scope = 'shared'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND (
        public.has_permission('seo_rank_target', b.b_target_id, 'viewer')
        OR (b.b_target_page_id IS NOT NULL AND public.has_permission('web_page', b.b_target_page_id, 'viewer'
        ))
        OR (b.b_site_id IS NOT NULL AND public.has_permission('web_site', b.b_site_id, 'viewer'
        ))
        OR (b.b_brand_id IS NOT NULL AND public.has_permission('web_brand', b.b_brand_id, 'viewer'
        ))
      )

    UNION ALL

    SELECT b.*, false, 'public'::text
    FROM base b
    WHERE v_scope = 'public'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND b.b_site_visibility = 'public'::platform.visibility
  ),
  enriched AS (
    SELECT
      s.*,
      obs.latest_position AS e_latest_position,
      obs.previous_position AS e_previous_position,
      CASE
        WHEN obs.latest_position IS NOT NULL AND obs.previous_position IS NOT NULL
        THEN obs.previous_position - obs.latest_position
      END AS e_movement,
      obs.best_position AS e_best_position,
      obs.last_checked_at AS e_last_checked_at
    FROM scoped s
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC)
          FILTER (WHERE ro.organic_rank IS NOT NULL))[1] AS latest_position,
        (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC)
          FILTER (WHERE ro.organic_rank IS NOT NULL))[2] AS previous_position,
        min(ro.organic_rank) FILTER (WHERE ro.organic_rank IS NOT NULL) AS best_position,
        max(ro.observed_at) AS last_checked_at
      FROM seo.rank_observation ro
      WHERE ro.rank_target_id = s.b_target_id
        AND ro.observed_at >= now() - interval '90 days'
    ) obs ON true
  ),
  filtered AS (
    SELECT e.*
    FROM enriched e
    WHERE (
      v_search IS NULL
      OR e.b_keyword ILIKE '%' || v_search || '%'
      OR coalesce(e.b_site_name, '') ILIKE '%' || v_search || '%'
      OR coalesce(e.b_site_domain, '') ILIKE '%' || v_search || '%'
      OR e.b_tracking_label ILIKE '%' || v_search || '%'
    )
      AND (NOT v_f ? 'keyword'
        OR e.b_keyword ILIKE '%' || (v_f->'keyword'->>'value') || '%')
      AND (NOT v_f ? 'site_name'
        OR coalesce(e.b_site_name, '') ILIKE '%' || (v_f->'site_name'->>'value') || '%'
        OR coalesce(e.b_site_domain, '') ILIKE '%' || (v_f->'site_name'->>'value') || '%')
      AND (NOT v_f ? 'tracking_label' OR e.b_tracking_label IN (
        SELECT jsonb_array_elements_text(v_f->'tracking_label'->'values')
      ))
      AND (NOT v_f ? 'device' OR e.b_device IN (
        SELECT jsonb_array_elements_text(v_f->'device'->'values')
      ))
      AND (NOT v_f ? 'latest_position' OR public.seo_rank_position_bucket(e.e_latest_position) IN (
        SELECT jsonb_array_elements_text(v_f->'latest_position'->'values')
      ))
      AND (NOT v_f ? 'movement' OR CASE
        WHEN e.e_movement IS NULL THEN 'unknown'
        WHEN e.e_movement > 0 THEN 'improved'
        WHEN e.e_movement < 0 THEN 'declined'
        ELSE 'unchanged'
      END IN (SELECT jsonb_array_elements_text(v_f->'movement'->'values')))
      AND (NOT v_f ? 'best_position' OR public.seo_rank_position_bucket(e.e_best_position) IN (
        SELECT jsonb_array_elements_text(v_f->'best_position'->'values')
      ))
      AND (NOT v_f ? 'last_checked_at' OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_f->'last_checked_at'->'values') bucket
        WHERE CASE bucket
          WHEN 'never' THEN e.e_last_checked_at IS NULL
          ELSE e.e_last_checked_at >= public.agx_since_bucket(bucket)
        END
      ))
      AND (NOT v_f ? 'is_active'
        OR e.b_is_active IS NOT DISTINCT FROM (v_f->'is_active'->>'value')::boolean)
      AND (NOT v_f ? 'created_at' OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_f->'created_at'->'values') bucket
        WHERE e.b_created_at >= public.agx_since_bucket(bucket)
      ))
  ),
  scored AS (
    SELECT f.*, CASE
      WHEN v_search IS NULL THEN 0
      WHEN lower(f.b_keyword) = lower(v_search) THEN 10000
      WHEN lower(f.b_keyword) LIKE lower(v_search) || '%' THEN 5000
      WHEN f.b_keyword ILIKE '%' || v_search || '%' THEN 3000
      WHEN coalesce(f.b_site_name, '') ILIKE '%' || v_search || '%' THEN 1000
      WHEN coalesce(f.b_site_domain, '') ILIKE '%' || v_search || '%' THEN 800
      ELSE 100
    END AS s_search_score
    FROM filtered f
  ),
  counted AS (
    SELECT s.*, count(*) OVER () AS s_total_count
    FROM scored s
  ),
  page_rows AS (
    SELECT c.*
    FROM counted c
    ORDER BY
      CASE WHEN v_search IS NOT NULL THEN c.s_search_score END DESC NULLS LAST,
      CASE WHEN v_sort = 'keyword' AND v_dir = 'desc' THEN lower(c.b_keyword) END DESC,
      CASE WHEN v_sort = 'keyword' AND v_dir = 'asc' THEN lower(c.b_keyword) END ASC,
      CASE WHEN v_sort = 'site_name' AND v_dir = 'desc' THEN lower(coalesce(c.b_site_name, '')) END DESC,
      CASE WHEN v_sort = 'site_name' AND v_dir = 'asc' THEN lower(coalesce(c.b_site_name, '')) END ASC,
      CASE WHEN v_sort = 'tracking_label' AND v_dir = 'desc' THEN lower(c.b_tracking_label) END DESC,
      CASE WHEN v_sort = 'tracking_label' AND v_dir = 'asc' THEN lower(c.b_tracking_label) END ASC,
      CASE WHEN v_sort = 'device' AND v_dir = 'desc' THEN lower(c.b_device) END DESC,
      CASE WHEN v_sort = 'device' AND v_dir = 'asc' THEN lower(c.b_device) END ASC,
      CASE WHEN v_sort = 'latest_position' AND v_dir = 'desc' THEN c.e_latest_position END DESC NULLS LAST,
      CASE WHEN v_sort = 'latest_position' AND v_dir = 'asc' THEN c.e_latest_position END ASC NULLS LAST,
      CASE WHEN v_sort = 'movement' AND v_dir = 'desc' THEN c.e_movement END DESC NULLS LAST,
      CASE WHEN v_sort = 'movement' AND v_dir = 'asc' THEN c.e_movement END ASC NULLS LAST,
      CASE WHEN v_sort = 'best_position' AND v_dir = 'desc' THEN c.e_best_position END DESC NULLS LAST,
      CASE WHEN v_sort = 'best_position' AND v_dir = 'asc' THEN c.e_best_position END ASC NULLS LAST,
      CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'desc' THEN c.e_last_checked_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'asc' THEN c.e_last_checked_at END ASC NULLS LAST,
      CASE WHEN v_sort = 'is_active' AND v_dir = 'desc' THEN c.b_is_active END DESC,
      CASE WHEN v_sort = 'is_active' AND v_dir = 'asc' THEN c.b_is_active END ASC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN c.b_created_at END DESC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN c.b_created_at END ASC,
      c.b_target_id
    LIMIT greatest(coalesce(p_limit, 25), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    p.b_target_id,
    CASE WHEN p.b_site_accessible THEN p.b_site_id END,
    CASE WHEN p.b_site_accessible THEN p.b_site_name END,
    CASE WHEN p.b_site_accessible THEN p.b_site_domain END,
    CASE WHEN p.b_site_accessible THEN p.b_brand_id END,
    p.b_keyword_id,
    p.b_keyword,
    p.b_engine,
    p.b_device,
    p.b_search_type,
    p.b_tracking_label,
    p.b_is_active,
    p.b_created_at,
    p.b_updated_at,
    p.b_created_by,
    p.b_org_id,
    p.b_org_name,
    p.b_owner_email,
    p.s_is_owner,
    p.s_access,
    p.e_latest_position,
    p.e_previous_position,
    p.e_movement,
    p.e_best_position,
    p.e_last_checked_at,
    coalesce(history.observed_at, ARRAY[]::timestamptz[]),
    coalesce(history.organic_rank, ARRAY[]::integer[]),
    p.s_total_count
  FROM page_rows p
  LEFT JOIN LATERAL (
    SELECT
      array_agg(ro.observed_at ORDER BY ro.observed_at ASC, ro.id ASC) AS observed_at,
      array_agg(ro.organic_rank ORDER BY ro.observed_at ASC, ro.id ASC) AS organic_rank
    FROM seo.rank_observation ro
    WHERE ro.rank_target_id = p.b_target_id
      AND ro.observed_at >= now() - interval '90 days'
  ) history ON true
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN p.s_search_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'keyword' AND v_dir = 'desc' THEN lower(p.b_keyword) END DESC,
    CASE WHEN v_sort = 'keyword' AND v_dir = 'asc' THEN lower(p.b_keyword) END ASC,
    CASE WHEN v_sort = 'site_name' AND v_dir = 'desc' THEN lower(coalesce(p.b_site_name, '')) END DESC,
    CASE WHEN v_sort = 'site_name' AND v_dir = 'asc' THEN lower(coalesce(p.b_site_name, '')) END ASC,
    CASE WHEN v_sort = 'tracking_label' AND v_dir = 'desc' THEN lower(p.b_tracking_label) END DESC,
    CASE WHEN v_sort = 'tracking_label' AND v_dir = 'asc' THEN lower(p.b_tracking_label) END ASC,
    CASE WHEN v_sort = 'device' AND v_dir = 'desc' THEN lower(p.b_device) END DESC,
    CASE WHEN v_sort = 'device' AND v_dir = 'asc' THEN lower(p.b_device) END ASC,
    CASE WHEN v_sort = 'latest_position' AND v_dir = 'desc' THEN p.e_latest_position END DESC NULLS LAST,
    CASE WHEN v_sort = 'latest_position' AND v_dir = 'asc' THEN p.e_latest_position END ASC NULLS LAST,
    CASE WHEN v_sort = 'movement' AND v_dir = 'desc' THEN p.e_movement END DESC NULLS LAST,
    CASE WHEN v_sort = 'movement' AND v_dir = 'asc' THEN p.e_movement END ASC NULLS LAST,
    CASE WHEN v_sort = 'best_position' AND v_dir = 'desc' THEN p.e_best_position END DESC NULLS LAST,
    CASE WHEN v_sort = 'best_position' AND v_dir = 'asc' THEN p.e_best_position END ASC NULLS LAST,
    CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'desc' THEN p.e_last_checked_at END DESC NULLS LAST,
    CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'asc' THEN p.e_last_checked_at END ASC NULLS LAST,
    CASE WHEN v_sort = 'is_active' AND v_dir = 'desc' THEN p.b_is_active END DESC,
    CASE WHEN v_sort = 'is_active' AND v_dir = 'asc' THEN p.b_is_active END ASC,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN p.b_created_at END DESC,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN p.b_created_at END ASC,
    p.b_target_id;
END;
$function$;

-- ── public.shx_list_scoped ──
CREATE OR REPLACE FUNCTION public.shx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, label text, family text, authoring_owner text, is_active boolean, has_component boolean, visibility text, origin text, organization_id uuid, organization_name text, created_by uuid, owner_email text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('content_ir_kind')));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_system_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'shx_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'team','orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'shx_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'label', 'kind', 'family', 'authoring_owner', 'status', 'component',
    'visibility', 'origin', 'organization_name', 'owner_email',
    'access_level', 'version', 'created', 'updated'
  ) THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT kd.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'mine' AND kd.created_by = v_uid

    UNION ALL

    SELECT kd.*, (kd.created_by = v_uid), CASE WHEN kd.created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM content_ir.kind_definition kd
    WHERE v_scope IN ('orgs','team')
      AND (p_org_id IS NULL OR kd.organization_id = p_org_id) AND kd.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (kd.organization_id, kd.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))

    UNION ALL

    SELECT kd.*, false, permission.permission_level::text
    FROM content_ir.kind_definition kd
    JOIN iam.permissions permission
      ON permission.resource_type = 'content_ir_kind'
     AND permission.resource_id = kd.id
     AND permission.granted_to_user_id = v_uid
    WHERE v_scope = 'shared'
      AND kd.created_by IS DISTINCT FROM v_uid

    UNION ALL

    SELECT org_shared.*
    FROM (
      SELECT DISTINCT ON (kd.id)
        kd.*, false AS s_is_owner, permission.permission_level::text AS s_access
      FROM content_ir.kind_definition kd
      JOIN iam.permissions permission
        ON permission.resource_type = 'content_ir_kind'
       AND permission.resource_id = kd.id
       AND permission.granted_to_organization_id IN (
         SELECT om.organization_id
         FROM iam.organization_member om
         WHERE om.user_id = v_uid
       )
      WHERE v_scope = 'shared'
        AND kd.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (
          SELECT 1
          FROM iam.permissions direct_permission
          WHERE direct_permission.resource_type = 'content_ir_kind'
            AND direct_permission.resource_id = kd.id
            AND direct_permission.granted_to_user_id = v_uid
        )
      ORDER BY kd.id, permission.permission_level::text
    ) org_shared

    UNION ALL

    SELECT kd.*, false, 'public'::text
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'public'
      AND kd.created_by IS DISTINCT FROM v_uid
      AND kd.visibility = 'public'
  ),
  enriched AS (
    SELECT
      scoped.*,
      organization.name AS s_org_name,
      owner_user.email::text AS s_owner_email,
      EXISTS (
        SELECT 1
        FROM content_ir.kind_component component
        WHERE component.kind_definition_id = scoped.id
          AND component.is_active
          AND component.deleted_at IS NULL
          AND component.role = 'output'
          AND component.component_key <> 'generic_structured'
      ) AS s_has_component,
      CASE
        WHEN scoped.organization_id = v_system_org THEN 'system'
        ELSE 'organization'
      END AS s_origin,
      CASE
        WHEN jsonb_typeof(scoped.metadata -> 'family') = 'string'
          THEN scoped.metadata ->> 'family'
        ELSE NULL
      END AS s_family
    FROM scoped
    LEFT JOIN iam.organizations organization ON organization.id = scoped.organization_id
    LEFT JOIN platform.visible_user_identity owner_user ON owner_user.id = scoped.created_by
  ),
  filtered AS (
    SELECT enriched.*
    FROM enriched
    WHERE enriched.deleted_at IS NULL
      AND enriched.is_contract_artifact IS NOT TRUE
      AND (
        v_search IS NULL
        OR enriched.label ILIKE '%' || v_search || '%'
        OR enriched.kind ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_family, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_org_name, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_owner_email, '') ILIKE '%' || v_search || '%'
      )
      AND (NOT v_filters ? 'label' OR enriched.label ILIKE '%' || (v_filters -> 'label' ->> 'value') || '%')
      AND (NOT v_filters ? 'kind' OR enriched.kind ILIKE '%' || (v_filters -> 'kind' ->> 'value') || '%')
      AND (NOT v_filters ? 'organization_name' OR coalesce(enriched.s_org_name, '') ILIKE '%' || (v_filters -> 'organization_name' ->> 'value') || '%')
      AND (NOT v_filters ? 'owner_email' OR coalesce(enriched.s_owner_email, '') ILIKE '%' || (v_filters -> 'owner_email' ->> 'value') || '%')
      AND (NOT v_filters ? 'family' OR coalesce(enriched.s_family, '__none__') IN (SELECT jsonb_array_elements_text(v_filters -> 'family' -> 'values')))
      AND (NOT v_filters ? 'authoring_owner' OR enriched.authoring_owner IN (SELECT jsonb_array_elements_text(v_filters -> 'authoring_owner' -> 'values')))
      AND (NOT v_filters ? 'status' OR (CASE WHEN enriched.is_active THEN 'active' ELSE 'inactive' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'status' -> 'values')))
      AND (NOT v_filters ? 'component' OR (CASE WHEN enriched.s_has_component THEN 'custom' ELSE 'generic' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'component' -> 'values')))
      AND (NOT v_filters ? 'visibility' OR enriched.visibility::text IN (SELECT jsonb_array_elements_text(v_filters -> 'visibility' -> 'values')))
      AND (NOT v_filters ? 'origin' OR enriched.s_origin IN (SELECT jsonb_array_elements_text(v_filters -> 'origin' -> 'values')))
      AND (NOT v_filters ? 'access_level' OR enriched.s_access IN (SELECT jsonb_array_elements_text(v_filters -> 'access_level' -> 'values')))
      AND (NOT v_filters ? 'version' OR enriched.version::text IN (SELECT jsonb_array_elements_text(v_filters -> 'version' -> 'values')))
      AND (NOT v_filters ? 'created' OR enriched.created_at >= public.shx_since_bucket(v_filters -> 'created' -> 'values' ->> 0))
      AND (NOT v_filters ? 'updated' OR enriched.updated_at >= public.shx_since_bucket(v_filters -> 'updated' -> 'values' ->> 0))
  ),
  scored AS (
    SELECT filtered.*, public.shx_search_score(
      v_search,
      filtered.label,
      filtered.kind,
      filtered.s_family,
      filtered.s_owner_email,
      filtered.s_org_name
    ) AS s_score
    FROM filtered
  ),
  counted AS (
    SELECT scored.*, count(*) OVER () AS s_total
    FROM scored
  )
  SELECT
    counted.id,
    counted.kind,
    counted.label,
    counted.s_family,
    counted.authoring_owner,
    counted.is_active,
    counted.s_has_component,
    counted.visibility::text,
    counted.s_origin,
    counted.organization_id,
    counted.s_org_name,
    counted.created_by,
    counted.s_owner_email,
    counted.version,
    counted.created_at,
    counted.updated_at,
    counted.s_is_owner,
    counted.s_access,
    counted.s_total
  FROM counted
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN counted.s_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'label' AND v_dir = 'asc' THEN lower(counted.label) END ASC,
    CASE WHEN v_sort = 'label' AND v_dir = 'desc' THEN lower(counted.label) END DESC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'asc' THEN lower(counted.kind) END ASC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'desc' THEN lower(counted.kind) END DESC,
    CASE WHEN v_sort = 'family' AND v_dir = 'asc' THEN lower(coalesce(counted.s_family, '')) END ASC,
    CASE WHEN v_sort = 'family' AND v_dir = 'desc' THEN lower(coalesce(counted.s_family, '')) END DESC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'asc' THEN counted.authoring_owner END ASC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'desc' THEN counted.authoring_owner END DESC,
    CASE WHEN v_sort = 'status' AND v_dir = 'asc' THEN counted.is_active END ASC,
    CASE WHEN v_sort = 'status' AND v_dir = 'desc' THEN counted.is_active END DESC,
    CASE WHEN v_sort = 'component' AND v_dir = 'asc' THEN counted.s_has_component END ASC,
    CASE WHEN v_sort = 'component' AND v_dir = 'desc' THEN counted.s_has_component END DESC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'asc' THEN counted.visibility::text END ASC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'desc' THEN counted.visibility::text END DESC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'asc' THEN counted.s_origin END ASC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'desc' THEN counted.s_origin END DESC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'asc' THEN lower(coalesce(counted.s_org_name, '')) END ASC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'desc' THEN lower(coalesce(counted.s_org_name, '')) END DESC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'asc' THEN lower(coalesce(counted.s_owner_email, '')) END ASC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'desc' THEN lower(coalesce(counted.s_owner_email, '')) END DESC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'asc' THEN counted.s_access END ASC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'desc' THEN counted.s_access END DESC,
    CASE WHEN v_sort = 'version' AND v_dir = 'asc' THEN counted.version END ASC,
    CASE WHEN v_sort = 'version' AND v_dir = 'desc' THEN counted.version END DESC,
    CASE WHEN v_sort = 'created' AND v_dir = 'asc' THEN counted.created_at END ASC,
    CASE WHEN v_sort = 'created' AND v_dir = 'desc' THEN counted.created_at END DESC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'asc' THEN counted.updated_at END ASC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'desc' THEN counted.updated_at END DESC,
    counted.id
  LIMIT greatest(coalesce(p_limit, 25), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

-- ── public.trx_list_scoped ──
CREATE OR REPLACE FUNCTION public.trx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, title text, description text, status text, folder_name text, tags text[], duration_seconds numeric, word_count integer, is_draft boolean, session_id uuid, transcript_id uuid, segment_index integer, visibility text, created_by uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('studio_session')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'trx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public') THEN
    RAISE EXCEPTION 'trx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','title','description','kind','status',
                    'folder_name','tags','duration','word_count',
                    'organization_name','owner_email','visibility','draft') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT t.id AS u_id, 'transcript'::text AS u_kind,
      coalesce(nullif(t.title,''),'Untitled transcript') AS u_title,
      coalesce(t.description,'') AS u_description,
      CASE WHEN t.is_draft THEN 'draft' ELSE 'final' END AS u_status,
      coalesce(nullif(t.folder_name,''),'Transcripts') AS u_folder,
      coalesce(t.tags, ARRAY[]::text[]) AS u_tags,
      CASE WHEN t.metadata->>'duration' ~ '^[0-9]+\.?[0-9]*$'
           THEN (t.metadata->>'duration')::numeric END AS u_duration,
      CASE WHEN t.metadata->>'wordCount' ~ '^[0-9]+$'
           THEN (t.metadata->>'wordCount')::integer END AS u_words,
      coalesce(t.is_draft,false) AS u_draft,
      NULL::uuid AS u_session_id, NULL::uuid AS u_transcript_id,
      NULL::integer AS u_segment_index,
      t.visibility::text AS u_visibility, t.created_by AS u_user_id,
      t.organization_id AS u_org_id, t.created_at AS u_created, t.updated_at AS u_updated,
      (p_deep AND v_search IS NOT NULL AND t.segments::text ILIKE '%'||v_search||'%') AS u_deep_hit
    FROM transcripts.transcripts t
    WHERE t.deleted_at IS NULL
    UNION ALL
    SELECT s.id, CASE WHEN s.source='cleanup' THEN 'cleanup' ELSE 'session' END,
      coalesce(nullif(s.title,''),'Untitled session'), ''::text,
      coalesce(s.status,''),
      NULL::text, ARRAY[]::text[],
      nullif(s.total_duration_ms,0)::numeric / 1000.0,
      NULL::integer, false,
      NULL::uuid, s.transcript_id, NULL::integer,
      s.visibility::text, s.created_by, s.organization_id, s.created_at, s.updated_at,
      false
    FROM transcripts.studio_sessions s
    WHERE s.deleted_at IS NULL
    UNION ALL
    SELECT r.id, 'unsorted'::text,
      'Recording ' || (r.segment_index + 1)::text, ''::text,
      'unsorted'::text,
      NULL::text, ARRAY[]::text[],
      CASE WHEN r.ended_at IS NOT NULL AND r.ended_at > r.started_at
           THEN extract(epoch FROM (r.ended_at - r.started_at)) END,
      NULL::integer, false,
      r.session_id, NULL::uuid, r.segment_index,
      coalesce(ps.visibility::text,'personal'), r.user_id,
      coalesce(r.organization_id, ps.organization_id),
      r.started_at, coalesce(r.detached_at, r.updated_at, r.started_at),
      false
    FROM transcripts.studio_recording_segments r
    LEFT JOIN transcripts.studio_sessions ps ON ps.id = r.session_id
    WHERE r.detached_at IS NOT NULL AND r.archived_at IS NULL
      AND (ps.id IS NULL OR ps.deleted_at IS NULL)
  ),
  scoped AS (
    SELECT u.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM unified u WHERE v_scope='mine' AND u.u_user_id = v_uid
    UNION ALL
    SELECT u.*, (u.u_user_id = v_uid), CASE WHEN u.u_user_id = v_uid THEN 'owner' ELSE 'org' END::text FROM unified u
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (u.u_org_id, u.u_user_id) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
      AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (u.u_id) u.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM unified u
      JOIN iam.permissions perm
        ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
        AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
          WHERE p2.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
            AND p2.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
            AND p2.granted_to_user_id=v_uid)
      ORDER BY u.u_id, perm.permission_level::text
    ) org_shared
    UNION ALL
    SELECT u.*, false, 'public'::text FROM unified u
    WHERE v_scope='public' AND u.u_user_id IS DISTINCT FROM v_uid AND u.u_visibility='public'
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
        OR j.u_description ILIKE '%'||v_search||'%'
        OR coalesce(j.u_folder,'') ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(j.u_tags) t WHERE t ILIKE '%'||v_search||'%')
        OR j.u_deep_hit)
      AND (NOT v_f ? 'title' OR j.u_title ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'description' OR j.u_description ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'kind'
           OR j.u_kind IN (SELECT jsonb_array_elements_text(v_f->'kind'->'values')))
      AND (NOT v_f ? 'status'
           OR coalesce(nullif(j.u_status,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'status'->'values')))
      AND (NOT v_f ? 'folder_name'
           OR (j.u_kind = 'transcript'
               AND coalesce(nullif(j.u_folder,''),'__none__') IN (
                     SELECT jsonb_array_elements_text(v_f->'folder_name'->'values'))))
      AND (NOT v_f ? 'visibility'
           OR j.u_visibility IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'tags'
           OR (j.u_kind = 'transcript'
               AND ((j.u_tags && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
                    OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
                        AND coalesce(array_length(j.u_tags,1),0) = 0))))
      AND (NOT v_f ? 'duration'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'duration'->'values') b
                      WHERE public.trx_duration_matches(j.u_duration, b)))
      AND (NOT v_f ? 'word_count'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'word_count'->'values') b
                      WHERE public.trx_words_matches(j.u_words, b)))
      AND (NOT v_f ? 'updated'
           OR j.u_updated >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.u_created >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'draft'
           OR j.u_draft IS NOT DISTINCT FROM (v_f->'draft'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.trx_search_score(
        v_search, f.u_id, f.u_title, f.u_description, f.u_kind, f.u_folder,
        f.u_tags, f.s_owner_email, f.u_deep_hit)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.u_id, c.u_kind, c.u_title, c.u_description, c.u_status, c.u_folder,
    c.u_tags, c.u_duration, c.u_words, c.u_draft, c.u_session_id,
    c.u_transcript_id, c.u_segment_index, c.u_visibility, c.u_user_id,
    c.u_org_id, c.s_org_name, c.u_created, c.u_updated,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.u_updated END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.u_updated END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.u_created END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(c.u_title) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(c.u_title) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.u_description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.u_description,'')) END ASC,
    CASE WHEN v_sort='kind' AND v_dir='desc' THEN c.u_kind END DESC,
    CASE WHEN v_sort='kind' AND v_dir='asc' THEN c.u_kind END ASC,
    CASE WHEN v_sort='status' AND v_dir='desc' THEN lower(coalesce(c.u_status,'')) END DESC,
    CASE WHEN v_sort='status' AND v_dir='asc' THEN lower(coalesce(c.u_status,'')) END ASC,
    CASE WHEN v_sort='folder_name' AND v_dir='desc' THEN lower(coalesce(c.u_folder,'')) END DESC,
    CASE WHEN v_sort='folder_name' AND v_dir='asc' THEN lower(coalesce(c.u_folder,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.u_tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.u_tags,','),'')) END ASC,
    CASE WHEN v_sort='duration' AND v_dir='desc' THEN c.u_duration END DESC NULLS LAST,
    CASE WHEN v_sort='duration' AND v_dir='asc' THEN c.u_duration END ASC NULLS LAST,
    CASE WHEN v_sort='word_count' AND v_dir='desc' THEN c.u_words END DESC NULLS LAST,
    CASE WHEN v_sort='word_count' AND v_dir='asc' THEN c.u_words END ASC NULLS LAST,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN c.u_visibility END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN c.u_visibility END ASC,
    CASE WHEN v_sort='draft' AND v_dir='desc' THEN c.u_draft END DESC,
    CASE WHEN v_sort='draft' AND v_dir='asc' THEN c.u_draft END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

-- ── public.wfx_list_scoped ──
CREATE OR REPLACE FUNCTION public.wfx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, card_visibility text, created_by uuid, organization_id uuid, organization_name text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, step_count integer, run_count bigint, last_run_id uuid, last_run_status text, last_run_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('workflow')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'wfx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public') THEN
    RAISE EXCEPTION 'wfx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived','steps','runs','last_run','status') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT d.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM workflow.definition d WHERE v_scope='mine' AND d.created_by = v_uid
    UNION ALL
    SELECT d.*, (d.created_by = v_uid), CASE WHEN d.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM workflow.definition d
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR d.organization_id = p_org_id) AND d.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (d.organization_id, d.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT d.*, false, perm.permission_level::text FROM workflow.definition d
    JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND d.created_by IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (d.id) d.*, false, perm.permission_level::text
    FROM workflow.definition d
    JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope='shared' AND d.created_by IS DISTINCT FROM v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='workflow'
        AND p2.resource_id=d.id AND p2.granted_to_user_id=v_uid)
    UNION ALL
    -- PUBLIC = the workflow's CARD is public. Rows come through workflow.public_card_rows()
    -- (card fields only) because RLS hides a stranger's workflow body from this invoker (2026-09-26).
    SELECT d.*, false, 'public'::text FROM workflow.public_card_rows() d
    WHERE v_scope='public' AND d.created_by IS DISTINCT FROM v_uid
  ),
  joined AS (
    SELECT s.*,
      o.name AS s_org_name,
      u.email::text AS s_owner_email,
      coalesce(jsonb_array_length(s.nodes), 0) AS s_steps,
      coalesce(r.s_runs, 0::bigint) AS s_runs,
      r.s_last_run_id, r.s_last_run_status, r.s_last_run_at
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
    LEFT JOIN LATERAL (
      SELECT (array_agg(x.id ORDER BY x.created_at DESC))[1] AS s_last_run_id,
             (array_agg(x.status ORDER BY x.created_at DESC))[1] AS s_last_run_status,
             max(x.created_at) AS s_last_run_at,
             count(*) AS s_runs
      FROM workflow.run x
      WHERE x.definition_id = s.id AND x.deleted_at IS NULL
    ) r ON true
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR (p_deep AND j.nodes::text ILIKE '%'||v_search||'%'))
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'status'
           OR coalesce(nullif(j.s_last_run_status,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'status'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'last_run'
           OR j.s_last_run_at >= public.agx_since_bucket(v_f->'last_run'->'values'->>0))
      AND (NOT v_f ? 'steps'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'steps'->'values') b
                      WHERE public.wfx_bucket_matches(j.s_steps::bigint, b)))
      AND (NOT v_f ? 'runs'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'runs'->'values') b
                      WHERE public.wfx_bucket_matches(j.s_runs, b)))
      AND (NOT v_f ? 'favorite'
           OR platform.my_favorite('workflow', j.id) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.mtx_search_score(
      v_search, f.id, f.name, f.description, f.tags, f.s_owner_email,
      ARRAY[f.category], ARRAY[f.s_last_run_status],
      p_deep AND f.nodes::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.name, c.description, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, platform.my_favorite('workflow', c.id),
    c.visibility::text, c.card_visibility::text,
    c.created_by, c.organization_id, c.s_org_name, c.version,
    c.created_at, c.updated_at, c.s_steps, c.s_runs,
    c.s_last_run_id, c.s_last_run_status, c.s_last_run_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN p_favorites_first THEN platform.my_favorite('workflow', c.id) END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.description,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.category,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='access_level' AND v_dir='desc' THEN lower(coalesce(c.s_access,'')) END DESC,
    CASE WHEN v_sort='access_level' AND v_dir='asc' THEN lower(coalesce(c.s_access,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='version' AND v_dir='desc' THEN c.version END DESC,
    CASE WHEN v_sort='version' AND v_dir='asc' THEN c.version END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN platform.my_favorite('workflow', c.id) END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN platform.my_favorite('workflow', c.id) END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    CASE WHEN v_sort='steps' AND v_dir='desc' THEN c.s_steps END DESC,
    CASE WHEN v_sort='steps' AND v_dir='asc' THEN c.s_steps END ASC,
    CASE WHEN v_sort='runs' AND v_dir='desc' THEN c.s_runs END DESC,
    CASE WHEN v_sort='runs' AND v_dir='asc' THEN c.s_runs END ASC,
    CASE WHEN v_sort='last_run' AND v_dir='desc' THEN c.s_last_run_at END DESC NULLS LAST,
    CASE WHEN v_sort='last_run' AND v_dir='asc' THEN c.s_last_run_at END ASC NULLS LAST,
    CASE WHEN v_sort='status' AND v_dir='desc' THEN lower(coalesce(c.s_last_run_status,'')) END DESC,
    CASE WHEN v_sort='status' AND v_dir='asc' THEN lower(coalesce(c.s_last_run_status,'')) END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

-- ── education.assessment_list_counts ──
CREATE OR REPLACE FUNCTION education.assessment_list_counts(p_kind text DEFAULT NULL::text, p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(scope text, total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH base AS (
    SELECT a.*, a.visibility::text AS vis FROM education.assessment a
  )
  SELECT l.lane, (
    SELECT count(*) FROM base b
    WHERE education.assessment_list_match(
      b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, l.lane, NULL, p_search, p_filters, p_archived)
      AND (l.lane <> 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(NULL) r))
  )
  FROM unnest(ARRAY['mine', 'team', 'orgs', 'shared', 'public']) AS l(lane)
$function$;

-- ── education.assessment_list_facets ──
CREATE OR REPLACE FUNCTION education.assessment_list_facets(p_kind text DEFAULT NULL::text, p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(facet text, value text, total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH base AS (
    SELECT a.*, a.visibility::text AS vis FROM education.assessment a
  ),
  keyed AS (
    SELECT 'depth'::text AS f, coalesce(nullif(btrim(b.depth), ''), '__none__') AS v
    FROM base b
    WHERE education.assessment_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived, 'depth')
      AND (p_scope IS DISTINCT FROM 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT 'exam_type', coalesce(nullif(btrim(b.exam_type), ''), '__none__')
    FROM base b
    WHERE education.assessment_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived, 'exam_type')
      AND (p_scope IS DISTINCT FROM 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT 'status', coalesce(nullif(btrim(b.status), ''), '__none__')
    FROM base b
    WHERE education.assessment_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived, 'status')
      AND (p_scope IS DISTINCT FROM 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT 'visibility', b.vis
    FROM base b
    WHERE education.assessment_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at, b.assessment_kind,
      b.title, b.topic, b.description, b.exam_type, b.depth, b.status,
      p_kind, p_scope, p_org_id, p_search, p_filters, p_archived, 'visibility')
      AND (p_scope IS DISTINCT FROM 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
  )
  SELECT k.f, k.v, count(*) FROM keyed k GROUP BY k.f, k.v ORDER BY k.f, count(*) DESC, k.v
$function$;

-- ── education.fc_set_list_counts ──
CREATE OR REPLACE FUNCTION education.fc_set_list_counts(p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(scope text, total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
      AND (l.lane <> 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(NULL) r))
  )
  FROM unnest(ARRAY['mine', 'team', 'orgs', 'shared', 'public']) AS l(lane)
$function$;

-- ── education.fc_set_list_facets ──
CREATE OR REPLACE FUNCTION education.fc_set_list_facets(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(facet text, value text, total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
      AND (p_scope IS DISTINCT FROM 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT 'visibility', b.vis
    FROM base b
    WHERE education.fc_set_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at,
      b.name, b.topic, b.lesson, b.description, b.difficulty, b.folders,
      p_scope, p_org_id, p_search, p_filters, p_archived, 'visibility')
      AND (p_scope IS DISTINCT FROM 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT 'folders', coalesce(f.fid::text, '__none__')
    FROM base b
    LEFT JOIN LATERAL unnest(CASE WHEN cardinality(b.folders) = 0 THEN ARRAY[NULL::uuid] ELSE b.folders END) AS f(fid) ON true
    WHERE education.fc_set_list_match(b.created_by, b.organization_id, b.vis, b.id, b.deleted_at,
      b.name, b.topic, b.lesson, b.description, b.difficulty, b.folders,
      p_scope, p_org_id, p_search, p_filters, p_archived, 'folders')
      AND (p_scope IS DISTINCT FROM 'team' OR (b.organization_id, b.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
  )
  SELECT k.f, k.v, count(*) FROM keyed k GROUP BY k.f, k.v ORDER BY k.f, count(*) DESC, k.v
$function$;

-- ── public.agx_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.agx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','team','orgs','shared','public','system'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.agx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- One row per organization the caller belongs to, WITH its name.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.agx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;

  -- MY TEAM (T-29): one narrow row per organization where the caller shares a team with someone.
  RETURN QUERY
  SELECT 'team'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = o.id
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.agx_list_scoped('team', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;

  -- ADMIN PLATFORM SCOPES (2026-09-26): totals plus one narrow row per owning
  -- organization / person, each counted from ONE scoped read (honest under
  -- search and filters, never a lateral call per owner).
  IF public.is_platform_admin() THEN
    FOREACH v_scope IN ARRAY ARRAY['platform_orgs','platform_users','platform_all'] LOOP
      RETURN QUERY
      SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
      FROM public.agx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
        true, p_archived, p_filters, 1, 0) r;
    END LOOP;
    RETURN QUERY
    SELECT 'platform_orgs'::text, r.organization_id, max(r.organization_name), count(*)::bigint
    FROM public.agx_list_scoped('platform_orgs', NULL, p_search, p_deep, 'updated', 'desc',
      false, p_archived, p_filters, 1000000, 0) r
    WHERE r.organization_id IS NOT NULL
    GROUP BY r.organization_id;
    RETURN QUERY
    SELECT 'platform_users'::text, r.organization_id,
           coalesce(max(NULLIF(btrim(pp.display_name), '')), max(r.owner_email), max(r.organization_name)),
           count(*)::bigint
    FROM public.agx_list_scoped('platform_users', NULL, p_search, p_deep, 'updated', 'desc',
      false, p_archived, p_filters, 1000000, 0) r
    LEFT JOIN iam.organizations po ON po.id = r.organization_id
    LEFT JOIN users.profiles pp ON pp.id = po.created_by
    WHERE r.organization_id IS NOT NULL
    GROUP BY r.organization_id;
  END IF;
END;
$function$;

-- ── public.crm_inbox_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.crm_inbox_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  FOREACH v_scope IN ARRAY ARRAY['mine','team','orgs'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.crm_inbox_list_scoped(v_scope, NULL, p_search, p_deep, 'occurred', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, coalesce(o.name, 'Unnamed org'), coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.memberships m
    ON m.container_id = o.id AND m.container_type = 'organization' AND m.user_id = (select auth.uid()) AND m.deleted_at IS NULL AND m.status = 'active'
  LEFT JOIN LATERAL public.crm_inbox_list_scoped('orgs', o.id, p_search, p_deep, 'occurred','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;

  -- MY TEAM (T-29): one narrow row per organization where the caller shares a team with someone.
  RETURN QUERY
  SELECT 'team'::text, o.id, coalesce(o.name, 'Unnamed org'), coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = o.id
  JOIN iam.memberships m
    ON m.container_id = o.id AND m.container_type = 'organization' AND m.user_id = (select auth.uid()) AND m.deleted_at IS NULL AND m.status = 'active'
  LEFT JOIN LATERAL public.crm_inbox_list_scoped('team', o.id, p_search, p_deep, 'occurred','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

-- ── public.cvx_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.cvx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- THE PROBE RUNS ONCE. This function calls cvx_list_scoped once per scope
  -- and once per organization (fifteen times for a twelve-org account), and
  -- each call used to re-run the ~1.7 s message-body probe: 11.2 s measured,
  -- a statement timeout from the page. The hit set is computed here, once,
  -- and handed to every call as p_filters->'__deep_hits'.
  IF v_search IS NOT NULL
     AND public.cvx_search_is_deep(v_search, p_deep)
     AND NOT (v_filters ? '__deep_hits') THEN
    v_filters := v_filters || jsonb_build_object(
      '__deep_hits',
      coalesce((SELECT jsonb_agg(h) FROM public.cvx_deep_hits(v_search) AS h), '[]'::jsonb));
  END IF;

  FOREACH v_scope IN ARRAY ARRAY['mine','team','orgs','shared'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.cvx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, v_filters, 1, 0) r;
  END LOOP;

  -- Per-org breakdown for the My Orgs dropdown. Labels come from THIS query,
  -- never a Redux slice — a tab bar must be self-sufficient.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.cvx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, v_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;

  -- MY TEAM (T-29): one narrow row per organization where the caller shares a team with someone.
  RETURN QUERY
  SELECT 'team'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = o.id
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.cvx_list_scoped('team', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, v_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

-- ── public.edu_library_scope_counts ──
CREATE OR REPLACE FUNCTION public.edu_library_scope_counts(p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'team', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT
      v_scope,
      NULL::uuid,
      NULL::text,
      coalesce(max(r.total_count), 0)
    FROM public.edu_library_list_scoped(
      v_scope, p_search, 'updated', 'desc', p_filters, 1, 0
    ) r;
  END LOOP;
END;
$function$;

-- ── public.ivw_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.ivw_list_scope_counts(p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','team','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.ivw_list_scoped(v_scope, NULL, p_search, 'updated', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.ivw_list_scoped('orgs', o.id, p_search, 'updated','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;

  -- MY TEAM (T-29): one narrow row per organization where the caller shares a team with someone.
  RETURN QUERY
  SELECT 'team'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = o.id
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.ivw_list_scoped('team', o.id, p_search, 'updated','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

-- ── public.mkt_initiative_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.mkt_initiative_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s text; begin foreach s in array array['mine','team','orgs','shared','public'] loop return query select s,null::uuid,null::text,coalesce(max(x.total_count),0) from public.mkt_initiative_list_scoped(s,null,p_search,p_deep,'updated_at','desc',p_filters,1,0)x; end loop; end $function$;

-- ── public.rsx_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.rsx_list_scope_counts(p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 'mine'::text, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
  FROM public.rsx_list_scoped('mine', NULL, p_search, 'updated_at', 'desc', p_filters, 1, 0, p_archived) r;
  RETURN QUERY
  WITH t AS (
    SELECT r.organization_id, r.organization_name, r.created_by
    FROM public.rsx_list_scoped('team', NULL, p_search, 'updated_at', 'desc', p_filters, 1000000, 0, p_archived) r
  )
  SELECT 'team'::text, NULL::uuid, NULL::text, count(*) FROM t
  UNION ALL
  SELECT 'team'::text, t.organization_id, max(t.organization_name), count(*)
  FROM t
  WHERE t.organization_id IN (SELECT tr.organization_id FROM iam.my_team_reach(NULL) tr WHERE tr.user_id <> (select auth.uid()))
  GROUP BY t.organization_id;
  RETURN QUERY
  WITH o AS (
    SELECT r.organization_id, r.organization_name
    FROM public.rsx_list_scoped('orgs', NULL, p_search, 'updated_at', 'desc', p_filters, 1000000, 0, p_archived) r
  )
  SELECT 'orgs'::text, NULL::uuid, NULL::text, count(*) FROM o
  UNION ALL
  SELECT 'orgs'::text, o.organization_id, max(o.organization_name), count(*)
  FROM o GROUP BY o.organization_id;
END;
$function$;

-- ── public.seo_rank_target_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scope_counts(p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'team', 'orgs', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.seo_rank_target_list_scoped(
      v_scope, NULL, p_search, 'created_at', 'desc', p_filters, 1, 0
    ) r;
  END LOOP;

  RETURN QUERY
  SELECT
    'orgs'::text,
    o.id,
    o.name,
    coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om
    ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.seo_rank_target_list_scoped(
    'orgs', o.id, p_search, 'created_at', 'desc', p_filters, 1, 0
  ) r ON true
  GROUP BY o.id, o.name;

  -- MY TEAM (T-29): one narrow row per organization where the caller shares a team with someone.
  RETURN QUERY
  SELECT
    'team'::text,
    o.id,
    o.name,
    coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = o.id
  JOIN iam.organization_member om
    ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.seo_rank_target_list_scoped(
    'team', o.id, p_search, 'created_at', 'desc', p_filters, 1, 0
  ) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

-- ── public.shx_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.shx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'team', 'orgs', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(result.total_count), 0)
    FROM public.shx_list_scoped(
      v_scope, NULL, p_search, p_deep, 'updated', 'desc', p_filters, 1, 0
    ) result;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, organization.id, organization.name, coalesce(max(result.total_count), 0)
  FROM iam.organizations organization
  JOIN iam.organization_member membership
    ON membership.organization_id = organization.id
   AND membership.user_id = (SELECT auth.uid())
  LEFT JOIN LATERAL public.shx_list_scoped(
    'orgs', organization.id, p_search, p_deep, 'updated', 'desc', p_filters, 1, 0
  ) result ON true
  GROUP BY organization.id, organization.name;

  -- MY TEAM (T-29): one narrow row per organization where the caller shares a team with someone.
  RETURN QUERY
  SELECT 'team'::text, organization.id, organization.name, coalesce(max(result.total_count), 0)
  FROM iam.organizations organization
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = organization.id
  JOIN iam.organization_member membership
    ON membership.organization_id = organization.id
   AND membership.user_id = (SELECT auth.uid())
  LEFT JOIN LATERAL public.shx_list_scoped(
    'team', organization.id, p_search, p_deep, 'updated', 'desc', p_filters, 1, 0
  ) result ON true
  GROUP BY organization.id, organization.name;
END;
$function$;

-- ── public.trx_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.trx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','team','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.trx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.trx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;

  -- MY TEAM (T-29): one narrow row per organization where the caller shares a team with someone.
  RETURN QUERY
  SELECT 'team'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = o.id
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.trx_list_scoped('team', o.id, p_search, p_deep, 'updated','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

-- ── public.wfx_list_scope_counts ──
CREATE OR REPLACE FUNCTION public.wfx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','team','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.wfx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- One row per organization the caller belongs to, WITH its name.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.wfx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;

  -- MY TEAM (T-29): one narrow row per organization where the caller shares a team with someone.
  RETURN QUERY
  SELECT 'team'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = o.id
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.wfx_list_scoped('team', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

