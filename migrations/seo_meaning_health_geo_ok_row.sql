-- =============================================================================
-- MEANING HEALTH: GEO GETS AN `ok` ROW  (HANDOFF I8, same change)
-- =============================================================================
-- seo.gsc_site_meaning_health returned NO geo row at all once every service
-- area had places in it: the line a person was sent here to fix silently
-- DISAPPEARED instead of visibly turning over. "Reported so the screen can be
-- honest about what IS done" was already true of rules and topics and was not
-- true of geo — and a door whose row vanishes teaches people not to trust the
-- door. Body is the live function plus one ELSE branch.
--
-- Idempotent: CREATE OR REPLACE only. Safe to re-run.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- =============================================================================

create or replace function seo.gsc_site_meaning_health(p_site_id uuid)
 returns table(area text, severity text, headline text, detail text, count_value bigint)
 language plpgsql
 stable security definer
 set search_path to 'seo', 'platform', 'web', 'pg_temp'
as $function$
DECLARE
  v_geo_total bigint; v_geo_inert bigint;
  v_rules bigint; v_facet_rules bigint;
  v_topics bigint; v_kw_on_tree bigint;
  v_dims_not_ready bigint; v_dims_no_abstain bigint;
  v_bands_site bigint;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  -- An area is finished when it names gazetteer places OR typed words (I3);
  -- only an area with neither is a shell that matches nothing.
  SELECT count(*),
         count(*) FILTER (WHERE COALESCE(jsonb_array_length(g.match_tokens), 0) = 0
                            AND COALESCE(array_length(g.place_ids, 1), 0) = 0)
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
      'They have a name and a band but no places in them — no picked place, no typed name — so no keyword has ever matched one. Until you say which towns, cities or regions each stands for, geography counts for nothing in your value tiers.',
      v_geo_inert;
  ELSIF v_geo_total = 0 THEN
    RETURN QUERY SELECT 'geo', 'gap',
      'No service areas yet',
      'Nothing tells the system which places are worth your money. Add your ideal area and the ones you will accept, and "near me in the wrong city" stops counting as a win.',
      0::bigint;
  ELSE
    -- Every area carries places. Reported, like rules and topics are, so the
    -- screen can be honest about what IS done — and so the row a person was
    -- sent here to fix visibly turns over instead of silently disappearing.
    RETURN QUERY SELECT 'geo', 'ok',
      format('%s service areas, all with places in them', v_geo_total),
      'Every area names the places it stands for, so location counts in the value of every search that mentions one. When several areas match the same search the lowest multiplier wins — a place you never serve beats a place you love.',
      v_geo_total;
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
$function$;
