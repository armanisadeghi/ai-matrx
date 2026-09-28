-- based-on: public.studio_session_metrics(uuid[]) dd065237de96fa6411976ceaf29dcbba684e24733b39b47a0d655055e2f5dfbb
-- based-on: public.page_extraction_runs_rollup() 2f3e137b336caa3f8e1bdfbfbd737cbdc541103740f7eaa312238012babb5540
-- based-on: public.trx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 9f6b9e9fb425fc07977c0dc0b8c2cb132e363c333e5a00b0a4f16a2fd26fe317
-- Delete means archive (Arman, 2026-09-27), lane B readers: transcript-studio
-- recordings/segments and page-extraction runs/results/page runs now move to
-- Trash (deleted_at) instead of being destroyed. Three database readers must
-- skip trashed rows or a trashed item keeps counting / showing:
--   * studio_session_metrics — recording count and character count per session
--   * trx_list_scoped — the unsorted-recordings arm of the /transcripts list
--   * page_extraction_runs_rollup — a run's chunk/result/cost rollup (a retry
--     trashes the page run's previous results before writing new ones)
-- Each body is the live body with only "deleted_at IS NULL" added.

CREATE OR REPLACE FUNCTION public.studio_session_metrics(p_session_ids uuid[])
 RETURNS TABLE(session_id uuid, recording_count integer, char_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    ids.sid as session_id,
    (
      select count(*)::integer
      from transcripts.studio_recording_segments r
      where r.session_id = ids.sid
        and r.detached_at is null
        and r.deleted_at is null
    ) as recording_count,
    coalesce(
      nullif(
        (
          select sum(length(c.text))
          from transcripts.studio_cleaned_segments c
          where c.session_id = ids.sid
            and c.superseded_at is null
            and c.deleted_at is null
        ),
        0
      ),
      (
        select sum(length(rw.text))
        from transcripts.studio_raw_segments rw
        where rw.session_id = ids.sid
          and rw.deleted_at is null
      ),
      0
    )::bigint as char_count
  from unnest(p_session_ids) as ids(sid);
$function$;

CREATE OR REPLACE FUNCTION public.page_extraction_runs_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_completed integer; v_failed integer; v_total integer;
  v_results integer; v_cost numeric(10,4); v_tokens integer;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*),
    COALESCE(SUM(cost), 0),
    COALESCE(SUM(tokens), 0)
  INTO v_completed, v_failed, v_total, v_cost, v_tokens
  FROM docproc.page_extraction_page_runs WHERE run_id = NEW.run_id AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_results FROM docproc.page_extraction_results WHERE run_id = NEW.run_id AND deleted_at IS NULL;

  UPDATE docproc.page_extraction_runs
     SET completed_chunks = v_completed, failed_chunks = v_failed,
         result_count = v_results, total_cost = v_cost, total_tokens = v_tokens
   WHERE id = NEW.run_id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, title text, description text, status text, folder_name text, tags text[], duration_seconds numeric, word_count integer, is_draft boolean, session_id uuid, transcript_id uuid, segment_index integer, visibility text, created_by uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb := jsonb_build_object('transcript', platform.shown_to_context('transcript'), 'studio_session', platform.shown_to_context('studio_session'));  -- access ladder T-11: Shown to
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
      (p_deep AND v_search IS NOT NULL AND t.segments::text ILIKE '%'||v_search||'%') AS u_deep_hit,
      t.shown_to AS u_shown, 'transcript'::text AS u_token
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
      false, s.shown_to, 'studio_session'::text
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
      false, ps.shown_to, 'studio_session'::text
    FROM transcripts.studio_recording_segments r
    LEFT JOIN transcripts.studio_sessions ps ON ps.id = r.session_id
    WHERE r.detached_at IS NOT NULL AND r.archived_at IS NULL AND r.deleted_at IS NULL
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
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(u.u_shown, u.u_visibility::platform.visibility, u.u_user_id, u.u_org_id, v_uid, v_ctx -> u.u_token)
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
