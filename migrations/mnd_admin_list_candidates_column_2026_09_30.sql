-- based-on: mandate._admin_list_read(text, text, text, uuid, text, jsonb, text, text, integer, integer, jsonb) 1cf6de22c6627e0bdda47dc5566a7598b6d932b16ecf14fc9a42dc1373f2520e
--
-- mnd_admin_list_candidates_column_2026_09_30.sql
--
-- THE CANDIDATES COLUMN (Mandate Candidates, PLAN §2.6 / item F4). Arman,
-- 2026-09-28: "each one that comes in showing up as a count on the mandate list
-- and page". The one list read (public.mnd_admin_list → mandate._admin_list_read)
-- answers, on each PAGE row, the mandate's open candidate:
--
--   candidate: null                                  no open candidate
--   candidate: { id, status ('collecting'|'ready'),
--                runs_wanted, runs_in, runs_failed,
--                runs_stopped, runs_regressed,
--                stalled, open_count, recommendation }
--
-- Counts are DERIVED from mandate.candidate_run every read, never stored twice
-- (PLAN §2.1): runs_in = terminal pairs (completed|stopped|failed|timed_out),
-- runs_failed = failed|timed_out, runs_regressed = verdict 'regressed' — the
-- same rules as aidream candidates/api.py `_counts`. `stalled` (P17) = still
-- collecting and nothing new since `mandates.candidate_stall_days`
-- (platform.knob_resolve, the knob C0 seeded; the server reads the same knob).
-- When a mandate has more than one open candidate (one per rung, P7) the cell
-- speaks for the one most worth attention — collecting first, then newest — the
-- same order as GET /mandates/{key}/candidates `active`; `open_count` says how
-- many there are.
--
-- SECURITY INVOKER throughout: the read runs as the platform admin who asked,
-- and candidate rows answer through their own row security (platform_admin_read).
-- Only the page rows (≤ p_limit) are summarised — never the corpus.
--
-- Function replacement + one new helper; no table touched, no long lock.
-- Re-appliable (CREATE OR REPLACE). Inverse:
-- migrations/inverse/mnd_admin_list_candidates_column_2026_09_30_down.sql

CREATE OR REPLACE FUNCTION mandate._admin_list_candidate(p_mandate_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH open_c AS (
    SELECT c.id, c.status, c.runs_wanted, c.recommendation, c.created_at,
           count(*) OVER () AS open_count
    FROM mandate.candidate c
    WHERE c.mandate_id = p_mandate_id
      AND c.status IN ('collecting', 'ready')
  ),
  lead AS (
    SELECT o.* FROM open_c o
    ORDER BY (o.status = 'collecting') DESC, o.created_at DESC
    LIMIT 1
  ),
  runs AS (
    SELECT
      count(*) FILTER (WHERE r.status IN ('completed', 'stopped', 'failed', 'timed_out')) AS runs_in,
      count(*) FILTER (WHERE r.status IN ('failed', 'timed_out')) AS runs_failed,
      count(*) FILTER (WHERE r.status = 'stopped') AS runs_stopped,
      count(*) FILTER (WHERE r.verdict = 'regressed') AS runs_regressed,
      max(r.created_at) AS last_run_at
    FROM mandate.candidate_run r
    WHERE r.candidate_id = (SELECT l.id FROM lead l)
  )
  SELECT jsonb_build_object(
    'id', l.id,
    'status', l.status,
    'runs_wanted', l.runs_wanted,
    'runs_in', r.runs_in,
    'runs_failed', r.runs_failed,
    'runs_stopped', r.runs_stopped,
    'runs_regressed', r.runs_regressed,
    'stalled', l.status = 'collecting'
               AND greatest(l.created_at, coalesce(r.last_run_at, l.created_at))
                   < now() - make_interval(days => coalesce(
                       (platform.knob_resolve('mandates', 'candidate_stall_days', NULL, NULL, NULL) #>> '{}')::int, 7)),
    'open_count', l.open_count,
    'recommendation', l.recommendation)
  FROM lead l CROSS JOIN runs r
$function$;

COMMENT ON FUNCTION mandate._admin_list_candidate(uuid) IS
  'Mandate Candidates (F4): one page row''s open-candidate cell for the admin mandate list — counts derived from mandate.candidate_run, stalled per mandates.candidate_stall_days. NULL when none is open.';

CREATE OR REPLACE FUNCTION mandate._admin_list_read(p_lane text, p_mode text, p_scope text, p_org_id uuid, p_search text, p_filters jsonb, p_sort text, p_dir text, p_limit integer, p_offset integer, p_facts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_lane  text := lower(coalesce(p_lane, ''));
  v_mode  text := lower(coalesce(p_mode, 'page'));
  v_scope text := lower(coalesce(p_scope, 'system'));
  v_q     text := NULLIF(lower(btrim(coalesce(p_search, ''))), '');
  v_f     jsonb := coalesce(p_filters, '{}'::jsonb);
  v_facts jsonb := coalesce(p_facts, '{}'::jsonb);
  v_dir   text := CASE WHEN lower(coalesce(p_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_sort  text := coalesce(NULLIF(p_sort, ''), 'name');
  v_sys   uuid;
  v_out   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501',
      message = 'Sign in to list mandates.';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION USING errcode = '42501',
      message = 'Only a platform administrator can open the admin mandate list.',
      hint    = 'Use your own mandates page instead (public.mnd_list_scoped).';
  END IF;
  IF v_mode NOT IN ('page', 'counts', 'facets', 'agents') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_mode %L is not a mode of the admin mandate list.', p_mode),
      hint    = 'Use page, counts, facets or agents.';
  END IF;
  -- THE TWO LANES (Arman, 2026-09-26). The admin mandate page manages the
  -- SYSTEM mandates and nothing else; looking into an organization's or a
  -- person's mandates is tech support and lives on its own route.
  IF v_lane = 'system' THEN
    IF v_scope <> 'system' THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('The admin mandate list manages system mandates only; %L is not one of its views.', p_scope),
        hint    = 'Look up an organization''s or a person''s mandates with public.mnd_admin_support_list (Mandate support lookup).';
    END IF;
  ELSIF v_lane = 'support' THEN
    IF v_scope NOT IN ('orgs', 'users', 'all') THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('p_scope %L is not a view of the mandate support lookup.', p_scope),
        hint    = 'Use orgs, users or all. System mandates are managed on the admin mandate list (public.mnd_admin_list).';
    END IF;
  ELSE
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_lane %L is not a lane of the admin mandate read.', p_lane),
      hint    = 'Use system (public.mnd_admin_list) or support (public.mnd_admin_support_list).';
  END IF;

  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';

  -- (rows come from mandate._admin_list_rows — one build per call)

  IF v_mode = 'agents' THEN
    SELECT coalesce(jsonb_agg(DISTINCT a), '[]'::jsonb) INTO v_out FROM (
      SELECT r.h_agent_id AS a FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE r.h_agent_id IS NOT NULL AND (v_lane = 'support' OR r.is_system)
      UNION
      SELECT coalesce(v.agent_id, b.holder_id)
      FROM mandate.binding b
      JOIN mandate._admin_list_rows(v_facts, v_q) r ON r.id = b.mandate_id
      LEFT JOIN agent.definition_version v ON v.id = b.holder_version_id
      WHERE b.deleted_at IS NULL AND coalesce(b.holder_type, 'agent') = 'agent'
        AND coalesce(v.agent_id, b.holder_id) IS NOT NULL
        AND (v_lane = 'support' OR r.is_system)
    ) x;
    RETURN v_out;
  END IF;

  IF v_mode = 'counts' THEN
    WITH narrowed AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (v_q IS NULL OR r.score > 0) AND mandate._admin_list_match(r.vals, v_f)
    )
    SELECT CASE WHEN v_lane = 'system' THEN
      -- The management page has ONE corpus and no tabs: the system's own.
      jsonb_build_object('system', (SELECT count(*) FROM narrowed n WHERE n.is_system))
    ELSE jsonb_build_object(
      'users',  (SELECT count(*) FROM narrowed n WHERE mandate._admin_owner_level(n.organization_id, n.is_system) = 'user'),
      'all',    (SELECT count(*) FROM narrowed n),
      'orgs',   (SELECT count(*) FROM narrowed n WHERE mandate._admin_owner_level(n.organization_id, n.is_system) = 'org'),
      'orgs_narrow', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.organization_id, 'label', o.home_label, 'count', o.n)
                         ORDER BY o.home_label)
        FROM (SELECT n.organization_id, n.home_label, count(*) AS n
              FROM narrowed n WHERE mandate._admin_owner_level(n.organization_id, n.is_system) = 'org' AND n.organization_id IS NOT NULL
              GROUP BY 1, 2) o), '[]'::jsonb),
      'users_narrow', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', u.organization_id, 'label', u.owner_label, 'count', u.n)
                         ORDER BY u.owner_label)
        FROM (SELECT n.organization_id, mandate._admin_owner_label(n.organization_id, n.is_system) AS owner_label, count(*) AS n
              FROM narrowed n WHERE mandate._admin_owner_level(n.organization_id, n.is_system) = 'user' AND n.organization_id IS NOT NULL
              GROUP BY 1, 2) u), '[]'::jsonb)) END
    INTO v_out;
    RETURN v_out;
  END IF;

  IF v_mode = 'facets' THEN
    WITH scoped AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (CASE v_scope
               WHEN 'system' THEN r.is_system
               WHEN 'all'    THEN true
               WHEN 'orgs'   THEN mandate._admin_owner_level(r.organization_id, r.is_system) = 'org' AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               WHEN 'users'  THEN mandate._admin_owner_level(r.organization_id, r.is_system) = 'user' AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               ELSE false
             END)
        AND (v_q IS NULL OR r.score > 0)
    )
    SELECT coalesce(jsonb_object_agg(c.col, c.opts), '{}'::jsonb) INTO v_out
    FROM (
      SELECT t.col, jsonb_agg(jsonb_build_object('value', t.val, 'count', t.n)
                              ORDER BY t.n DESC, t.val) AS opts
      FROM (
        -- One pass: each row's own keys, the match only when a filter is set.
        SELECT e.key AS col, v.val, count(*) AS n
        FROM scoped r
        CROSS JOIN LATERAL jsonb_each(r.vals) e
        CROSS JOIN LATERAL (SELECT DISTINCT x AS val
                            FROM jsonb_array_elements_text(e.value) x) v
        WHERE e.key NOT IN ('id', 'goal', 'updatedAt', 'createdAt')
          AND (v_f = '{}'::jsonb OR mandate._admin_list_match(r.vals, v_f, e.key))
        GROUP BY e.key, v.val
      ) t
      GROUP BY t.col
    ) c;
    RETURN v_out;
  END IF;

  -- page
  WITH scoped AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (CASE v_scope
               WHEN 'system' THEN r.is_system
               WHEN 'all'    THEN true
               WHEN 'orgs'   THEN mandate._admin_owner_level(r.organization_id, r.is_system) = 'org' AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               WHEN 'users'  THEN mandate._admin_owner_level(r.organization_id, r.is_system) = 'user' AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               ELSE false
             END)
        AND (v_q IS NULL OR r.score > 0)
    ),
  matched AS (
    SELECT r.*, count(*) OVER () AS total
    FROM scoped r
    WHERE mandate._admin_list_match(r.vals, v_f)
  ),
  ordered AS MATERIALIZED (
    SELECT m.* FROM matched m
    ORDER BY
      CASE WHEN v_q IS NOT NULL THEN m.score END DESC,
      CASE WHEN v_q IS NULL AND v_dir = 'asc'  AND jsonb_typeof(m.sortv->v_sort) = 'number'
           THEN (m.sortv->>v_sort)::numeric END ASC,
      CASE WHEN v_q IS NULL AND v_dir = 'desc' AND jsonb_typeof(m.sortv->v_sort) = 'number'
           THEN (m.sortv->>v_sort)::numeric END DESC,
      CASE WHEN v_q IS NULL AND v_dir = 'asc'  AND jsonb_typeof(m.sortv->v_sort) = 'string'
           THEN m.sortv->>v_sort END ASC,
      CASE WHEN v_q IS NULL AND v_dir = 'desc' AND jsonb_typeof(m.sortv->v_sort) = 'string'
           THEN m.sortv->>v_sort END DESC,
      CASE WHEN v_q IS NULL AND NOT (m.sortv ? v_sort) THEN lower(m.name) END ASC,
      m.mandate_key ASC
    LIMIT greatest(coalesce(p_limit, 50), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  ),
  -- ── The page's own rows (header, 3) ─────────────────────────────────────
  page_defs AS MATERIALIZED (
    SELECT d.* FROM mandate.definition d
    WHERE d.deleted_at IS NULL AND d.id IN (SELECT o.id FROM ordered o)
  ),
  page_binds AS MATERIALIZED (
    SELECT b.* FROM mandate.binding b
    WHERE b.deleted_at IS NULL AND b.mandate_id IN (SELECT o.id FROM ordered o)
  ),
  rungs AS (
    SELECT coalesce(d.default_holder_type, 'agent') AS r_type,
           d.default_holder_id AS r_id, d.default_holder_version_id AS r_vid
    FROM page_defs d
    UNION ALL
    SELECT coalesce(b.holder_type, 'agent'), b.holder_id, b.holder_version_id
    FROM page_binds b
  ),
  agent_versions AS MATERIALIZED (
    SELECT v.id, v.agent_id, v.version_number, v.name,
           v.variable_definitions, v.context_policies, v.output_schema
    FROM agent.definition_version v
    WHERE v.id IN (SELECT r.r_vid FROM rungs r WHERE r.r_type <> 'workflow' AND r.r_vid IS NOT NULL)
  ),
  agents AS (
    SELECT a.id, a.name, a.version, a.is_archived, a.agent_type, a.auto_context_disabled,
           a.variable_definitions, a.context_policies, a.output_schema
    FROM agent.definition a
    WHERE a.id IN (SELECT r.r_id FROM rungs r WHERE r.r_type <> 'workflow' AND r.r_id IS NOT NULL
                   UNION SELECT av.agent_id FROM agent_versions av WHERE av.agent_id IS NOT NULL)
  ),
  workflows AS (
    SELECT w.id, w.name, w.is_archived
    FROM workflow.definition w
    WHERE w.id IN (SELECT r.r_id FROM rungs r WHERE r.r_type = 'workflow' AND r.r_id IS NOT NULL)
  ),
  workflow_versions AS (
    SELECT wv.id, wv.definition_id, wv.version_number
    FROM workflow.definition_version wv
    WHERE wv.id IN (SELECT r.r_vid FROM rungs r WHERE r.r_type = 'workflow' AND r.r_vid IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'total', coalesce((SELECT max(total) FROM matched), 0),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'mandate_key', o.mandate_key,
        'customized_by', to_jsonb(o.customized_by),
        'serves', to_jsonb(o.serves),
        'serves_detail', to_jsonb(o.serves_detail),
        'backs_count', o.backs_count,
        'home_label', o.home_label,
        'owner_level', mandate._admin_owner_level(o.organization_id, o.is_system),
        'owner_label', mandate._admin_owner_label(o.organization_id, o.is_system),
        'feature_label', o.feature_label,
        'contract_check', o.vals->'contractCheck'->>0,
        -- Mandate Candidates (F4): the open candidate's cell, derived from its
        -- child rows every read (never stored twice). NULL = no open candidate.
        'candidate', mandate._admin_list_candidate(o.id))) FROM ordered o), '[]'::jsonb),
    'console', jsonb_build_object(
      'mandates', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.mandate_key) FROM page_defs d), '[]'::jsonb),
      'bindings', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at) FROM page_binds b), '[]'::jsonb),
      'agents', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM agents a), '[]'::jsonb),
      'versions', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM agent_versions v), '[]'::jsonb),
      'workflows', coalesce((SELECT jsonb_agg(to_jsonb(w)) FROM workflows w), '[]'::jsonb),
      'workflow_versions', coalesce((SELECT jsonb_agg(to_jsonb(wv)) FROM workflow_versions wv), '[]'::jsonb)))
  INTO v_out;
  RETURN v_out;
END;
$function$
;
