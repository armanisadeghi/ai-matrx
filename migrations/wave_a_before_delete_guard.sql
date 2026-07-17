-- Wave A soft-delete — CAPSTONE: enforce THE INVARIANT at the DB.
-- Spec: docs/handoffs/wave-a-softdelete-spec.md (Decision 6).
--
-- Lifecycle is strictly active -> soft-deleted -> deleted. A live
-- processed_documents row can NEVER be hard-deleted — by anyone, including
-- service role and SECURITY DEFINER functions. Every sanctioned purge path
-- (rag.fn_purge_library_document, aidream purge_*_rag_artifacts) operates on
-- rows that are already trashed (or pre-stamps them in the same tx).
--
-- V10 (documented deviation from the spec's capstone text): NO trigger guard
-- on rag.kg_chunks. Rationale, verified against live grants + code:
--   * authenticated has SELECT-only on rag.kg_chunks — no user-facing DELETE
--     path exists to guard.
--   * chunk hard-deletes are service-only REBUILD machinery (re-ingest stale
--     replacement, derivation rebuilds, repo re-index) that legitimately
--     erases live rows of live docs; a trigger guard would break every
--     re-ingest, and a bypass GUC threaded through ~10 package sites adds
--     more risk than it removes.
--   * chunks die with their doc via FK CASCADE — which the doc-level guard
--     below already forces through the trash.
-- Belt: revoke the (RLS-denied anyway) anon DELETE grant on the doc table.

create or replace function docproc.guard_processed_document_delete()
returns trigger
language plpgsql
as $function$
begin
  if old.deleted_at is null and old.archived_at is null then
    raise exception
      'processed_document % is live — hard delete is forbidden; soft-delete first (lifecycle: active -> soft-deleted -> deleted)',
      old.id
      using errcode = '55000',
            hint = 'set deleted_at (trash) and purge from the Trash surface';
  end if;
  return old;
end
$function$;

drop trigger if exists _guard_harddelete on docproc.processed_documents;
create trigger _guard_harddelete
  before delete on docproc.processed_documents
  for each row
  execute function docproc.guard_processed_document_delete();

revoke delete on docproc.processed_documents from anon;
