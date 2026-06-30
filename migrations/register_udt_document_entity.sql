-- register_udt_document_entity.sql
-- Register `workbench.udt_documents` as a first-class entity in the authoritative
-- registry `platform.entity_types` so it can be a valid association source/target
-- (e.g. War Room attaches a data-table document to a thread/task).
--
-- ROOT CAUSE this fixes: udt_documents is a real, actively-used document entity
-- (the data-tables / Univer document system, distinct from workbench.working_documents
-- = token `working_document`), but it was never retrofit-registered — there is no
-- `udt_documents_base_retrofit.sql`. Frontend code referenced a phantom `document`
-- token that FK-violated against platform.associations.source_type. The correct fix
-- is to register the real table (not to alias a fake token), giving it the canonical
-- token `udt_document` (singular, matching the registry's `working_document`/`file`/
-- `message` convention).
--
-- Semantics from the live table: versioned (`version` int), NO soft-delete column
-- (hard delete), carries organization_id.
--
-- Idempotent: ON CONFLICT (token) DO NOTHING. Safe to re-apply.

insert into platform.entity_types
    (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
values
    ('udt_document', 'workbench', 'udt_documents', 'Document',
     1, true, false, true,
     'Data-table (Univer) document — features/data-tables/document-service + War Room thread document attachments. Distinct from working_document (agent working docs).')
on conflict (token) do nothing;
