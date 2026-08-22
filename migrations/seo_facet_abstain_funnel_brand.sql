-- Arman's ruling 2026-08-22 (R2): the AI must be allowed to say "not clear" on
-- funnel_stage and brand_presence (leave query_form, specificity, local_intent,
-- intent_class). THE CHECK LAW: the registry value and the legacy mirror CHECK
-- on seo.keyword widen in the SAME change, or the classifier's dual-write would
-- fail the moment it emits the new value.

ALTER TABLE seo.keyword DROP CONSTRAINT IF EXISTS keyword_funnel_stage_check;
ALTER TABLE seo.keyword ADD CONSTRAINT keyword_funnel_stage_check
  CHECK (funnel_stage = ANY (ARRAY['problem_aware','solution_aware','vendor_evaluation','purchase_ready','not_clear']));

ALTER TABLE seo.keyword DROP CONSTRAINT IF EXISTS keyword_brand_presence_check;
ALTER TABLE seo.keyword ADD CONSTRAINT keyword_brand_presence_check
  CHECK (brand_presence = ANY (ARRAY['unbranded','branded','product_branded','not_clear']));

-- Registry rows (platform dimension → system org), flagged as the abstain member
-- exactly like searcher_role:unknown.
INSERT INTO platform.categories (organization_id, dimension, name, slug, parent_id, is_system, position, metadata, visibility)
SELECT d.organization_id, 'seo_facet', 'Not clear', d.slug || ':not_clear', d.id, true,
       COALESCE((SELECT max(position) FROM platform.categories c WHERE c.parent_id = d.id), 0) + 1,
       jsonb_build_object('value','not_clear','abstain',true,
         'description', CASE d.slug
            WHEN 'funnel_stage' THEN 'The words do not say what stage the searcher is at. Never guess a stage that is not in the query.'
            ELSE 'The query names a token the classifier cannot confirm is or is not a brand. Never guess.' END),
       d.visibility
FROM platform.categories d
WHERE d.dimension='seo_facet' AND d.parent_id IS NULL AND d.slug IN ('funnel_stage','brand_presence') AND d.deleted_at IS NULL
ON CONFLICT DO NOTHING;
