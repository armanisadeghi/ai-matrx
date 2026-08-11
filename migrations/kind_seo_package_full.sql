-- ============================================================================
-- content-ir kind `seo_package` (+ child `faq_item`) — FULL package.
--
-- The on-page SEO package for one publishable piece, produced by the
-- `research_client.output_seo` agent slot and rendered in the Research Outputs
-- Studio (/research/topics/[topicId]/outputs). Before this kind existed the run
-- was awaited whole behind a spinner, hand-parsed with `parseJsonLoose`, and
-- rendered by a bespoke `SeoView` card that could only ever show a FINISHED
-- payload — a violation of THE FLOATING LAW.
--
-- Canonical `__kind` JSON shape:
--   { "__kind":"seo_package", "title":"…", "meta_description":"…", "slug":"…",
--     "primary_keyword":"…", "keywords":[…],
--     "faq":[{ "__kind":"faq_item", "question":"…", "answer":"…" }],
--     "schema_org":{…}, "open_graph":{…} }
--
-- Rows applied here:
--   * content_ir.kind_definition — faq_item (child, first so the root's edge
--     resolves) + seo_package. data / emitted_block_schema /
--     emitted_json_schema / emitted_fingerprint are CONVERTER-EMITTED
--     (planKindMigration → kindSchemaToStorage / kindSchemaToJsonSchema /
--     fingerprintText over features/content-ir/kinds/seo-package.ts; emitter
--     run 2026-08-11) — never hand-written. authoring_owner 'ts', platform org,
--     visibility public.
--   * content_ir.kind_edge — seo_package.faq → faq_item.
--   * content_ir.kind_example — 1 canonical example per kind. The seo_package
--     example passed the FULL dual gate (structural + render legs) in-process
--     on 2026-08-11 before this migration was written; `validation_status` is
--     recomputed by the `kind_example_recompute_validation` trigger on write
--     regardless, so the DB derives it rather than trusting this file.
--   * content_ir.kind_component — web/output → component_key 'seo_package'
--     (the compiled bridge facade into SeoPackageBlock via block-dispatch).
--     `faq_item` deliberately gets NONE: it is a nested_only_child that renders
--     only inside its parent, so it legitimately fails the render leg and stays
--     inactive — the same precedent as video_prompt_variation / task_item.
--   * NO kind_surface — `__kind` JSON is the only arrival form (no tag/fence).
--
-- is_active is inserted FALSE for both; the flip is the dual gate's job
-- (`pnpm shape:activate seo_package --apply`), never a migration's.
--
-- Idempotent on business keys; re-apply is safe.
-- ============================================================================

BEGIN;

-- ── 1. kind_definition: child first (the root's edge resolves to it) ────────

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility, metadata)
VALUES
  (
    'faq_item',
    'FAQ Item',
    'ts',
    $J$[{"name":"question","required":true,"description":"The question, phrased the way a searcher would type it.","type":"string"},{"name":"answer","description":"A direct, self-contained answer — no more than a paragraph.","type":"string"}]$J$::jsonb,
    $J${"__kind":"faq_item","question":"Can I finance dental implants with bad credit?","answer":"Yes. In-house payment plans and third-party medical lenders both approve applicants outside prime credit, usually at a higher APR and with a larger deposit."}$J$::jsonb,
    $J${"type":"object","properties":{"question":{"type":"string","description":"The question, phrased the way a searcher would type it."},"answer":{"type":"string","description":"A direct, self-contained answer — no more than a paragraph."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"faq_item"}},"required":["__kind","question"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"question":{"type":"string","description":"The question, phrased the way a searcher would type it."},"answer":{"type":"string","description":"A direct, self-contained answer — no more than a paragraph."}},"required":["question"],"additionalProperties":false}$J$::jsonb,
    'b5-3gz63lego9an',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public',
    $J${"nested_only_child":true}$J$::jsonb
  ),
  (
    'seo_package',
    'SEO Package',
    'ts',
    $J$[{"name":"title","required":true,"description":"The meta title, written to fit inside the SERP budget (~60 characters).","type":"string"},{"name":"meta_description","description":"The meta description, written to fit inside the SERP budget (~160 characters).","type":"string"},{"name":"slug","description":"URL slug — lowercase, hyphenated, no stop words.","type":"string"},{"name":"primary_keyword","description":"The single keyword this page targets. Must also appear in `keywords`.","type":"string"},{"name":"keywords","description":"Every keyword this page targets, primary first, then secondary and long-tail.","type":"string[]"},{"name":"faq","description":"Questions worth answering on the page — the source for FAQPage markup.","type":"array"},{"name":"schema_org","description":"JSON-LD structured data for the page (an object, or an @graph array).","type":"json"},{"name":"open_graph","description":"Open Graph / social card tags as a key-value object.","type":"json"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
    $J${"__kind":"seo_package","title":"Dental Implant Financing: What It Costs Per Month","meta_description":"The three ways to finance dental implants, compared with real monthly numbers — and exactly what to bring to your first consultation.","slug":"dental-implant-financing-monthly-cost","primary_keyword":"dental implant financing","keywords":["dental implant financing","dental implant cost per month","implant payment plans","financing dental implants with bad credit"],"faq":[{"__kind":"faq_item","question":"Can I finance dental implants with bad credit?","answer":"Yes. In-house payment plans and third-party medical lenders both approve applicants outside prime credit, usually at a higher APR and with a larger deposit."},{"__kind":"faq_item","question":"Does dental insurance cover any of the implant cost?","answer":"Most plans cover the crown but not the titanium post, which is why two quotes for the same procedure can differ by thousands."}],"schema_org":{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I finance dental implants with bad credit?","acceptedAnswer":{"@type":"Answer","text":"Yes. In-house payment plans and third-party medical lenders both approve applicants outside prime credit, usually at a higher APR and with a larger deposit."}}]},"open_graph":{"og:title":"Dental Implant Financing: What It Costs Per Month","og:description":"The three ways to finance dental implants, compared with real monthly numbers.","og:type":"article"}}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"The meta title, written to fit inside the SERP budget (~60 characters)."},"meta_description":{"type":"string","description":"The meta description, written to fit inside the SERP budget (~160 characters)."},"slug":{"type":"string","description":"URL slug — lowercase, hyphenated, no stop words."},"primary_keyword":{"type":"string","description":"The single keyword this page targets. Must also appear in `keywords`."},"keywords":{"type":"array","items":{"type":"string"},"description":"Every keyword this page targets, primary first, then secondary and long-tail."},"faq":{"type":"array","items":{"$ref":"#/$defs/faq_item"},"description":"Questions worth answering on the page — the source for FAQPage markup."},"schema_org":{"description":"JSON-LD structured data for the page (an object, or an @graph array)."},"open_graph":{"description":"Open Graph / social card tags as a key-value object."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"seo_package"}},"required":["__kind","title"],"additionalProperties":false,"$defs":{"faq_item":{"type":"object","properties":{"question":{"type":"string","description":"The question, phrased the way a searcher would type it."},"answer":{"type":"string","description":"A direct, self-contained answer — no more than a paragraph."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"faq_item"}},"required":["__kind","question"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"The meta title, written to fit inside the SERP budget (~60 characters)."},"meta_description":{"type":"string","description":"The meta description, written to fit inside the SERP budget (~160 characters)."},"slug":{"type":"string","description":"URL slug — lowercase, hyphenated, no stop words."},"primary_keyword":{"type":"string","description":"The single keyword this page targets. Must also appear in `keywords`."},"keywords":{"type":"array","items":{"type":"string"},"description":"Every keyword this page targets, primary first, then secondary and long-tail."},"faq":{"type":"array","items":{"$ref":"#/$defs/faq_item"},"description":"Questions worth answering on the page — the source for FAQPage markup."},"schema_org":{"description":"JSON-LD structured data for the page (an object, or an @graph array)."},"open_graph":{"description":"Open Graph / social card tags as a key-value object."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["title"],"additionalProperties":false,"$defs":{"faq_item":{"type":"object","properties":{"question":{"type":"string","description":"The question, phrased the way a searcher would type it."},"answer":{"type":"string","description":"A direct, self-contained answer — no more than a paragraph."}},"required":["question"],"additionalProperties":false}}}$J$::jsonb,
    '19x-1luvieq1xysmo0',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public',
    $J${"loading_component":"list","source_name":"research_client.output_seo"}$J$::jsonb
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

-- ── 2. kind_edge: seo_package.faq → faq_item ───────────────────────────────

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'faq', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'faq_item'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'seo_package'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

-- ── 3. kind_example: canonical samples (validation_status is DERIVED by the
--      kind_example_recompute_validation trigger, never trusted from here) ──

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, validation_status, validated_at, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', true, 'passed', now(), d.organization_id
FROM (VALUES
  (
    'seo_package',
    'Dental implant financing package (canonical)',
    'Full shape: title and meta description inside their SERP budgets, slug, primary keyword plus long-tail set, two FAQ entries, FAQPage JSON-LD and Open Graph tags.',
    $J${"__kind":"seo_package","title":"Dental Implant Financing: What It Costs Per Month","meta_description":"The three ways to finance dental implants, compared with real monthly numbers — and exactly what to bring to your first consultation.","slug":"dental-implant-financing-monthly-cost","primary_keyword":"dental implant financing","keywords":["dental implant financing","dental implant cost per month","implant payment plans","financing dental implants with bad credit"],"faq":[{"__kind":"faq_item","question":"Can I finance dental implants with bad credit?","answer":"Yes. In-house payment plans and third-party medical lenders both approve applicants outside prime credit, usually at a higher APR and with a larger deposit."},{"__kind":"faq_item","question":"Does dental insurance cover any of the implant cost?","answer":"Most plans cover the crown but not the titanium post, which is why two quotes for the same procedure can differ by thousands."}],"schema_org":{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I finance dental implants with bad credit?","acceptedAnswer":{"@type":"Answer","text":"Yes. In-house payment plans and third-party medical lenders both approve applicants outside prime credit, usually at a higher APR and with a larger deposit."}}]},"open_graph":{"og:title":"Dental Implant Financing: What It Costs Per Month","og:description":"The three ways to finance dental implants, compared with real monthly numbers.","og:type":"article"}}$J$
  ),
  (
    'faq_item',
    'Implant financing FAQ entry (canonical)',
    'One question phrased the way a searcher types it, with a direct self-contained answer.',
    $J${"__kind":"faq_item","question":"Can I finance dental implants with bad credit?","answer":"Yes. In-house payment plans and third-party medical lenders both approve applicants outside prime credit, usually at a higher APR and with a larger deposit."}$J$
  )
) AS v(kind, label, description, data)
JOIN content_ir.kind_definition d
  ON d.kind = v.kind
 AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND d.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_example x
  WHERE x.kind_definition_id = d.id
    AND x.label = v.label
    AND x.deleted_at IS NULL
);

-- ── 4. kind_component: web output → the bundled renderer (root only) ────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'seo_package', 'bundled',
       $J${"legacyBlockType":"seo_package"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'seo_package'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'seo_package'
      AND c.deleted_at IS NULL
  );

COMMIT;
