-- Canonical Shape package for the optional SERP-informed keyword intent pass.
-- Converter outputs below come from:
--   pnpm exec tsx scripts/shape/emit-kind-rows.ts keyword_serp_intent_analysis_v1
-- The agent carries the stricter provider schema; the Shape keeps nested
-- evidence as JSON because those nested objects do not carry __kind markers.

BEGIN;

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility)
VALUES (
  'keyword_serp_intent_analysis_v1',
  'SERP-Informed Keyword Intent Analysis',
  'ts',
  $J$[{"name":"analyzer_version","required":true,"type":"string"},{"name":"keyword_id","required":true,"type":"string"},{"name":"phrase","required":true,"type":"string"},{"name":"language","required":true,"type":"string"},{"name":"context","required":true,"type":"json"},{"name":"original_classification","required":true,"type":"json"},{"name":"enhanced_classification","required":true,"type":"json"},{"name":"changes","required":true,"type":"json[]"},{"name":"provider_findings","required":true,"type":"json[]"},{"name":"serp_consensus","required":true,"type":"enum","values":["aligned","mixed","conflicted"]},{"name":"intent_summary","required":true,"type":"string"},{"name":"content_expectations","required":true,"type":"json"},{"name":"difficulty_signal","required":true,"type":"enum","values":["low","moderate","high","very_high"]},{"name":"limitations","required":true,"type":"string[]"}]$J$::jsonb,
  $J${"__kind":"keyword_serp_intent_analysis_v1","analyzer_version":"kwserp-v1","keyword_id":"11111111-1111-4111-8111-111111111111","phrase":"best project management software","language":"en","context":{"google_snapshot_id":"google-snapshot-1","brave_snapshot_id":"brave-snapshot-1","google_observed_at":"2026-08-14T18:00:00+00:00","brave_observed_at":"2026-08-14T18:05:00+00:00","location":"United States","device":"desktop"},"original_classification":{"intent_class":"commercial_investigation","overall_confidence":82},"enhanced_classification":{"intent_class":"commercial_investigation","overall_confidence":90,"per_fact_confidence":{"intent_class":94}},"changes":[],"provider_findings":[{"provider":"google","apparent_intent":"commercial_investigation","confidence":93,"dominant_formats":["comparison roundups"],"evidence_summary":"Editorial comparisons dominate."},{"provider":"brave","apparent_intent":"commercial_investigation","confidence":88,"dominant_formats":["comparison roundups","UGC"],"evidence_summary":"Comparisons dominate with one practitioner discussion."}],"serp_consensus":"aligned","intent_summary":"Both observed result pages support commercial investigation intent.","content_expectations":{"dominant_formats":["comparison roundups"],"must_cover":["features and pricing"],"differentiators":["transparent testing"],"likely_weak_fit":["single-vendor sales pages"]},"difficulty_signal":"very_high","limitations":["Only the stored result rows were analyzed."]}$J$::jsonb,
  $J${"type":"object","properties":{"analyzer_version":{"type":"string"},"keyword_id":{"type":"string"},"phrase":{"type":"string"},"language":{"type":"string"},"context":{},"original_classification":{},"enhanced_classification":{},"changes":{"type":"array","items":{}},"provider_findings":{"type":"array","items":{}},"serp_consensus":{"type":"string","enum":["aligned","mixed","conflicted"]},"intent_summary":{"type":"string"},"content_expectations":{},"difficulty_signal":{"type":"string","enum":["low","moderate","high","very_high"]},"limitations":{"type":"array","items":{"type":"string"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"keyword_serp_intent_analysis_v1"}},"required":["__kind","analyzer_version","keyword_id","phrase","language","context","original_classification","enhanced_classification","changes","provider_findings","serp_consensus","intent_summary","content_expectations","difficulty_signal","limitations"],"additionalProperties":false}$J$::jsonb,
  $J${"type":"object","properties":{"analyzer_version":{"type":"string"},"keyword_id":{"type":"string"},"phrase":{"type":"string"},"language":{"type":"string"},"context":{},"original_classification":{},"enhanced_classification":{},"changes":{"type":"array","items":{}},"provider_findings":{"type":"array","items":{}},"serp_consensus":{"type":"string","enum":["aligned","mixed","conflicted"]},"intent_summary":{"type":"string"},"content_expectations":{},"difficulty_signal":{"type":"string","enum":["low","moderate","high","very_high"]},"limitations":{"type":"array","items":{"type":"string"}}},"required":["analyzer_version","keyword_id","phrase","language","context","original_classification","enhanced_classification","changes","provider_findings","serp_consensus","intent_summary","content_expectations","difficulty_signal","limitations"],"additionalProperties":false}$J$::jsonb,
  'rt-qzvojqw7yofw', false,
  '39c38960-d30c-4840-b0c1-c9960de95582', 'public'
)
ON CONFLICT (kind) WHERE deleted_at IS NULL DO UPDATE SET
  label = EXCLUDED.label,
  authoring_owner = EXCLUDED.authoring_owner,
  data = EXCLUDED.data,
  sample_data = EXCLUDED.sample_data,
  emitted_block_schema = EXCLUDED.emitted_block_schema,
  emitted_json_schema = EXCLUDED.emitted_json_schema,
  emitted_fingerprint = EXCLUDED.emitted_fingerprint,
  visibility = EXCLUDED.visibility,
  updated_at = now();

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, organization_id)
SELECT d.id, d.version, d.sample_data, 'Commercial comparison intent',
       'Google and Brave agree with the baseline classification; the report names evidence, content expectations, difficulty, and limits.',
       'authored', true, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'keyword_serp_intent_analysis_v1' AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example e
    WHERE e.kind_definition_id = d.id AND e.is_canonical AND e.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'keyword_serp_intent_analysis', 'bundled',
       '{"legacyBlockType":"keyword_serp_intent_analysis"}'::jsonb,
       true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'keyword_serp_intent_analysis_v1' AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id AND c.platform = 'web'
      AND c.role = 'output' AND c.component_key = 'keyword_serp_intent_analysis'
      AND c.deleted_at IS NULL
  );

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order,
   semver, platform_targets, organization_id, metadata)
SELECT
  'kind_keyword_serp_intent_analysis_v1',
  'SERP-Informed Keyword Intent Analysis (structured)',
  'How and when to emit the evidence-cited Google + Brave intent enhancement Shape.',
  'render_block',
  $SB$# SERP-Informed Keyword Intent Analysis

Use `keyword_serp_intent_analysis_v1` only when exact persisted Google and Brave
result-page snapshots and an existing intrinsic keyword classification are
supplied. It is an evidence review, not a fresh search and not a replacement
for the intrinsic classification.

Emit one JSON object with `__kind` first. Preserve `original_classification`
exactly. Put the proposal in `enhanced_classification`. Cite every material
change by provider, observed position, domain, and signal. Analyze Google and
Brave separately, then state whether they are aligned, mixed, or conflicted.
Always include general content expectations and honest evidence limitations.
Never add client, brand, or site-specific recommendations.$SB$,
  'SearchCheck', true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca', 64, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"kind":"keyword_serp_intent_analysis_v1"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_keyword_serp_intent_analysis_v1'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL AND task_id IS NULL AND deleted_at IS NULL
);

INSERT INTO skill.render_definition
  (block_id, label, description, icon_name, template, block_type,
   category_id, sort_order, is_active, visibility, skill_id,
   organization_id, metadata)
SELECT 'kind-keyword-serp-intent-analysis', 'SERP-Informed Keyword Intent',
       'Emit a cited intent enhancement from supplied Google and Brave snapshots.',
       'SearchCheck',
       $CB$Given an existing keyword classification plus exact stored Google and Brave result pages, emit `keyword_serp_intent_analysis_v1`. Preserve the original classification verbatim, return the complete enhanced 13-field proposal separately, cite every changed value or 10+ point confidence change to a real provider position and domain, compare Google and Brave separately, and state content expectations and limitations. Do not browse or add site-specific advice.$CB$,
       'render_kind', '2c324058-95e9-4b7e-a991-884f4443eb6e', 10,
       true, 'public', s.id, '39c38960-d30c-4840-b0c1-c9960de95582',
       '{"skill_id":"kind_keyword_serp_intent_analysis_v1"}'::jsonb
FROM skill.definition s
WHERE s.skill_id = 'kind_keyword_serp_intent_analysis_v1'
  AND s.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND s.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM skill.render_definition b
    WHERE b.block_id = 'kind-keyword-serp-intent-analysis' AND b.deleted_at IS NULL
  );

COMMIT;
