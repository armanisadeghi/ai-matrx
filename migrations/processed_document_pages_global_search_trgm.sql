-- Preserve GenericTableBrowser's OR search across every text and UUID column.
-- All UUID branches already have btree indexes; an unindexed text branch forces
-- a full scan even for an exact ID. GIN supports each column independently.
CREATE INDEX CONCURRENTLY IF NOT EXISTS processed_document_pages_global_search_trgm
ON docproc.processed_document_pages USING gin (
  raw_text public.gin_trgm_ops,
  cleaned_text public.gin_trgm_ops,
  extraction_method public.gin_trgm_ops,
  section_kind public.gin_trgm_ops,
  section_title public.gin_trgm_ops,
  section_subtype public.gin_trgm_ops,
  portion_kind public.gin_trgm_ops,
  speaker public.gin_trgm_ops
);
