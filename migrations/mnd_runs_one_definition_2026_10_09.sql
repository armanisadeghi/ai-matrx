-- based-on: mandate.admin_run_counts(timestamp with time zone) be8285dca52e816e760facec6f962a99584b78fff3edf8e70d7eff7487f12c22
-- based-on: mandate.run_history(text, uuid, text, uuid, uuid, text, text, boolean, integer, integer) 5812c92baaefd3fad3b29ea4921f27ca2a7d6efcce425c91fa3e58c5ff677d24
-- based-on: mandate._admin_list_read(text, text, text, uuid, text, jsonb, text, text, integer, integer, jsonb) b3e8d4fcbc0f10f7053edc7882c4fc157f70c23a49bf08841f2cc132adb856e5
--
-- ONE DEFINITION OF A MANDATE'S RUNS (2026-10-09; features/mandates/FEATURE.md
-- "A mandate's runs"). The admin list counted runs one way and costed them from
-- the usage ledger another way: Agent Structure Builder showed 221 runs at $0.00,
-- Masterwork — Coherence Partner $109.05 with 0 runs.
--
--   * mandate.admin_run_counts — runs, last run AND cost (+ how many runs and how
--     much cost are inferred) from the SAME rows; adds the agent-run lane
--     (runtime.global_execution labelled mandate:<key>); reads request metadata
--     once per row (was three de-TOASTs) so it is not slower than before.
--   * mandate.run_history — the same agent-run lane (run_kind 'agent_run'), and
--     cost_total / inferred_total / inferred_cost over every matching run.
--   * mandate._admin_list_read — a sorted column keeps its order while searching;
--     relevance leads only on the default order (Name A→Z).
-- No table, index or data changes. Same signatures. Inverse:
-- migrations/inverse/mnd_runs_one_definition_2026_10_09a_down.sql.

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION mandate.admin_run_counts(p_since timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to see runs.';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION USING errcode = '42501',
      message = 'Only a platform administrator can see every mandate''s run count.';
  END IF;
  p_since := coalesce(p_since, now() - interval '30 days');
  -- ONE DEFINITION OF A MANDATE'S RUNS (features/mandates/FEATURE.md "A mandate's
  -- runs"), the same lanes as mandate.run_history's mandate view, counted per key
  -- for every mandate at once. Runs, last run AND cost come from the same rows:
  --   recorded  a request tagged with the mandate (metadata.mandate_key /
  --             source_feature mandate:<key>) — cost user_request.total_cost
  --   recorded  a workflow run the mandate's chain ended on — cost its requests
  --   recorded  an agent run labelled mandate:<key> (runtime.global_execution)
  --             that is not itself a tagged request of that key and not inside
  --             an untagged request — one run per request id, cost its executions
  --   inferred  an untagged request of the mandate's Holder agent (history from
  --             before runs carried the mandate's name) — cost total_cost
  -- Candidate legs and Test-page runs stay out.
  WITH holders AS (
    SELECT md.mandate_key AS k, md.default_holder_id AS aid
    FROM mandate.definition md
    WHERE md.default_holder_type = 'agent' AND md.default_holder_id IS NOT NULL AND md.deleted_at IS NULL
    UNION
    SELECT md2.mandate_key, mb.holder_id
    FROM mandate.binding mb
    JOIN mandate.definition md2 ON md2.id = mb.mandate_id
    WHERE mb.holder_type = 'agent' AND mb.holder_id IS NOT NULL AND mb.deleted_at IS NULL
  ),
  ur AS (
    -- metadata is read ONCE per request (jsonb_each): every ->> / ? on the
    -- column de-TOASTs the whole ~5 kB value again (~230 ms per pass for 30 days).
    SELECT u.created_at, u.agent_id, u.total_cost,
           coalesce(mm.m ->> 'mandate_key', substring(u.source_feature from '^mandate:(.+)$')) AS k,
           (u.source_feature LIKE 'mandate:%' OR mm.m ? 'mandate_key') AS tagged,
           u.origin_class, u.conversation_id, u.id
    FROM chat.user_request u
    CROSS JOIN LATERAL (
      SELECT coalesce(jsonb_object_agg(j.key, j.value), '{}'::jsonb) AS m
      FROM jsonb_each(u.metadata) j
      WHERE j.key IN ('mandate_key', 'mandate_candidate')) mm
    WHERE u.created_at >= p_since AND u.deleted_at IS NULL
      AND NOT (mm.m ? 'mandate_candidate')
      AND coalesce(u.source_feature, '') NOT LIKE 'mandate\_candidate:%'
  ),
  ok AS (
    SELECT ur.* FROM ur
    WHERE NOT EXISTS (
        SELECT 1 FROM chat.conversation tc
        WHERE tc.id = ur.conversation_id
          AND tc.metadata #>> '{mandate_run,placement,test_run}' = 'true')
  ),
  tagged AS (
    SELECT o.k, count(*) AS n, max(o.created_at) AS last_at, sum(o.total_cost) AS cost FROM ok o
    WHERE o.tagged AND o.k IS NOT NULL AND o.origin_class IS DISTINCT FROM 'workflow'
      AND NOT EXISTS (
        SELECT 1 FROM chat.request rq
        JOIN chat.conversation cv ON cv.id = rq.conversation_id
        WHERE rq.user_request_id = o.id AND cv.conversation_type = 'mandate_candidate')
    GROUP BY o.k
  ),
  by_agent AS (
    SELECT o.agent_id, count(*) AS n, max(o.created_at) AS last_at, sum(o.total_cost) AS cost FROM ok o
    WHERE o.k IS NULL AND o.agent_id IS NOT NULL GROUP BY o.agent_id
  ),
  holder_runs AS (
    SELECT h.k, sum(b.n)::bigint AS n, max(b.last_at) AS last_at, sum(b.cost) AS cost
    FROM holders h JOIN by_agent b ON b.agent_id = h.aid GROUP BY h.k
  ),
  wf AS (
    SELECT (r.metadata -> '_mandate' -> 'chain' ->> -1) AS k, count(*) AS n, max(r.created_at) AS last_at,
           sum((SELECT sum(rq.cost) FROM chat.request rq
                 WHERE rq.execution_kind = 'workflow_run' AND rq.execution_id = r.id AND rq.deleted_at IS NULL)) AS cost
    FROM workflow.run r
    WHERE r.created_at >= p_since AND r.metadata ? '_mandate' AND r.deleted_at IS NULL
      AND (r.metadata -> '_mandate' -> 'chain' ->> -1) IS NOT NULL
      AND NOT (r.metadata ? 'mandate_candidate')
      AND NOT EXISTS (SELECT 1 FROM mandate.candidate_run cr WHERE cr.candidate_wf_run_id = r.id)
    GROUP BY 1
  ),
  agent_runs AS (
    SELECT x.k, count(*) AS n, max(x.last_at) AS last_at, sum(x.cost) AS cost
    FROM (
      SELECT coalesce(e.context ->> 'mandate_key', substring(e.context ->> 'agent_run_label' from '^mandate:(.+)$')) AS k,
             coalesce(e.request_id, e.id) AS run_id, max(e.created_at) AS last_at, sum(e.cost) AS cost
      FROM runtime.global_execution e
      LEFT JOIN chat.user_request u ON u.id = e.request_id
      WHERE e.created_at >= p_since
        -- = ANY(every mandate key) reaches global_execution_ctx_mandate_idx (~50 ms)
        -- instead of scanning every execution of the period (~1.3 s).
        AND coalesce(e.context ->> 'mandate_key', substring(e.context ->> 'agent_run_label' from '^mandate:(.+)$'))
            = ANY (ARRAY(SELECT md.mandate_key FROM mandate.definition md WHERE md.deleted_at IS NULL))
        AND (u.id IS NULL
             OR coalesce(u.metadata ->> 'mandate_key', substring(u.source_feature from '^mandate:(.+)$'))
                IS DISTINCT FROM coalesce(e.context ->> 'mandate_key', substring(e.context ->> 'agent_run_label' from '^mandate:(.+)$'))
                AND coalesce(u.metadata ->> 'mandate_key', substring(u.source_feature from '^mandate:(.+)$')) IS NOT NULL)
      GROUP BY 1, 2) x
    GROUP BY x.k
  )
  SELECT coalesce(jsonb_object_agg(g.k, jsonb_build_object(
           'runs', g.n, 'last', g.last_at, 'cost', g.cost,
           'inferred_runs', g.inferred_n, 'inferred_cost', g.inferred_cost)), '{}'::jsonb)
  INTO v_out
  FROM (
    SELECT u.k, sum(u.n)::bigint AS n, max(u.last_at) AS last_at, coalesce(sum(u.cost), 0) AS cost,
           coalesce(sum(u.n) FILTER (WHERE u.inferred), 0)::bigint AS inferred_n,
           coalesce(sum(u.cost) FILTER (WHERE u.inferred), 0) AS inferred_cost
    FROM (SELECT k, n, last_at, cost, false AS inferred FROM tagged
          UNION ALL SELECT k, n, last_at, cost, true FROM holder_runs
          UNION ALL SELECT k, n, last_at, cost, false FROM wf
          UNION ALL SELECT k, n, last_at, cost, false FROM agent_runs) u
    GROUP BY u.k) g;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION mandate.run_history(p_mandate_key text DEFAULT NULL::text, p_agent_id uuid DEFAULT NULL::uuid, p_view text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_sort text DEFAULT 'started_at'::text, p_desc boolean DEFAULT true, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_view   text := lower(coalesce(p_view, 'mine'));
  v_key    text := NULLIF(btrim(coalesce(p_mandate_key, '')), '');
  v_status text := NULLIF(lower(btrim(coalesce(p_status, ''))), '');
  v_sort   text := lower(coalesce(NULLIF(btrim(p_sort), ''), 'started_at'));
  v_desc   boolean := coalesce(p_desc, true);
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_out    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to see runs.';
  END IF;
  IF (v_key IS NULL) = (p_agent_id IS NULL) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Name one mandate (p_mandate_key) or one agent (p_agent_id).';
  END IF;
  IF v_view NOT IN ('mine', 'org', 'platform') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('%L is not a run-history view.', p_view), hint = 'Use mine, org or platform.';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('succeeded', 'warned', 'failed', 'stopped', 'waiting', 'running') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('%L is not a run status.', p_status),
      hint = 'Use succeeded, warned, failed, stopped, waiting or running.';
  END IF;
  IF v_sort NOT IN ('started_at', 'duration', 'cost', 'status', 'level') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('%L is not a run sort.', p_sort), hint = 'Use started_at, duration, cost, status or level.';
  END IF;
  IF v_view = 'org' THEN
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION USING errcode = '22023', message = 'Name the organization whose runs to list (p_org_id).';
    END IF;
    IF NOT (public.is_org_admin(p_org_id) OR public.is_platform_admin()) THEN
      RAISE EXCEPTION USING errcode = '42501',
        message = 'Only an owner or admin of this organization can see everyone''s runs.',
        hint = 'Members see their own runs (view mine).';
    END IF;
  ELSIF v_view = 'platform' THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION USING errcode = '42501',
        message = 'Only a platform administrator can see every run on the platform.',
        hint = 'Use view mine, or org for an organization you manage.';
    END IF;
  END IF;

  WITH raw AS (
    SELECT
      'conversation'::text AS run_kind, u.id AS run_id, u.created_at, u.completed_at,
      u.status AS raw_status, u.created_by, u.organization_id, u.origin_class,
      u.metadata -> 'mandate_resolution' AS res, u.metadata -> 'mandate_holder' AS hold,
      u.agent_id, NULL::uuid AS workflow_definition_id,
      u.total_cost AS cost, u.total_duration_ms::bigint AS duration_ms,
      u.total_tokens::bigint AS tokens,
      NULLIF(left(coalesce(u.error, ''), 300), '') AS error_text,
      v_key AS mandate_key, u.conversation_id AS direct_conversation_id, 'mandate'::text AS found_by
    FROM chat.user_request u
    WHERE v_key IS NOT NULL
      AND (u.source_feature LIKE 'mandate:%' OR u.metadata ? 'mandate_key')
      AND coalesce(u.metadata ->> 'mandate_key', substring(u.source_feature from '^mandate:(.+)$')) = v_key
      AND u.deleted_at IS NULL
      AND u.origin_class IS DISTINCT FROM 'workflow'
      AND NOT (u.metadata ? 'mandate_candidate')
      AND NOT EXISTS (
        SELECT 1 FROM chat.conversation tc
        WHERE tc.id = u.conversation_id
          AND tc.metadata #>> '{mandate_run,placement,test_run}' = 'true')
      AND coalesce(u.source_feature, '') NOT LIKE 'mandate\_candidate:%'
      AND NOT EXISTS (
        SELECT 1 FROM chat.request rq
        JOIN chat.conversation cv ON cv.id = rq.conversation_id
        WHERE rq.user_request_id = u.id AND cv.conversation_type = 'mandate_candidate')
    UNION ALL
    SELECT
      'conversation'::text, u.id, u.created_at, u.completed_at, u.status, u.created_by,
      u.organization_id, u.origin_class,
      u.metadata -> 'mandate_resolution', u.metadata -> 'mandate_holder',
      u.agent_id, NULL::uuid, u.total_cost, u.total_duration_ms::bigint, u.total_tokens::bigint,
      NULLIF(left(coalesce(u.error, ''), 300), ''),
      coalesce(u.metadata ->> 'mandate_key', substring(u.source_feature from '^mandate:(.+)$')),
      u.conversation_id, 'agent'::text
    FROM chat.user_request u
    WHERE p_agent_id IS NOT NULL AND u.agent_id = p_agent_id AND u.deleted_at IS NULL
    UNION ALL
    SELECT
      'conversation'::text, u.id, u.created_at, u.completed_at, u.status, u.created_by,
      u.organization_id, u.origin_class,
      u.metadata -> 'mandate_resolution', u.metadata -> 'mandate_holder',
      u.agent_id, NULL::uuid, u.total_cost, u.total_duration_ms::bigint, u.total_tokens::bigint,
      NULLIF(left(coalesce(u.error, ''), 300), ''),
      v_key, u.conversation_id, 'holder_agent'::text
    FROM chat.user_request u
    WHERE v_key IS NOT NULL
      AND u.agent_id IN (
        SELECT md.default_holder_id FROM mandate.definition md
        WHERE md.mandate_key = v_key AND md.default_holder_type = 'agent' AND md.deleted_at IS NULL
        UNION
        SELECT mb.holder_id FROM mandate.binding mb
        JOIN mandate.definition md2 ON md2.id = mb.mandate_id
        WHERE md2.mandate_key = v_key AND mb.holder_type = 'agent' AND mb.deleted_at IS NULL)
      AND u.deleted_at IS NULL
      AND coalesce(u.metadata ->> 'mandate_key', substring(u.source_feature from '^mandate:(.+)$')) IS NULL
      AND coalesce(u.source_feature, '') NOT LIKE 'mandate\_candidate:%'
      AND NOT (u.metadata ? 'mandate_candidate')
      AND NOT EXISTS (
        SELECT 1 FROM chat.conversation tc
        WHERE tc.id = u.conversation_id
          AND tc.metadata #>> '{mandate_run,placement,test_run}' = 'true')
    UNION ALL
    SELECT
      'workflow'::text, r.id, r.created_at, r.completed_at, r.status, r.created_by,
      r.organization_id, NULL::text, r.metadata -> '_mandate' -> 'resolution', NULL::jsonb,
      NULL::uuid, r.definition_id,
      (SELECT sum(rq.cost) FROM chat.request rq
        WHERE rq.execution_kind = 'workflow_run' AND rq.execution_id = r.id AND rq.deleted_at IS NULL),
      CASE WHEN r.completed_at IS NOT NULL
        THEN (extract(epoch FROM (r.completed_at - coalesce(r.started_at, r.created_at))) * 1000)::bigint END,
      (SELECT sum(rq.total_tokens) FROM chat.request rq
        WHERE rq.execution_kind = 'workflow_run' AND rq.execution_id = r.id AND rq.deleted_at IS NULL),
      NULLIF(left(coalesce(r.error ->> 'message', r.error #>> '{}', ''), 300), ''),
      v_key, NULL::uuid, 'mandate'::text
    FROM workflow.run r
    WHERE v_key IS NOT NULL
      AND r.metadata ? '_mandate'
      AND (r.metadata -> '_mandate' -> 'chain' ->> -1) = v_key
      AND r.deleted_at IS NULL
      AND NOT (r.metadata ? 'mandate_candidate')
      AND NOT EXISTS (SELECT 1 FROM mandate.candidate_run cr WHERE cr.candidate_wf_run_id = r.id)
    UNION ALL
    -- An agent run labelled mandate:<key> (runtime.global_execution) that is not
    -- itself a tagged request of this mandate and not inside an untagged request:
    -- one run per request id, its cost the sum of its executions. The SAME lane as
    -- mandate.admin_run_counts (features/mandates/FEATURE.md "A mandate's runs").
    SELECT
      'agent_run'::text, ex.run_id, ex.created_at, ex.completed_at, ex.raw_status, ex.created_by,
      ex.organization_id, 'child_agent'::text, NULL::jsonb, NULL::jsonb,
      ex.agent_id, NULL::uuid, ex.cost, ex.duration_ms, ex.tokens, ex.error_text,
      v_key, NULL::uuid, 'mandate'::text
    FROM (
      SELECT coalesce(e.request_id, e.id) AS run_id,
        min(e.created_at) AS created_at,
        CASE WHEN bool_and(e.ended_at IS NOT NULL) THEN max(e.ended_at) END AS completed_at,
        CASE WHEN bool_or(e.status = 'failed') THEN 'failed'
             WHEN bool_or(e.status NOT IN ('completed', 'failed', 'cancelled')) THEN 'running'
             WHEN bool_or(e.status = 'cancelled') THEN 'cancelled'
             ELSE 'completed' END AS raw_status,
        (array_agg(CASE WHEN pg_input_is_valid(e.context ->> 'user_id', 'uuid') THEN (e.context ->> 'user_id')::uuid END
           ORDER BY e.created_at) FILTER (WHERE pg_input_is_valid(e.context ->> 'user_id', 'uuid')))[1] AS created_by,
        (array_agg(e.organization_id ORDER BY e.created_at) FILTER (WHERE e.organization_id IS NOT NULL))[1] AS organization_id,
        (array_agg((e.context ->> 'agent_id')::uuid ORDER BY e.created_at)
           FILTER (WHERE pg_input_is_valid(e.context ->> 'agent_id', 'uuid')))[1] AS agent_id,
        sum(e.cost) AS cost,
        CASE WHEN bool_and(e.ended_at IS NOT NULL)
          THEN (extract(epoch FROM (max(e.ended_at) - min(coalesce(e.started_at, e.created_at)))) * 1000)::bigint END AS duration_ms,
        sum(coalesce(NULLIF(e.meters ->> 'input_tokens', '')::bigint, 0)
          + coalesce(NULLIF(e.meters ->> 'output_tokens', '')::bigint, 0))::bigint AS tokens,
        NULLIF(left(coalesce((array_agg(coalesce(e.error ->> 'message', e.error #>> '{}')
           ORDER BY e.created_at) FILTER (WHERE e.error IS NOT NULL))[1], ''), 300), '') AS error_text
      FROM runtime.global_execution e
      LEFT JOIN chat.user_request u ON u.id = e.request_id
      WHERE v_key IS NOT NULL
        AND coalesce(e.context ->> 'mandate_key', substring(e.context ->> 'agent_run_label' from '^mandate:(.+)$')) = v_key
        AND (u.id IS NULL
             OR coalesce(u.metadata ->> 'mandate_key', substring(u.source_feature from '^mandate:(.+)$')) IS DISTINCT FROM v_key
                AND coalesce(u.metadata ->> 'mandate_key', substring(u.source_feature from '^mandate:(.+)$')) IS NOT NULL)
      GROUP BY 1) ex
  ),
  normalized AS (
    SELECT raw.*,
      CASE
        WHEN raw.raw_status = 'completed' THEN
          CASE WHEN coalesce((raw.res ->> 'output_warned')::boolean, false)
                 OR jsonb_array_length(coalesce(NULLIF(raw.res -> 'output_missing_keys', 'null'::jsonb), '[]'::jsonb)) > 0
            THEN 'warned' ELSE 'succeeded' END
        WHEN raw.raw_status IN ('failed', 'errored') THEN 'failed'
        WHEN raw.raw_status IN ('cancelled', 'abandoned', 'interrupted') THEN 'stopped'
        WHEN raw.raw_status IN ('paused', 'awaiting_input', 'pausing') THEN 'waiting'
        ELSE 'running'
      END AS status
    FROM raw
  ),
  seat AS (
    SELECT n.* FROM normalized n
    WHERE CASE v_view
        WHEN 'mine' THEN n.created_by = v_uid AND (p_org_id IS NULL OR n.organization_id = p_org_id)
        WHEN 'org' THEN n.organization_id = p_org_id AND (p_user_id IS NULL OR n.created_by = p_user_id)
        ELSE (p_org_id IS NULL OR n.organization_id = p_org_id)
          AND (p_user_id IS NULL OR n.created_by = p_user_id)
      END
  ),
  filtered AS (
    SELECT s.*,
      CASE s.status WHEN 'failed' THEN 0 WHEN 'warned' THEN 1 WHEN 'stopped' THEN 2
        WHEN 'waiting' THEN 3 WHEN 'running' THEN 4 ELSE 5 END AS status_rank,
      CASE s.res ->> 'rung' WHEN 'system' THEN 0 WHEN 'org' THEN 1 WHEN 'user' THEN 2 WHEN 'run' THEN 3 END AS level_rank
    FROM seat s WHERE v_status IS NULL OR s.status = v_status
  ),
  page AS (
    SELECT f.*, row_number() OVER (ORDER BY
      CASE WHEN v_desc THEN
        CASE v_sort WHEN 'duration' THEN f.duration_ms::numeric WHEN 'cost' THEN f.cost
          WHEN 'status' THEN f.status_rank::numeric WHEN 'level' THEN f.level_rank::numeric END
      END DESC NULLS LAST,
      CASE WHEN NOT v_desc THEN
        CASE v_sort WHEN 'duration' THEN f.duration_ms::numeric WHEN 'cost' THEN f.cost
          WHEN 'status' THEN f.status_rank::numeric WHEN 'level' THEN f.level_rank::numeric END
      END ASC NULLS LAST,
      CASE WHEN v_sort = 'started_at' AND NOT v_desc THEN f.created_at END ASC,
      f.created_at DESC, f.run_id DESC) AS ord
    FROM filtered f
    ORDER BY ord
    LIMIT v_limit OFFSET v_offset
  ),
  shaped AS (
    SELECT p.*,
      coalesce(p.res ->> 'holder_type', p.hold ->> 'holder_type',
        CASE WHEN p.run_kind = 'workflow' THEN 'workflow' ELSE 'agent' END) AS holder_type,
      coalesce(CASE WHEN p.run_kind = 'workflow' THEN p.workflow_definition_id END,
        NULLIF(p.res ->> 'holder_id', '')::uuid, p.agent_id, NULLIF(p.hold ->> 'workflow_id', '')::uuid) AS holder_id
    FROM page p
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    -- Cost over EVERY run that matches (not just this page) and how many of them
    -- are inferred (the Holder agent's untagged runs) — the admin list's numbers.
    'cost_total', (SELECT coalesce(sum(f.cost), 0) FROM filtered f),
    'inferred_total', (SELECT count(*) FROM filtered f WHERE f.found_by = 'holder_agent'),
    'inferred_cost', (SELECT coalesce(sum(f.cost), 0) FROM filtered f WHERE f.found_by = 'holder_agent'),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'run_kind', s.run_kind,
          'run_id', s.run_id,
          'started_at', s.created_at,
          'completed_at', s.completed_at,
          'status', s.status,
          'raw_status', s.raw_status,
          'error', s.error_text,
          'ran_by_id', s.created_by,
          'ran_by_name', coalesce(NULLIF(btrim(pr.display_name), ''), au.email::text),
          'ran_by_kind', CASE
              WHEN s.created_by IS NULL THEN 'system'
              WHEN s.run_kind = 'conversation'
                AND coalesce(s.origin_class, 'human') NOT IN ('human', 'child_agent') THEN 'system'
              ELSE 'person'
            END,
          'organization_id', s.organization_id,
          'organization_name', org.name,
          'rung', s.res ->> 'rung',
          'mandate_key', s.mandate_key,
          'found_by', s.found_by,
          'attribution', coalesce(
            (SELECT ur.metadata ->> 'mandate_attribution' FROM chat.user_request ur
              WHERE s.run_kind = 'conversation' AND ur.id = s.run_id),
            (SELECT cv.metadata ->> 'mandate_attribution' FROM chat.conversation cv
              WHERE cv.id = conv.conversation_id)),
          'direct_door', coalesce(
            (SELECT ur.metadata ->> 'direct_door' FROM chat.user_request ur
              WHERE s.run_kind = 'conversation' AND ur.id = s.run_id),
            (SELECT cv.metadata ->> 'direct_door' FROM chat.conversation cv
              WHERE cv.id = conv.conversation_id)),
          'holder_type', s.holder_type,
          'holder_id', s.holder_id,
          'holder_name', CASE WHEN s.holder_type = 'workflow' THEN wd.name ELSE ad.name END,
          'holder_agent_type', CASE WHEN s.holder_type = 'workflow' THEN NULL ELSE ad.agent_type END,
          'output_warned', s.status = 'warned',
          'output_missing_keys', coalesce(NULLIF(s.res -> 'output_missing_keys', 'null'::jsonb), '[]'::jsonb),
          'cost', s.cost,
          'duration_ms', s.duration_ms,
          'tokens', s.tokens,
          'output_preview', CASE WHEN v_view = 'org' AND s.created_by IS DISTINCT FROM v_uid THEN NULL
            WHEN s.run_kind = 'workflow' THEN wout.preview ELSE cout.preview END,
          'conversation_id', conv.conversation_id,
          'has_transcript', CASE WHEN conv.conversation_id IS NULL THEN false ELSE EXISTS (
            SELECT 1 FROM chat.message m
            WHERE m.conversation_id = conv.conversation_id
              AND m.status IN ('active', 'summary') AND m.deleted_at IS NULL) END
        ) ORDER BY s.ord)
      FROM shaped s
      LEFT JOIN users.profiles pr ON pr.id = s.created_by
      LEFT JOIN auth.users au ON au.id = s.created_by
      LEFT JOIN iam.organizations org ON org.id = s.organization_id
      LEFT JOIN agent.definition ad ON s.holder_type <> 'workflow' AND ad.id = s.holder_id
      LEFT JOIN workflow.definition wd ON s.holder_type = 'workflow' AND wd.id = s.holder_id
      LEFT JOIN LATERAL (
        SELECT coalesce(s.direct_conversation_id, (
          SELECT rq.conversation_id FROM chat.request rq
          WHERE s.run_kind = 'conversation' AND rq.user_request_id = s.run_id
            AND rq.conversation_id IS NOT NULL AND rq.deleted_at IS NULL
          ORDER BY rq.iteration LIMIT 1)) AS conversation_id
      ) conv ON true
      LEFT JOIN LATERAL (
        SELECT left(btrim(regexp_replace(string_agg(b ->> 'text', ' '), '\s+', ' ', 'g')), 240) AS preview
        FROM (
          SELECT m.content FROM chat.message m
          WHERE s.run_kind = 'conversation' AND m.conversation_id = conv.conversation_id
            AND m.role = 'assistant' AND m.deleted_at IS NULL
            AND m.created_at >= s.created_at
            AND m.created_at < coalesce((
              SELECT min(u2.created_at) FROM chat.user_request u2
              WHERE u2.conversation_id = conv.conversation_id AND u2.created_at > s.created_at
                AND u2.deleted_at IS NULL), 'infinity'::timestamptz)
          ORDER BY m.position DESC LIMIT 1
        ) last_msg,
        LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(last_msg.content) = 'array' THEN last_msg.content ELSE '[]'::jsonb END) b
        WHERE b ->> 'type' = 'text' AND coalesce(b ->> 'text', '') <> ''
      ) cout ON true
      LEFT JOIN LATERAL (
        SELECT left(regexp_replace(CASE WHEN jsonb_typeof(r.output) = 'string' THEN r.output #>> '{}' ELSE r.output::text END, '\s+', ' ', 'g'), 240) AS preview
        FROM workflow.run r WHERE s.run_kind = 'workflow' AND r.id = s.run_id
          AND r.output IS NOT NULL AND r.output <> 'null'::jsonb
      ) wout ON true
    ), '[]'::jsonb),
    'facets', CASE WHEN v_view = 'mine' THEN NULL ELSE jsonb_build_object(
      'organizations', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.organization_id, 'name', o.name, 'count', x.n) ORDER BY x.n DESC)
        FROM (SELECT organization_id, count(*) n FROM normalized
              WHERE organization_id IS NOT NULL AND (v_view = 'platform' OR organization_id = p_org_id)
              GROUP BY 1 ORDER BY 2 DESC LIMIT 50) x
        LEFT JOIN iam.organizations o ON o.id = x.organization_id
      ), '[]'::jsonb),
      'people', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.created_by,
            'name', coalesce(NULLIF(btrim(pp.display_name), ''), uu.email::text), 'count', x.n) ORDER BY x.n DESC)
        FROM (SELECT created_by, count(*) n FROM normalized
              WHERE created_by IS NOT NULL
                AND (CASE WHEN v_view = 'org' THEN organization_id = p_org_id
                          ELSE (p_org_id IS NULL OR organization_id = p_org_id) END)
              GROUP BY 1 ORDER BY 2 DESC LIMIT 50) x
        LEFT JOIN users.profiles pp ON pp.id = x.created_by
        LEFT JOIN auth.users uu ON uu.id = x.created_by
      ), '[]'::jsonb)
    ) END
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

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
  -- Relevance leads only while searching on the DEFAULT order (Name A→Z); a column
  -- the person sorted by keeps its order while searching (2026-10-09: Runs sorted
  -- 221, 230, 226, 0 under a search).
  v_ranked boolean := NULLIF(lower(btrim(coalesce(p_search, ''))), '') IS NOT NULL
                      AND coalesce(NULLIF(p_sort, ''), 'name') = 'name'
                      AND lower(coalesce(p_dir, 'asc')) <> 'desc';
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
    -- ONE row build (it was two: one per UNION arm, ~0.5 s each).
    WITH rows_once AS MATERIALIZED (
      SELECT r.id, r.h_agent_id, r.is_system FROM mandate._admin_list_rows(v_facts, v_q) r
    )
    SELECT coalesce(jsonb_agg(DISTINCT a), '[]'::jsonb) INTO v_out FROM (
      SELECT r.h_agent_id AS a FROM rows_once r
      WHERE r.h_agent_id IS NOT NULL AND (v_lane = 'support' OR r.is_system)
      UNION
      SELECT coalesce(v.agent_id, b.holder_id)
      FROM mandate.binding b
      JOIN rows_once r ON r.id = b.mandate_id
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
      CASE WHEN v_ranked THEN m.score END DESC,
      CASE WHEN NOT v_ranked AND v_dir = 'asc'  AND jsonb_typeof(m.sortv->v_sort) = 'number'
           THEN (m.sortv->>v_sort)::numeric END ASC,
      CASE WHEN NOT v_ranked AND v_dir = 'desc' AND jsonb_typeof(m.sortv->v_sort) = 'number'
           THEN (m.sortv->>v_sort)::numeric END DESC,
      CASE WHEN NOT v_ranked AND v_dir = 'asc'  AND jsonb_typeof(m.sortv->v_sort) = 'string'
           THEN m.sortv->>v_sort END ASC,
      CASE WHEN NOT v_ranked AND v_dir = 'desc' AND jsonb_typeof(m.sortv->v_sort) = 'string'
           THEN m.sortv->>v_sort END DESC,
      CASE WHEN NOT v_ranked AND NOT (m.sortv ? v_sort) THEN lower(m.name) END ASC,
      CASE WHEN v_q IS NOT NULL THEN m.score END DESC,
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
        'candidate', mandate._admin_list_candidate(o.id),
        -- THE MODEL: default Holder's model first, then each other model a binding runs on.
        'models', o.vals->'model')) FROM ordered o), '[]'::jsonb),
    -- THE SPEND TOTAL of every row the filters match (all pages), when the
    -- client sent the period's spend; absent otherwise.
    'spend_total', CASE WHEN v_facts ? 'spend'
                        THEN (SELECT coalesce(sum((m.sortv->>'spendUsd')::numeric), 0) FROM matched m) END,
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
$function$;
