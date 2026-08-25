-- ============================================================================
-- KI-035 — THE MIRROR/STAMP GAP REPAIR (2026-08-25)
--
-- Found while proving `seo.keyword_universal_facet` reproduces the 13 mirror
-- columns: it reproduced 12 of them exactly and missed 37 rows across two —
-- 36 × `price_sensitivity` (every one of them `free_seeking`) and 1 ×
-- `compliance_framing`. Those keywords carry the value in the COLUMN and have
-- no stamp for that dimension at all.
--
-- Why it matters beyond the drop: a value rule keyed on `free_seeking` (the
-- canonical example in this system's own vision — "the word free massively
-- reduces the value of a keyword") reads the STAMP store, so on those 36
-- keywords the rule has been silently inert. The gap is not a counting
-- artefact; it is meaning that never reached the layer that acts on it.
--
-- This migration copies the orphaned column values into the fact store as
-- `source='import'` (never 'classifier' — no model asserted these in the run
-- that produced the stamps) so provenance stays honest. It is idempotent: it
-- writes only where the dimension has NO universal stamp for that keyword.
-- `local_intent` differences are deliberately NOT touched — there the stamp
-- store is AHEAD (the gazetteer detects places the classifier missed).
-- ============================================================================

INSERT INTO seo.keyword_facet
  (keyword_id, category_id, site_id, source, confidence, classifier_version,
   organization_id, visibility, notes, metadata)
SELECT k.id, cv.id, NULL, 'import', 60, 'mirror-repair-v1',
       cd.organization_id, 'public',
       'Recovered from the legacy mirror column: the classifier wrote the column but no fact row.',
       jsonb_build_object('recovered_from', 'seo.keyword.' || cd.slug,
                          'recovered_at', now(),
                          'original_classifier_version', k.classifier_version)
FROM seo.keyword k
JOIN LATERAL (
  VALUES ('price_sensitivity', k.price_sensitivity),
         ('compliance_framing', k.compliance_framing),
         ('intent_class', k.intent_class),
         ('audience_type', k.audience_type),
         ('funnel_stage', k.funnel_stage),
         ('fulfillment_mode', k.fulfillment_mode),
         ('transaction_direction', k.transaction_direction),
         ('urgency', k.urgency),
         ('comparison_intent', k.comparison_intent),
         ('query_form', k.query_form),
         ('specificity', k.specificity),
         ('brand_presence', k.brand_presence)
) AS col(dimension_slug, column_value) ON col.column_value IS NOT NULL
JOIN platform.categories cd
  ON cd.dimension = 'seo_facet' AND cd.parent_id IS NULL
 AND cd.slug = col.dimension_slug AND cd.deleted_at IS NULL
JOIN platform.categories cv
  ON cv.parent_id = cd.id AND cv.deleted_at IS NULL
 AND COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) = col.column_value
WHERE k.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM seo.keyword_facet kf
    JOIN platform.categories x ON x.id = kf.category_id
    WHERE kf.keyword_id = k.id AND kf.site_id IS NULL AND kf.deleted_at IS NULL
      AND x.parent_id = cd.id)
ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deleted_at IS NULL DO NOTHING;
