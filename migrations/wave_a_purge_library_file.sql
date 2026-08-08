-- Wave A — family purge (trash-empty for a file's document family).
-- Handoff: docs/handoffs/wave-a-softdelete-spec.md (Remaining #2).
--
-- Purges every processed_documents row derived from a trashed cld_file, plus
-- chunks (CASCADE takes embeddings/entities/edges), pages, and data-store
-- memberships. THE INVARIANT holds: callable ONLY when the file itself is
-- already soft-deleted, and only by its owner. The files.files row and the
-- S3 binary are NOT touched here — the caller follows up with the server
-- hard-delete path (S3 knowledge is server-only per files doctrine).
-- Idempotent: CREATE OR REPLACE; re-running on an already-purged family is a no-op.

create or replace function rag.fn_purge_library_file(p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'rag', 'docproc'
as $function$
declare
  v_user uuid := auth.uid();
  v_docs int := 0;
  v_chunks int := 0;
  v_pages int := 0;
begin
  -- Guard: file exists, caller owns it, and it is ALREADY in the trash.
  perform 1 from files.files
   where id = p_file_id and created_by = v_user and deleted_at is not null;
  if not found then
    raise exception 'file not found in trash (only a trashed file''s family can be purged, by its owner)';
  end if;

  -- Belt: stamp any family doc the cascade missed so the BEFORE DELETE guard
  -- passes (guard requires deleted_at IS NOT NULL on every purged row).
  update docproc.processed_documents
     set deleted_at = now()
   where source_kind = 'cld_file' and source_id = p_file_id::text
     and deleted_at is null;

  delete from rag.kg_chunks c
   using docproc.processed_documents d
   where d.source_kind = 'cld_file' and d.source_id = p_file_id::text
     and c.processed_document_id = d.id;
  get diagnostics v_chunks = row_count;

  delete from docproc.processed_document_pages p
   using docproc.processed_documents d
   where d.source_kind = 'cld_file' and d.source_id = p_file_id::text
     and p.processed_document_id = d.id;
  get diagnostics v_pages = row_count;

  delete from rag.data_store_members m
   using docproc.processed_documents d
   where d.source_kind = 'cld_file' and d.source_id = p_file_id::text
     and m.source_kind = 'processed_document' and m.source_id = d.id::text;

  delete from rag.data_store_members
   where source_kind = 'cld_file' and source_id = p_file_id::text;

  delete from docproc.processed_documents
   where source_kind = 'cld_file' and source_id = p_file_id::text;
  get diagnostics v_docs = row_count;

  return jsonb_build_object(
    'purged_documents', v_docs,
    'purged_pages', v_pages,
    'purged_chunks', v_chunks
  );
end;
$function$;

grant execute on function rag.fn_purge_library_file(uuid) to authenticated;
