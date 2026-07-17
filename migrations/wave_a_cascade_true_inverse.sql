-- Wave A soft-delete — Phase 5: ONE transactional authority for the file
-- family cascade. Spec: docs/handoffs/wave-a-softdelete-spec.md (Phase 5).
--
-- Before: the files.files trigger stamped only processed_documents; chunk and
-- membership hiding ran as a fire-and-forget aidream task whose failures were
-- swallowed (doc trashed, chunks live), and NOTHING restored chunks on the FE
-- restore path. Now the trigger is a true inverse, same-transaction with the
-- file-row flip, for EVERY writer (FE RPCs, aidream, direct SQL):
--
--   soft-delete: stamp derivations (marker deleted_via='file_cascade'),
--     their chunks (doc-scoped + source-keyed), and memberships (file-keyed +
--     doc-keyed).
--   restore: restore ONLY what this cascade removed — docs by marker; chunks
--     by restored-doc scope (a doc individually trashed BEFORE the file stays
--     trashed, chunks included); members stamped at-or-after the file's
--     trash instant (>= old.deleted_at), so a membership the user explicitly
--     removed from a store earlier is never resurrected.
--
-- aidream's source_lifecycle keeps the suggestion satellites + non-cld
-- sources; its chunk/doc work for cld_file is now an idempotent no-op.

create or replace function docproc.cascade_file_softdelete_to_documents()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'docproc', 'files', 'rag'
as $function$
declare
  v_doc_ids uuid[] := '{}';
begin
  -- Soft-delete: file just went to the trash → take its whole family with it.
  if old.deleted_at is null and new.deleted_at is not null then
    with stamped as (
      update docproc.processed_documents
         set deleted_at = new.deleted_at,
             metadata = jsonb_set(coalesce(metadata, '{}'::jsonb),
                                   '{deleted_via}', '"file_cascade"', true)
       where source_kind = 'cld_file'
         and source_id = new.id::text
         and deleted_at is null
       returning id)
    select coalesce(array_agg(id), '{}') into v_doc_ids from stamped;

    update rag.kg_chunks c
       set deleted_at = new.deleted_at
     where c.deleted_at is null
       and (c.processed_document_id = any(v_doc_ids)
            or (c.source_kind = 'cld_file' and c.source_id = new.id::text));

    update rag.data_store_members m
       set deleted_at = new.deleted_at
     where m.deleted_at is null
       and ((m.source_kind = 'cld_file' and m.source_id = new.id::text)
            or (m.source_kind = 'processed_document'
                and m.source_id in (select unnest(v_doc_ids)::text)));

  -- Restore: file came back → restore only what THIS cascade removed.
  elsif old.deleted_at is not null and new.deleted_at is null then
    with restored as (
      update docproc.processed_documents
         set deleted_at = null,
             metadata = metadata - 'deleted_via'
       where source_kind = 'cld_file'
         and source_id = new.id::text
         and deleted_at is not null
         and metadata->>'deleted_via' = 'file_cascade'
       returning id)
    select coalesce(array_agg(id), '{}') into v_doc_ids from restored;

    update rag.kg_chunks c
       set deleted_at = null
     where c.deleted_at is not null
       and (c.processed_document_id = any(v_doc_ids)
            or (c.source_kind = 'cld_file' and c.source_id = new.id::text
                and c.processed_document_id is null
                and c.deleted_at >= old.deleted_at));

    update rag.data_store_members m
       set deleted_at = null
     where m.deleted_at is not null
       and m.deleted_at >= old.deleted_at
       and ((m.source_kind = 'cld_file' and m.source_id = new.id::text)
            or (m.source_kind = 'processed_document'
                and m.source_id in (select unnest(v_doc_ids)::text)));
  end if;

  return new;
end
$function$;

-- The cascade only matters when deleted_at actually flips — don't run the
-- (now 3-statement) function on every rename/move/metadata update.
drop trigger if exists _cascade_softdelete_documents on files.files;
create trigger _cascade_softdelete_documents
  after update on files.files
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function docproc.cascade_file_softdelete_to_documents();
