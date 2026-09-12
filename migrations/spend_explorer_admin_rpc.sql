-- spend_explorer_admin_rpc — the multidimensional half of the platform SPEND
-- DASHBOARD (/administration/billing/spend).
--
-- WHY (Arman, 2026-09-12, looking at two $100+ days he did not drive):
--   "it's not being registered under any user. It's not being registered under
--    any organization. So where the heck is all this money going?"
-- The money WAS attributed — `runtime.global_execution.context` carries the
-- user, agent and conversation, `request_id` points at `chat.user_request`
-- (app, feature, origin class, status, iterations), and `chat.request` carries
-- the model per API call. The first dashboard simply never read those columns,
-- and its per-user table came from a different ledger (the rolling throttling
-- window), so the person who spent $164 in 48h showed as $10. This function
-- reads the ONE ledger and joins every dimension the data already has.
--
-- WHAT IT RETURNS, for ANY window [p_from, p_to) and ANY set of filters:
--   totals      — cost, executions, requests, tokens, manual vs automated,
--                 what portion of the window's ledger the breakdown covers.
--   dimensions  — organization, person, agent, app, feature, origin class,
--                 trigger (manual / automated), source (execution link kind),
--                 model, conversation, local day. Each is the same shape:
--                 ranked rows with share-of-total, plus an "everything else"
--                 remainder so the client can draw the 80/20 view.
--   series      — per local day (always) and per hour (windows ≤ 4 days),
--                 zero-filled, split manual / automated.
--   signals     — the "dig here" list: spend on failed or truncated requests,
--                 context-heavy conversations, iteration-heavy requests,
--                 conversations that alone exceed a share of the window,
--                 hour spikes against the median hour, repeat bursts (the same
--                 person + agent + feature firing many requests inside ten
--                 minutes — the loop signature), and API calls with no price.
--   top_requests — the most expensive individual requests with every
--                 dimension on the row, so a line item can be opened.
--
-- FILTERS (p_filters jsonb, every key optional, equality on the dimension key):
--   organization, user, agent, app, feature, origin, trigger, source, model,
--   conversation, day. The literal '(none)' matches a NULL key ("Unattributed").
--   Filters compose: the dimensions returned are the dimensions OF THE FILTERED
--   SET, which is what "click a line item and see it through the other
--   dimensions" means.
--
-- THRESHOLDS (p_thresholds jsonb, ALL REQUIRED — nothing here guesses):
--   context_heavy_tokens, iteration_heavy, spike_multiplier, hog_share_pct,
--   repeat_burst. They are knobs (`platform.spend_explorer.*`, seeded by
--   `migrations/spend_explorer_knobs.sql`); the client resolves them with org
--   overrides and passes them in. A missing key RAISES.
--
-- HONESTY: every number is `runtime.global_execution.cost` — the same ledger as
-- the headline — grouped differently. `model` is the model that billed the most
-- of a request (a request can fall back across models), so the model dimension
-- still sums to the ledger. Rows the ledger holds that no chat request explains
-- (scheduler polls, internal runs without a request row) are attributed from
-- the execution's own context and link kind, never dropped, never invented.
--
-- WHY VOLATILE: the fact set is materialised ONCE into a temp table (ON COMMIT
-- DROP) and every dimension, series and signal reads from it, instead of
-- re-scanning a 143k-row ledger a dozen times. A STABLE function may not create
-- a temp table. The function writes nothing durable.
--
-- Also here: `admin_spend_overview` loses its `by_org` and `by_user` arrays —
-- superseded by this function, and the by_user one was the wrong scope (the
-- throttling window, not the ledger). No legacy: they are removed, not kept.
--
-- Idempotent (CREATE OR REPLACE + ON CONFLICT DO NOTHING). Reversible: drop
-- `admin_spend_breakdown(timestamptz, timestamptz, text, jsonb, jsonb)`;
-- nothing else depends on it.
-- db-rules §6d-4: the `platform.client_callable_door` row is declared BEFORE
-- the GRANT.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

-- ── The breakdown ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_spend_breakdown(
  p_from       timestamptz,
  p_to         timestamptz,
  p_tz         text  DEFAULT 'UTC',
  p_filters    jsonb DEFAULT '{}'::jsonb,
  p_thresholds jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz               text;
  v_hours            numeric;
  v_context_heavy    numeric;
  v_iteration_heavy  integer;
  v_spike_multiplier numeric;
  v_hog_share_pct    numeric;
  v_repeat_burst     integer;
  v_ledger_total     numeric;
  v_ledger_rows      bigint;
  v_totals           jsonb;
  v_dimensions       jsonb := '{}'::jsonb;
  v_series_day       jsonb;
  v_series_hour      jsonb;
  v_signals          jsonb := '{}'::jsonb;
  v_top_requests     jsonb;
  v_dim              record;
  v_row              jsonb;
  v_filter_key       text;
  v_filter_value     text;
  v_column           text;
  v_median_hour      numeric;
  v_total_cost       numeric;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin_spend_breakdown: super admin only'
      USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'admin_spend_breakdown: the window must be a non-empty [from, to) range (got % → %)', p_from, p_to
      USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > interval '92 days' THEN
    RAISE EXCEPTION 'admin_spend_breakdown: the window is capped at 92 days (asked for %)', p_to - p_from
      USING ERRCODE = '22023';
  END IF;

  -- Every threshold is a knob the client resolved; a missing one is a defect
  -- to surface, never a number to assume.
  v_context_heavy    := (p_thresholds->>'context_heavy_tokens')::numeric;
  v_iteration_heavy  := (p_thresholds->>'iteration_heavy')::integer;
  v_spike_multiplier := (p_thresholds->>'spike_multiplier')::numeric;
  v_hog_share_pct    := (p_thresholds->>'hog_share_pct')::numeric;
  v_repeat_burst     := (p_thresholds->>'repeat_burst')::integer;
  IF v_context_heavy IS NULL OR v_iteration_heavy IS NULL OR v_spike_multiplier IS NULL
     OR v_hog_share_pct IS NULL OR v_repeat_burst IS NULL THEN
    RAISE EXCEPTION 'admin_spend_breakdown: p_thresholds must carry context_heavy_tokens, iteration_heavy, spike_multiplier, hog_share_pct and repeat_burst (got %)', p_thresholds
      USING ERRCODE = '22023';
  END IF;

  -- An unknown zone would silently move every day boundary, so fall back loudly to UTC.
  BEGIN
    PERFORM now() AT TIME ZONE coalesce(p_tz, 'UTC');
    v_tz := coalesce(p_tz, 'UTC');
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  v_hours := extract(epoch FROM (p_to - p_from)) / 3600.0;

  -- The whole ledger inside the window, BEFORE filters, so the client can say
  -- how much of it the filtered view explains.
  SELECT coalesce(sum(cost), 0), count(*)
  INTO v_ledger_total, v_ledger_rows
  FROM runtime.global_execution
  WHERE created_at >= p_from AND created_at < p_to;

  -- ── The fact set: one row per execution, every dimension resolved ──────────
  DROP TABLE IF EXISTS pg_temp.spend_fact;
  CREATE TEMP TABLE spend_fact ON COMMIT DROP AS
  WITH g AS (
    SELECT
      e.id, e.created_at, coalesce(e.cost, 0) AS cost,
      e.organization_id, e.link_kind, e.link_id, e.type, e.request_id, e.context, e.meters,
      -- context values are stored as text and can be absent; only a real uuid casts.
      CASE WHEN (e.context->>'user_id') ~ '^[0-9a-f-]{36}$'
           THEN (e.context->>'user_id')::uuid END              AS ctx_user_id,
      CASE WHEN (e.context->>'agent_id') ~ '^[0-9a-f-]{36}$'
           THEN (e.context->>'agent_id')::uuid END             AS ctx_agent_id,
      CASE WHEN e.link_kind = 'conversation' AND e.link_id ~ '^[0-9a-f-]{36}$'
           THEN e.link_id::uuid
           WHEN (e.context->>'conversation_id') ~ '^[0-9a-f-]{36}$'
           THEN (e.context->>'conversation_id')::uuid END      AS ctx_conversation_id,
      -- A request can own SEVERAL ledger rows (one request in the 2026-09-10/11
      -- window owned 71). The request-level facts — its token totals, its
      -- iteration count, its unpriced-call count — belong to ONE of them, or
      -- every per-request signal counts them once per execution. The earliest
      -- execution is the head; the rest carry cost only.
      (e.request_id IS NULL OR row_number() OVER (
         PARTITION BY e.request_id ORDER BY e.created_at, e.id) = 1) AS is_request_head
    FROM runtime.global_execution e
    WHERE e.created_at >= p_from AND e.created_at < p_to
  )
  SELECT
    g.id                                                        AS execution_id,
    g.created_at,
    g.cost,
    CASE WHEN ur.id IS NULL THEN coalesce((g.meters->>'input_tokens')::bigint, 0)
         WHEN g.is_request_head THEN coalesce(ur.total_input_tokens, 0) ELSE 0 END  AS tokens_in,
    CASE WHEN ur.id IS NULL THEN coalesce((g.meters->>'cached_tokens')::bigint, 0)
         WHEN g.is_request_head THEN coalesce(ur.total_cached_tokens, 0) ELSE 0 END AS tokens_cached,
    CASE WHEN ur.id IS NULL THEN coalesce((g.meters->>'output_tokens')::bigint, 0)
         WHEN g.is_request_head THEN coalesce(ur.total_output_tokens, 0) ELSE 0 END AS tokens_out,
    g.is_request_head,
    g.organization_id,
    coalesce(o.name, 'Unattributed')                            AS organization_name,
    coalesce(ur.created_by, g.ctx_user_id)                      AS user_id,
    au.email                                                    AS user_email,
    coalesce(ur.agent_id, g.ctx_agent_id)                       AS agent_id,
    ad.name                                                     AS agent_name,
    coalesce(nullif(ur.source_app, ''), 'aidream')              AS app,
    coalesce(nullif(ur.source_feature, ''),
             nullif(g.context->>'agent_run_label', ''),
             g.link_kind, g.type)                               AS feature,
    coalesce(ur.origin_class,
             CASE g.link_kind
               WHEN 'sch_run'            THEN 'scheduled'
               WHEN 'internal_agent_run' THEN 'child_agent'
               ELSE 'system' END)                               AS origin_class,
    CASE WHEN coalesce(ur.origin_class, '') IN ('human', 'api')
         THEN 'manual' ELSE 'automated' END                     AS trigger,
    coalesce(g.link_kind, g.type)                               AS source,
    g.ctx_conversation_id                                       AS conversation_id,
    c.title                                                     AS conversation_title,
    ur.id                                                       AS request_id,
    ur.status                                                   AS request_status,
    ur.finish_reason,
    CASE WHEN g.is_request_head THEN coalesce(ur.iterations, 0) ELSE 0 END       AS iterations,
    CASE WHEN g.is_request_head THEN coalesce(ur.total_tool_calls, 0) ELSE 0 END AS tool_calls,
    m.model,
    m.provider,
    CASE WHEN g.is_request_head THEN m.unpriced_calls ELSE 0 END AS unpriced_calls,
    -- The LOGIN SESSION: every sign-in (a person, or an agent driving the UI
    -- as admin@admin.com) gets its own Supabase session id, carried on the
    -- request's JWT claims. It is the only thing that separates two agents
    -- sharing one account. Label = who, and when they signed in.
    ur.metadata->'jwt_claims'->>'session_id'                    AS login_session_id,
    -- The label is built on the request's head row only (min() over the
    -- dimension ignores NULLs), so to_timestamp runs once per request, not
    -- once per ledger row.
    CASE WHEN g.is_request_head AND ur.metadata->'jwt_claims'->>'session_id' IS NOT NULL THEN
      coalesce(ur.metadata->'jwt_claims'->>'email', au.email, 'unknown')
      || ' · signed in '
      || CASE WHEN (ur.metadata->'jwt_claims'->'amr'->0->>'timestamp') ~ '^[0-9]+$'
              THEN to_char(to_timestamp((ur.metadata->'jwt_claims'->'amr'->0->>'timestamp')::bigint)
                           AT TIME ZONE v_tz, 'Mon DD, HH12:MI AM')
              ELSE 'at an unknown time (' || left(ur.metadata->'jwt_claims'->>'session_id', 8) || ')' END
    END                                                         AS login_label,
    to_char(g.created_at AT TIME ZONE v_tz, 'YYYY-MM-DD')       AS local_day,
    date_trunc('hour', g.created_at AT TIME ZONE v_tz)          AS local_hour,
    to_char(g.created_at AT TIME ZONE v_tz, 'YYYY-MM-DD"T"HH24:00') AS local_hour_key
  FROM g
  LEFT JOIN chat.user_request ur ON ur.id = g.request_id
  LEFT JOIN iam.organizations o  ON o.id = g.organization_id
  LEFT JOIN auth.users au        ON au.id = coalesce(ur.created_by, g.ctx_user_id)
  LEFT JOIN agent.definition ad  ON ad.id = coalesce(ur.agent_id, g.ctx_agent_id)
  LEFT JOIN chat.conversation c  ON c.id = g.ctx_conversation_id
  LEFT JOIN LATERAL (
    -- The model that billed the most of this request. A request can fall back
    -- across models; one label per execution keeps the dimension summing to
    -- the ledger. unpriced_calls counts API calls whose cost is NULL — a
    -- pricing gap, not free work.
    SELECT x.model, x.provider, x.unpriced_calls
    FROM (
      SELECT coalesce(md.name, r.ai_model_id::text, 'unknown') AS model,
             coalesce(r.provider, 'unknown')                    AS provider,
             sum(r.cost)                                        AS model_cost,
             sum(count(*) FILTER (WHERE r.cost IS NULL)) OVER () AS unpriced_calls
      FROM chat.request r
      LEFT JOIN ai.model_definition md ON md.id = r.ai_model_id
      WHERE r.user_request_id = ur.id AND r.deleted_at IS NULL
      GROUP BY 1, 2
    ) x
    ORDER BY x.model_cost DESC NULLS LAST
    LIMIT 1
  ) m ON ur.id IS NOT NULL;

  -- ── Filters: equality on the dimension key; '(none)' means NULL ────────────
  FOR v_filter_key, v_filter_value IN
    SELECT key, value #>> '{}' FROM jsonb_each(coalesce(p_filters, '{}'::jsonb))
  LOOP
    v_column := CASE v_filter_key
      WHEN 'organization' THEN 'organization_id::text'
      WHEN 'user'         THEN 'user_id::text'
      WHEN 'agent'        THEN 'agent_id::text'
      WHEN 'app'          THEN 'app'
      WHEN 'feature'      THEN 'feature'
      WHEN 'origin'       THEN 'origin_class'
      WHEN 'trigger'      THEN 'trigger'
      WHEN 'source'       THEN 'source'
      WHEN 'model'        THEN 'model'
      WHEN 'conversation' THEN 'conversation_id::text'
      WHEN 'session'      THEN 'login_session_id'
      WHEN 'day'          THEN 'local_day'
      WHEN 'hour'         THEN 'local_hour_key'
      ELSE NULL END;
    IF v_column IS NULL THEN
      RAISE EXCEPTION 'admin_spend_breakdown: unknown filter key % (allowed: organization, user, agent, app, feature, origin, trigger, source, model, conversation, session, day, hour)', v_filter_key
        USING ERRCODE = '22023';
    END IF;
    IF v_filter_value IS NULL OR v_filter_value = '' THEN
      CONTINUE;
    END IF;
    IF v_filter_value = '(none)' THEN
      EXECUTE format('DELETE FROM spend_fact WHERE %s IS NOT NULL', v_column);
    ELSE
      EXECUTE format('DELETE FROM spend_fact WHERE %s IS DISTINCT FROM $1', v_column)
        USING v_filter_value;
    END IF;
  END LOOP;

  -- The fact set is read a dozen times below; two small indexes and fresh
  -- statistics turn each pass into an index scan instead of a full re-read.
  CREATE INDEX ON spend_fact (local_day);
  CREATE INDEX ON spend_fact (local_hour);
  ANALYZE spend_fact;

  -- ── Totals ─────────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'cost',            coalesce(sum(cost), 0),
    'executions',      count(*),
    'paid_executions', count(*) FILTER (WHERE cost > 0),
    'requests',        count(DISTINCT request_id),
    'conversations',   count(DISTINCT conversation_id),
    'tokens_in',       coalesce(sum(tokens_in), 0),
    'tokens_cached',   coalesce(sum(tokens_cached), 0),
    'tokens_out',      coalesce(sum(tokens_out), 0),
    'manual_cost',     coalesce(sum(cost) FILTER (WHERE trigger = 'manual'), 0),
    'automated_cost',  coalesce(sum(cost) FILTER (WHERE trigger = 'automated'), 0),
    'linked_cost',     coalesce(sum(cost) FILTER (WHERE request_id IS NOT NULL), 0),
    'unlinked_cost',   coalesce(sum(cost) FILTER (WHERE request_id IS NULL), 0),
    'ledger_cost',     v_ledger_total,
    'ledger_rows',     v_ledger_rows,
    'hours',           round(v_hours, 2)
  )
  INTO v_totals
  FROM spend_fact;

  v_total_cost := (v_totals->>'cost')::numeric;

  -- ── Dimensions: the same shape for every one ───────────────────────────────
  FOR v_dim IN
    SELECT * FROM (VALUES
      ('organization', 'organization_id::text', 'organization_name', 100),
      ('user',         'user_id::text',         'coalesce(user_email, user_id::text)', 100),
      ('agent',        'agent_id::text',        'agent_name', 100),
      ('app',          'app',                   'app', 100),
      ('feature',      'feature',               'feature', 100),
      ('origin',       'origin_class',          'origin_class', 100),
      ('trigger',      'trigger',               'trigger', 100),
      ('source',       'source',                'source', 100),
      ('model',        'model',                 'model', 100),
      ('conversation', 'conversation_id::text', 'conversation_title', 60),
      ('session',      'login_session_id',      'login_label', 100),
      ('day',          'local_day',             'local_day', 100),
      ('hour',         'local_hour_key',        'local_hour_key', 100)
    ) AS d(name, key_expr, label_expr, cap)
  LOOP
    EXECUTE format($q$
      WITH d AS (
        SELECT %s AS key, min(%s) AS label,
               sum(cost) AS cost, count(*) AS n,
               count(DISTINCT request_id) AS requests,
               sum(tokens_in) AS tokens_in, sum(tokens_cached) AS tokens_cached,
               sum(tokens_out) AS tokens_out,
               sum(cost) FILTER (WHERE trigger = 'manual')    AS manual_cost,
               sum(cost) FILTER (WHERE trigger = 'automated') AS automated_cost,
               max(created_at) AS last_at
        FROM spend_fact
        GROUP BY 1
      ),
      ranked AS (
        SELECT d.*, row_number() OVER (ORDER BY cost DESC NULLS LAST, n DESC) AS rn
        FROM d
      )
      SELECT jsonb_build_object(
        'rows', coalesce(jsonb_agg(jsonb_build_object(
                  'key',            coalesce(key, '(none)'),
                  'label',          coalesce(label, 'Unattributed'),
                  'cost',           coalesce(cost, 0),
                  'share',          CASE WHEN $1 > 0 THEN coalesce(cost, 0) / $1 ELSE 0 END,
                  'n',              n,
                  'requests',       requests,
                  'tokens_in',      coalesce(tokens_in, 0),
                  'tokens_cached',  coalesce(tokens_cached, 0),
                  'tokens_out',     coalesce(tokens_out, 0),
                  'manual_cost',    coalesce(manual_cost, 0),
                  'automated_cost', coalesce(automated_cost, 0),
                  'last_at',        last_at
                ) ORDER BY cost DESC NULLS LAST, n DESC) FILTER (WHERE rn <= %s), '[]'::jsonb),
        'other_cost', coalesce(sum(cost) FILTER (WHERE rn > %s), 0),
        'other_n',    coalesce(sum(n)    FILTER (WHERE rn > %s), 0),
        'distinct',   count(*))
      FROM ranked
    $q$, v_dim.key_expr, v_dim.label_expr, v_dim.cap, v_dim.cap, v_dim.cap)
    INTO v_row
    USING v_total_cost;

    v_dimensions := v_dimensions || jsonb_build_object(v_dim.name, v_row);
  END LOOP;

  -- ── Series ─────────────────────────────────────────────────────────────────
  WITH per_day AS (
    SELECT local_day,
           sum(cost) AS cost,
           sum(cost) FILTER (WHERE trigger = 'manual')    AS manual,
           sum(cost) FILTER (WHERE trigger = 'automated') AS automated,
           count(*) AS n
    FROM spend_fact
    GROUP BY local_day
  )
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'day'), '[]'::jsonb)
  INTO v_series_day
  FROM (
    SELECT jsonb_build_object(
             'day',       to_char(d.day, 'YYYY-MM-DD'),
             'cost',      coalesce(s.cost, 0),
             'manual',    coalesce(s.manual, 0),
             'automated', coalesce(s.automated, 0),
             'n',         coalesce(s.n, 0)) AS x
    FROM generate_series(
           date_trunc('day', p_from AT TIME ZONE v_tz),
           date_trunc('day', (p_to - interval '1 microsecond') AT TIME ZONE v_tz),
           interval '1 day') AS d(day)
    LEFT JOIN per_day s ON s.local_day = to_char(d.day, 'YYYY-MM-DD')
  ) q;

  IF v_hours <= 96 THEN
    WITH per_hour AS (
      SELECT local_hour,
             sum(cost) AS cost,
             sum(cost) FILTER (WHERE trigger = 'manual')    AS manual,
             sum(cost) FILTER (WHERE trigger = 'automated') AS automated,
             count(*) AS n
      FROM spend_fact
      GROUP BY local_hour
    )
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'hour'), '[]'::jsonb)
    INTO v_series_hour
    FROM (
      SELECT jsonb_build_object(
               'hour',      to_char(h.hour, 'YYYY-MM-DD"T"HH24:00'),
               'cost',      coalesce(s.cost, 0),
               'manual',    coalesce(s.manual, 0),
               'automated', coalesce(s.automated, 0),
               'n',         coalesce(s.n, 0)) AS x
      FROM generate_series(
             date_trunc('hour', p_from AT TIME ZONE v_tz),
             date_trunc('hour', (p_to - interval '1 microsecond') AT TIME ZONE v_tz),
             interval '1 hour') AS h(hour)
      LEFT JOIN per_hour s ON s.local_hour = h.hour
    ) q;
  ELSE
    v_series_hour := NULL;
  END IF;

  -- ── Signals: where to dig ──────────────────────────────────────────────────

  -- 1. Money spent on requests that failed, were abandoned, or were cut off
  --    at the output limit. Spent, and nothing usable came back. Counted per
  --    REQUEST (a request may own several ledger rows).
  WITH failed AS (
    SELECT request_id, sum(cost) AS cost,
           min(request_status) AS status, min(finish_reason) AS finish_reason,
           min(feature) AS feature, min(agent_name) AS agent,
           min(coalesce(user_email, user_id::text)) AS who,
           min(conversation_id::text) AS conversation_id, min(conversation_title) AS conversation,
           min(created_at) AS at
    FROM spend_fact
    WHERE request_id IS NOT NULL
      AND (request_status IN ('failed', 'abandoned') OR finish_reason = 'max_tokens')
    GROUP BY request_id
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost), 0),
    'n',    count(*),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'request_id', request_id, 'cost', cost, 'status', status,
               'finish_reason', finish_reason, 'feature', feature,
               'agent', agent, 'user', who,
               'conversation_id', conversation_id, 'conversation', conversation,
               'at', at) ORDER BY cost DESC)
      FROM (SELECT * FROM failed ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM failed;
  v_signals := v_signals || jsonb_build_object('failed_spend', v_row);

  -- 2. Context-heavy: conversations whose average context per API call
  --    (input + cached tokens / iterations) exceeds the knob. Every call
  --    re-sends the whole history, so cost grows with the square of the
  --    conversation length — the single biggest lever on a long session.
  WITH per_conv AS (
    SELECT conversation_id, min(conversation_title) AS title,
           sum(cost) AS cost, count(DISTINCT request_id) AS requests,
           sum(iterations) AS calls,
           CASE WHEN sum(iterations) > 0
                THEN (sum(tokens_in) + sum(tokens_cached))::numeric / sum(iterations)
                ELSE 0 END AS avg_context,
           min(user_email) AS user_email, min(agent_name) AS agent, min(feature) AS feature
    FROM spend_fact
    WHERE conversation_id IS NOT NULL AND request_id IS NOT NULL
    GROUP BY conversation_id
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost) FILTER (WHERE avg_context >= v_context_heavy), 0),
    'n',    count(*) FILTER (WHERE avg_context >= v_context_heavy),
    'threshold', v_context_heavy,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversation_id', conversation_id, 'conversation', title, 'cost', cost,
               'requests', requests, 'calls', calls, 'avg_context', round(avg_context),
               'user', user_email, 'agent', agent, 'feature', feature) ORDER BY cost DESC)
      FROM (SELECT * FROM per_conv WHERE avg_context >= v_context_heavy
            ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM per_conv;
  v_signals := v_signals || jsonb_build_object('context_heavy', v_row);

  -- 3. Iteration-heavy: single requests that looped through the model many
  --    times (tool loops). Legitimate for agentic work; suspicious past the knob.
  --    Per REQUEST: cost is the sum of every ledger row the request owns.
  WITH heavy AS (
    SELECT request_id, sum(cost) AS cost, max(iterations) AS iterations,
           max(tool_calls) AS tool_calls, min(feature) AS feature, min(agent_name) AS agent,
           min(coalesce(user_email, user_id::text)) AS who,
           min(conversation_id::text) AS conversation_id, min(conversation_title) AS conversation,
           min(created_at) AS at
    FROM spend_fact
    WHERE request_id IS NOT NULL
    GROUP BY request_id
    HAVING max(iterations) >= v_iteration_heavy
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost), 0),
    'n',    count(*),
    'threshold', v_iteration_heavy,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'request_id', request_id, 'cost', cost, 'iterations', iterations,
               'tool_calls', tool_calls, 'feature', feature, 'agent', agent,
               'user', who, 'conversation_id', conversation_id, 'conversation', conversation,
               'at', at) ORDER BY cost DESC)
      FROM (SELECT * FROM heavy ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM heavy;
  v_signals := v_signals || jsonb_build_object('iteration_heavy', v_row);

  -- 4. Hogs: a single conversation that alone is more than hog_share_pct of
  --    the whole window.
  WITH per_conv AS (
    SELECT conversation_id, min(conversation_title) AS title, sum(cost) AS cost,
           count(DISTINCT request_id) AS requests, min(user_email) AS user_email,
           min(agent_name) AS agent, min(feature) AS feature,
           CASE WHEN coalesce(sum(cost) FILTER (WHERE trigger = 'manual'), 0)
                     >= coalesce(sum(cost) FILTER (WHERE trigger = 'automated'), 0)
                THEN 'manual' ELSE 'automated' END AS trigger,
           min(created_at) AS first_at, max(created_at) AS last_at
    FROM spend_fact
    WHERE conversation_id IS NOT NULL
    GROUP BY conversation_id
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost) FILTER (WHERE v_total_cost > 0 AND cost / v_total_cost * 100 >= v_hog_share_pct), 0),
    'n',    count(*) FILTER (WHERE v_total_cost > 0 AND cost / v_total_cost * 100 >= v_hog_share_pct),
    'threshold', v_hog_share_pct,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversation_id', conversation_id, 'conversation', title, 'cost', cost,
               'share', CASE WHEN v_total_cost > 0 THEN cost / v_total_cost ELSE 0 END,
               'requests', requests, 'user', user_email, 'agent', agent, 'feature', feature,
               'trigger', trigger, 'first_at', first_at, 'last_at', last_at) ORDER BY cost DESC)
      FROM (SELECT * FROM per_conv
            WHERE v_total_cost > 0 AND cost / v_total_cost * 100 >= v_hog_share_pct
            ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM per_conv;
  v_signals := v_signals || jsonb_build_object('conversation_hogs', v_row);

  -- 5. Spikes: hours that cost more than spike_multiplier × the median
  --    non-zero hour. A loop or a runaway job shows up here first.
  WITH per_hour AS (
    SELECT local_hour, sum(cost) AS cost, count(*) AS n
    FROM spend_fact
    GROUP BY local_hour
    HAVING sum(cost) > 0
  ),
  med AS (
    SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY cost))::numeric AS median FROM per_hour
  ),
  spiking AS (
    SELECT h.local_hour, h.cost, h.n, m.median
    FROM per_hour h, med m
    WHERE h.cost > v_spike_multiplier * m.median
  ),
  top_feature AS (
    SELECT DISTINCT ON (f.local_hour) f.local_hour, f.feature
    FROM spend_fact f JOIN spiking s ON s.local_hour = f.local_hour
    GROUP BY f.local_hour, f.feature
    ORDER BY f.local_hour, sum(f.cost) DESC
  ),
  top_user AS (
    SELECT DISTINCT ON (f.local_hour) f.local_hour, coalesce(f.user_email, f.user_id::text) AS who
    FROM spend_fact f JOIN spiking s ON s.local_hour = f.local_hour
    GROUP BY f.local_hour, coalesce(f.user_email, f.user_id::text)
    ORDER BY f.local_hour, sum(f.cost) DESC
  )
  SELECT jsonb_build_object(
    'median_hour', coalesce((SELECT median FROM med), 0),
    'threshold',   v_spike_multiplier,
    'cost', coalesce((SELECT sum(cost) FROM spiking), 0),
    'n',    (SELECT count(*) FROM spiking),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'hour', to_char(s.local_hour, 'YYYY-MM-DD"T"HH24:00'),
               'cost', s.cost, 'n', s.n,
               'multiple', CASE WHEN s.median > 0 THEN round((s.cost / s.median)::numeric, 1) ELSE NULL END,
               'top_feature', tf.feature,
               'top_user', tu.who) ORDER BY s.cost DESC)
      FROM (SELECT * FROM spiking ORDER BY cost DESC LIMIT 25) s
      LEFT JOIN top_feature tf ON tf.local_hour = s.local_hour
      LEFT JOIN top_user tu ON tu.local_hour = s.local_hour), '[]'::jsonb))
  INTO v_row;
  v_signals := v_signals || jsonb_build_object('spike_hours', v_row);

  -- 6. Repeat bursts: the same person + agent + feature firing at least
  --    repeat_burst requests inside one ten-minute bucket. Humans do not type
  --    that fast; loops and retry storms do.
  WITH buckets AS (
    SELECT user_id, min(user_email) AS user_email, agent_id, min(agent_name) AS agent,
           feature, trigger,
           date_trunc('hour', created_at) + (floor(extract(minute FROM created_at) / 10) * interval '10 minutes') AS bucket,
           count(DISTINCT request_id) AS requests, sum(cost) AS cost
    FROM spend_fact
    WHERE request_id IS NOT NULL
    GROUP BY user_id, agent_id, feature, trigger, bucket
    HAVING count(DISTINCT request_id) >= v_repeat_burst
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost), 0),
    'n',    count(*),
    'threshold', v_repeat_burst,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'bucket', bucket, 'user', coalesce(user_email, user_id::text), 'agent', agent,
               'feature', feature, 'trigger', trigger, 'requests', requests, 'cost', cost)
             ORDER BY cost DESC)
      FROM (SELECT * FROM buckets ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM buckets;
  v_signals := v_signals || jsonb_build_object('repeat_bursts', v_row);

  -- 7. Unpriced: API calls whose cost is NULL — the model had no price on file,
  --    so the ledger UNDER-counts by an unknown amount.
  SELECT jsonb_build_object(
    'n', coalesce(sum(unpriced_calls), 0),
    'requests', count(*) FILTER (WHERE unpriced_calls > 0))
  INTO v_row
  FROM spend_fact
  WHERE request_id IS NOT NULL;
  v_signals := v_signals || jsonb_build_object('unpriced', v_row);

  -- ── The most expensive individual requests, every dimension on the row ─────
  -- One row per REQUEST (its ledger rows summed); a ledger row no request
  -- explains stands on its own.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'request_id',       request_id,
           'execution_id',     execution_id,
           'at',               at,
           'cost',             cost,
           'share',            CASE WHEN v_total_cost > 0 THEN cost / v_total_cost ELSE 0 END,
           'organization_id',  organization_id,
           'organization',     organization_name,
           'user_id',          user_id,
           'user',             who,
           'agent_id',         agent_id,
           'agent',            agent_name,
           'app',              app,
           'feature',          feature,
           'origin',           origin_class,
           'trigger',          trigger,
           'source',           source,
           'model',            model,
           'provider',         provider,
           'conversation_id',  conversation_id,
           'conversation',     conversation_title,
           'status',           request_status,
           'finish_reason',    finish_reason,
           'iterations',       iterations,
           'tool_calls',       tool_calls,
           'tokens_in',        tokens_in,
           'tokens_cached',    tokens_cached,
           'tokens_out',       tokens_out
         ) ORDER BY cost DESC), '[]'::jsonb)
  INTO v_top_requests
  FROM (
    SELECT request_id,
           min(execution_id::text)::uuid AS execution_id,
           min(created_at) AS at, sum(cost) AS cost,
           min(organization_id::text)::uuid AS organization_id, min(organization_name) AS organization_name,
           min(user_id::text)::uuid AS user_id, min(coalesce(user_email, user_id::text)) AS who,
           min(agent_id::text)::uuid AS agent_id, min(agent_name) AS agent_name,
           min(app) AS app, min(feature) AS feature, min(origin_class) AS origin_class,
           min(trigger) AS trigger, min(source) AS source, min(model) AS model, min(provider) AS provider,
           min(conversation_id::text)::uuid AS conversation_id, min(conversation_title) AS conversation_title,
           min(request_status) AS request_status, min(finish_reason) AS finish_reason,
           max(iterations) AS iterations, max(tool_calls) AS tool_calls,
           sum(tokens_in) AS tokens_in, sum(tokens_cached) AS tokens_cached, sum(tokens_out) AS tokens_out
    FROM spend_fact
    GROUP BY coalesce(request_id::text, execution_id::text), request_id
    ORDER BY sum(cost) DESC NULLS LAST
    LIMIT 40
  ) t;

  RETURN jsonb_build_object(
    'generated_at',       now(),
    'timezone',           v_tz,
    'timezone_requested', p_tz,
    'window',             jsonb_build_object('from', p_from, 'to', p_to, 'hours', round(v_hours, 2)),
    'filters',            coalesce(p_filters, '{}'::jsonb),
    'thresholds',         p_thresholds,
    'totals',             v_totals,
    'dimensions',         v_dimensions,
    'series',             jsonb_build_object('day', v_series_day, 'hour', v_series_hour),
    'signals',            v_signals,
    'top_requests',       v_top_requests);
END;
$function$;

COMMENT ON FUNCTION public.admin_spend_breakdown(timestamptz, timestamptz, text, jsonb, jsonb) IS
  'Super-admin only. runtime.global_execution for any window (≤92 days), filtered by any combination of organization / user / agent / app / feature / origin / trigger / source / model / conversation / login session / day / hour, returned as totals, every dimension ranked with share-of-total and a remainder, zero-filled day and hour series split manual/automated, the "dig here" signals (failed spend, context-heavy conversations, iteration-heavy requests, conversation hogs, hour spikes, repeat bursts, unpriced calls) and the most expensive individual requests. Thresholds are the platform.spend_explorer.* knobs, resolved by the client and required.';

-- ── admin_spend_overview: drop the superseded by_org / by_user arrays ─────────
-- by_user came from chat.user_usage_summary (the rolling throttling window),
-- which is not the ledger and read as "nobody spent it". by_org is the
-- breakdown's organization dimension. Both are gone, not kept.

CREATE OR REPLACE FUNCTION public.admin_spend_overview(p_tz text DEFAULT 'UTC')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz            text;
  v_today         timestamptz;
  v_yesterday     timestamptz;
  v_month_start   timestamptz;
  v_days_elapsed  numeric;
  v_days_in_month numeric;
  v_headline      jsonb;
  v_by_day        jsonb;
  v_ledgers       jsonb := '[]'::jsonb;
  v_print         jsonb;
  r               record;
  v_row           jsonb;
  v_exists        boolean;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin_spend_overview: super admin only'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    PERFORM now() AT TIME ZONE coalesce(p_tz, 'UTC');
    v_tz := coalesce(p_tz, 'UTC');
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  v_today       := date_trunc('day',   now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_yesterday   := v_today - interval '1 day';
  v_month_start := date_trunc('month', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  v_days_elapsed  := extract(epoch FROM (now() - v_month_start)) / 86400.0;
  v_days_in_month := extract(day FROM (v_month_start + interval '1 month' - interval '1 day')
                                       AT TIME ZONE v_tz);

  SELECT jsonb_build_object(
    'today',          coalesce(sum(cost) FILTER (WHERE created_at >= v_today), 0),
    'today_runs',     count(*) FILTER (WHERE created_at >= v_today),
    'yesterday',      coalesce(sum(cost) FILTER (WHERE created_at >= v_yesterday
                                                   AND created_at <  v_today), 0),
    'last_7d',        coalesce(sum(cost) FILTER (WHERE created_at >= now() - interval '7 days'), 0),
    'last_30d',       coalesce(sum(cost) FILTER (WHERE created_at >= now() - interval '30 days'), 0),
    'month_to_date',  coalesce(sum(cost) FILTER (WHERE created_at >= v_month_start), 0),
    'last_24h',       coalesce(sum(cost) FILTER (WHERE created_at >= now() - interval '24 hours'), 0),
    'all_time',       coalesce(sum(cost), 0),
    'rows_all_time',  count(*)
  )
  INTO v_headline
  FROM runtime.global_execution;

  v_headline := v_headline
    || jsonb_build_object(
         'days_elapsed',  round(v_days_elapsed, 2),
         'days_in_month', v_days_in_month,
         'month_projection',
           CASE WHEN v_days_elapsed >= 0.25
                THEN round((v_headline->>'month_to_date')::numeric
                           / v_days_elapsed * v_days_in_month, 2)
                ELSE NULL
           END);

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'day'), '[]'::jsonb)
  INTO v_by_day
  FROM (
    SELECT jsonb_build_object(
             'day',  to_char(d.day, 'YYYY-MM-DD'),
             'cost', coalesce(s.cost, 0),
             'runs', coalesce(s.runs, 0)
           ) AS x
    FROM generate_series(
           (v_today - interval '29 days') AT TIME ZONE v_tz,
           v_today AT TIME ZONE v_tz,
           interval '1 day') AS d(day)
    LEFT JOIN LATERAL (
      SELECT sum(g.cost) AS cost, count(*) AS runs
      FROM runtime.global_execution g
      WHERE g.created_at >= d.day AT TIME ZONE v_tz
        AND g.created_at <  (d.day + interval '1 day') AT TIME ZONE v_tz
    ) s ON true
  ) q;

  FOR r IN SELECT * FROM public._spend_ledger_registry() LOOP
    IF r.table_name IS NULL THEN
      v_ledgers := v_ledgers || jsonb_build_array(jsonb_build_object(
        'ledger_key', r.ledger_key, 'label', r.label, 'role', r.role,
        'note', r.note, 'table_ref', NULL, 'exists', false,
        'rows', NULL, 'last_write', NULL,
        'total_all', NULL, 'total_today', NULL, 'total_30d', NULL));
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = r.schema_name AND table_name = r.table_name
    ) INTO v_exists;

    IF NOT v_exists THEN
      v_ledgers := v_ledgers || jsonb_build_array(jsonb_build_object(
        'ledger_key', r.ledger_key, 'label', r.label, 'role', r.role,
        'note', r.note, 'table_ref', r.schema_name || '.' || r.table_name,
        'exists', false, 'rows', NULL, 'last_write', NULL,
        'total_all', NULL, 'total_today', NULL, 'total_30d', NULL));
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT jsonb_build_object(
         %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, true,
         %L, count(*),
         %L, max(%I),
         %L, coalesce(sum(%I), 0),
         %L, coalesce(sum(%I) FILTER (WHERE %I >= $1), 0),
         %L, coalesce(sum(%I) FILTER (WHERE %I >= now() - interval ''30 days''), 0))
       FROM %I.%I',
      'ledger_key', r.ledger_key, 'label', r.label, 'role', r.role,
      'note', r.note, 'table_ref', r.schema_name || '.' || r.table_name, 'exists',
      'rows',
      'last_write', r.ts_column,
      'total_all',  r.cost_column,
      'total_today', r.cost_column, r.ts_column,
      'total_30d',   r.cost_column, r.ts_column,
      r.schema_name, r.table_name)
    INTO v_row
    USING v_today;

    v_ledgers := v_ledgers || jsonb_build_array(v_row);
  END LOOP;

  SELECT jsonb_build_object(
    'orders',         count(*),
    'paid_orders',    count(*) FILTER (WHERE paid_at IS NOT NULL),
    'revenue_usd',    coalesce(sum(charge_amount_cents) FILTER (WHERE paid_at IS NOT NULL), 0) / 100.0,
    'refunded_usd',   coalesce(sum(charge_amount_cents) FILTER (WHERE refunded_at IS NOT NULL), 0) / 100.0,
    'lulu_cost_usd',  coalesce(sum(lulu_total_incl_tax) FILTER (WHERE paid_at IS NOT NULL), 0),
    'last_order_at',  max(created_at)
  )
  INTO v_print
  FROM commerce.print_order
  WHERE deleted_at IS NULL;

  v_print := v_print || jsonb_build_object(
    'margin_usd',
      (v_print->>'revenue_usd')::numeric
      - (v_print->>'refunded_usd')::numeric
      - (v_print->>'lulu_cost_usd')::numeric);

  RETURN jsonb_build_object(
    'generated_at',   now(),
    'timezone',       v_tz,
    'timezone_requested', p_tz,
    'today_start',    v_today,
    'headline',       v_headline,
    'by_day',         v_by_day,
    'ledgers',        v_ledgers,
    'print_orders',   v_print);
END;
$function$;

COMMENT ON FUNCTION public.admin_spend_overview(text) IS
  'Super-admin only. The headline half of the platform spend dashboard: totals from runtime.global_execution in the caller''s timezone, the 30-day series, every cost ledger with its last write, and print-order revenue vs Lulu cost. Every breakdown by organization / person / agent / model / feature lives in admin_spend_breakdown.';

-- ── Declare the client door BEFORE granting (db-rules §6d-4) ──────────────────

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
VALUES
  ('public', 'admin_spend_breakdown', 'p_from timestamp with time zone, p_to timestamp with time zone, p_tz text, p_filters jsonb, p_thresholds jsonb',
   'platform spend dashboard',
   'Super-admin-only read behind /administration/billing/spend. Definer because the platform total crosses every organization''s RLS boundary by definition, and because PostgREST aggregates are disabled on this project. Identity is auth.uid() via public.is_super_admin(). Arguments: a window (capped at 92 days), an IANA zone for day boundaries, equality filters on the dimension keys, and the five platform.spend_explorer knob values the client resolved. Returns aggregates, dimension identities (organization/user/agent/conversation ids and names, email addresses of spenders), and per-request cost rows — no prompts, no payloads, no message content. Materialises a temp table ON COMMIT DROP; writes nothing durable.')
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.admin_spend_breakdown(timestamptz, timestamptz, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_spend_breakdown(timestamptz, timestamptz, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_spend_breakdown(timestamptz, timestamptz, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_spend_breakdown(timestamptz, timestamptz, text, jsonb, jsonb) TO service_role;
