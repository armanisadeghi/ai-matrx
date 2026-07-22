-- rag_library_list: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated SECURITY DEFINER RPC whose ORDER BY is not a TOTAL order. Each
-- LIMIT/OFFSET page is a separate query execution and Postgres uses a bounded
-- top-N sort, so tied rows are ordered arbitrarily and differently on each page
-- — rows get duplicated onto one page and silently skipped from another. On
-- agx_get_list, paging a 365-row result 100 at a time returned only 306
-- DISTINCT ids.
--
-- Bulk ingest writes many processed_documents with the same created_at, so the
-- ties here are common, not theoretical.
--
-- FIX: append `id` as a final tiebreaker to the `filtered` subquery's ORDER BY
-- — the one that actually governs LIMIT/OFFSET.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION public.rag_library_list(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_source_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'docproc', 'rag'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_limit  int  := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int  := greatest(0, coalesce(p_offset, 0));
  v_search text := case when p_search is not null and p_search <> ''
                        then '%' || p_search || '%' end;
  v_total  int;
  v_docs   jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  with base as (
    select
      pd.id, pd.name, pd.source_kind, pd.source_id, pd.mime_type,
      pd.total_pages, pd.derivation_kind, pd.parent_processed_id,
      pd.created_at, pd.updated_at,
      (pd.structured_json is not null) as has_structured_json,
      (select count(*) from docproc.processed_document_pages
         where processed_document_id = pd.id) as pages_persisted,
      (select count(*) from rag.kg_chunks
         where processed_document_id = pd.id) as chunks,
      (select count(*) from rag.kg_chunks c
         join rag.embeddings_voyage_4_large_1024 e on e.chunk_id = c.id
         where c.processed_document_id = pd.id) as embeddings_oai,
      (select count(*) from rag.kg_chunks c
         join rag.embeddings_voyage_code_3_1024 e on e.chunk_id = c.id
         where c.processed_document_id = pd.id) as embeddings_voyage,
      (select count(*) from rag.data_store_members m
         where m.source_kind = 'cld_file'
           and m.source_id   = pd.source_id
           and m.deleted_at is null) as data_store_count
    from docproc.processed_documents pd
    where (pd.owner_id = v_uid
           or (pd.organization_id = public.system_org_id('library')
               and public.can_curate_library_document(pd.id, v_uid)))
      and pd.deleted_at is null
      and pd.parent_processed_id is null
      and (v_search is null or pd.name ilike v_search)
      and (p_source_kind is null or pd.source_kind = p_source_kind)
  ),
  scored as (
    select *,
      case
        when pages_persisted = 0        then 'pending'
        when chunks = 0                 then 'extracted'
        when embeddings_oai < chunks    then 'embedding'
        else 'ready'
      end as status
    from base
  ),
  filtered as (
    select * from scored
    where p_status_filter is null or status = p_status_filter
  )
  select
    count(*)::int,
    coalesce(
      (select jsonb_agg(row_to_json(d)::jsonb order by d.created_at desc)
       from (
         select
           id::text, name, source_kind, source_id, mime_type, total_pages,
           pages_persisted::int, chunks::int, embeddings_oai::int,
           embeddings_voyage::int, data_store_count::int, has_structured_json,
           coalesce(derivation_kind, 'initial_extract') as derivation_kind,
           parent_processed_id::text,
           status,
           to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') as created_at,
           to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') as updated_at
         from filtered
         -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
         order by created_at desc, id
         limit v_limit offset v_offset
       ) d),
      '[]'::jsonb)
  into v_total, v_docs
  from filtered;

  return jsonb_build_object(
    'documents', coalesce(v_docs, '[]'::jsonb),
    'total',     coalesce(v_total, 0),
    'limit',     v_limit,
    'offset',    v_offset
  );
end;
$function$;
