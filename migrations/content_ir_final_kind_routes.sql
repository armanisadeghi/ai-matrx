-- content_ir_final_kind_routes.sql
--
-- Army: FE kind component routes — THE FINAL FOUR
-- (docs/KIND_COMPONENT_LEDGER.md, claim `copy-D`).
--
-- The last active, non-contract-artifact kinds without a
-- `(kind,'web','output')` row:
--
--   gsc_site_intake_bundle · gsc_site_intake_proposal
--   seo_finding_fix_context · seo_finding_fix_proposal
--
-- Applying this takes the mission's count to ZERO: every active,
-- non-contract-artifact kind now has a registered frontend route, and none of
-- them reaches the generic viewer by silent fallback.
--
-- REUSE was checked against the whole repo. The only near-miss is worth
-- recording, because it is NOT a legacy display to repoint or delete:
--
--   features/marketing/components/analysis/FindingFixCard.tsx consumes
--   `seo_finding_fix_proposal` (via useFindingFixer). It is an INTERACTIVE
--   APPLY SURFACE — before/after, a confirm dialog, and a CMS-draft writeback
--   through applyFindingFix — not a block renderer. It cannot render from a
--   kind envelope alone: it needs a finding row, the page workspace, and the
--   apply seams. So it is not a second renderer competing with this route, and
--   nothing here repoints or removes it.
--
--   THE OPEN QUESTION, left for the distillation/verification pass rather than
--   decided here: when a `seo_finding_fix_proposal` arrives as a STREAMED
--   BLOCK (not inside the fixer flow), should it render as a read-only twin of
--   that card instead of the generic document? That is a product-semantics
--   call, and a basic route is not the place to make it. Recorded in the
--   ledger; the generic route is strictly better than the silent fallback it
--   replaces either way.
--
-- The other three have no component anywhere. All four get the generic
-- structured renderer as an EXPLICIT basic route, so the resolver answers
-- (`by:'db'`) instead of the seam falling back (`by:'generic', unverified`).
--
-- NOT DONE, deliberately: kind_example (all four already carry a canonical
-- example), kind_definition.is_active, and metadata.maturity — a basic FE
-- route does NOT promote maturity (KINDS_EVERYWHERE_PLAN.md §7.8).
--
-- Idempotent: re-running is safe.

BEGIN;

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'generic_structured', 'bundled',
       '{}'::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind IN ('gsc_site_intake_bundle',
                 'gsc_site_intake_proposal',
                 'seo_finding_fix_context',
                 'seo_finding_fix_proposal')
  AND d.is_active
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.deleted_at IS NULL
  );

COMMIT;
