-- content_ir_declare_topic_ideas_fields.sql
--
-- `topic_ideas` was registered python-side with a complete
-- `emitted_json_schema` but a NULL `data[]`. The frontend Shape registry reads
-- ONLY `data` + `kind_edge` (schema-source-kind-tables.ts DEF_COLUMNS), so the
-- kind was FIELDLESS on the client: no per-field form, and `isKindBindable`
-- (features/agents/.../output-schema/kindBinding.ts) refused to bind it to an
-- agent's `output_schema` because `fields` was empty.
--
-- This declares the three real fields and the `ideas -> topic_idea[]` edge, and
-- rewrites the emitted schemas/fingerprint from the ONE sanctioned TS emitter
-- (`planKindMigration`, via scripts/shape/plan-topic-ideas.ts). Nothing here is
-- hand-written. `authoring_owner` stays 'python' — the DB CHECK
-- `kind_definition_ts_requires_data` only forces data NOT NULL for 'ts' owners;
-- python + data is the sanctioned combination and the emitted JSON Schema
-- remains the validation source of truth.
--
-- The live canonical `kind_example` was pre-validated against the regenerated
-- schema through the activation gate's own ajv leg (`validateStructuralLeg`)
-- and passes; the example row is touched at the end so the
-- `kind_example_recompute_validation` trigger re-derives its verdict.

update content_ir.kind_definition set
  data = $mtx$[{"name": "concept_summary", "required": true, "description": "A one-sentence summary of the user's core concept and the angle explored", "type": "string"}, {"name": "search_insights", "required": true, "description": "2-4 sentences summarizing the most interesting and relevant findings from web searches", "type": "string"}, {"name": "ideas", "required": true, "description": "The individual topic ideas", "type": "array"}]$mtx$::jsonb,
  emitted_block_schema = $mtx${"type": "object", "properties": {"concept_summary": {"type": "string", "description": "A one-sentence summary of the user's core concept and the angle explored"}, "search_insights": {"type": "string", "description": "2-4 sentences summarizing the most interesting and relevant findings from web searches"}, "ideas": {"type": "array", "items": {"$ref": "#/$defs/topic_idea"}, "description": "The individual topic ideas"}, "__kind": {"type": "string", "description": "Block discriminator for render pipeline.", "const": "topic_ideas"}}, "required": ["__kind", "concept_summary", "search_insights", "ideas"], "additionalProperties": false, "$defs": {"topic_idea": {"type": "object", "properties": {"title": {"type": "string", "description": "A compelling, specific topic title written as if it were the episode or article headline"}, "hook": {"type": "string", "description": "1-2 sentences explaining the core angle and why it's interesting or timely"}, "why_now": {"type": "string", "description": "What recent event, trend, or data point makes this especially relevant right now"}, "key_points": {"type": "array", "items": {"type": "string"}, "description": "Key points or talking points"}, "format_notes": {"type": "string", "description": "A brief note on why this idea works well for the selected format and any structural suggestions"}, "tags": {"type": "array", "items": {"type": "string"}, "description": "Topical tags"}, "__kind": {"type": "string", "description": "Block discriminator for render pipeline.", "const": "topic_idea"}}, "required": ["__kind", "title", "hook", "why_now", "key_points", "format_notes", "tags"], "additionalProperties": false}}}$mtx$::jsonb,
  emitted_json_schema = $mtx${"type": "object", "properties": {"concept_summary": {"type": "string", "description": "A one-sentence summary of the user's core concept and the angle explored"}, "search_insights": {"type": "string", "description": "2-4 sentences summarizing the most interesting and relevant findings from web searches"}, "ideas": {"type": "array", "items": {"$ref": "#/$defs/topic_idea"}, "description": "The individual topic ideas"}}, "required": ["concept_summary", "search_insights", "ideas"], "additionalProperties": false, "$defs": {"topic_idea": {"type": "object", "properties": {"title": {"type": "string", "description": "A compelling, specific topic title written as if it were the episode or article headline"}, "hook": {"type": "string", "description": "1-2 sentences explaining the core angle and why it's interesting or timely"}, "why_now": {"type": "string", "description": "What recent event, trend, or data point makes this especially relevant right now"}, "key_points": {"type": "array", "items": {"type": "string"}, "description": "Key points or talking points"}, "format_notes": {"type": "string", "description": "A brief note on why this idea works well for the selected format and any structural suggestions"}, "tags": {"type": "array", "items": {"type": "string"}, "description": "Topical tags"}}, "required": ["title", "hook", "why_now", "key_points", "format_notes", "tags"], "additionalProperties": false}}}$mtx$::jsonb,
  emitted_fingerprint = '17o-1ut4uxx3aoa7',
  updated_at = now()
where kind = 'topic_ideas'
  and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and deleted_at is null;

insert into content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'ideas', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind = 'topic_idea' and c.deleted_at is null
 and c.organization_id = p.organization_id
where p.kind = 'topic_ideas' and p.deleted_at is null
  and p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id = p.id and e.field_name = 'ideas'
      and e.deleted_at is null);

-- Force the example trigger to re-derive validation_status against the new schema.
update content_ir.kind_example e set updated_at = now()
from content_ir.kind_definition d
where d.id = e.kind_definition_id and d.kind = 'topic_ideas'
  and e.deleted_at is null;
