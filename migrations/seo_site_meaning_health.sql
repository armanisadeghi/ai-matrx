-- ============================================================================
-- WHAT IS UNFINISHED ABOUT THIS SITE'S SETUP  (D37 follow-up 3)
--
-- Arman's actual complaint about this feature was not that it was broken. It
-- was: "I just can't seem to figure out what's missing." Every screen answered
-- "what does the system think this keyword is worth" and no screen answered
-- "what have I not told it yet" -- so a setting that silently does nothing
-- looked exactly like a setting that works.
--
-- Three live examples, each measured tonight and each invisible until someone
-- went looking:
--   * All FOUR geo areas on datadestruction.com carry ZERO match tokens. The
--     starter pack adopted them as labelled shells. They have never matched a
--     keyword and nothing said so.
--   * 4,524 of the site's keywords are not on the topic tree at all, so 70% of
--     its clicks cannot be traced to anything it sells.
--   * Six platform dimensions have no "not clear" option, so the classifier is
--     forced to guess on them.
--
-- This returns those facts as rows. It deliberately computes NO score and NO
-- health percentage: a number would invite optimising the number. Each row is
-- a plain sentence and the screen that fixes it.
--
-- Cheap by construction -- metadata counts only, no corpus scan, no resolver
-- call (the 2026-08-07 timeout law).
-- ============================================================================
CREATE OR REPLACE FUNCTION seo.gsc_site_meaning_health(p_site_id uuid)
RETURNS TABLE (
  area text,        -- which screen fixes it
  severity text,    -- 'inert' = expressed but doing nothing · 'gap' · 'ok'
  headline text,
  detail text,
  count_value bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
DECLARE
  v_geo_total bigint; v_geo_inert bigint;
  v_rules bigint; v_facet_rules bigint;
  v_topics bigint; v_kw_on_tree bigint;
  v_dims_not_ready bigint; v_dims_no_abstain bigint;
  v_bands_site bigint;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  SELECT count(*), count(*) FILTER (WHERE COALESCE(jsonb_array_length(g.match_tokens), 0) = 0)
    INTO v_geo_total, v_geo_inert
  FROM seo.site_geo_area g WHERE g.site_id = p_site_id AND g.deleted_at IS NULL;

  SELECT count(*), count(*) FILTER (WHERE r.match_facet IS NOT NULL)
    INTO v_rules, v_facet_rules
  FROM seo.keyword_class_rule r
  WHERE r.site_id = p_site_id AND r.deleted_at IS NULL AND r.value_multiplier IS NOT NULL;

  SELECT count(*) INTO v_topics
  FROM seo.site_topic_value t WHERE t.site_id = p_site_id AND t.deleted_at IS NULL;

  SELECT count(DISTINCT kt.keyword_id) INTO v_kw_on_tree
  FROM seo.keyword_topic kt WHERE kt.is_primary AND kt.deleted_at IS NULL;

  SELECT count(*) INTO v_bands_site
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band'
    AND sv.active AND sv.deleted_at IS NULL;

  SELECT count(*) FILTER (WHERE NOT r.is_ready),
         count(*) FILTER (WHERE r.is_ready AND NOT r.can_abstain)
    INTO v_dims_not_ready, v_dims_no_abstain
  FROM platform.categories c
  CROSS JOIN LATERAL seo.facet_dimension_readiness(c.id) r
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND (COALESCE(c.metadata->>'scope','platform') = 'platform'
         OR (c.metadata->>'site_id')::uuid = p_site_id);

  -- Geo areas that were labelled but never given the places they stand for.
  IF v_geo_inert > 0 THEN
    RETURN QUERY SELECT 'geo', 'inert',
      format('%s of your %s service areas match nothing', v_geo_inert, v_geo_total),
      'They have a name and a band but no place names in them, so no keyword has ever matched one. Until you add the towns, cities or regions each stands for, geography counts for nothing in your value tiers.',
      v_geo_inert;
  ELSIF v_geo_total = 0 THEN
    RETURN QUERY SELECT 'geo', 'gap',
      'No service areas yet',
      'Nothing tells the system which places are worth your money. Add your ideal area and the ones you will accept, and "near me in the wrong city" stops counting as a win.',
      0::bigint;
  END IF;

  -- Rules.
  IF v_rules = 0 THEN
    RETURN QUERY SELECT 'rules', 'gap',
      'No value rules yet',
      'This is where a word changes what a keyword is worth — "free" pulling value down, "certified" pushing it up. Without any, every keyword leans entirely on its topic.',
      0::bigint;
  ELSE
    RETURN QUERY SELECT 'rules', 'ok',
      format('%s value rules, %s of them reading a dimension', v_rules, v_facet_rules),
      'Rules that read a dimension only fire on keywords the classifier has actually looked at.',
      v_rules;
  END IF;

  -- The tree — the biggest one, and the one Arman asked the original question about.
  IF v_topics = 0 THEN
    RETURN QUERY SELECT 'topics', 'gap',
      'No topic is worth anything yet',
      'Nothing has been ruled as something you sell, so no keyword can be traced to money. This is the first thing to fill in.',
      0::bigint;
  ELSE
    RETURN QUERY SELECT 'topics', 'ok',
      format('%s topics carry a worth for this site', v_topics),
      format('%s keywords across the platform have a primary topic. The topic tree is shared; what each topic is WORTH is yours. Only keywords on the tree can be traced up to something you sell — everything else is honestly unvalued. The topics screen reports this site''s own split.', v_kw_on_tree),
      v_topics;
  END IF;

  -- Dimensions.
  IF v_dims_not_ready > 0 THEN
    RETURN QUERY SELECT 'dimensions', 'inert',
      format('%s dimensions are not being applied', v_dims_not_ready),
      'A dimension needs at least two real choices. With only one, the AI would be forced to stamp it on everything, so it is held back until you add another.',
      v_dims_not_ready;
  END IF;
  IF v_dims_no_abstain > 0 THEN
    RETURN QUERY SELECT 'dimensions', 'gap',
      format('%s dimensions cannot say "not clear"', v_dims_no_abstain),
      'On these the AI must pick a value even when the words do not say — so some answers are guesses that look like facts.',
      v_dims_no_abstain;
  END IF;

  -- Bands.
  IF v_bands_site = 0 THEN
    RETURN QUERY SELECT 'bands', 'gap',
      'Using the platform''s starter tiers',
      'The tier names and thresholds are still ours, not yours. Rename them in your language and the whole page relabels.',
      0::bigint;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_site_meaning_health(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_site_meaning_health(uuid) TO authenticated;
