-- lane: list-perf (education list RPC N+1), 2026-09-28
-- based-on: education.fc_set_list_filter_ok(jsonb, text, text, text) 967a2345b09dcdd595aacedfc5f1ad3aeb32ab1a6dc1138a7c57faf26571804e
-- based-on: education.fc_set_list_scoped(text, uuid, text, jsonb, text, text, boolean, integer, integer) 5f1c03cbd2e2c83d8f30bc56b667f07bea20fb7a1e6dbe842d4cec7e3b55b6f4
-- based-on: education.assessment_list_scoped(text, text, uuid, text, jsonb, text, text, boolean, integer, integer) e1d0df2f76adc023f1f907da2ce815943ce3da3f6e3d652f0c586fa4b25a326e
--
-- /education/flashcards and /education/quizzes lists were slow (fc_set_list_scoped('mine') ~210–350 ms
-- for 370 rows; assessment_list_scoped / _list_counts 1.1–1.3 s from the browser). Measured root cause,
-- by ablation on production as admin@admin.com (min of 5 runs):
--
--   1. NESTED SQL FUNCTIONS ARE RE-PLANNED ON EVERY OUTER CALL. `*_list_match` is a LANGUAGE sql function
--      with SET search_path (never inlined), called once per row. PostgreSQL builds a fresh executor for
--      each call, so the six-to-seven `fc_set_list_filter_ok(...)` calls inside it (also LANGUAGE sql,
--      with a sub-SELECT) are parsed and planned again for every row: ~0.12 ms × 7 × rows. Ablation:
--      match without the filter_ok calls = 36 ms; with them = 179 ms. The same six calls made directly
--      from the outer query cost ~25 ms in total.
--      Fix: fc_set_list_filter_ok becomes LANGUAGE plpgsql (compiled once per session, plans cached), same
--      expression, same result for every input — the absent-filter path returns before any query runs.
--      Both education.fc_set_list_match and education.assessment_list_match call it, so both lists, both
--      counts and both facet RPCs get faster without either match predicate changing.
--   2. PER-ROW HELPERS RAN BEFORE THE PAGE. fc_set_list_scoped computed fc_set_folder_ids() for every row
--      the table's RLS admits; assessment_list_scoped computed the question count and my-attempts lateral
--      for every matching row. They now run only when the folder filter / the sort key needs them, and
--      otherwise only for the returned page's rows. Rows, order, totals and every column are unchanged.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION education.fc_set_list_filter_ok(p_filters jsonb, p_key text, p_value text, p_skip text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  -- LANGUAGE plpgsql on purpose: this is called from inside the per-row *_list_match SQL functions,
  -- and a nested LANGUAGE sql function is parsed and planned again on every outer call (see the
  -- migration education_list_rpcs_no_per_row_replan.sql). Same expression as the SQL original.
  if p_skip = p_key or p_filters is null or not (p_filters ? p_key) then
    return true;
  end if;
  return case
    when p_filters -> p_key ->> 'kind' = 'select' then
      jsonb_array_length(coalesce(p_filters -> p_key -> 'values', '[]'::jsonb)) = 0
      or coalesce(nullif(btrim(p_value), ''), '__none__') in (
        select jsonb_array_elements_text(p_filters -> p_key -> 'values'))
    when p_filters -> p_key ->> 'kind' = 'text' then
      coalesce(p_filters -> p_key ->> 'value', '') = ''
      or position(lower(p_filters -> p_key ->> 'value') in lower(coalesce(p_value, ''))) > 0
    else true
  end;
end
$function$;

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
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND (lower(coalesce(p_scope, '')) NOT IN ('orgs', 'team')
           OR platform.shown_to_lists(b.s_shown, b.s_visibility, b.s_by, b.s_org, (SELECT auth.uid()), (SELECT platform.shown_to_context('fc_set'))))
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
         pg.total_count
  FROM page pg
  ORDER BY
    CASE WHEN p_ascending THEN pg.sort_key END ASC NULLS LAST,
    CASE WHEN NOT p_ascending THEN pg.sort_key END DESC NULLS LAST,
    pg.s_id
$function$;

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
