-- Wave A soft-delete — Phase 1 (FE path): convert the three library delete
-- RPCs from hard DELETE to soft-delete. These are the functions the FE
-- actually calls (LibraryPage / LibraryDocDetailSheet via supabase.rpc), found
-- as a Phase-1 adversarial BLOCKER: they still ran literal DELETEs after the
-- Python endpoints were converted. Semantics mirror aidream
-- library_queries.py exactly (one behavior, two entry points):
--   * lifecycle: active -> soft-deleted (deleted_at); hard erase ONLY via the
--     purge path from the Trash (Decision 6 invariant).
--   * canonical extracts (initial_extract/legacy_import) are BLOCKED from
--     per-document delete (Decision 2) — file path only.
--   * "Delete file" soft-deletes the WHOLE family as one set (Decision 4):
--     file row first (the cascade trigger stamps derivations with
--     metadata.deleted_via='file_cascade'), then chunks + members +
--     suggestion rows, all in the same transaction.
--   * gate: owner OR can_curate_library_document (the old RPCs had NO owner
--     leg — an unreported defect; the Python original always had one).
-- Responses keep the legacy keys (deleted_pages now always 0 — pages follow
-- their parent) and bulk adds skipped_canonical.

create or replace function rag.fn_delete_library_document(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'rag', 'docproc'
as $function$
declare
  v_user uuid := auth.uid();
  v_kind text;
  v_chunks int := 0;
begin
  select derivation_kind into v_kind
    from docproc.processed_documents
   where id = p_id and deleted_at is null
     and (owner_id = v_user or public.can_curate_library_document(id, v_user));
  if v_kind is null then
    raise exception 'document not found';
  end if;
  if v_kind in ('initial_extract', 'legacy_import') then
    raise exception 'canonical extract — remove it via the file (delete or reprocess the file), not per-document';
  end if;

  update rag.kg_chunks set deleted_at = now()
   where processed_document_id = p_id and deleted_at is null;
  get diagnostics v_chunks = row_count;

  update rag.data_store_members set deleted_at = now()
   where source_kind = 'processed_document' and source_id = p_id::text
     and deleted_at is null;

  update docproc.processed_documents set deleted_at = now()
   where id = p_id and deleted_at is null;

  return jsonb_build_object(
    'deleted_documents', 1, 'deleted_pages', 0, 'deleted_chunks', v_chunks
  );
end;
$function$;

create or replace function rag.fn_bulk_delete_library_documents(p_ids uuid[] default null::uuid[], p_status text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'rag', 'docproc'
as $function$
declare
  v_user uuid := auth.uid();
  v_target_ids uuid[];
  v_skipped int := 0;
  v_chunks int := 0;
  v_docs int := 0;
begin
  if p_ids is null and p_status is null then
    raise exception 'must specify ids or status';
  end if;
  if p_status is not null and p_status not in ('pending', 'extracted', 'embedding', 'ready') then
    raise exception 'status must be one of: pending, extracted, embedding, ready';
  end if;

  if p_ids is not null then
    select array_agg(id) filter (where derivation_kind not in ('initial_extract','legacy_import')),
           count(*) filter (where derivation_kind in ('initial_extract','legacy_import'))
      into v_target_ids, v_skipped
    from docproc.processed_documents
    where id = any(p_ids) and owner_id = v_user and deleted_at is null;
  else
    select array_agg(pd.id) filter (where pd.derivation_kind not in ('initial_extract','legacy_import')),
           count(*) filter (where pd.derivation_kind in ('initial_extract','legacy_import'))
      into v_target_ids, v_skipped
    from docproc.processed_documents pd
    where pd.owner_id = v_user
      and pd.deleted_at is null
      and (
        case
          when (select count(*) from docproc.processed_document_pages pp where pp.processed_document_id = pd.id) = 0
            then 'pending'
          when (select count(*) from rag.kg_chunks kc where kc.processed_document_id = pd.id and kc.deleted_at is null) = 0
            then 'extracted'
          when (select count(*) from rag.kg_chunks kc
                  join rag.embeddings_voyage_4_large_1024 e on e.chunk_id = kc.id
                 where kc.processed_document_id = pd.id and kc.deleted_at is null)
               >= (select count(*) from rag.kg_chunks kc where kc.processed_document_id = pd.id and kc.deleted_at is null)
            then 'ready'
          else 'embedding'
        end
      ) = p_status;
  end if;

  if v_target_ids is null or array_length(v_target_ids, 1) is null then
    return jsonb_build_object('deleted_documents', 0, 'deleted_pages', 0,
                              'deleted_chunks', 0, 'skipped_canonical', coalesce(v_skipped, 0));
  end if;

  update rag.kg_chunks set deleted_at = now()
   where processed_document_id = any(v_target_ids) and deleted_at is null;
  get diagnostics v_chunks = row_count;

  update rag.data_store_members set deleted_at = now()
   where source_kind = 'processed_document'
     and source_id in (select unnest(v_target_ids)::text)
     and deleted_at is null;

  update docproc.processed_documents set deleted_at = now()
   where id = any(v_target_ids) and deleted_at is null;
  get diagnostics v_docs = row_count;

  return jsonb_build_object(
    'deleted_documents', v_docs, 'deleted_pages', 0,
    'deleted_chunks', v_chunks, 'skipped_canonical', coalesce(v_skipped, 0)
  );
end;
$function$;

create or replace function rag.fn_delete_library_document_and_source(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'rag', 'docproc', 'files'
as $function$
declare
  v_user uuid := auth.uid();
  v_source_kind text;
  v_source_id text;
  v_chunks int := 0;
  v_docs int := 0;
  v_cld_deleted boolean := false;
begin
  select source_kind, source_id into v_source_kind, v_source_id
    from docproc.processed_documents
   where id = p_id and deleted_at is null
     and (owner_id = v_user or public.can_curate_library_document(id, v_user));
  if v_source_kind is null then
    raise exception 'document not found';
  end if;

  -- File row FIRST: the cascade trigger stamps every derivation with
  -- metadata.deleted_via='file_cascade' so a file restore brings back exactly
  -- this set.
  if v_source_kind = 'cld_file' then
    update files.files
       set deleted_at = now()
     where id = v_source_id::uuid and created_by = v_user and deleted_at is null;
    v_cld_deleted := found;
  end if;

  -- Any family docs the trigger didn't stamp (non-cld sources, curator-owned
  -- files the UPDATE above skipped).
  update docproc.processed_documents set deleted_at = now()
   where source_kind = v_source_kind and source_id = v_source_id
     and deleted_at is null;

  select count(*) into v_docs from docproc.processed_documents
   where source_kind = v_source_kind and source_id = v_source_id
     and deleted_at is not null;

  update rag.kg_chunks set deleted_at = now()
   where source_kind = v_source_kind and source_id = v_source_id
     and deleted_at is null;
  get diagnostics v_chunks = row_count;

  -- Memberships: source-keyed (loose kind match, mirrors the old RPC) AND
  -- doc-keyed rows for every family member (the Phase-1 adversarial leak).
  update rag.data_store_members set deleted_at = now()
   where deleted_at is null
     and ( (source_id = v_source_id and source_kind in ('cld_file', 'processed_document'))
        or (source_kind = 'processed_document' and source_id in (
              select pd.id::text from docproc.processed_documents pd
               where pd.source_kind = v_source_kind and pd.source_id = v_source_id)) );

  -- Suggestion/match/alert satellites — same set the Python lifecycle stamps.
  update rag.scope_association_suggestions set deleted_at = now()
   where source_kind = v_source_kind and source_id = v_source_id and deleted_at is null;
  update rag.scope_item_value_suggestions set deleted_at = now()
   where source_kind = v_source_kind and source_id = v_source_id and deleted_at is null;
  update rag.kg_value_matches set deleted_at = now()
   where source_kind = v_source_kind and source_id = v_source_id and deleted_at is null;
  update rag.kg_alerts set deleted_at = now()
   where source_kind = v_source_kind and source_id = v_source_id and deleted_at is null;
  update rag.scope_suggestions set deleted_at = now()
   where source_kind = v_source_kind and source_id = v_source_id and deleted_at is null;

  return jsonb_build_object(
    'deleted_documents', v_docs, 'deleted_pages', 0,
    'deleted_chunks', v_chunks, 'deleted_cld_file', v_cld_deleted
  );
end;
$function$;
