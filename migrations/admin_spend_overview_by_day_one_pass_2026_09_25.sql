-- based-on: public.admin_spend_overview(text) 78162ee26705202e558473b140f971d91eeb3ade5a8de74a0afd5b6c921ad78c
-- admin_spend_overview: the 30-day chart reads runtime.global_execution ONCE, not once per day.
--
-- 2026-09-25: admin_spend_overview hit statement timeouts on production. Measured on the clone as
-- admin@admin.com (super admin): 3.3-3.8 s, 540 269 shared buffers. 441 000 of those buffers were
-- the by_day block: a LEFT JOIN LATERAL per local day, each a full scan of runtime.global_execution
-- (218k rows, 14.7k buffers, no created_at index). This file replaces ONLY that block with one
-- grouped pass over the 30-day window, bucketed by the same local-day windows; every other line of
-- the live body (sha of pg_get_functiondef read from production 2026-09-25) is verbatim.
-- Same signature, same return shape. No data write.
-- Proof: scripts/campaign-tests/admin_spend_overview_one_pass_green.sql (the old and new by_day
-- answer byte-identical in four time zones; the call's buffers fall under 150 000).
CREATE OR REPLACE FUNCTION public.admin_spend_overview(p_tz text DEFAULT 'UTC'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  -- ONE pass over the window, bucketed by local day. It used to be a LATERAL subquery per day:
  -- 30 full scans of runtime.global_execution (no created_at index; 540k buffers, ~2.1 s of this
  -- function's ~3.3 s on the clone, 2026-09-25). The buckets are the same local-day windows.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
             'day',  to_char(d.day, 'YYYY-MM-DD'),
             'cost', coalesce(s.cost, 0),
             'runs', coalesce(s.runs, 0)
           ) ORDER BY d.day), '[]'::jsonb)
  INTO v_by_day
  FROM generate_series(
         (v_today - interval '29 days') AT TIME ZONE v_tz,
         v_today AT TIME ZONE v_tz,
         interval '1 day') AS d(day)
  LEFT JOIN (
    SELECT date_trunc('day', g.created_at AT TIME ZONE v_tz) AS day,
           sum(g.cost) AS cost, count(*) AS runs
    FROM runtime.global_execution g
    WHERE g.created_at >= ((v_today - interval '29 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz
      AND g.created_at <  ((v_today AT TIME ZONE v_tz) + interval '1 day') AT TIME ZONE v_tz
    GROUP BY 1
  ) s ON s.day = d.day;

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
$function$
;
