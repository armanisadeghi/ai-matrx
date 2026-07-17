-- Wave A soft-delete — Phase 5.5: owner Trash surface (DB half) + summary fix.
-- Spec: docs/handoffs/wave-a-softdelete-spec.md (Decision 5, V8).
--
-- 1. public.rag_library_summary_totals now excludes trashed docs + chunks
--    (it counted them — found during the trash build).
-- 2. rag.fn_list_library_trash  — owner-only list of trashed docs, with the
--    deleted_via marker so the UI can route family rows to "restore the file".
-- 3. rag.fn_restore_library_document — owner-only per-doc restore. Rejects
--    file-cascade rows (the family restores together via the file, which the
--    files trigger handles atomically).
-- 4. rag.fn_purge_library_document — THE ONLY hard-delete path, owner-only,
--    and only for a row that is ALREADY soft-deleted (the lifecycle
--    invariant: active -> soft-deleted -> deleted). Chunks cascade the
--    embeddings; the AFTER DELETE trigger repoints the canonical bridge.

create or replace function public.rag_library_summary_totals(p_organization_id uuid default null::uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'docproc', 'rag'
as $function$
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

  with tops as (
    select id from docproc.processed_documents
    where owner_id = v_uid and parent_processed_id is null and deleted_at is null
  ),
  per_doc as (
    select
      t.id,
      (select count(*) from docproc.processed_document_pages p
         where p.processed_document_id = t.id) as pages,
      (select count(*) from rag.kg_chunks c
         where c.processed_document_id = t.id and c.deleted_at is null) as chunks,
      (select count(*) from rag.kg_chunks c
         join rag.embeddings_voyage_4_large_1024 e on e.chunk_id = c.id
         where c.processed_document_id = t.id and c.deleted_at is null) as oai
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

  select coalesce(count(*), 0)
  into v_embeddings_voyage
  from rag.kg_chunks c
  join rag.embeddings_voyage_code_3_1024 e on e.chunk_id = c.id
  where c.deleted_at is null
    and c.processed_document_id in (
      select id from docproc.processed_documents
       where owner_id = v_uid and deleted_at is null
    );

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
$function$;

create or replace function rag.fn_list_library_trash()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'rag', 'docproc', 'files'
as $function$
  select coalesce(jsonb_agg(row order by row->>'deleted_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', pd.id,
      'name', pd.name,
      'source_kind', pd.source_kind,
      'source_id', pd.source_id,
      'derivation_kind', pd.derivation_kind,
      'parent_processed_id', pd.parent_processed_id,
      'total_pages', pd.total_pages,
      'deleted_at', pd.deleted_at,
      'deleted_via', pd.metadata->>'deleted_via',
      'file_name', case when pd.source_kind = 'cld_file'
                        then (select f.file_name from files.files f where f.id = pd.source_id::uuid)
                        end,
      'hidden_chunks', (select count(*) from rag.kg_chunks c
                         where c.processed_document_id = pd.id and c.deleted_at is not null)
    ) as row
    from docproc.processed_documents pd
    where pd.owner_id = auth.uid()
      and pd.deleted_at is not null
  ) t;
$function$;

create or replace function rag.fn_restore_library_document(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'rag', 'docproc'
as $function$
declare
  v_user uuid := auth.uid();
  v_via text;
  v_chunks int := 0;
begin
  select metadata->>'deleted_via' into v_via
    from docproc.processed_documents
   where id = p_id and owner_id = v_user and deleted_at is not null;
  if not found then
    raise exception 'document not found in trash';
  end if;
  if v_via = 'file_cascade' then
    raise exception 'this document was trashed with its file — restore the file to bring the whole family back';
  end if;

  update rag.kg_chunks set deleted_at = null
   where processed_document_id = p_id and deleted_at is not null;
  get diagnostics v_chunks = row_count;

  update rag.data_store_members set deleted_at = null
   where source_kind = 'processed_document' and source_id = p_id::text
     and deleted_at is not null;

  update docproc.processed_documents set deleted_at = null
   where id = p_id;

  return jsonb_build_object('restored_documents', 1, 'restored_chunks', v_chunks);
end;
$function$;

create or replace function rag.fn_purge_library_document(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'rag', 'docproc'
as $function$
declare
  v_user uuid := auth.uid();
  v_chunks int := 0;
  v_pages int := 0;
  v_via text;
begin
  -- THE INVARIANT: purge is reachable only from the trash — the row must
  -- already be soft-deleted. There is no active -> hard-deleted path.
  select metadata->>'deleted_via' into v_via
    from docproc.processed_documents
   where id = p_id and owner_id = v_user and deleted_at is not null;
  if not found then
    raise exception 'document not found in trash (only trashed documents can be purged)';
  end if;
  -- Family lock (mirrors fn_restore_library_document): a doc trashed WITH its
  -- file lives and dies with the family — purging one member would strand the
  -- rest. Family purge arrives with the file-purge path.
  if v_via = 'file_cascade' then
    raise exception 'this document was trashed with its file — the family is purged together via the file, not per-document';
  end if;

  delete from rag.kg_chunks where processed_document_id = p_id;
  get diagnostics v_chunks = row_count;
  delete from docproc.processed_document_pages where processed_document_id = p_id;
  get diagnostics v_pages = row_count;
  delete from rag.data_store_members
   where source_kind = 'processed_document' and source_id = p_id::text;
  delete from docproc.processed_documents where id = p_id;

  return jsonb_build_object('purged_documents', 1, 'purged_pages', v_pages, 'purged_chunks', v_chunks);
end;
$function$;

grant execute on function rag.fn_list_library_trash() to authenticated;
grant execute on function rag.fn_restore_library_document(uuid) to authenticated;
grant execute on function rag.fn_purge_library_document(uuid) to authenticated;
