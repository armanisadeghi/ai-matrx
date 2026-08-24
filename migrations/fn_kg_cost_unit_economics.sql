-- WP-08 (Knowledge System launch) Layer 3 — unit economics from the per-run
-- ingest ledger (rag.ingest_run). RECORD of a live migration applied via the
-- Supabase MCP on 2026-08-24 (migration fn_kg_cost_unit_economics).
-- Consumer: /administration/knowledge/kg-cost (KgCostDashboard).
-- Same contract as the other fn_kg_cost_* RPCs: SECURITY DEFINER, self-gated
-- on public.is_super_admin(), one jsonb document:
--   by_source_kind[]  — runs/successes/errors/skips/stuck_running, p50/p90/max
--                       success cost, cost_per_1k_chars, stage sums, cache_hit_pct
--   enrichment        — avg cost with vs without enrich + the measured multiplier
--   totals            — window totals, projected monthly (1x and 10x), inexact runs
--   recent_runs[]     — last 50 runs for the drill-down table
CREATE OR REPLACE FUNCTION public.fn_kg_cost_unit_economics(p_days int DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(p_days, 1));
  v_by_kind jsonb;
  v_enrich jsonb;
  v_totals jsonb;
  v_recent jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION '/kg-cost is admin-only';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(k)::jsonb ORDER BY k.total_cost_usd DESC), '[]'::jsonb)
    INTO v_by_kind
  FROM (
    SELECT
      source_kind,
      COUNT(*) AS runs,
      COUNT(*) FILTER (WHERE status = 'success') AS successes,
      COUNT(*) FILTER (WHERE status = 'error') AS errors,
      COUNT(*) FILTER (WHERE status = 'skipped') AS skips,
      COUNT(*) FILTER (WHERE status = 'running') AS stuck_running,
      ROUND(COALESCE(SUM(total_cost_usd), 0), 6) AS total_cost_usd,
      ROUND(COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY total_cost_usd)
              FILTER (WHERE status = 'success'), 0)::numeric, 6) AS p50_cost_usd,
      ROUND(COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY total_cost_usd)
              FILTER (WHERE status = 'success'), 0)::numeric, 6) AS p90_cost_usd,
      ROUND(COALESCE(MAX(total_cost_usd) FILTER (WHERE status = 'success'), 0), 6) AS max_cost_usd,
      CASE WHEN COALESCE(SUM(chars_in) FILTER (WHERE status = 'success'), 0) > 0
        THEN ROUND(1000.0 * SUM(total_cost_usd) FILTER (WHERE status = 'success')
             / SUM(chars_in) FILTER (WHERE status = 'success'), 6)
        ELSE 0 END AS cost_per_1k_chars_usd,
      ROUND(COALESCE(SUM(embedding_cost_usd), 0), 6) AS embedding_cost_usd,
      ROUND(COALESCE(SUM(extraction_cost_usd), 0), 6) AS extraction_cost_usd,
      ROUND(COALESCE(SUM(cleanup_cost_usd), 0), 6) AS cleanup_cost_usd,
      ROUND(COALESCE(SUM(enrichment_cost_usd), 0), 6) AS enrichment_cost_usd,
      SUM(embedding_cache_hits) AS embedding_cache_hits,
      SUM(embedding_calls) AS embedding_calls,
      CASE WHEN COALESCE(SUM(embedding_cache_hits) + SUM(embedding_calls), 0) > 0
        THEN ROUND(100.0 * SUM(embedding_cache_hits)
             / (SUM(embedding_cache_hits) + SUM(embedding_calls)), 1)
        ELSE 0 END AS cache_hit_pct
    FROM rag.ingest_run
    WHERE started_at >= v_since
    GROUP BY source_kind
  ) k;

  SELECT jsonb_build_object(
    'runs_with_enrich', COUNT(*) FILTER (WHERE enrich_ran),
    'runs_without_enrich', COUNT(*) FILTER (WHERE NOT enrich_ran),
    'avg_cost_with_enrich_usd', ROUND(COALESCE(AVG(total_cost_usd) FILTER (WHERE enrich_ran AND status = 'success'), 0), 6),
    'avg_cost_without_enrich_usd', ROUND(COALESCE(AVG(total_cost_usd) FILTER (WHERE NOT enrich_ran AND status = 'success'), 0), 6),
    'multiplier', CASE
      WHEN COALESCE(AVG(total_cost_usd) FILTER (WHERE NOT enrich_ran AND status = 'success'), 0) > 0
       AND COALESCE(AVG(total_cost_usd) FILTER (WHERE enrich_ran AND status = 'success'), 0) > 0
      THEN ROUND(AVG(total_cost_usd) FILTER (WHERE enrich_ran AND status = 'success')
           / AVG(total_cost_usd) FILTER (WHERE NOT enrich_ran AND status = 'success'), 1)
      ELSE NULL END
  ) INTO v_enrich
  FROM rag.ingest_run WHERE started_at >= v_since;

  SELECT jsonb_build_object(
    'window_days', GREATEST(p_days, 1),
    'runs', COUNT(*),
    'total_cost_usd', ROUND(COALESCE(SUM(total_cost_usd), 0), 6),
    'embedding_cost_saved_usd', ROUND(COALESCE(SUM(embedding_cost_saved_usd), 0), 6),
    'projected_monthly_usd', ROUND(COALESCE(SUM(total_cost_usd), 0) * 30.0 / GREATEST(p_days, 1), 4),
    'projected_monthly_10x_usd', ROUND(COALESCE(SUM(total_cost_usd), 0) * 300.0 / GREATEST(p_days, 1), 4),
    'inexact_cost_runs', COUNT(*) FILTER (WHERE NOT cost_is_exact)
  ) INTO v_totals
  FROM rag.ingest_run WHERE started_at >= v_since;

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT id, organization_id, source_kind, source_id, triggered_by, status,
           skip_reason, chars_in, chunks_written, chunks_reused,
           embedding_cost_usd, extraction_cost_usd, cleanup_cost_usd,
           enrichment_cost_usd, total_cost_usd, cost_is_exact, enrich_ran,
           duration_ms, started_at
    FROM rag.ingest_run
    ORDER BY started_at DESC
    LIMIT 50
  ) r;

  RETURN jsonb_build_object(
    'by_source_kind', v_by_kind,
    'enrichment', v_enrich,
    'totals', v_totals,
    'recent_runs', v_recent
  );
END;
$function$;
