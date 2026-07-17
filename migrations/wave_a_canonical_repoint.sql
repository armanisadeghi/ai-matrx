-- Wave A soft-delete — Phase 3: canonical pointer integrity.
-- Spec: docs/handoffs/wave-a-softdelete-spec.md (Phase 3, V3/V4).
--
-- files.canonical_processed_document_id was first-writer-wins (bridge, AFTER
-- INSERT, only when NULL) with FK ON DELETE SET NULL. Soft-delete left it
-- aimed at a trashed doc; hard-delete NULLed it forever. These triggers keep
-- it aimed at the NEWEST live canonical sibling (Decision 3), symmetrically:
--   * AFTER UPDATE OF deleted_at  → recompute (covers soft-delete AND restore)
--   * AFTER DELETE                → recompute (purge promotes a surviving
--     sibling, or leaves NULL which the existing AFTER INSERT bridge reclaims
--     on re-ingest — pdf_set_canonical_bridge writes whenever pointer IS NULL,
--     so no bridge change is needed; V4)
-- Idempotent: CREATE OR REPLACE + drop-if-exists trigger recreation.

create or replace function docproc.recompute_canonical_for_file(p_file_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'docproc', 'files'
as $$
  update files.files f
     set canonical_processed_document_id = (
           select pd.id
             from docproc.processed_documents pd
            where pd.source_kind = 'cld_file'
              and pd.source_id = p_file_id::text
              and pd.derivation_kind in ('initial_extract', 'legacy_import')
              and pd.deleted_at is null
            order by pd.created_at desc
            limit 1)
   where f.id = p_file_id;
$$;

create or replace function docproc.canonical_repoint_on_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'docproc', 'files'
as $function$
declare
  rec record;
begin
  if tg_op = 'DELETE' then
    rec := old;
  else
    rec := new;
  end if;
  if rec.source_kind = 'cld_file'
     and rec.source_id is not null
     and rec.derivation_kind in ('initial_extract', 'legacy_import') then
    perform docproc.recompute_canonical_for_file(rec.source_id::uuid);
  end if;
  return null;  -- AFTER trigger; return value ignored
end
$function$;

drop trigger if exists trg_canonical_repoint_on_softdelete on docproc.processed_documents;
create trigger trg_canonical_repoint_on_softdelete
  after update of deleted_at on docproc.processed_documents
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function docproc.canonical_repoint_on_lifecycle();

drop trigger if exists trg_canonical_repoint_on_delete on docproc.processed_documents;
create trigger trg_canonical_repoint_on_delete
  after delete on docproc.processed_documents
  for each row
  execute function docproc.canonical_repoint_on_lifecycle();
