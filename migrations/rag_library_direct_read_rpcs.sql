-- rag_library_direct_read_rpcs.sql
--
-- Kill the Python-as-DB-proxy hop for the /rag/library visibility surface.
-- The FastAPI endpoints GET /rag/library and GET /rag/library/summary/totals
-- are pure aggregate reads over docproc.* + rag.* — no secrets, no S3, no
-- processing. Per CLAUDE.md, a direct call that returns the same rows is the
-- canonical path: React -> supabase-js -> SECURITY DEFINER RPC, no Python.
--
-- These two RPCs replicate the exact SQL of the FastAPI handlers
-- (aidream/api/routers/rag.py :: list_library_documents / library_summary),
-- keyed on auth.uid() instead of a JWT-derived user_id passed by the server.
-- They live in public (always PostgREST-exposed) and are SECURITY DEFINER so
-- they can read the docproc/rag schemas regardless of PostgREST exposure.
--
-- Idempotent: CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- 1. public.rag_library_list — the paginated list + total, as one jsonb object
--    matching the FE ApiListResponse ({documents, total, limit, offset}).
-- ---------------------------------------------------------------------------
create or replace function public.rag_library_list(
  p_limit         int  default 50,
  p_offset        int  default 0,
  p_search        text default null,
  p_status_filter text default null,
  p_source_kind   text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, docproc, rag
as $$
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

  -- base row set with derived counts (mirrors the FastAPI correlated subqueries)
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
         order by created_at desc
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
$$;

-- ---------------------------------------------------------------------------
-- 2. public.rag_library_summary_totals — one-shot rollup for the page header.
--    Mirrors library_summary(). p_organization_id replaces ctx.organization_id
--    for the data_stores count (created_by = me OR org match).
-- ---------------------------------------------------------------------------
create or replace function public.rag_library_summary_totals(
  p_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, docproc, rag
as $$
declare
  v_uid uuid := auth.uid();
  v_documents_total     int := 0;
  v_documents_ready     int := 0;
  v_documents_embedding int := 0;
  v_documents_extracted int := 0;
  v_documents_pending   int := 0;
  v_pages_persisted     bigint := 0;
  v_chunks              bigint := 0;
  v_embeddings_oai      bigint := 0;
  v_embeddings_voyage   bigint := 0;
  v_data_stores         int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Per top-level document: pages, chunks, oai-embeddings -> status buckets.
  with tops as (
    select id from docproc.processed_documents
    where owner_id = v_uid and parent_processed_id is null
  ),
  per_doc as (
    select
      t.id,
      (select count(*) from docproc.processed_document_pages p
         where p.processed_document_id = t.id) as pages,
      (select count(*) from rag.kg_chunks c
         where c.processed_document_id = t.id) as chunks,
      (select count(*) from rag.kg_chunks c
         join rag.embeddings_voyage_4_large_1024 e on e.chunk_id = c.id
         where c.processed_document_id = t.id) as oai
    from tops t
  )
  select
    count(*)::int,
    coalesce(sum(pages), 0),
    coalesce(sum(chunks), 0),
    coalesce(sum(oai), 0),
    coalesce(sum((pages = 0)::int), 0),
    coalesce(sum((pages > 0 and chunks = 0)::int), 0),
    coalesce(sum((pages > 0 and chunks > 0 and oai >= chunks)::int), 0),
    coalesce(sum((pages > 0 and chunks > 0 and oai < chunks)::int), 0)
  into
    v_documents_total, v_pages_persisted, v_chunks, v_embeddings_oai,
    v_documents_pending, v_documents_extracted, v_documents_ready,
    v_documents_embedding
  from per_doc;

  -- Legacy voyage_code_3 embeddings across ALL of the owner's docs.
  select coalesce(count(*), 0)
  into v_embeddings_voyage
  from rag.kg_chunks c
  join rag.embeddings_voyage_code_3_1024 e on e.chunk_id = c.id
  where c.processed_document_id in (
    select id from docproc.processed_documents where owner_id = v_uid
  );

  -- Data stores the caller owns or belongs to (org).
  select count(*)::int
  into v_data_stores
  from rag.data_stores
  where created_by = v_uid
     or (p_organization_id is not null and organization_id = p_organization_id);

  return jsonb_build_object(
    'documents_total',     v_documents_total,
    'documents_ready',     v_documents_ready,
    'documents_embedding', v_documents_embedding,
    'documents_extracted', v_documents_extracted,
    'documents_pending',   v_documents_pending,
    'pages_persisted',     v_pages_persisted,
    'chunks',              v_chunks,
    'embeddings_oai',      v_embeddings_oai,
    'embeddings_voyage',   v_embeddings_voyage,
    'data_stores',         v_data_stores
  );
end;
$$;

revoke all on function public.rag_library_list(int, int, text, text, text) from public, anon;
revoke all on function public.rag_library_summary_totals(uuid) from public, anon;
grant execute on function public.rag_library_list(int, int, text, text, text) to authenticated;
grant execute on function public.rag_library_summary_totals(uuid) to authenticated;
