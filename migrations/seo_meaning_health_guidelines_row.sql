-- =============================================================================
-- MEANING HEALTH REPORTS THE BUSINESS GUIDELINES  (KI-031)
-- =============================================================================
-- The one thing a site says about ITSELF was the one thing "your setup, as it
-- actually stands" never mentioned. 1 of 32 sites had written the document,
-- and no screen said so: every AI run judged those sites' keywords with no
-- idea what the business sells, and reported nothing about it. Silence is the
-- adoption problem — a person cannot fill in a gap they were never shown.
--
-- Three states, and a NEW severity the readout did not have:
--   gap    — never written. The AI has been told nothing about this business.
--   stale  — written, untouched for > 90 days. Still driving every run, so it
--            is neither `ok` (it may be wrong now) nor `gap` (it exists and is
--            doing work). `inert` would be a lie: this document is anything
--            but inert, which is exactly why an old one is worth flagging.
--   ok     — written and current.
--
-- Body is the live function (as of 2026-08-25) plus the guidelines block.
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
  v_geo_total bigint; v_geo_inert bigint; v_geo_disconnected bigint;
  v_rules bigint; v_facet_rules bigint; v_rules_disconnected bigint;
  v_topics bigint; v_kw_on_tree bigint;
  v_dims_not_ready bigint; v_dims_no_abstain bigint;
  v_bands_site bigint;
  v_gl jsonb; v_gl_chars bigint; v_gl_days int;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  -- An area is finished when it names gazetteer places OR typed words (I3);
  -- only an area with neither is a shell that matches nothing.
  SELECT count(*),
         count(*) FILTER (WHERE COALESCE(jsonb_array_length(g.match_tokens), 0) = 0
                            AND COALESCE(array_length(g.place_ids, 1), 0) = 0)
    INTO v_geo_total, v_geo_inert
  FROM seo.site_geo_area g WHERE g.site_id = p_site_id AND g.deleted_at IS NULL;

  -- …and an area that is FULL and still has no matchers is worse: it looks
  -- finished on every screen and changes no score at all. That is exactly the
  -- state C2 left every site in, so it gets its own line and never hides
  -- inside the "no places yet" count.
  SELECT count(*) INTO v_geo_disconnected
  FROM seo.gsc_geo_area_health(p_site_id) h WHERE h.state = 'disconnected';

  SELECT count(*), count(*) FILTER (WHERE r.match_facet IS NOT NULL)
    INTO v_rules, v_facet_rules
  FROM seo.keyword_class_rule r
  WHERE r.site_id = p_site_id AND r.deleted_at IS NULL AND r.value_multiplier IS NOT NULL;

  -- The rules half of the same silence (2026-08-24): a rule that is complete on
  -- the screen and mints no matcher and no worth.
  SELECT count(*) INTO v_rules_disconnected
  FROM seo.gsc_value_rule_health(p_site_id) h WHERE h.state = 'disconnected';

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

  -- The site's own doctrine (D35 / KI-031). Read straight off the site row —
  -- the same key `seo.gsc_site_kw_guidelines` reads and
  -- `seo.gsc_set_site_kw_guidelines` writes; never a second store.
  SELECT s.settings -> 'kw_guidelines' INTO v_gl
    FROM web.site s WHERE s.id = p_site_id;
  v_gl_chars := COALESCE(length(NULLIF(btrim(COALESCE(v_gl ->> 'text','')),'')), 0);
  v_gl_days  := CASE
    WHEN (v_gl ->> 'updated_at') IS NULL THEN NULL
    ELSE GREATEST(0, (now()::date - ((v_gl ->> 'updated_at')::timestamptz)::date))
  END;

  IF v_geo_disconnected > 0 THEN
    RETURN QUERY SELECT 'geo', 'inert',
      format('%s service area%s full of places but not connected to scoring',
             v_geo_disconnected, CASE WHEN v_geo_disconnected = 1 THEN '' ELSE 's' END),
      'The places are named, but nothing links them to your value tiers, so these areas change no score at all — the worst state a setting can be in, because every screen shows them as finished. Open the Rulebook and reconnect them; it takes one click and nothing you typed is lost.',
      v_geo_disconnected;
  END IF;

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
  ELSIF v_geo_disconnected = 0 THEN
    RETURN QUERY SELECT 'geo', 'ok',
      format('%s service areas, all with places in them', v_geo_total),
      'Every area names the places it stands for, so location counts in the value of every search that mentions one. When several areas match the same search the lowest multiplier wins — a place you never serve beats a place you love.',
      v_geo_total;
  END IF;

  -- Rules. The inert line comes FIRST and is never folded into the count of
  -- rules you have: a rule that changes nothing is worse than a missing one,
  -- because the screen already told you it was written.
  IF v_rules_disconnected > 0 THEN
    RETURN QUERY SELECT 'rules', 'inert',
      format('%s value rule%s written but not connected to scoring',
             v_rules_disconnected, CASE WHEN v_rules_disconnected = 1 THEN '' ELSE 's' END),
      'The words and the multipliers are typed, but nothing links them to your value tiers, so these rules change no score at all. Open the Rulebook and reconnect them; it takes one click and nothing you typed is lost.',
      v_rules_disconnected;
  END IF;

  IF v_rules = 0 THEN
    RETURN QUERY SELECT 'rules', 'gap',
      'No value rules yet',
      'This is where a word changes what a keyword is worth — "free" pulling value down, "certified" pushing it up. Without any, every keyword leans entirely on its topic.',
      0::bigint;
  ELSIF v_rules_disconnected = 0 THEN
    RETURN QUERY SELECT 'rules', 'ok',
      format('%s value rules, %s of them reading a dimension', v_rules, v_facet_rules),
      'Rules that read a dimension only fire on keywords the classifier has actually looked at.',
      v_rules;
  END IF;

  -- The tree.
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

  -- Business guidelines. Counted in CHARACTERS because that is the honest
  -- measure of how much this site has actually told the AI about itself.
  IF v_gl_chars = 0 THEN
    RETURN QUERY SELECT 'guidelines', 'gap',
      'You have told the AI nothing about this business',
      'Every AI run that judges this site''s keywords reads one plain-text document about what you sell and who you serve — and yours is empty, so every keyword is being judged on universal signals alone. A few sentences here ("CRT and TV searches are consumers; we make our money on corporations") change every future run. You do not have to start from a blank page: ask for a draft written from your own site and correct it.',
      0::bigint;
  ELSIF v_gl_days IS NOT NULL AND v_gl_days > 90 THEN
    RETURN QUERY SELECT 'guidelines', 'stale',
      format('Business guidelines not edited in %s days', v_gl_days),
      'The AI is still ruling on every keyword from this text, so an out-of-date sentence keeps deciding things long after it stopped being true. Re-read it before the next classification sweep — most edits take a minute.',
      v_gl_chars;
  ELSE
    RETURN QUERY SELECT 'guidelines', 'ok',
      format('%s characters of business guidelines, read on every run', v_gl_chars),
      'Every AI classification and valuation run for this site reads this document before it judges a keyword. It never overrides a keyword you ruled by hand — a human ruling always wins.',
      v_gl_chars;
  END IF;
END;
$function$;
