-- content_ir_seo_analysis_kind_routes.sql
--
-- Army: FE kind component routes — the SEO ANALYSIS cluster
-- (docs/KIND_COMPONENT_LEDGER.md, claim `copy-D`, batch 3).
--
-- Eight active, non-contract-artifact kinds had NO `(kind,'web','output')` row
-- in content_ir.kind_component. REUSE was checked for each against the whole
-- repo first, and the answer split two ways:
--
-- 1. `keyword_classification_batch_v1` ALREADY HAS A REAL COMPONENT.
--    features/content-ir/kinds/keyword-research.ts declares
--    `legacyBlockType: "keyword_classification_batch"`, so today it routes
--    through `applyIrKindRoute`'s COMPILED-BRIDGE path to
--    components/mardown-display/blocks/keyword-research/
--    KeywordClassificationBatchBlock.tsx. It was never a silent fallback — the
--    missing row was a REGISTRY LIE, not a rendering gap: the database did not
--    record the component the platform actually uses. This registers the truth,
--    naming the real component (the same pattern as
--    migrations/kind_masterwork_checkup_finding_full.sql).
--
-- 2. The other seven have no component anywhere — not a compiled bridge, not a
--    bespoke display, nothing to repoint or delete:
--
--      competitor_opportunity_autopsy_v1 · competitor_page_autopsy_v1
--      digital_pr_reputation_brief_v1 · page_keyword_analysis_v1
--      page_keyword_map_v1 · topic_assignment_batch_v1
--      seo_authority_route_analysis
--
--    (`seo_authority_route_analysis` is a COMPILED kind — features/content-ir/
--    kinds/seo-authority-route-analysis.ts — but declares no `legacyBlockType`,
--    so it has a schema and no renderer, which is exactly the R6 case.)
--
--    They each get the generic structured renderer as an EXPLICIT basic route,
--    so the resolver answers (`by:'db'`) instead of the seam falling back
--    (`by:'generic', unverified:true`). Their nested child kinds
--    (`keyword_ref_v1`, `content_gap_v1`, `page_plan_v1`, `page_ref_v1`,
--    `topic_proposal_v1`, …) render by RECURSION through the registry — this
--    migration deliberately mints no per-child renderer.
--
-- NOT DONE here, deliberately:
--   * kind_example — all eight already carry a canonical example with
--     validation_status='passed'; nothing to author.
--   * kind_definition.is_active — untouched (owned by set_kind_activation).
--   * metadata.maturity — untouched. A basic FE route does NOT promote
--     maturity (KINDS_EVERYWHERE_PLAN.md §7.8); `verified` belongs to the
--     verification pass, after a real end-to-end render.
--
-- Idempotent: re-running is safe.

BEGIN;

-- 1. The kind that already HAS a component — record the real one.

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'keyword_classification_batch', 'bundled',
       '{"legacyBlockType": "keyword_classification_batch"}'::jsonb,
       true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'keyword_classification_batch_v1'
  AND d.is_active
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.deleted_at IS NULL
  );

-- 2. The seven with no component anywhere — explicit basic route.

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'generic_structured', 'bundled',
       '{}'::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind IN ('competitor_opportunity_autopsy_v1',
                 'competitor_page_autopsy_v1',
                 'digital_pr_reputation_brief_v1',
                 'page_keyword_analysis_v1',
                 'page_keyword_map_v1',
                 'topic_assignment_batch_v1',
                 'seo_authority_route_analysis')
  AND d.is_active
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.deleted_at IS NULL
  );

COMMIT;
