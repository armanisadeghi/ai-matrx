-- Stage 1 (flashcards vertical) data seeds. Applied 2026-07-05 via Supabase MCP execute_sql.
-- Idempotent.
-- 1. R9 skill dedupe: flashcard-generation is canonical for flashcard_set (JSON syntax);
--    the thin flashcard-set skill is deactivated (superseded, soft).
-- 2. First kind_component row: flashcard_set / web / output -> component_key 'flashcards'
--    (the legacyBlockType contract key; config carries the web hint).
-- 3. First kind_surface row: <flashcards> xml_tag -> flashcard_set via named strategy
--    'flashcards_legacy_text' (implemented in features/content-ir/surfaces/).

update skill.definition set is_active = false,
  metadata = coalesce(metadata,'{}'::jsonb) || '{"superseded_by":"flashcard-generation","superseded_reason":"R9 dedupe: one skill per kind per syntax; flashcard-generation is canonical for flashcard_set JSON"}'::jsonb
where skill_id = 'flashcard-set' and deleted_at is null and is_active;

update skill.definition set category_id = '49c845cb-9314-485c-88ed-a7ace4f286ca'
where skill_id = 'flashcard-generation' and deleted_at is null and category_id is null;

insert into content_ir.kind_component (kind_definition_id, platform, role, component_key, source, config, organization_id)
select kd.id, 'web', 'output', 'flashcards', 'bundled', '{"legacyBlockType":"flashcards"}'::jsonb, kd.organization_id
from content_ir.kind_definition kd where kd.kind='flashcard_set' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_component c where c.kind_definition_id=kd.id and c.platform='web' and c.role='output' and c.deleted_at is null);

insert into content_ir.kind_surface (kind_definition_id, surface_type, token, parser_strategy, parser_config, streaming, organization_id)
select kd.id, 'xml_tag', 'flashcards', 'flashcards_legacy_text', '{}'::jsonb, true, kd.organization_id
from content_ir.kind_definition kd where kd.kind='flashcard_set' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_surface s where s.surface_type='xml_tag' and s.token='flashcards' and s.deleted_at is null);
