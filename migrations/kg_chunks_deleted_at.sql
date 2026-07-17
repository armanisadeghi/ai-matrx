-- Wave A Phase 0 — dedicated soft-delete marker for RAG chunks.
--
-- rag.kg_chunks has valid_from/valid_to (bitemporal SUPERSESSION — used by
-- reprocess/replace) but NO deletion marker. Reusing valid_to for delete would
-- conflate delete with supersede and break restore (restoring by clearing
-- valid_to would resurrect genuinely superseded chunks). So Wave A adds a
-- separate `deleted_at`: soft-delete stamps it, restore NULLs it, the rows +
-- embeddings stay intact (the expensive work we are protecting), and every
-- read surface filters `deleted_at IS NULL` alongside the existing
-- `valid_to IS NULL`.
--
-- The partial index backs the hot "live chunks for this document" path used by
-- soft-delete/restore/purge (scoped by processed_document_id) and by search.
-- Idempotent.

alter table rag.kg_chunks add column if not exists deleted_at timestamptz;

create index if not exists kg_chunks_live_by_doc_idx
  on rag.kg_chunks (processed_document_id)
  where deleted_at is null and valid_to is null;
