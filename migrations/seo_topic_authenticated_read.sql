-- Content Planning follow-up: the plan client tags nodes/entities with
-- seo.topic (association role 'topic') and reads keyword↔topic edges, but
-- seo.topic and seo.keyword_topic were never granted authenticated SELECT
-- when the seo schema was exposed (keyword / keyword_market /
-- site_keyword_value / keyword_edge all have it). RLS stays the
-- authorization ceiling (pub_read / org policies) — this only aligns the
-- grant layer with the rest of the exposed seo read surface.

GRANT SELECT ON seo.topic TO authenticated;
GRANT SELECT ON seo.keyword_topic TO authenticated;
