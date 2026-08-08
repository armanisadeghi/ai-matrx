-- Seed the two Office workflow-result kinds consumed by the aidream office
-- graph nodes (office.generate_* / office.extract). Idempotent; mirrors
-- content_ir_seed_workflow_io_kinds.sql. Source models:
-- aidream/services/office_generation/service.py (OfficeGenerationResponse /
-- OfficeExtractionResponse).

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'office_file_result', 'Office File Result', 'python', null,
       $mtx${"description":"FileRef-shaped result the client binds to directly.","properties":{"file_id":{"title":"File Id","type":"string"},"office_kind":{"title":"Office Kind","type":"string"},"mime_type":{"title":"Mime Type","type":"string"},"file_name":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"File Name"},"byte_size":{"title":"Byte Size","type":"integer"},"url":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Url"},"signed_url":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Signed Url"},"download_url":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Download Url"},"cdn_url":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Cdn Url"},"visibility":{"default":"personal","title":"Visibility","type":"string"}},"required":["file_id","office_kind","mime_type","byte_size"],"title":"OfficeGenerationResponse","type":"object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family":"workflow_io","generic":false,"category":"side_effect","source":"aidream.graph_actions.office","description":"FileRef-shaped result of generating an Office file (.docx/.pptx/.xlsx) as a stored asset"}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'office_file_result' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
       $mtx${"file_id":"0f1e2d3c-4b5a-6789-abcd-ef0123456789","office_kind":"docx","mime_type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","file_name":"q3-report.docx","byte_size":24576,"url":"https://files.example.com/f/0f1e2d3c","signed_url":null,"download_url":"https://files.example.com/f/0f1e2d3c?download=1","cdn_url":null,"visibility":"personal"}$mtx$::jsonb,
       'Canonical example', 'authored', true, 'passed', now(),
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'office_file_result' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'office_extraction_result', 'Office Extraction Result', 'python', null,
       $mtx${"$defs":{"OfficePortionOut":{"description":"One slide / sheet / section of an extracted document (FE-facing).","properties":{"index":{"title":"Index","type":"integer"},"number":{"title":"Number","type":"integer"},"kind":{"title":"Kind","type":"string"},"title":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Title"},"markdown":{"default":"","title":"Markdown","type":"string"}},"required":["index","number","kind"],"title":"OfficePortionOut","type":"object"}},"description":"AI-facing markdown view of an existing Office file.","properties":{"file_id":{"title":"File Id","type":"string"},"office_kind":{"title":"Office Kind","type":"string"},"mime_type":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Mime Type"},"file_name":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"File Name"},"markdown":{"default":"","title":"Markdown","type":"string"},"portions":{"items":{"$ref":"#/$defs/OfficePortionOut"},"title":"Portions","type":"array"},"warnings":{"items":{"type":"string"},"title":"Warnings","type":"array"}},"required":["file_id","office_kind"],"title":"OfficeExtractionResponse","type":"object"}$mtx$::jsonb,
       false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
       $mtx${"family":"workflow_io","generic":false,"category":"pure","source":"aidream.graph_actions.office","description":"AI-facing markdown view of an existing Office file: whole-document markdown + per-portion breakdown"}$mtx$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'office_extraction_result' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
       $mtx${"file_id":"0f1e2d3c-4b5a-6789-abcd-ef0123456789","office_kind":"pptx","mime_type":"application/vnd.openxmlformats-officedocument.presentationml.presentation","file_name":"kickoff-deck.pptx","markdown":"# Kickoff\n\n- Goals\n- Timeline","portions":[{"index":0,"number":1,"kind":"slide","title":"Kickoff","markdown":"- Goals\n- Timeline"}],"warnings":[]}$mtx$::jsonb,
       'Canonical example', 'authored', true, 'passed', now(),
       '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'office_extraction_result' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null);
