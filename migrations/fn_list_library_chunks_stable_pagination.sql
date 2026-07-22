-- rag.fn_list_library_chunks: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated RPC whose ORDER BY is not a TOTAL order. Each LIMIT/OFFSET page is
-- a separate query execution and Postgres uses a bounded top-N sort, so tied
-- rows are ordered arbitrarily and differently on each page — rows get
-- duplicated onto one page and silently skipped from another. On agx_get_list,
-- paging a 365-row result 100 at a time returned only 306 DISTINCT ids.
--
-- FIX: append `id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION rag.fn_list_library_chunks(p_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_parent_only boolean DEFAULT false, p_children_only boolean DEFAULT false, p_page_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'rag', 'docproc'
AS $function$
DECLARE
  v_limit int := GREATEST(1, LEAST(p_limit, 500));
  v_offset int := GREATEST(0, p_offset);
  v_total int;
  v_result jsonb;
BEGIN
  IF p_parent_only AND p_children_only THEN
    RAISE EXCEPTION 'parent_only and children_only are mutually exclusive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM docproc.processed_documents WHERE id = p_id) THEN
    RAISE EXCEPTION 'document not found';
  END IF;

  SELECT COUNT(*) INTO v_total FROM rag.kg_chunks
   WHERE processed_document_id = p_id AND valid_to IS NULL
     AND (NOT p_parent_only OR parent_chunk_id IS NULL)
     AND (NOT p_children_only OR parent_chunk_id IS NOT NULL)
     AND (p_page_number IS NULL OR p_page_number = ANY(page_numbers));

  SELECT jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'chunks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'chunk_index', c.chunk_index,
        'chunk_kind', c.chunk_kind,
        'parent_chunk_id', c.parent_chunk_id,
        'page_numbers', c.page_numbers,
        'token_count', c.token_count,
        'content_text', COALESCE(c.content_text, ''),
        'has_oai_embedding', EXISTS (SELECT 1 FROM rag.embeddings_voyage_4_large_1024 e WHERE e.chunk_id = c.id),
        'has_voyage_embedding', EXISTS (SELECT 1 FROM rag.embeddings_voyage_code_3_1024 e WHERE e.chunk_id = c.id),
        'section_kind', c.metadata->>'section_kind',
        'metadata', c.metadata
      ))
      FROM (
        SELECT * FROM rag.kg_chunks
        WHERE processed_document_id = p_id AND valid_to IS NULL
          AND (NOT p_parent_only OR parent_chunk_id IS NULL)
          AND (NOT p_children_only OR parent_chunk_id IS NOT NULL)
          AND (p_page_number IS NULL OR p_page_number = ANY(page_numbers))
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        ORDER BY chunk_index, created_at, id
        LIMIT v_limit OFFSET v_offset
      ) c
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
