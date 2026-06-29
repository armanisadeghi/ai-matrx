-- Working document rebuild — STEP 2: migrate the real conversation_documents
-- junction links into platform.associations (idempotent). The FE now reads
-- chat↔doc links as `working_document` (source) → `conversation` (target) edges;
-- this carries the existing links over so they hydrate. Only links to a
-- non-empty document are migrated (the empty rows + their links are deleted in
-- STEP 4). The per-link opt-in flag + doc kind ride the edge metadata.
insert into platform.associations
  (source_type, source_id, target_type, target_id, organization_id, metadata, created_by)
select 'working_document', cd.document_id, 'conversation', cd.conversation_id,
       wd.organization_id,
       jsonb_build_object('enabled', cd.enabled, 'doc_kind', cd.kind),
       wd.created_by
from chat.conversation_documents cd
join workbench.working_documents wd on wd.id = cd.document_id
where length(coalesce(wd.content, '')) > 0
on conflict (source_type, source_id, target_type, target_id, role) do nothing;
