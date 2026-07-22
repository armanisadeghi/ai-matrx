-- rag.fn_kg_inspector_entity_mentions: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated RPC whose ORDER BY is not a TOTAL order. Each LIMIT/OFFSET page is
-- a separate query execution and Postgres uses a bounded top-N sort, so tied
-- rows are ordered arbitrarily and differently on each page — rows get
-- duplicated onto one page and silently skipped from another. On agx_get_list,
-- paging a 365-row result 100 at a time returned only 306 DISTINCT ids.
--
-- Here (confidence, chunk_id) is not unique: one chunk can carry several
-- mention rows for the same entity.
--
-- FIX: append `ce.id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION rag.fn_kg_inspector_entity_mentions(p_entity_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag'
AS $function$
DECLARE
  v_limit int := GREATEST(1, LEAST(p_limit, 200));
  v_offset int := GREATEST(0, p_offset);
  v_total int;
  v_window int := 240;
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'kg-inspector is super_admin-only';
  END IF;

  SELECT COUNT(*) INTO v_total FROM rag.kg_chunk_entities WHERE entity_id = p_entity_id;

  SELECT jsonb_build_object(
    'total', v_total, 'limit', v_limit, 'offset', v_offset,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'chunk_id', r.chunk_id,
        'source_kind', r.source_kind,
        'source_id', r.source_id,
        'span_start', r.span_start,
        'span_end', r.span_end,
        'confidence', r.confidence,
        'snippet', CASE
          WHEN r.content_text IS NULL THEN ''
          WHEN r.span_start IS NOT NULL AND r.span_end IS NOT NULL AND r.span_start >= 0 THEN
            (CASE WHEN GREATEST(r.span_start - ((v_window - GREATEST(r.span_end - r.span_start, 0)) / 2), 0) > 0 THEN '…' ELSE '' END)
            || substr(r.content_text,
                 GREATEST(r.span_start - ((v_window - GREATEST(r.span_end - r.span_start, 0)) / 2), 0) + 1,
                 LEAST(r.span_end + ((v_window - GREATEST(r.span_end - r.span_start, 0)) / 2), length(r.content_text))
                   - GREATEST(r.span_start - ((v_window - GREATEST(r.span_end - r.span_start, 0)) / 2), 0))
            || (CASE WHEN LEAST(r.span_end + ((v_window - GREATEST(r.span_end - r.span_start, 0)) / 2), length(r.content_text)) < length(r.content_text) THEN '…' ELSE '' END)
          ELSE left(r.content_text, v_window) || (CASE WHEN length(r.content_text) > v_window THEN '…' ELSE '' END)
        END
      ))
      FROM (
        SELECT ce.chunk_id, c.source_kind, c.source_id, c.content_text,
               ce.span_start, ce.span_end, ce.confidence
        FROM rag.kg_chunk_entities ce
        JOIN rag.kg_chunks c ON c.id = ce.chunk_id
        WHERE ce.entity_id = p_entity_id
        -- `ce.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        ORDER BY ce.confidence DESC NULLS LAST, ce.chunk_id, ce.id
        LIMIT v_limit OFFSET v_offset
      ) r
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
