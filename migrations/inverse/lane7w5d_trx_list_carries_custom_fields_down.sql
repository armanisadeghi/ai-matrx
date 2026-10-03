-- chair-step: inverse of migrations/campaign/lane7w5d_trx_list_carries_custom_fields.sql — drops public.trx_list_scoped and re-creates
-- production's body without custom_fields, byte for byte, and its grants.
-- based-on: public.trx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 1c9f4d8e028f20a0f73fec4605c8b370838d2b407abfef8c3c4e57576097983e

set local lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.trx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.trx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, title text, description text, status text, folder_name text, tags text[], duration_seconds numeric, word_count integer, is_draft boolean, session_id uuid, transcript_id uuid, segment_index integer, visibility text, created_by uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint, is_archived boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('studio_session')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- THE ARCHIVED-ITEMS LAW: active (default) | archived | all. Archived = moved out through the one archive.
  v_archived text := CASE lower(coalesce(v_f->'archived'->>'value', 'active')) WHEN 'archived' THEN 'archived' WHEN 'all' THEN 'all' ELSE 'active' END;
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team', 'all') THEN
    v_ctx := jsonb_build_object('transcript', platform.shown_to_context('transcript'), 'studio_session', platform.shown_to_context('studio_session'));
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'trx_list_scoped: not authenticated'; END IF;

  -- INTERNAL LANE MODE (p_scope = '_lanes'), used only by trx_list_scope_counts: ONE statement that returns, for
  -- every lane, the ids this same list would show (access_level carries the lane name, one row per lane and
  -- record, 'all' deduped), so the row-secured tables are read once instead of once per lane. Same lane
  -- predicates and filters as below; nothing is sorted, scored or paged. Never a lane a page asks for.
  IF v_scope = '_lanes' THEN
    DECLARE v_need_names boolean := v_f ?| ARRAY['owner_email','organization_name'];
    BEGIN
      v_ctx := jsonb_build_object('transcript', platform.shown_to_context('transcript'), 'studio_session', platform.shown_to_context('studio_session'));
      RETURN QUERY
      WITH unified AS (
    SELECT t.id AS u_id, 'transcript'::text AS u_kind,
      coalesce(nullif(t.title,''),'Untitled transcript') AS u_title,
      coalesce(t.description,'') AS u_description,
      CASE WHEN t.is_draft THEN 'draft' ELSE 'final' END AS u_status,
      coalesce(nullif(t.folder_name,''),'Transcripts') AS u_folder,
      coalesce(t.tags, ARRAY[]::text[]) AS u_tags,
      transcripts.duration_seconds(t.metadata, t.segments) AS u_duration,
      CASE WHEN t.metadata->>'wordCount' ~ '^[0-9]+$'
           THEN (t.metadata->>'wordCount')::integer END AS u_words,
      coalesce(t.is_draft,false) AS u_draft,
      NULL::uuid AS u_session_id, NULL::uuid AS u_transcript_id,
      NULL::integer AS u_segment_index,
      CASE WHEN coalesce(t.published_to_web, false) THEN 'public' WHEN t.shown_to = 'only_me'::platform.shown_to THEN 'personal' ELSE 'internal' END AS u_access, t.created_by AS u_user_id,
      t.organization_id AS u_org_id, t.created_at AS u_created, t.updated_at AS u_updated,
      (p_deep AND v_search IS NOT NULL AND t.segments::text ILIKE '%'||v_search||'%') AS u_deep_hit,
      t.shown_to AS u_shown, 'transcript'::text AS u_token, (t.deleted_at IS NOT NULL) AS u_archived
    FROM transcripts.transcripts t
    WHERE (v_archived = 'all' OR (t.deleted_at IS NOT NULL) = (v_archived = 'archived'))
    UNION ALL
    SELECT s.id, CASE WHEN s.source='cleanup' THEN 'cleanup' ELSE 'session' END,
      coalesce(nullif(s.title,''),'Untitled session'), ''::text,
      coalesce(s.status,''),
      NULL::text, ARRAY[]::text[],
      nullif(s.total_duration_ms,0)::numeric / 1000.0,
      NULL::integer, false,
      NULL::uuid, s.transcript_id, NULL::integer,
      CASE WHEN s.shown_to = 'only_me'::platform.shown_to THEN 'personal' ELSE 'internal' END, s.created_by, s.organization_id, s.created_at, s.updated_at,
      false, s.shown_to, 'studio_session'::text, (s.deleted_at IS NOT NULL)
    FROM transcripts.studio_sessions s
    WHERE (v_archived = 'all' OR (s.deleted_at IS NOT NULL) = (v_archived = 'archived'))
    UNION ALL
    SELECT r.id, 'unsorted'::text,
      'Recording ' || (r.segment_index + 1)::text, ''::text,
      'unsorted'::text,
      NULL::text, ARRAY[]::text[],
      CASE WHEN r.ended_at IS NOT NULL AND r.ended_at > r.started_at
           THEN extract(epoch FROM (r.ended_at - r.started_at)) END,
      NULL::integer, false,
      r.session_id, NULL::uuid, r.segment_index,
      CASE WHEN ps.id IS NULL OR ps.shown_to = 'only_me'::platform.shown_to THEN 'personal' ELSE 'internal' END, r.user_id,
      coalesce(r.organization_id, ps.organization_id),
      r.started_at, coalesce(r.detached_at, r.updated_at, r.started_at),
      false, ps.shown_to, 'studio_session'::text,
      (r.archived_at IS NOT NULL OR r.deleted_at IS NOT NULL OR ps.deleted_at IS NOT NULL)
    FROM transcripts.studio_recording_segments r
    LEFT JOIN transcripts.studio_sessions ps ON ps.id = r.session_id
    WHERE r.detached_at IS NOT NULL
      AND (v_archived = 'all' OR (r.archived_at IS NOT NULL OR r.deleted_at IS NOT NULL OR ps.deleted_at IS NOT NULL) = (v_archived = 'archived'))
  ),
      mine AS (SELECT u.u_id, u.u_org_id FROM unified u WHERE u.u_user_id = v_uid),
      orgs AS (
        SELECT u.u_id, u.u_org_id, u.u_user_id FROM unified u
        WHERE (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
          AND platform.shown_to_lists(u.u_shown, NULL, u.u_user_id, u.u_org_id, v_uid, v_ctx -> u.u_token)
      ),
      team AS (
        SELECT o.u_id, o.u_org_id FROM orgs o
        WHERE (o.u_org_id, o.u_user_id) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r)
      ),
      shared AS (
        SELECT u.u_id, u.u_org_id FROM unified u
        JOIN iam.permissions perm
          ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
          AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
          AND perm.granted_to_user_id = v_uid
        WHERE u.u_user_id IS DISTINCT FROM v_uid
        UNION ALL
        SELECT os.u_id, os.u_org_id FROM (
          SELECT DISTINCT ON (u.u_id) u.u_id, u.u_org_id
          FROM unified u
          JOIN iam.permissions perm
            ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
            AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
            AND perm.granted_to_organization_id IN (
              SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
          WHERE u.u_user_id IS DISTINCT FROM v_uid
            AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
              WHERE p2.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
                AND p2.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
                AND p2.granted_to_user_id=v_uid)
          ORDER BY u.u_id, perm.permission_level::text
        ) os
      ),
      pub AS (
        SELECT u.u_id, u.u_org_id FROM unified u
        WHERE u.u_user_id IS DISTINCT FROM v_uid AND u.u_access='public'
      ),
      lane_rows AS (
        SELECT 'mine'::text AS lane, m.u_id, m.u_org_id FROM mine m
        UNION ALL SELECT 'orgs', o.u_id, o.u_org_id FROM orgs o
        UNION ALL SELECT 'team', t.u_id, t.u_org_id FROM team t
        UNION ALL SELECT 'shared', s.u_id, s.u_org_id FROM shared s
        UNION ALL SELECT 'public', p.u_id, p.u_org_id FROM pub p
        UNION ALL SELECT 'all', d.u_id, d.u_org_id FROM (
          SELECT DISTINCT ON (x.u_id) x.u_id, x.u_org_id FROM (
            SELECT m.u_id, m.u_org_id FROM mine m
            UNION ALL SELECT o.u_id, o.u_org_id FROM orgs o
            UNION ALL SELECT s.u_id, s.u_org_id FROM shared s
          ) x ORDER BY x.u_id
        ) d
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
    WHERE (p_org_id IS NULL OR j.u_org_id = p_org_id)
      AND (v_search IS NULL
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
      AND (NOT v_f ? 'shown_to'
           OR j.u_access IN (SELECT jsonb_array_elements_text(v_f->'shown_to'->'values')))
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
      )
      SELECT lr.u_id, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text[], NULL::numeric,
        NULL::integer, NULL::boolean, NULL::uuid, NULL::uuid, NULL::integer, NULL::text, NULL::uuid, lr.u_org_id,
        NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::boolean, lr.lane, NULL::text, 0::bigint, NULL::boolean
      FROM lane_rows lr JOIN ok ON ok.u_id = lr.u_id;
      RETURN;
    END;
  END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public','all') THEN
    RAISE EXCEPTION 'trx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','title','description','kind','status',
                    'folder_name','tags','duration','word_count',
                    'organization_name','owner_email','shown_to','draft') THEN
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
      transcripts.duration_seconds(t.metadata, t.segments) AS u_duration,
      CASE WHEN t.metadata->>'wordCount' ~ '^[0-9]+$'
           THEN (t.metadata->>'wordCount')::integer END AS u_words,
      coalesce(t.is_draft,false) AS u_draft,
      NULL::uuid AS u_session_id, NULL::uuid AS u_transcript_id,
      NULL::integer AS u_segment_index,
      CASE WHEN coalesce(t.published_to_web, false) THEN 'public' WHEN t.shown_to = 'only_me'::platform.shown_to THEN 'personal' ELSE 'internal' END AS u_access, t.created_by AS u_user_id,
      t.organization_id AS u_org_id, t.created_at AS u_created, t.updated_at AS u_updated,
      (p_deep AND v_search IS NOT NULL AND t.segments::text ILIKE '%'||v_search||'%') AS u_deep_hit,
      t.shown_to AS u_shown, 'transcript'::text AS u_token, (t.deleted_at IS NOT NULL) AS u_archived
    FROM transcripts.transcripts t
    WHERE (v_archived = 'all' OR (t.deleted_at IS NOT NULL) = (v_archived = 'archived'))
    UNION ALL
    SELECT s.id, CASE WHEN s.source='cleanup' THEN 'cleanup' ELSE 'session' END,
      coalesce(nullif(s.title,''),'Untitled session'), ''::text,
      coalesce(s.status,''),
      NULL::text, ARRAY[]::text[],
      nullif(s.total_duration_ms,0)::numeric / 1000.0,
      NULL::integer, false,
      NULL::uuid, s.transcript_id, NULL::integer,
      CASE WHEN s.shown_to = 'only_me'::platform.shown_to THEN 'personal' ELSE 'internal' END, s.created_by, s.organization_id, s.created_at, s.updated_at,
      false, s.shown_to, 'studio_session'::text, (s.deleted_at IS NOT NULL)
    FROM transcripts.studio_sessions s
    WHERE (v_archived = 'all' OR (s.deleted_at IS NOT NULL) = (v_archived = 'archived'))
    UNION ALL
    SELECT r.id, 'unsorted'::text,
      'Recording ' || (r.segment_index + 1)::text, ''::text,
      'unsorted'::text,
      NULL::text, ARRAY[]::text[],
      CASE WHEN r.ended_at IS NOT NULL AND r.ended_at > r.started_at
           THEN extract(epoch FROM (r.ended_at - r.started_at)) END,
      NULL::integer, false,
      r.session_id, NULL::uuid, r.segment_index,
      CASE WHEN ps.id IS NULL OR ps.shown_to = 'only_me'::platform.shown_to THEN 'personal' ELSE 'internal' END, r.user_id,
      coalesce(r.organization_id, ps.organization_id),
      r.started_at, coalesce(r.detached_at, r.updated_at, r.started_at),
      false, ps.shown_to, 'studio_session'::text,
      (r.archived_at IS NOT NULL OR r.deleted_at IS NOT NULL OR ps.deleted_at IS NOT NULL)
    FROM transcripts.studio_recording_segments r
    LEFT JOIN transcripts.studio_sessions ps ON ps.id = r.session_id
    WHERE r.detached_at IS NOT NULL
      AND (v_archived = 'all' OR (r.archived_at IS NOT NULL OR r.deleted_at IS NOT NULL OR ps.deleted_at IS NOT NULL) = (v_archived = 'archived'))
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
      AND platform.shown_to_lists(u.u_shown, NULL, u.u_user_id, u.u_org_id, v_uid, v_ctx -> u.u_token)
    UNION ALL
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
      AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope IN ('shared','all') AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (u.u_id) u.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM unified u
      JOIN iam.permissions perm
        ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
        AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope IN ('shared','all') AND u.u_user_id IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
          WHERE p2.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
            AND p2.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
            AND p2.granted_to_user_id=v_uid)
      ORDER BY u.u_id, perm.permission_level::text
    ) org_shared
    UNION ALL
    SELECT u.*, false, 'public'::text FROM unified u
    WHERE v_scope='public' AND u.u_user_id IS DISTINCT FROM v_uid AND u.u_access='public'
  ),
  scoped AS (SELECT r.* FROM scoped_raw r WHERE v_scope <> 'all' UNION ALL SELECT dd.* FROM (SELECT DISTINCT ON (r.u_id) r.* FROM scoped_raw r WHERE v_scope = 'all' ORDER BY r.u_id, CASE r.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 WHEN 'commenter' THEN 3 WHEN 'viewer' THEN 4 WHEN 'org' THEN 5 ELSE 9 END) dd),
  joined AS (
    SELECT s.*, o.name AS s_org_name, au.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.u_org_id
    LEFT JOIN platform.visible_user_identity au ON au.id = s.u_user_id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (p_org_id IS NULL OR j.u_org_id = p_org_id)
      AND (v_search IS NULL
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
      AND (NOT v_f ? 'shown_to'
           OR j.u_access IN (SELECT jsonb_array_elements_text(v_f->'shown_to'->'values')))
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
    c.u_transcript_id, c.u_segment_index, c.u_access, c.u_user_id,
    c.u_org_id, c.s_org_name, c.u_created, c.u_updated,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total, c.u_archived
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
    CASE WHEN v_sort='shown_to' AND v_dir='desc' THEN c.u_access END DESC,
    CASE WHEN v_sort='shown_to' AND v_dir='asc' THEN c.u_access END ASC,
    CASE WHEN v_sort='draft' AND v_dir='desc' THEN c.u_draft END DESC,
    CASE WHEN v_sort='draft' AND v_dir='asc' THEN c.u_draft END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.trx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) TO authenticated, service_role;
