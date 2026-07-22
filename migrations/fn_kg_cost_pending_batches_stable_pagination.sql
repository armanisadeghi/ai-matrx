-- fn_kg_cost_pending_batches: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated SECURITY DEFINER RPC whose ORDER BY is not a TOTAL order. Each
-- LIMIT/OFFSET page is a separate query execution and Postgres uses a bounded
-- top-N sort, so tied rows are ordered arbitrarily and differently on each page
-- — rows get duplicated onto one page and silently skipped from another. On
-- agx_get_list, paging a 365-row result 100 at a time returned only 306
-- DISTINCT ids.
--
-- Batches are submitted in bursts, so `submitted_at` ties are the norm here.
--
-- FIX: append `id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION public.fn_kg_cost_pending_batches(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'iam'
AS $function$
DECLARE
  v_limit int := GREATEST(1, LEAST(p_limit, 500));
  v_offset int := GREATEST(0, p_offset);
  v_total int;
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION '/kg-cost is admin-only';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.auto_ingest_batch WHERE status IN ('pending', 'in_progress');

  SELECT jsonb_build_object(
    'total', v_total,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'custom_id', b.custom_id, 'provider', b.provider, 'batch_id', b.batch_id,
        'kind', b.kind, 'user_id', b.user_id, 'organization_id', b.organization_id,
        'organization_name', o.name, 'source_kind', b.source_kind, 'source_id', b.source_id,
        'status', b.status, 'est_cost_usd', COALESCE(b.est_cost_usd, 0), 'poll_count', COALESCE(b.poll_count, 0),
        'submitted_at', b.submitted_at, 'last_polled_at', b.last_polled_at, 'next_poll_at', b.next_poll_at
      ))
      FROM (
        SELECT * FROM public.auto_ingest_batch
        WHERE status IN ('pending', 'in_progress')
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        ORDER BY submitted_at DESC, id DESC
        LIMIT v_limit OFFSET v_offset
      ) b
      LEFT JOIN iam.organizations o ON o.id = b.organization_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
