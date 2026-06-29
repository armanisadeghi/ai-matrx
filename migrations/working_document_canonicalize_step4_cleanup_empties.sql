-- Working document rebuild — STEP 4: delete the empty (null-content) documents.
-- The materialize-on-write model creates a row only on the first byte of content,
-- so a content-empty row is always pre-rebuild garbage (88% of the old table).
-- Their bespoke junction rows cascade away (FK ON DELETE CASCADE); they have no
-- platform.associations edges (STEP 2 migrated only non-empty docs). Idempotent.
delete from workbench.working_documents where length(coalesce(content, '')) = 0;
