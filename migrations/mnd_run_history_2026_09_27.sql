-- mnd_run_history_2026_09_27.sql
--
-- MANDATE RUN HISTORY — every mandate can show its runs, newest first.
--
-- NO NEW LOG. A mandate's runs are already recorded where every funnel writes
-- them; this function only reads them:
--   · chat.user_request — an agent/chat start (`mandate_key` stamped from the
--     server's mandated start), a held code call (`mandate_key` + the Holder
--     stamp `mandate_holder`), and `run_mandate`'s agent lane
--     (`source_feature = 'mandate:<key>'`). The run's OWN mandate is the
--     source_feature one when present (a parent chat's key can be inherited
--     through the context), else the metadata one. Index:
--     chat.user_request_mandate_run_idx (built CONCURRENTLY through the Supabase
--     connection, 2026-09-27 — no file, per the MCP-changes rule).
--   · workflow.run — every workflow-Holder run stamps `metadata._mandate.chain`
--     ending in the mandate that started it. Cost is the sum of the run's own
--     provider requests (chat.request.execution_kind = 'workflow_run').
-- The one thing that was genuinely missing — WHICH LEVEL decided the run — is
-- now stamped at the resolution by aidream (`mandates.service.mandate_run_stamp`,
-- metadata `mandate_resolution` / `_mandate.resolution`). Runs recorded before
-- that stamp existed answer `rung = null` ("not recorded"), never a guess.
--
-- WHO SEES WHAT (the view is the caller's seat, checked here):
--   mine      — the caller's own runs (optionally within one organization).
--   org       — every run in one organization; caller must be its owner/admin
--               (public.is_org_admin) — members use `mine`.
--   platform  — every run on the platform, narrowable to one organization or
--               one person; platform administrators only. Never "mine".
-- SECURITY DEFINER because an organization admin reads other members' request
-- rows, which row security does not grant; each view's gate above is the whole
-- authorization, and the rows carry metadata only (no message content — the
-- conversation or run opens through its own access-checked viewer).

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
              WHEN s.run_kind = 'conversation' AND coalesce(s.origin_class, 'human') <> 'human' THEN 'system'
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

COMMENT ON FUNCTION public.mnd_run_history(text, text, uuid, uuid, text, integer, integer) IS
  'Mandate run history: one mandate''s runs, newest first, from the records every funnel already writes (chat.user_request, workflow.run). Views: mine | org (org owner/admin) | platform (platform admin). See migrations/mnd_run_history_2026_09_27.sql.';

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, anonymous_purpose,
   gate_predicate, argument_rules)
VALUES
  ('public', 'mnd_run_history',
   'p_mandate_key text, p_view text, p_org_id uuid, p_user_id uuid, p_status text, p_limit integer, p_offset integer',
   'mandate run history (2026-09-27)',
   'SIGNED-IN door (authenticated only). Lists one mandate''s runs (metadata only — no message content). The body gates each view: mine = the caller''s own rows (auth.uid()); org = public.is_org_admin(p_org_id) or platform admin; platform = public.is_platform_admin().',
   false, NULL,
   'auth.uid(); view org: public.is_org_admin(p_org_id) or public.is_platform_admin(); view platform: public.is_platform_admin()',
   jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
     'p_mandate_key', jsonb_build_object('type', 'text', 'position', 1, 'optional', false,
        'foreign', jsonb_build_object('not_an_id', true),
        'null_rule', jsonb_build_object('sqlstate', '22023', 'note', 'raised naming the argument')),
     'p_view', jsonb_build_object('type', 'text', 'position', 2, 'optional', true,
        'foreign', jsonb_build_object('not_an_id', true),
        'null_rule', jsonb_build_object('means', 'mine')),
     'p_org_id', jsonb_build_object('type', 'uuid', 'position', 3, 'optional', true,
        'check', 'view mine: only narrows the caller''s own rows; view org: public.is_org_admin(p_org_id) or platform admin, decided before the first read; view platform: platform admin only',
        'foreign', jsonb_build_object('bounded', true,
          'note', 'Under mine it only narrows rows already limited to the caller; under org a foreign organization raises 42501 before any row is read; under platform the caller already sees every row.'),
        'null_rule', jsonb_build_object('means', 'every organization the view already allows (org view refuses null)')),
     'p_user_id', jsonb_build_object('type', 'uuid', 'position', 4, 'optional', true,
        'check', 'only narrows rows the view already allows (ignored under mine)',
        'foreign', jsonb_build_object('bounded', true,
          'note', 'Only narrows rows already limited to one organization the caller administers (org) or to the platform (platform admin); under mine it is ignored.'),
        'null_rule', jsonb_build_object('means', 'everyone the view already allows')),
     'p_status', jsonb_build_object('type', 'text', 'position', 5, 'optional', true,
        'foreign', jsonb_build_object('not_an_id', true),
        'null_rule', jsonb_build_object('means', 'every status')),
     'p_limit', jsonb_build_object('type', 'integer', 'position', 6, 'optional', true,
        'foreign', jsonb_build_object('not_an_id', true),
        'null_rule', jsonb_build_object('means', '25; clamped to 1..100')),
     'p_offset', jsonb_build_object('type', 'integer', 'position', 7, 'optional', true,
        'foreign', jsonb_build_object('not_an_id', true),
        'null_rule', jsonb_build_object('means', '0'))
   )))
ON CONFLICT DO NOTHING;

GRANT EXECUTE ON FUNCTION public.mnd_run_history(text, text, uuid, uuid, text, integer, integer) TO authenticated;
