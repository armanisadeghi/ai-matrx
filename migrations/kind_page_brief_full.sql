-- ============================================================================
-- content-ir kind `page_brief` — FULL package (root kind, no children).
--
-- One page's content brief, as produced by the `content_plan.brief_writer`
-- agent slot. aidream runs that slot SERVER-side
-- (POST /content-plan/nodes/{id}/draft-brief) and persists the whole result to
-- plan.node.metadata.ai_brief_draft; the client adopts the stream and renders
-- it in the generic live-run window. Without this kind the payload streamed as
-- a bare JSON code block.
--
-- Canonical `__kind` JSON shape:
--   { "__kind":"page_brief", "angle":"…", "brief":[…],
--     "must_not_cover":[…], "concerns":[…], "suggested_word_count": 1400 }
--
-- Rows applied here:
--   * content_ir.kind_definition — page_brief. data / emitted_block_schema /
--     emitted_json_schema / emitted_fingerprint are CONVERTER-EMITTED
--     (kindSchemaToStorage / kindSchemaToJsonSchema / fingerprintText over
--     features/content-ir/kinds/page-brief.ts) — never hand-written.
--     authoring_owner 'ts', platform org, visibility public.
--   * content_ir.kind_example — 1 canonical authored example. It passed the
--     FULL dual gate (structural + render legs) in-process on 2026-08-11
--     before this migration was written — validation_status 'passed' is REAL.
--   * content_ir.kind_component — web/output → component_key 'page_brief'
--     (the compiled bridge facade into PageBriefBlock via block-dispatch).
--   * NO kind_edge (no child kinds) and NO kind_surface — `__kind` JSON is
--     the only arrival form (no tag/fence surface).
--
-- Idempotent on business keys; re-apply is safe.
-- ============================================================================

BEGIN;

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility, metadata)
VALUES
  (
    'page_brief',
    'Page Brief',
    'ts',
    $J$[{"name":"angle","description":"The single differentiating angle this page takes, in one sentence.","type":"string"},{"name":"brief","required":true,"description":"The brief itself — one instruction per line, in the order the writer should follow them.","type":"string[]"},{"name":"must_not_cover","description":"Topics belonging to a sibling page — covering them here cannibalizes it.","type":"string[]"},{"name":"concerns","description":"Risks the writer or the plan owner should know about before this page is written.","type":"string[]"},{"name":"suggested_word_count","description":"Target length for the finished page, in words.","type":"number"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
    $J${"__kind":"page_brief","angle":"The only page on the site that prices the decision instead of describing the procedure.","brief":["Open with the single decision the reader is trying to make: whether this is worth financing.","Compare the three financing routes side by side with real monthly numbers.","Answer the two objections the sales team hears most, in the reader's own words.","Close with exactly what to bring to a first consultation."],"must_not_cover":["Recovery timelines — that is the /recovery page's job.","Surgeon credentials — /about owns those."],"concerns":["Every price claim needs a dated source before this publishes.","The financing partner's terms changed in June; verify before quoting APR."],"suggested_word_count":1400}$J$::jsonb,
    $J${"type":"object","properties":{"angle":{"type":"string","description":"The single differentiating angle this page takes, in one sentence."},"brief":{"type":"array","items":{"type":"string"},"description":"The brief itself — one instruction per line, in the order the writer should follow them."},"must_not_cover":{"type":"array","items":{"type":"string"},"description":"Topics belonging to a sibling page — covering them here cannibalizes it."},"concerns":{"type":"array","items":{"type":"string"},"description":"Risks the writer or the plan owner should know about before this page is written."},"suggested_word_count":{"type":"number","description":"Target length for the finished page, in words."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"page_brief"}},"required":["__kind","brief"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"angle":{"type":"string","description":"The single differentiating angle this page takes, in one sentence."},"brief":{"type":"array","items":{"type":"string"},"description":"The brief itself — one instruction per line, in the order the writer should follow them."},"must_not_cover":{"type":"array","items":{"type":"string"},"description":"Topics belonging to a sibling page — covering them here cannibalizes it."},"concerns":{"type":"array","items":{"type":"string"},"description":"Risks the writer or the plan owner should know about before this page is written."},"suggested_word_count":{"type":"number","description":"Target length for the finished page, in words."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["brief"],"additionalProperties":false}$J$::jsonb,
    'qq-tgo9li4nweuo',
    true,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public',
    $J${"loading_component":"list","source_name":"content_plan.brief_writer"}$J$::jsonb
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
  metadata = content_ir.kind_definition.metadata || EXCLUDED.metadata,
  updated_at = now();
  -- is_active deliberately NOT updated on re-apply: activation belongs to the
  -- dual gate (scripts/shape/activate-kinds.ts).

-- ── kind_example: the canonical sample (dual gate passed in-process) ────────

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, validation_status, validated_at, organization_id)
SELECT d.id, d.version, $J${"__kind":"page_brief","angle":"The only page on the site that prices the decision instead of describing the procedure.","brief":["Open with the single decision the reader is trying to make: whether this is worth financing.","Compare the three financing routes side by side with real monthly numbers.","Answer the two objections the sales team hears most, in the reader's own words.","Close with exactly what to bring to a first consultation."],"must_not_cover":["Recovery timelines — that is the /recovery page's job.","Surgeon credentials — /about owns those."],"concerns":["Every price claim needs a dated source before this publishes.","The financing partner's terms changed in June; verify before quoting APR."],"suggested_word_count":1400}$J$::jsonb,
       'Financing page brief (canonical)',
       'Full shape: angle, four ordered brief lines, sibling-page exclusions, publishing concerns, target length.',
       'authored', true, 'passed', now(), d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'page_brief'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example x
    WHERE x.kind_definition_id = d.id
      AND x.label = 'Financing page brief (canonical)'
      AND x.deleted_at IS NULL
  );

-- ── kind_component: web output → the bundled renderer ──────────────────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'page_brief', 'bundled',
       $J${"legacyBlockType":"page_brief"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'page_brief'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'page_brief'
      AND c.deleted_at IS NULL
  );

COMMIT;
