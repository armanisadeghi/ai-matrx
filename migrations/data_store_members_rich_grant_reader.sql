-- D89 (2026-07-23): rag.fn_data_store_members_rich raised 'data store not found' for grant
-- readers — its gate predated the grant-reader access pass (creator OR owning-org member only),
-- so /rag/data-stores showed "Could not load members" on granted stores even though the
-- member rows themselves are grant-readable via RLS.
-- Fix: admit super-admins and grant readers via the frozen predicate
-- public.user_can_read_data_store_via_grant (README §2 — never fork a second audience reader).
-- Read-only function; conveys the same rows RLS already allows.

create or replace function rag.fn_data_store_members_rich(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'rag', 'iam', 'docproc', 'files'
as $function$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM rag.data_stores s
       WHERE s.id = p_store_id
         AND (s.created_by = v_user
           OR (s.organization_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM iam.organization_member om
                            WHERE om.organization_id = s.organization_id AND om.user_id = v_user)))
    )
    OR public.user_can_read_data_store_via_grant(v_user, p_store_id)
  ) THEN
    RAISE EXCEPTION 'data store not found';
  END IF;

  WITH members AS (
    SELECT source_kind, source_id, added_at, notes
    FROM rag.data_store_members
    WHERE data_store_id = p_store_id AND deleted_at IS NULL
  ),
  latest_pd AS (
    SELECT DISTINCT ON (pd.source_id) pd.source_id, pd.id AS pd_id
    FROM docproc.processed_documents pd
    WHERE pd.source_kind = 'cld_file'
      AND pd.source_id IN (SELECT source_id FROM members WHERE source_kind = 'cld_file')
    ORDER BY pd.source_id, pd.created_at DESC
  ),
  pd_counts AS (
    SELECT pd_id, pages, chunks, embeddings_oai FROM (
      SELECT DISTINCT pd_id FROM (
        SELECT pd_id FROM latest_pd
        UNION
        SELECT source_id::uuid FROM members WHERE source_kind = 'processed_document'
      ) x
    ) ids
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS pages FROM docproc.processed_document_pages pp WHERE pp.processed_document_id = ids.pd_id
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS chunks FROM rag.kg_chunks kc WHERE kc.processed_document_id = ids.pd_id
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS embeddings_oai FROM rag.kg_chunks kc
        JOIN rag.embeddings_voyage_4_large_1024 e ON e.chunk_id = kc.id
       WHERE kc.processed_document_id = ids.pd_id
    ) e ON true
  ),
  cld_out AS (
    SELECT
      m.source_kind, m.source_id, m.added_at, m.notes,
      f.file_name AS name, f.mime_type, f.size_bytes,
      lp.pd_id AS processed_document_id,
      COALESCE(pc.pages, 0) AS pages,
      COALESCE(pc.chunks, 0) AS chunks,
      COALESCE(pc.embeddings_oai, 0) AS embeddings_oai
    FROM members m
    LEFT JOIN files.files f ON f.id::text = m.source_id
    LEFT JOIN latest_pd lp ON lp.source_id = m.source_id
    LEFT JOIN pd_counts pc ON pc.pd_id = lp.pd_id
    WHERE m.source_kind = 'cld_file'
  ),
  pd_out AS (
    SELECT
      m.source_kind, m.source_id, m.added_at, m.notes,
      d.name, d.mime_type, NULL::bigint AS size_bytes,
      d.id AS processed_document_id,
      COALESCE(pc.pages, 0) AS pages,
      COALESCE(pc.chunks, 0) AS chunks,
      COALESCE(pc.embeddings_oai, 0) AS embeddings_oai
    FROM members m
    JOIN docproc.processed_documents d ON d.id::text = m.source_id
    LEFT JOIN pd_counts pc ON pc.pd_id = d.id
    WHERE m.source_kind = 'processed_document'
  ),
  other_out AS (
    SELECT
      m.source_kind, m.source_id, m.added_at, m.notes,
      m.source_id AS name, NULL::text AS mime_type, NULL::bigint AS size_bytes,
      NULL::uuid AS processed_document_id, 0 AS pages, 0 AS chunks, 0 AS embeddings_oai
    FROM members m
    WHERE m.source_kind NOT IN ('cld_file', 'processed_document')
  ),
  everything AS (
    SELECT * FROM cld_out UNION ALL SELECT * FROM pd_out UNION ALL SELECT * FROM other_out
  )
  SELECT jsonb_build_object(
    'data_store_id', p_store_id,
    'members', COALESCE(jsonb_agg(jsonb_build_object(
      'source_kind', e.source_kind,
      'source_id', e.source_id,
      'added_at', e.added_at,
      'notes', e.notes,
      'name', COALESCE(e.name, e.source_id),
      'mime_type', e.mime_type,
      'size_bytes', e.size_bytes,
      'processed_document_id', e.processed_document_id,
      'pages', e.pages,
      'chunks', e.chunks,
      'embeddings_oai', e.embeddings_oai,
      'status', CASE
        WHEN e.source_kind = 'cld_file' AND e.processed_document_id IS NULL THEN 'no_processing'
        WHEN e.source_kind NOT IN ('cld_file', 'processed_document') THEN 'unknown'
        WHEN e.pages = 0 THEN 'pending'
        WHEN e.chunks = 0 THEN 'extracted'
        WHEN e.embeddings_oai < e.chunks THEN 'embedding'
        ELSE 'ready'
      END
    )), '[]'::jsonb)
  ) INTO v_result
  FROM everything e;

  RETURN v_result;
END;
$function$;

revoke all on function rag.fn_data_store_members_rich(uuid) from public, anon;
grant execute on function rag.fn_data_store_members_rich(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
