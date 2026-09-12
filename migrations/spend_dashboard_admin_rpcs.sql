-- spend_dashboard_admin_rpcs — the two super-admin doors behind the platform
-- SPEND DASHBOARD (/administration/billing/spend) and the daily spend popover.
--
-- WHY AN RPC AND NOT A CLIENT-SIDE READ (Arman, 2026-09-11: "a dashboard where
-- I can easily and quickly see where money is being spent"):
-- `runtime.global_execution` holds 166k rows, 143k of them inside the last 30
-- days. PostgREST on this project has aggregate functions DISABLED
-- (`PGRST123: Use of aggregate functions is not allowed`, verified live
-- 2026-09-12), so the only client-side path to "what did today cost" is
-- `readAllRows` over 143k rows — 144 round trips for one number, and a popover
-- that must open in milliseconds. The sums belong in the database. This is the
-- same shape as the KG cost console's `fn_kg_cost_*` family.
--
-- WHY SECURITY DEFINER: every cost ledger below is RLS-gated to platform
-- admins or to the row's own org. A super admin reading the PLATFORM total has
-- to cross org boundaries by definition. Identity comes from `auth.uid()`
-- only — never a parameter — and both functions refuse anyone who is not a
-- super admin (`public.is_super_admin()`), the same bar the admin RPC family
-- uses (protected-resources).
--
-- THE LEDGER REGISTRY (the honesty half):
-- `_spend_ledger_registry()` is the ONE list of every place this platform does
-- or should record money. Each row declares its role:
--   primary    — the headline. `runtime.global_execution` and nothing else.
--   overlap    — real spend, but the SAME money seen through another lens
--                (chat.user_request $134.36 vs global_execution $145.62 over
--                the same 24h, 2026-09-12). Shown, never added.
--   additive   — genuinely separate spend, currently stale or tiny.
--   gap        — a ledger that EXISTS and writes nothing (or nothing but zeros).
--   unmeasured — money we know we spend with no row anywhere to prove it.
-- Adding a cost source is a row in that VALUES list, in one place, and the
-- dashboard, the gaps tile and the popover all learn it at once. That is why
-- the headline can be labelled honestly as a LOWER BOUND.
--
-- Idempotent (CREATE OR REPLACE + ON CONFLICT DO NOTHING). Reversible: revoke
-- execute and drop the three functions; nothing else depends on them.
-- db-rules §6d-4: the `platform.client_callable_door` rows are declared BEFORE
-- the GRANTs, or `platform.enforce_definer_client_grants` revokes the client
-- EXECUTE inside the GRANT and writes a `ddl_guard_log` row.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

-- ── The registry ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._spend_ledger_registry()
RETURNS TABLE (
  ledger_key   text,
  label        text,
  schema_name  text,
  table_name   text,
  cost_column  text,
  ts_column    text,
  role         text,
  note         text
)
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT * FROM (VALUES
    ('runtime.global_execution', 'AI / provider executions', 'runtime', 'global_execution', 'cost', 'created_at', 'primary',
     'The canonical execution ledger. Every headline number on this page is this table and only this table.'),

    ('chat.user_request', 'Chat user requests', 'chat', 'user_request', 'total_cost', 'created_at', 'overlap',
     'The same provider spend seen per chat request rather than per execution. Shown for cross-checking; never added to the headline.'),
    ('chat.agent_run', 'Agent runs', 'chat', 'agent_run', 'total_cost', 'created_at', 'overlap',
     'Per-run roll-up of the same executions. Never added to the headline.'),
    ('chat.tool_call', 'Tool calls', 'chat', 'tool_call', 'cost_usd', 'created_at', 'overlap',
     'Tool-level slice, almost entirely $0 because model cost is billed on the execution, not the tool.'),

    ('batch.cost_event', 'Provider batch jobs', 'batch', 'cost_event', 'cost_usd', 'created_at', 'additive',
     'Separate spend, but nothing has written here since 2026-09-03.'),
    ('batch.work_item', 'Batch work items', 'batch', 'work_item', 'actual_cost_usd', 'created_at', 'additive',
     'Separate spend; last write 2026-08-15.'),
    ('ops.proof_run', 'Proof runs', 'ops', 'proof_run', 'cost_usd', 'created_at', 'additive',
     'Resilience-lab proof runs. Live and small.'),
    ('rag.ingest_run', 'RAG ingest runs', 'rag', 'ingest_run', 'total_cost_usd', 'created_at', 'additive',
     'Separate embedding/extraction spend; last write 2026-09-03.'),
    ('hindsight.replay_step', 'Hindsight replays', 'hindsight', 'replay_step', 'cost_usd', 'created_at', 'additive',
     'Regression replays; last write 2026-08-17.'),

    ('rag.kg_sweep_run', 'Knowledge-graph sweeps', 'rag', 'kg_sweep_run', 'cost_usd', 'created_at', 'additive',
     'Priced 2026-09-12. Every sweep model call already lands on the primary ledger as an internal_agent_run execution; cost_usd is the sweep-level roll-up, now fed by the corrected tally (it used to collapse an unpriced call to $0). All 62 live rows predate the fix and made 0 model calls, so their $0 is a measured zero, not a hole.'),
    ('docproc.derive_runs', 'Document derive runs', 'docproc', 'derive_runs', 'cost_usd', 'started_at', 'gap',
     'Cost column exists and has never been written.'),
    ('docproc.page_extraction_runs', 'Page extraction runs', 'docproc', 'page_extraction_runs', 'total_cost', 'created_at', 'additive',
     'Priced 2026-09-12. Two defects fixed together: the chunk executor read cost from a key the AI layer never returns (always $0), and the run settle never persisted the total. The same figure is now also metered onto the primary ledger, so read this column as the per-run detail, not as spend to add.'),
    ('docproc.processed_documents', 'Document cleaning', 'docproc', 'processed_documents', 'clean_content_cost_usd', 'created_at', 'additive',
     'Priced 2026-09-12 on the whole-document cleaning path, which now writes the cleaner agent''s real cost. The resumable per-page cleaning path still writes nothing: its runner returns a bare dict across the matrx-rag package seam, so cost cannot reach the row without changing that protocol. Rows before 2026-09-12 are NULL.'),
    ('communication.sms_messages', 'SMS (Twilio)', 'communication', 'sms_messages', 'price', 'created_at', 'additive',
     'Written since 2026-09-12. The outbound dispatcher now stores Twilio''s own answer on every accepted send — num_segments always, price/price_unit whenever Twilio has priced the message — and opens a matching primary-ledger row (link_kind external_api, twilio:sms) charged at segments x the twilio_sms_segment_usd knob, or at Twilio''s real price when it returned one. Read this column as the per-message detail, not as spend to add: the same money is already in the headline. Rows before 2026-09-12 are NULL, and Twilio''s create response usually prices a message as null (it prices after the carrier accepts), so a populated price is the exception, not the rule.'),
    ('crm.enrichment_call', 'CRM enrichment calls', 'crm', 'enrichment_call', 'estimated_cost_usd', 'created_at', 'gap',
     'Table has zero rows.'),
    ('crm.registry_ingest_run', 'CRM registry ingest', 'crm', 'registry_ingest_run', 'estimated_cost_usd', 'created_at', 'gap',
     'Table has zero rows.'),

        ('unmeasured.email',        'Email (Resend)',                NULL, NULL, NULL, NULL, 'unmeasured',
     'Plan-billed, never per email: part of the fixed monthly figure entered in the platform.spend.fixed_monthly_usd setting, shown per day under the headline.'),
    ('speech.global_execution', 'Text-to-speech and transcription', NULL, NULL, NULL, NULL, 'overlap',
     'Measured, and already inside the primary total — not a gap. STT and TTS are priced by the AI catalog like any model (ai.offering pricing, per audio-second or per character) and settle as global_execution rows with link_kind audio_transcription / audio_speech: 3,364 transcriptions and 29,819 audio seconds for $0.38 since 2026-07-15. That is genuinely near-free: $0.046/hour against Groq whisper-large-v3-turbo''s $0.04/hour list. The 5 zero-cost rows were an unpriced call recorded as a believable $0; since 2026-09-12 such a call records meters.unpriced_calls instead. Meet note-taker STT (LiveKit/Deepgram) is billed by LiveKit and has no row here.'),
    ('search.global_execution', 'Search and SEO data APIs',      NULL, NULL, NULL, NULL, 'overlap',
     'Measured since 2026-09-12, and already inside the primary total — no longer a gap. Every SerpAPI, Brave and DataForSEO call opens its own global_execution row (link_kind external_api, agent_run_label "<provider>:<operation>"), because all three funnel through exactly one transport apiece and the host observes each one. DataForSEO reports its own price in every response envelope and that real figure is recorded; SerpAPI and Brave sell calls in a bundle and report nothing, so they are priced from the platform.external_api_prices knobs (serpapi_search_usd, brave_search_usd) an admin can turn. A call we cannot price is recorded UNPRICED with a screaming log line, never as $0 — a $0 row would have this page claim a paid search was free.'),
    ('unmeasured.print_fulfil', 'Print fulfilment (Lulu)',        NULL, NULL, NULL, NULL, 'unmeasured',
     'Captured per order on commerce.print_order.lulu_total_incl_tax, which the Print orders tile shows — it is not in this ledger total.'),
        ('unmeasured.infra',        'Hosting and infrastructure',     NULL, NULL, NULL, NULL, 'unmeasured',
     'AWS ECS/Fargate, sandbox EC2, Supabase, Vercel. Billed by invoice: the fixed monthly figure entered in the platform.spend.fixed_monthly_usd setting, shown per day under the headline.')
  ) AS t(ledger_key, label, schema_name, table_name, cost_column, ts_column, role, note);
$function$;

COMMENT ON FUNCTION public._spend_ledger_registry() IS
  'The ONE list of every place AI Matrx records (or fails to record) money. Roles: primary | overlap | additive | gap | unmeasured. Adding a cost source is a row here.';

-- ── The full dashboard payload ────────────────────────────────────────────────

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
  v_by_org        jsonb;
  v_by_user       jsonb;
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

  -- An unknown zone would silently move every boundary, so fall back loudly to UTC.
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

  -- Headline — runtime.global_execution and nothing else.
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

  -- 30 local days, zero-filled so an empty day reads as $0 and not as a hole.
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

  -- By organization, with the name so the row can open the org.
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'cost_30d')::numeric DESC), '[]'::jsonb)
  INTO v_by_org
  FROM (
    SELECT jsonb_build_object(
             'organization_id', g.organization_id,
             'name',            coalesce(o.name, 'Unattributed'),
             'cost_today',      coalesce(sum(g.cost) FILTER (WHERE g.created_at >= v_today), 0),
             'cost_7d',         coalesce(sum(g.cost) FILTER (WHERE g.created_at >= now() - interval '7 days'), 0),
             'cost_30d',        coalesce(sum(g.cost), 0),
             'runs_30d',        count(*)
           ) AS x
    FROM runtime.global_execution g
    LEFT JOIN iam.organizations o ON o.id = g.organization_id
    WHERE g.created_at >= now() - interval '30 days'
    GROUP BY g.organization_id, o.name
  ) q;

  -- Per user — a DIFFERENT SCOPE: chat.user_usage_summary is the rolling
  -- throttling window, not this page's headline. The UI says so out loud.
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'cost_24h')::numeric DESC), '[]'::jsonb)
  INTO v_by_user
  FROM (
    SELECT jsonb_build_object(
             'user_id',      u.user_id,
             'email',        au.email,
             'auth_type',    u.auth_type,
             'cost_24h',     round(u.cost_24h_mcents / 100000.0, 6),
             'cost_6h',      round(u.cost_6h_mcents  / 100000.0, 6),
             'requests_24h', u.requests_24h,
             'tokens_24h',   u.tokens_24h,
             'blocked',      (u.daily_blocked OR u.window_blocked),
             'last_request_at', u.last_request_at
           ) AS x
    FROM chat.user_usage_summary u
    LEFT JOIN auth.users au ON au.id = u.user_id
    WHERE u.cost_24h_mcents > 0 OR u.requests_24h > 0
  ) q;

  -- Every ledger in the registry, measured the same way.
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

  -- Print orders: what customers PAID us, against what Lulu charged us.
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
    'by_org',         v_by_org,
    'by_user',        v_by_user,
    'ledgers',        v_ledgers,
    'print_orders',   v_print);
END;
$function$;

COMMENT ON FUNCTION public.admin_spend_overview(text) IS
  'Super-admin only. The whole platform spend dashboard in one payload: headline totals from runtime.global_execution in the caller''s timezone, 30-day series, by-organization, by-user (chat.user_usage_summary scope), every cost ledger with its last write, and print-order revenue vs Lulu cost. Aggregation lives here because PostgREST aggregates are disabled and the primary ledger holds 143k rows per 30 days.';

-- ── The popover headline (small and fast) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_spend_headline(p_tz text DEFAULT 'UTC')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz          text;
  v_today       timestamptz;
  v_month_start timestamptz;
  v_out         jsonb;
  v_top         jsonb;
  v_gaps        integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin_spend_headline: super admin only'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    PERFORM now() AT TIME ZONE coalesce(p_tz, 'UTC');
    v_tz := coalesce(p_tz, 'UTC');
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  v_today       := date_trunc('day',   now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_month_start := date_trunc('month', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  SELECT jsonb_build_object(
    'today',         coalesce(sum(cost) FILTER (WHERE created_at >= v_today), 0),
    'today_runs',    count(*) FILTER (WHERE created_at >= v_today),
    'yesterday',     coalesce(sum(cost) FILTER (WHERE created_at >= v_today - interval '1 day'
                                                  AND created_at <  v_today), 0),
    'last_7d',       coalesce(sum(cost) FILTER (WHERE created_at >= now() - interval '7 days'), 0),
    'month_to_date', coalesce(sum(cost) FILTER (WHERE created_at >= v_month_start), 0)
  )
  INTO v_out
  FROM runtime.global_execution
  WHERE created_at >= LEAST(v_month_start, now() - interval '7 days') - interval '1 day';

  SELECT jsonb_build_object(
           'organization_id', g.organization_id,
           'name',            coalesce(o.name, 'Unattributed'),
           'cost',            sum(g.cost))
  INTO v_top
  FROM runtime.global_execution g
  LEFT JOIN iam.organizations o ON o.id = g.organization_id
  WHERE g.created_at >= v_today
  GROUP BY g.organization_id, o.name
  ORDER BY sum(g.cost) DESC NULLS LAST
  LIMIT 1;

  SELECT count(*) INTO v_gaps
  FROM public._spend_ledger_registry()
  WHERE role IN ('gap', 'unmeasured');

  RETURN v_out || jsonb_build_object(
    'generated_at', now(),
    'timezone',     v_tz,
    'today_start',  v_today,
    'top_org',      v_top,
    'gap_count',    v_gaps);
END;
$function$;

COMMENT ON FUNCTION public.admin_spend_headline(text) IS
  'Super-admin only. The small, fast payload behind the daily spend popover: today, yesterday, last 7 days, month to date, today''s top-spending organization, and how many cost sources measure nothing.';

-- ── Declare the client doors BEFORE granting (db-rules §6d-4) ─────────────────

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
VALUES
  ('public', 'admin_spend_overview', 'p_tz text',
   'platform spend dashboard',
   'Super-admin-only read behind /administration/billing/spend. Definer because the platform total crosses every organization''s RLS boundary by definition, and because PostgREST aggregates are disabled on this project so the alternative is paging 143k rows into the browser for one sum. Identity is auth.uid() via public.is_super_admin(); the only argument is an IANA timezone string used for day boundaries, and an unrecognised one falls back to UTC. Returns aggregates and organization/user identities — no execution content, no prompts, no payloads. Read-only.'),
  ('public', 'admin_spend_headline', 'p_tz text',
   'platform spend dashboard',
   'Super-admin-only read behind the daily spend popover. Same gate and same argument as admin_spend_overview, returning only today/yesterday/7d/month-to-date totals, today''s top-spending organization, and the count of unmeasured cost sources. Read-only.')
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public._spend_ledger_registry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._spend_ledger_registry() TO service_role;

REVOKE ALL ON FUNCTION public.admin_spend_overview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_spend_overview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_spend_overview(text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_spend_headline(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_spend_headline(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_spend_headline(text) TO service_role;
