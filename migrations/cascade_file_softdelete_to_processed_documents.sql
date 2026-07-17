-- Keep a file and its (expensive, LLM-derived) processed_documents as ONE SET
-- through soft-delete and restore.
--
-- A file's derivations (initial_extract, clean, synthetic_qa, agent_structured_json,
-- chunked_*, user_fork …) all carry source_kind='cld_file' + source_id=<file id>.
-- Before this trigger, soft-deleting a file left those derivations live-but-
-- unreachable (15 such orphans on 2026-07-17) — a half-deleted set. Worse, the
-- surviving-but-unreferenced rows were the kind of expensive work
-- (~2,400 LLM calls for one guide) we must never silently strand.
--
-- Behaviour (Arman decision 2026-07-17: "cascade as one set, restore together"):
--   * file deleted_at  NULL -> set   → soft-delete every live derivation of the
--     file, stamping metadata.deleted_via='file_cascade' so restore is precise.
--   * file deleted_at  set  -> NULL  → restore ONLY the derivations this cascade
--     soft-deleted (marker present) — a derivation deleted on its own stays deleted.
--
-- Soft-delete only — NEVER hard-deletes; nothing expensive is destroyed. The
-- hard-delete association GC (separate trigger) does not fire here, so a
-- soft-deleted derivation keeps its conversation edges and they come back on
-- restore. Idempotent.

create or replace function docproc.cascade_file_softdelete_to_documents()
returns trigger
language plpgsql
security definer
set search_path to 'public','docproc','files'
as $function$
begin
  -- Soft-delete: file just went to the trash → take its derivations with it.
  if old.deleted_at is null and new.deleted_at is not null then
    update docproc.processed_documents
       set deleted_at = new.deleted_at,
           metadata = jsonb_set(coalesce(metadata, '{}'::jsonb),
                                 '{deleted_via}', '"file_cascade"', true)
     where source_kind = 'cld_file'
       and source_id = new.id::text
       and deleted_at is null;

  -- Restore: file came back → restore only what THIS cascade removed.
  elsif old.deleted_at is not null and new.deleted_at is null then
    update docproc.processed_documents
       set deleted_at = null,
           metadata = metadata - 'deleted_via'
     where source_kind = 'cld_file'
       and source_id = new.id::text
       and deleted_at is not null
       and metadata->>'deleted_via' = 'file_cascade';
  end if;

  return new;
end
$function$;

drop trigger if exists _cascade_softdelete_documents on files.files;
create trigger _cascade_softdelete_documents
  after update on files.files
  for each row execute function docproc.cascade_file_softdelete_to_documents();
