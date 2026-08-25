-- ============================================================================
-- KI-035 step 1 — THE CANONICAL UNIVERSAL-FACET READ (2026-08-23 plan, built 2026-08-25)
--
-- The 13 facet columns on `seo.keyword` are the declared legacy mirror of the
-- stamp store. They cannot be dropped while readers still name them, and a
-- reader cannot be repointed until there is ONE thing to repoint it AT. This
-- view is that thing: the same 13 facts, per keyword, derived from
-- `seo.keyword_facet` (universal stamps — `site_id IS NULL`, the plane the
-- columns always mirrored) through the registry, so a repoint is a join swap
-- rather than a rewrite.
--
-- Precedence inside a dimension matches every other resolver: pinned/human
-- first, then matcher/pack/rule, then the classifier. Cardinality is ignored
-- on purpose — these 13 are single-choice by construction, and taking the
-- best-ranked stamp reproduces exactly what the column held.
--
-- Order of the cutover (safe-cutover: readers BEFORE writers — the doc's
-- original order would have left new keywords reading empty columns):
--   1. this view                                    ← here
--   2. repoint the DB readers, verifying each       ← same migration
--   3. repoint the frontend readers                 ← chip
--   4. stop aidream's mirror-write                  ← after 3 is live
--   5. drop the columns                             ← ARMAN, after a nightly cycle
-- ============================================================================

CREATE OR REPLACE VIEW seo.keyword_universal_facet AS
WITH ranked AS (
  SELECT kf.keyword_id,
         cd.slug AS dimension,
         COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS value,
         row_number() OVER (
           PARTITION BY kf.keyword_id, cd.id
           ORDER BY CASE WHEN kf.pinned THEN 0
                         ELSE CASE kf.source WHEN 'human' THEN 1 WHEN 'import' THEN 2
                                             WHEN 'matcher' THEN 3 WHEN 'rule' THEN 3
                                             WHEN 'pack' THEN 3 WHEN 'classifier' THEN 5
                                             ELSE 6 END END,
                    kf.updated_at DESC, kf.category_id
         ) AS rn
  FROM seo.keyword_facet kf
  JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  WHERE kf.deleted_at IS NULL AND kf.site_id IS NULL
)
SELECT keyword_id,
       max(value) FILTER (WHERE dimension = 'intent_class')          AS intent_class,
       max(value) FILTER (WHERE dimension = 'fulfillment_mode')      AS fulfillment_mode,
       max(value) FILTER (WHERE dimension = 'audience_type')         AS audience_type,
       max(value) FILTER (WHERE dimension = 'funnel_stage')          AS funnel_stage,
       max(value) FILTER (WHERE dimension = 'transaction_direction') AS transaction_direction,
       max(value) FILTER (WHERE dimension = 'local_intent')          AS local_intent,
       max(value) FILTER (WHERE dimension = 'urgency')               AS urgency,
       max(value) FILTER (WHERE dimension = 'comparison_intent')     AS comparison_intent,
       max(value) FILTER (WHERE dimension = 'price_sensitivity')     AS price_sensitivity,
       max(value) FILTER (WHERE dimension = 'query_form')            AS query_form,
       max(value) FILTER (WHERE dimension = 'specificity')           AS specificity,
       max(value) FILTER (WHERE dimension = 'brand_presence')        AS brand_presence,
       max(value) FILTER (WHERE dimension = 'compliance_framing')    AS compliance_framing
FROM ranked
WHERE rn = 1
GROUP BY keyword_id;

COMMENT ON VIEW seo.keyword_universal_facet IS
  'KI-035 — the canonical read for the 13 universal facts, derived from the stamp store (seo.keyword_facet, site_id IS NULL). Every reader that still names the mirror columns on seo.keyword repoints HERE; once none do, the columns can be dropped. Never write through this view — the writer is seo.keyword_facet_set / the classifier.';

GRANT SELECT ON seo.keyword_universal_facet TO authenticated, service_role;
