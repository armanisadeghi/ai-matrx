-- kind_troubleshooting_guide_full.sql
-- Full Shape System package for the `troubleshooting_guide` kind (successor to
-- the `<troubleshooting>` XML render block; component: TroubleshootingBlock via
-- the `troubleshooting` legacyBlockType).
--
--   1. content_ir.kind_definition rows: troubleshooting_guide +
--      troubleshooting_issue / troubleshooting_solution / troubleshooting_step /
--      troubleshooting_link. `data`, `emitted_json_schema` (strict, no __kind)
--      and `emitted_block_schema` (strict, __kind injected) are CONVERTER-EMITTED
--      (features/content-ir/registry/kind-storage-transform.ts +
--      features/content-ir/convert/kind-to-json-schema.ts) from the schemas in
--      features/content-ir/kinds/troubleshooting-guide.ts — never hand-written.
--   2. content_ir.kind_edge rows: guide.issues -> issue, issue.solutions ->
--      solution, solution.steps -> step, step.links -> link.
--   3. content_ir.kind_example: 2 rows on the root kind (simple = canonical,
--      full = every rendered field). Both validated with a REAL Draft 2020-12
--      validator (ajv/dist/2020) against the emitted_json_schema (with __kind
--      stripped, mirroring the dual gate) BEFORE being marked 'passed'.
--   4. content_ir.kind_surface: xml_tag/troubleshooting -> named strategy
--      'troubleshooting_legacy_text' (features/content-ir/surfaces/).
--   5. content_ir.kind_component: web/output -> component_key 'troubleshooting'.
--   6. skill.definition 'kind_troubleshooting_guide' (render_block, JSON syntax;
--      XML counterpart skill: 'troubleshooting-guides').
--   7. public.content_blocks 'kind-troubleshooting-guide-simple' / '-full'
--      (category "Agent Skills" 2c324058-95e9-4b7e-a991-884f4443eb6e; never
--      clobber: ON CONFLICT DO NOTHING).
--
-- is_active stays FALSE on every kind row until central integration registers
-- the compiled definitions + strategy and the dual gate runs — expected.
-- Idempotent + schema-qualified; business-key guarded so re-apply is safe.
-- Owner org = "Matrx System" 39c38960-d30c-4840-b0c1-c9960de95582.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. kind_definition rows
-- ---------------------------------------------------------------------------

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema, is_active, visibility, organization_id, metadata)
select 'troubleshooting_guide', 'Troubleshooting Guide', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"issues","required":true,"type":"array"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"issues":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_issue"}}},"required":["title","issues"],"additionalProperties":false,"$defs":{"troubleshooting_issue":{"type":"object","properties":{"symptom":{"type":"string"},"description":{"type":"string"},"severity":{"type":"string"},"causes":{"type":"array","items":{"type":"string"}},"solutions":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_solution"}},"relatedIssues":{"type":"array","items":{"type":"string"}}},"required":["symptom","causes","solutions"],"additionalProperties":false},"troubleshooting_solution":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"successRate":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"steps":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_step"}}},"required":["title","steps"],"additionalProperties":false},"troubleshooting_step":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"commands":{"type":"array","items":{"type":"string"}},"links":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_link"}},"difficulty":{"type":"string"},"estimatedTime":{"type":"string"}},"required":["title","description"],"additionalProperties":false},"troubleshooting_link":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"}},"required":["title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"issues":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_issue"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_guide"}},"required":["__kind","title","issues"],"additionalProperties":false,"$defs":{"troubleshooting_issue":{"type":"object","properties":{"symptom":{"type":"string"},"description":{"type":"string"},"severity":{"type":"string"},"causes":{"type":"array","items":{"type":"string"}},"solutions":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_solution"}},"relatedIssues":{"type":"array","items":{"type":"string"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_issue"}},"required":["__kind","symptom","causes","solutions"],"additionalProperties":false},"troubleshooting_solution":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"successRate":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"steps":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_step"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_solution"}},"required":["__kind","title","steps"],"additionalProperties":false},"troubleshooting_step":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"commands":{"type":"array","items":{"type":"string"}},"links":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_link"}},"difficulty":{"type":"string"},"estimatedTime":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_step"}},"required":["__kind","title","description"],"additionalProperties":false},"troubleshooting_link":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_link"}},"required":["__kind","title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='troubleshooting_guide' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema, is_active, visibility, organization_id, metadata)
select 'troubleshooting_issue', 'Troubleshooting Issue', 'ts',
  $mtx$[{"name":"symptom","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"severity","type":"string"},{"name":"causes","required":true,"type":"string[]"},{"name":"solutions","required":true,"type":"array"},{"name":"relatedIssues","type":"string[]"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"symptom":{"type":"string"},"description":{"type":"string"},"severity":{"type":"string"},"causes":{"type":"array","items":{"type":"string"}},"solutions":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_solution"}},"relatedIssues":{"type":"array","items":{"type":"string"}}},"required":["symptom","causes","solutions"],"additionalProperties":false,"$defs":{"troubleshooting_solution":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"successRate":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"steps":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_step"}}},"required":["title","steps"],"additionalProperties":false},"troubleshooting_step":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"commands":{"type":"array","items":{"type":"string"}},"links":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_link"}},"difficulty":{"type":"string"},"estimatedTime":{"type":"string"}},"required":["title","description"],"additionalProperties":false},"troubleshooting_link":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"}},"required":["title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"symptom":{"type":"string"},"description":{"type":"string"},"severity":{"type":"string"},"causes":{"type":"array","items":{"type":"string"}},"solutions":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_solution"}},"relatedIssues":{"type":"array","items":{"type":"string"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_issue"}},"required":["__kind","symptom","causes","solutions"],"additionalProperties":false,"$defs":{"troubleshooting_solution":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"successRate":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"steps":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_step"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_solution"}},"required":["__kind","title","steps"],"additionalProperties":false},"troubleshooting_step":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"commands":{"type":"array","items":{"type":"string"}},"links":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_link"}},"difficulty":{"type":"string"},"estimatedTime":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_step"}},"required":["__kind","title","description"],"additionalProperties":false},"troubleshooting_link":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_link"}},"required":["__kind","title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='troubleshooting_issue' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema, is_active, visibility, organization_id, metadata)
select 'troubleshooting_solution', 'Troubleshooting Solution', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"priority","type":"string"},{"name":"successRate","type":"number"},{"name":"tags","type":"string[]"},{"name":"steps","required":true,"type":"array"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"successRate":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"steps":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_step"}}},"required":["title","steps"],"additionalProperties":false,"$defs":{"troubleshooting_step":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"commands":{"type":"array","items":{"type":"string"}},"links":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_link"}},"difficulty":{"type":"string"},"estimatedTime":{"type":"string"}},"required":["title","description"],"additionalProperties":false},"troubleshooting_link":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"}},"required":["title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"successRate":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"steps":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_step"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_solution"}},"required":["__kind","title","steps"],"additionalProperties":false,"$defs":{"troubleshooting_step":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"commands":{"type":"array","items":{"type":"string"}},"links":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_link"}},"difficulty":{"type":"string"},"estimatedTime":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_step"}},"required":["__kind","title","description"],"additionalProperties":false},"troubleshooting_link":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_link"}},"required":["__kind","title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='troubleshooting_solution' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema, is_active, visibility, organization_id, metadata)
select 'troubleshooting_step', 'Troubleshooting Step', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"description","required":true,"type":"string"},{"name":"commands","type":"string[]"},{"name":"links","type":"array"},{"name":"difficulty","type":"string"},{"name":"estimatedTime","type":"string"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"commands":{"type":"array","items":{"type":"string"}},"links":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_link"}},"difficulty":{"type":"string"},"estimatedTime":{"type":"string"}},"required":["title","description"],"additionalProperties":false,"$defs":{"troubleshooting_link":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"}},"required":["title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"commands":{"type":"array","items":{"type":"string"}},"links":{"type":"array","items":{"$ref":"#/$defs/troubleshooting_link"}},"difficulty":{"type":"string"},"estimatedTime":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_step"}},"required":["__kind","title","description"],"additionalProperties":false,"$defs":{"troubleshooting_link":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_link"}},"required":["__kind","title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='troubleshooting_step' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema, is_active, visibility, organization_id, metadata)
select 'troubleshooting_link', 'Troubleshooting Link', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"url","required":true,"type":"string"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"}},"required":["title","url"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"troubleshooting_link"}},"required":["__kind","title","url"],"additionalProperties":false}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='troubleshooting_link' and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 2. kind_edge rows (single-child ref arrays -> position 0)
-- ---------------------------------------------------------------------------

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'issues', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='troubleshooting_issue' and c.deleted_at is null and c.organization_id=p.organization_id
where p.kind='troubleshooting_guide' and p.deleted_at is null and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
  and not exists (select 1 from content_ir.kind_edge e where e.parent_definition_id=p.id and e.field_name='issues' and e.deleted_at is null);

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'solutions', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='troubleshooting_solution' and c.deleted_at is null and c.organization_id=p.organization_id
where p.kind='troubleshooting_issue' and p.deleted_at is null and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
  and not exists (select 1 from content_ir.kind_edge e where e.parent_definition_id=p.id and e.field_name='solutions' and e.deleted_at is null);

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'steps', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='troubleshooting_step' and c.deleted_at is null and c.organization_id=p.organization_id
where p.kind='troubleshooting_solution' and p.deleted_at is null and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
  and not exists (select 1 from content_ir.kind_edge e where e.parent_definition_id=p.id and e.field_name='steps' and e.deleted_at is null);

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'links', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='troubleshooting_link' and c.deleted_at is null and c.organization_id=p.organization_id
where p.kind='troubleshooting_step' and p.deleted_at is null and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
  and not exists (select 1 from content_ir.kind_edge e where e.parent_definition_id=p.id and e.field_name='links' and e.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 3. kind_example rows (both Draft 2020-12 validated BEFORE 'passed';
--    payloads mirror TROUBLESHOOTING_GUIDE_EXAMPLE_SIMPLE / _FULL in
--    features/content-ir/kinds/troubleshooting-guide.ts)
-- ---------------------------------------------------------------------------

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"troubleshooting_guide","title":"Docker Build Fails","issues":[{"__kind":"troubleshooting_issue","symptom":"docker build exits with \"no space left on device\"","causes":["Dangling images and build cache filling the disk","Docker's data root on a small volume"],"solutions":[{"__kind":"troubleshooting_solution","title":"Reclaim Docker disk space","description":"Prune unused layers and caches","steps":[{"__kind":"troubleshooting_step","title":"Prune the system","description":"Remove stopped containers, unused images, and cache","commands":["docker system prune -a --volumes"],"difficulty":"easy","estimatedTime":"2 min"},{"__kind":"troubleshooting_step","title":"Check remaining space","description":"Confirm the disk recovered","commands":["df -h /var/lib/docker"],"difficulty":"easy","estimatedTime":"1 min"}]}],"relatedIssues":["Slow image builds","Out-of-memory during build"]}]}$mtx$::jsonb,
  'Canonical example', 'Single-issue guide mirroring the <troubleshooting> XML skill sample.', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='troubleshooting_guide' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"troubleshooting_guide","title":"API Connection Issues","description":"Common problems and solutions for API connectivity","issues":[{"__kind":"troubleshooting_issue","symptom":"Timeout errors when calling the API","description":"Requests to the API are timing out after 30 seconds","severity":"high","causes":["Network connectivity issues","Server overload","Authentication problems","Rate limiting"],"solutions":[{"__kind":"troubleshooting_solution","title":"Check Network Connection","description":"Verify that your network connection is working properly","priority":"high","successRate":85,"tags":["network","connectivity"],"steps":[{"__kind":"troubleshooting_step","title":"Test with curl","description":"Use curl to test the API endpoint directly","commands":["curl -X GET https://api.example.com/health"],"difficulty":"easy","estimatedTime":"2 min"},{"__kind":"troubleshooting_step","title":"Check DNS resolution","description":"Verify that the API domain resolves correctly","commands":["nslookup api.example.com","dig api.example.com"],"difficulty":"easy","estimatedTime":"1 min"}]},{"__kind":"troubleshooting_solution","title":"Verify API Credentials","description":"Ensure your API key and credentials are valid","priority":"medium","successRate":90,"steps":[{"__kind":"troubleshooting_step","title":"Check API key","description":"Verify that your API key is valid and not expired","difficulty":"easy","estimatedTime":"3 min","links":[{"__kind":"troubleshooting_link","title":"API Key Management","url":"https://example.com/api-keys"}]}]}],"relatedIssues":["Slow response times","Authentication failures"]},{"__kind":"troubleshooting_issue","symptom":"Intermittent 401 Unauthorized responses","severity":"critical","causes":["Expired access token","Clock skew between client and server"],"solutions":[{"__kind":"troubleshooting_solution","title":"Refresh the access token","priority":"high","steps":[{"__kind":"troubleshooting_step","title":"Request a new token","description":"Exchange the refresh token for a new access token","difficulty":"medium"}]}]}]}$mtx$::jsonb,
  'Full-field example', 'Two issues exercising every rendered field: severity, priority, successRate, tags, commands, links, difficulty, estimatedTime, relatedIssues. Derived from the component''s own sample factory.', 'authored', false, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='troubleshooting_guide' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.label='Full-field example' and e.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 4. kind_surface: <troubleshooting> xml_tag -> troubleshooting_guide via the
--    named strategy 'troubleshooting_legacy_text'
-- ---------------------------------------------------------------------------

insert into content_ir.kind_surface (kind_definition_id, surface_type, token, parser_strategy, parser_config, streaming, organization_id)
select kd.id, 'xml_tag', 'troubleshooting', 'troubleshooting_legacy_text', '{}'::jsonb, true, kd.organization_id
from content_ir.kind_definition kd where kd.kind='troubleshooting_guide' and kd.deleted_at is null
  and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
  and not exists (select 1 from content_ir.kind_surface s where s.surface_type='xml_tag' and s.token='troubleshooting' and s.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 5. kind_component: web/output -> the legacyBlockType contract key
-- ---------------------------------------------------------------------------

insert into content_ir.kind_component (kind_definition_id, platform, role, component_key, source, config, organization_id)
select kd.id, 'web', 'output', 'troubleshooting', 'bundled', '{"legacyBlockType":"troubleshooting"}'::jsonb, kd.organization_id
from content_ir.kind_definition kd where kd.kind='troubleshooting_guide' and kd.deleted_at is null
  and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
  and not exists (select 1 from content_ir.kind_component c where c.kind_definition_id=kd.id and c.platform='web' and c.role='output' and c.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 6. Skill: kind_troubleshooting_guide (render_block, JSON syntax).
--    XML counterpart: skill 'troubleshooting-guides' (the <troubleshooting>
--    markdown dialect) — R9: one skill per kind per syntax.
-- ---------------------------------------------------------------------------

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   platform_targets, semver, category_id, is_system, is_active,
   visibility, organization_id, project_id, task_id, sort_order, metadata)
SELECT
  'kind_troubleshooting_guide',
  'Troubleshooting Guide (JSON)',
  'How and when to emit a troubleshooting_guide render block as __kind JSON: the guide/issue/solution/step/link shape, the exact enum values that drive severity/priority/difficulty color coding, the required-field rules that prevent silent drops, sizing, and editing etiquette. XML counterpart: the troubleshooting-guides skill.',
  'render_block',
  $BODY$# Troubleshooting Guide (JSON)

You can render a live, interactive troubleshooting guide by emitting a single
JSON object carrying `"__kind": "troubleshooting_guide"`. It renders as
collapsible issues the user can search, filter by severity, walk step by step
(checking steps off, copying commands), import into their Tasks, open on the
Canvas, and print — and it persists as an editable artifact. Reach for it
whenever the user is diagnosing a problem, debugging an error, or asking "why
isn't X working / how do I fix it" — an interactive guide beats a wall of prose.

The SAME component also renders the `<troubleshooting>` XML markdown dialect
(see the `troubleshooting-guides` skill). This JSON kind is a superset of that
dialect: `severity`, `priority`, and `successRate` can ONLY be authored here —
the XML grammar cannot express them. Prefer this JSON shape when you want the
severity badges, priority chips, or success-rate stars.

## How to emit a guide

Emit ONE JSON object with `"__kind": "troubleshooting_guide"`. The system
recognizes it live, fenced or unfenced; a ```json fence is fine for clarity:

```json
{
  "__kind": "troubleshooting_guide",
  "title": "API Connection Issues",
  "description": "Common problems and fixes for API connectivity",
  "issues": [
    {
      "__kind": "troubleshooting_issue",
      "symptom": "Timeout errors when calling the API",
      "severity": "high",
      "causes": ["Network connectivity issues", "Invalid or expired credentials"],
      "solutions": [
        {
          "__kind": "troubleshooting_solution",
          "title": "Check the network path",
          "description": "Confirm the endpoint is reachable",
          "priority": "high",
          "successRate": 85,
          "steps": [
            {
              "__kind": "troubleshooting_step",
              "title": "Test with curl",
              "description": "Hit the health endpoint directly",
              "commands": ["curl -X GET https://api.example.com/health"],
              "difficulty": "easy",
              "estimatedTime": "2 min"
            }
          ]
        }
      ],
      "relatedIssues": ["Slow response times"]
    }
  ]
}
```

One guide per JSON object. Never wrap it in `<artifact>` tags — the JSON object
IS the artifact.

## When to use it

| User intent | Do this |
|---|---|
| Reports a symptom / error / broken behavior and wants a fix | A troubleshooting_guide with one issue per distinct symptom |
| Diagnostic flow with several possible causes and fixes | One issue: causes list + one solution per fix, cheapest first |
| A runbook an operator walks top-down, checking steps off | Solutions with concrete steps + copyable `commands` |

If you are only listing plain steps with no diagnosis, use a normal ordered
list. Use this kind when the shape is genuinely symptom -> causes -> solutions
-> steps.

## The `__kind` + field structure

**troubleshooting_guide** (the root object):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"troubleshooting_guide"`. |
| `title` | string | yes | The guide title shown at the top. |
| `issues` | array | yes | One or more `troubleshooting_issue` objects. |
| `description` | string | no | A short subtitle under the title. |

**troubleshooting_issue** (each item in `issues`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | `"troubleshooting_issue"`. |
| `symptom` | string | yes | The observable problem — the issue's headline. |
| `causes` | string[] | yes | Possible causes (may be `[]`, but must be present). |
| `solutions` | array | yes | One or more `troubleshooting_solution` objects. |
| `description` | string | no | Extra detail under the symptom. |
| `severity` | string | no | Exactly `"low"`, `"medium"`, `"high"`, or `"critical"` (lowercase) — drives the color-coded badge and the severity filter. Anything else renders a neutral badge. |
| `relatedIssues` | string[] | no | Related-issue chips. |

**troubleshooting_solution** (each item in `solutions`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | `"troubleshooting_solution"`. |
| `title` | string | yes | The solution headline. |
| `steps` | array | yes | One or more `troubleshooting_step` objects. |
| `description` | string | no | One line on what this solution does. |
| `priority` | string | no | Exactly `"low"`, `"medium"`, or `"high"` (lowercase) — the priority chip. |
| `successRate` | number | no | 0-100; renders as a 5-star rating plus the percentage. |
| `tags` | string[] | no | Carried on the data model (not currently rendered). |

**troubleshooting_step** (each item in `steps`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | `"troubleshooting_step"`. |
| `title` | string | yes | Short, scannable step name. |
| `description` | string | yes | What to do — rendered directly under the title. |
| `commands` | string[] | no | Each string renders as a copyable command block. |
| `links` | array | no | `troubleshooting_link` objects — reference links. |
| `difficulty` | string | no | Exactly `"easy"`, `"medium"`, or `"hard"` (lowercase). |
| `estimatedTime` | string | no | Free text, e.g. `"2 min"`, `"1 hour"`. |

**troubleshooting_link** (each item in `links`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | `"troubleshooting_link"`. |
| `title` | string | yes | The link label. |
| `url` | string | yes | The href. |

## Syntax rules that PREVENT render failures

1. **`title` and a non-empty `issues` array are mandatory on the root.**
   Without them the whole guide falls back to raw text.
2. **Every issue carries `symptom`, `causes`, and `solutions`.** `causes` may
   be an empty array but must be PRESENT — the renderer and search index read
   it unconditionally. An issue without solutions renders as a dead end; give
   every issue at least one solution.
3. **Every solution needs `title` + `steps`; every step needs `title` +
   `description`.** These render directly — a missing description shows the
   placeholder "No description provided".
4. **Enum-like strings are lowercase and exact**: severity `low | medium |
   high | critical`, priority `low | medium | high`, difficulty `easy |
   medium | hard`. `"High"` or `"urgent"` will not match the color coding and
   renders as a neutral gray badge.
5. **`successRate` is a NUMBER 0-100**, not a string — `"85%"` breaks the
   star math; `85` is correct.
6. **`commands` entries are plain command strings** — no backticks, no fences,
   no `$` prompt prefixes. Each entry gets its own copy button, so one command
   per entry.
7. **Do NOT author `id` fields.** The renderer assigns `issue-N` /
   `solution-N` / `step-N` deterministically; authored ids are overwritten.
8. **Keep every `__kind` marker** — the guide, each issue, each solution, each
   step, and each link carry their own `__kind`.
9. **Valid JSON only** — double-quoted keys/strings, no trailing commas, no
   comments. Escape quotes inside strings.

## Sizing / limits

- 1-8 issues per guide; split huge domains into several focused guides.
- 2-5 solutions per issue, 2-6 steps per solution reads best.
- Order solutions most-likely / cheapest first — the user works top-down and
  checks steps off as they go.
- Keep symptoms and step titles short and scannable; put detail in the step
  `description` and `commands`.

## Editing etiquette

When asked to change a guide, return ONE complete updated
`troubleshooting_guide` object — the full block, not a diff:

- Keep `"__kind"` on every object at every level.
- Preserve the issues/solutions/steps you were not asked to change, in their
  original order, so step-completion state and artifact history stay stable.
- Re-check enum casing (rule 4) after any edit.

## One correct minimal example

```json
{
  "__kind": "troubleshooting_guide",
  "title": "Docker Build Fails",
  "issues": [
    {
      "__kind": "troubleshooting_issue",
      "symptom": "docker build exits with \"no space left on device\"",
      "severity": "high",
      "causes": ["Dangling images and build cache filling the disk"],
      "solutions": [
        {
          "__kind": "troubleshooting_solution",
          "title": "Reclaim Docker disk space",
          "description": "Prune unused layers and caches",
          "priority": "high",
          "steps": [
            {
              "__kind": "troubleshooting_step",
              "title": "Prune the system",
              "description": "Remove stopped containers, unused images, and cache",
              "commands": ["docker system prune -a --volumes"],
              "difficulty": "easy",
              "estimatedTime": "2 min"
            }
          ]
        }
      ]
    }
  ]
}
```
$BODY$,
  'Wrench',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true,
  true,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  NULL,
  NULL,
  0,
  '{"syntax":"json","xml_counterpart":"troubleshooting-guides"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_troubleshooting_guide' AND deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 7. Content blocks — Agent Skills category, paired to the skill via
--    metadata.skill_id. Never clobber: ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, version, metadata)
VALUES
  (
    'kind-troubleshooting-guide-simple',
    'Troubleshooting Guide',
    'An interactive symptom-causes-solutions guide with checkable steps',
    'Wrench',
    $CB$When the user is diagnosing a problem or asking how to fix something, emit an interactive troubleshooting guide as a single JSON object with "__kind":"troubleshooting_guide":

```json
{ "__kind": "troubleshooting_guide", "title": "Docker Build Fails", "issues": [
  { "__kind": "troubleshooting_issue", "symptom": "docker build exits with \"no space left on device\"", "severity": "high", "causes": ["Build cache filling the disk"], "solutions": [
    { "__kind": "troubleshooting_solution", "title": "Reclaim Docker disk space", "steps": [
      { "__kind": "troubleshooting_step", "title": "Prune the system", "description": "Remove unused images and cache", "commands": ["docker system prune -a --volumes"], "difficulty": "easy", "estimatedTime": "2 min" }
    ] }
  ] }
] }
```

Rules: the guide needs `title` + non-empty `issues`; every issue needs `symptom`, `causes` (array, may be empty), and at least one solution; every solution needs `title` + `steps`; every step needs `title` + `description`. severity is exactly low|medium|high|critical, difficulty easy|medium|hard (lowercase). Keep `__kind` on every object; never author `id` fields.$CB$,
    60,
    true,
    '2c324058-95e9-4b7e-a991-884f4443eb6e',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    1,
    '{"skill_id":"kind_troubleshooting_guide"}'::jsonb
  )
ON CONFLICT (block_id) DO NOTHING;

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, version, metadata)
VALUES
  (
    'kind-troubleshooting-guide-full',
    'Troubleshooting Guide (full)',
    'Troubleshooting guide with severity, priority, success-rate, commands, and reference links',
    'Wrench',
    $CB$For a rich diagnostic runbook, emit "__kind":"troubleshooting_guide" JSON using the FULL field set — severity badges, priority chips, success-rate stars, copyable commands, and reference links:

```json
{ "__kind": "troubleshooting_guide", "title": "API Connection Issues", "description": "Common connectivity fixes", "issues": [
  { "__kind": "troubleshooting_issue", "symptom": "Timeout errors when calling the API", "severity": "high", "causes": ["Network issues", "Expired credentials"], "solutions": [
    { "__kind": "troubleshooting_solution", "title": "Check the network path", "priority": "high", "successRate": 85, "steps": [
      { "__kind": "troubleshooting_step", "title": "Test with curl", "description": "Hit the health endpoint directly", "commands": ["curl -X GET https://api.example.com/health"], "difficulty": "easy", "estimatedTime": "2 min" },
      { "__kind": "troubleshooting_step", "title": "Inspect the key", "description": "Confirm it is active in the dashboard", "links": [{ "__kind": "troubleshooting_link", "title": "API Keys", "url": "https://example.com/keys" }], "difficulty": "medium" }
    ] }
  ], "relatedIssues": ["Slow response times"] }
] }
```

Rules: enum strings are lowercase and exact (severity low|medium|high|critical, priority low|medium|high, difficulty easy|medium|hard); `successRate` is a number 0-100, not "85%"; `commands` are plain strings (one command per entry, no backticks); links need `title` + `url`. Order solutions cheapest-first; keep `__kind` everywhere; never author `id` fields.$CB$,
    61,
    true,
    '2c324058-95e9-4b7e-a991-884f4443eb6e',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    1,
    '{"skill_id":"kind_troubleshooting_guide"}'::jsonb
  )
ON CONFLICT (block_id) DO NOTHING;

COMMIT;
