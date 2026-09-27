-- based-on: public.mnd_run_history(text, text, uuid, uuid, text, integer, integer) 1b919f96e9d674b2164a491198743e53defea3884c65ea00a9ea67f29a89e828
-- mnd_run_history_step_rows_and_ran_by_2026_09_27.sql
--
-- Two corrections to public.mnd_run_history (mnd_run_history_2026_09_27.sql),
-- found running a real member "Try it" through a workflow-free and a
-- workflow-held mandate:
--   1. A workflow Holder's own AI steps run under the child workflow's context
--      (source_feature 'mandate:<key>', origin_class 'workflow'), so each step
--      was listed as a second "run" beside the workflow.run row. Excluded.
--   2. "Ran by": an agent that ran inside a person's request (origin
--      'child_agent' — every run_mandate / test-bench run) was labelled
--      "System". Only a platform-started run (code call, schedule) is System.
-- Function replacement only.

CREATE OR REPLACE FUNCTION public.mnd_run_history(
  p_mandate_key text,
  p_view text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_view   text := lower(coalesce(p_view, 'mine'));
  v_key    text := NULLIF(btrim(coalesce(p_mandate_key, '')), '');
  v_status text := NULLIF(lower(btrim(coalesce(p_status, ''))), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_out    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to see a mandate''s runs.';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Name the mandate whose runs to list (p_mandate_key).';
  END IF;
  IF v_view NOT IN ('mine', 'org', 'platform') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('%L is not a run-history view.', p_view),
      hint = 'Use mine, org or platform.';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('succeeded', 'failed', 'stopped', 'waiting', 'running') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('%L is not a run status.', p_status),
      hint = 'Use succeeded, failed, stopped, waiting or running.';
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
      'conversation'::text AS run_kind,
      u.id AS run_id,
      u.created_at,
      u.completed_at,
      u.status AS raw_status,
      u.created_by,
      u.organization_id,
      u.origin_class,
      u.metadata -> 'mandate_resolution' AS res,
      u.metadata -> 'mandate_holder' AS hold,
      u.agent_id,
      NULL::uuid AS workflow_definition_id,
      u.total_cost AS cost,
      u.total_duration_ms::bigint AS duration_ms,
      NULLIF(left(coalesce(u.error, ''), 300), '') AS error_text
    FROM chat.user_request u
    WHERE (u.source_feature LIKE 'mandate:%' OR u.metadata ? 'mandate_key')
      AND coalesce(substring(u.source_feature from '^mandate:(.+)$'), u.metadata ->> 'mandate_key') = v_key
      AND u.deleted_at IS NULL
      -- A workflow Holder's own AI steps run under the child workflow's
      -- context (source_feature 'mandate:<key>', origin 'workflow'); the run
      -- is the workflow.run row below, never each step again.
      AND u.origin_class IS DISTINCT FROM 'workflow'
    UNION ALL
    SELECT
      'workflow'::text,
      r.id,
      r.created_at,
      r.completed_at,
      r.status,
      r.created_by,
      r.organization_id,
      NULL::text,
      r.metadata -> '_mandate' -> 'resolution',
      NULL::jsonb,
      NULL::uuid,
      r.definition_id,
      NULL::numeric,
      CASE WHEN r.completed_at IS NOT NULL
        THEN (extract(epoch FROM (r.completed_at - coalesce(r.started_at, r.created_at))) * 1000)::bigint
      END,
      NULLIF(left(coalesce(r.error ->> 'message', r.error #>> '{}', ''), 300), '')
    FROM workflow.run r
    WHERE r.metadata ? '_mandate'
      AND (r.metadata -> '_mandate' -> 'chain' ->> -1) = v_key
      AND r.deleted_at IS NULL
  ),
  normalized AS (
    SELECT raw.*,
      CASE
        WHEN raw.raw_status = 'completed' THEN 'succeeded'
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
    SELECT s.* FROM seat s WHERE v_status IS NULL OR s.status = v_status
  ),
  page AS (
    SELECT f.* FROM filtered f
    ORDER BY f.created_at DESC, f.run_id DESC
    LIMIT v_limit OFFSET v_offset
  ),
  shaped AS (
    SELECT
      p.*,
      coalesce(
        p.res ->> 'holder_type',
        p.hold ->> 'holder_type',
        CASE WHEN p.run_kind = 'workflow' THEN 'workflow' ELSE 'agent' END
      ) AS holder_type,
      coalesce(
        CASE WHEN p.run_kind = 'workflow' THEN p.workflow_definition_id END,
        NULLIF(p.res ->> 'holder_id', '')::uuid,
        p.agent_id,
        NULLIF(p.hold ->> 'workflow_id', '')::uuid
      ) AS holder_id
    FROM page p
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
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
              -- Started by the platform itself (a code call, a schedule), on
              -- that person's behalf; a person's own click, or an agent that
              -- ran inside their request, is the person.
              WHEN s.run_kind = 'conversation'
                AND coalesce(s.origin_class, 'human') NOT IN ('human', 'child_agent') THEN 'system'
              ELSE 'person'
            END,
          'organization_id', s.organization_id,
          'organization_name', org.name,
          'rung', s.res ->> 'rung',
          'holder_type', s.holder_type,
          'holder_id', s.holder_id,
          'holder_name', CASE WHEN s.holder_type = 'workflow' THEN wd.name ELSE ad.name END,
          'holder_agent_type', CASE WHEN s.holder_type = 'workflow' THEN NULL ELSE ad.agent_type END,
          'output_warned', coalesce((s.res ->> 'output_warned')::boolean, false),
          'output_missing_keys', coalesce(s.res -> 'output_missing_keys', '[]'::jsonb),
          'cost', CASE WHEN s.run_kind = 'workflow' THEN wc.cost ELSE s.cost END,
          'duration_ms', s.duration_ms,
          'conversation_id', conv.conversation_id
        ) ORDER BY s.created_at DESC, s.run_id DESC)
      FROM shaped s
      LEFT JOIN users.profiles pr ON pr.id = s.created_by
      LEFT JOIN auth.users au ON au.id = s.created_by
      LEFT JOIN iam.organizations org ON org.id = s.organization_id
      LEFT JOIN agent.definition ad ON s.holder_type <> 'workflow' AND ad.id = s.holder_id
      LEFT JOIN workflow.definition wd ON s.holder_type = 'workflow' AND wd.id = s.holder_id
      LEFT JOIN LATERAL (
        SELECT rq.conversation_id FROM chat.request rq
        WHERE s.run_kind = 'conversation' AND rq.user_request_id = s.run_id
          AND rq.conversation_id IS NOT NULL AND rq.deleted_at IS NULL
        ORDER BY rq.iteration LIMIT 1
      ) conv ON true
      LEFT JOIN LATERAL (
        SELECT sum(rq.cost) AS cost FROM chat.request rq
        WHERE s.run_kind = 'workflow' AND rq.execution_kind = 'workflow_run'
          AND rq.execution_id = s.run_id AND rq.deleted_at IS NULL
      ) wc ON true
    ), '[]'::jsonb),
    -- Who and where, for the org and platform views' filters (never for mine).
    'facets', CASE WHEN v_view = 'mine' THEN NULL ELSE jsonb_build_object(
      'organizations', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.organization_id, 'name', o.name, 'count', x.n) ORDER BY x.n DESC)
        FROM (SELECT organization_id, count(*) n FROM normalized
              WHERE organization_id IS NOT NULL
                AND (v_view = 'platform' OR organization_id = p_org_id)
              GROUP BY 1 ORDER BY 2 DESC LIMIT 50) x
        LEFT JOIN iam.organizations o ON o.id = x.organization_id
      ), '[]'::jsonb),
      'people', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'id', x.created_by,
            'name', coalesce(NULLIF(btrim(pp.display_name), ''), uu.email::text),
            'count', x.n) ORDER BY x.n DESC)
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

