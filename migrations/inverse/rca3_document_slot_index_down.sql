-- autocommit: DROP INDEX CONCURRENTLY
-- inverse of rca3_document_slot_index.sql: removes the one-document-per-slot unique index.
drop index concurrently if exists platform.assoc_document_slot_uq;
