-- Keyword Value System — the SITE BAND EDITOR write path (adopt-then-edit).
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md (D30).
--
-- THE RULING this implements (Arman, 2026-08-21): "users must be able to see
-- and adjust the vocabulary agents apply — the rules can't live in the agent's
-- head." A site starts on the platform starter template (platform.categories,
-- dimension 'seo_value_band' / 'seo_geo_band'). The moment it wants its own
-- meaning it ADOPTS — the template rows are copied into seo.site_vocabulary —
-- and from then on the site's rows REPLACE the whole template set (the
-- resolution semantics seo.keyword_value_map and seo.gsc_value_vocabulary
-- already share; never fork a second one).
--
-- IDENTITY vs LABEL: `value` is the identity (it is what
-- seo.site_keyword_value.value_tier and seo.site_geo_area.geo_band store) and
-- is immutable once created. `label` is free text and renaming it RE-LABELS
-- EVERY KEYWORD INSTANTLY — that is the feature, not a hazard, because the
-- resolver reads labels from these rows on every read.
--
-- COHERENCE is enforced HERE, not in the UI: a band set that cannot band every
-- score is a broken vocabulary, and a UI-only check is not a rule.
--
-- All SECURITY DEFINER per the 2026-08-07 timeout law: reads guard with
-- seo.gsc_assert_site_access, writes with seo.gsc_assert_site_editor.

-- ── 0. Resolver fix: the floor band is the site's LOWEST band, never a
--    hardcoded slug. Before this, a site whose vocabulary has no band literally
--    named 'minimal' could be handed a band its own vocabulary does not name.
CREATE OR REPLACE FUNCTION seo.keyword_value_map(p_site_id uuid)
RETURNS TABLE (keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
LANGUAGE sql STABLE
SET search_path = seo, platform, pg_temp
AS $$
WITH RECURSIVE
bands AS (
  SELECT sv.value, (sv.config->>'min_score')::numeric AS min_score
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band' AND sv.active
    AND sv.deleted_at IS NULL AND sv.config ? 'min_score'
  UNION ALL
  SELECT c.slug, (c.metadata->>'min_score')::numeric
  FROM platform.categories c
  WHERE c.dimension = 'seo_value_band' AND c.deleted_at IS NULL AND c.metadata ? 'min_score'
    AND NOT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv2
      WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'value_band' AND sv2.active
        AND sv2.deleted_at IS NULL AND sv2.config ? 'min_score')
),
geo_band_mult AS (
  SELECT sv.value, COALESCE((sv.config->>'multiplier')::numeric, 1) AS mult
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'geo_band' AND sv.active AND sv.deleted_at IS NULL
  UNION ALL
  SELECT c.slug, COALESCE((c.metadata->>'multiplier')::numeric, 1)
  FROM platform.categories c
  WHERE c.dimension = 'seo_geo_band' AND c.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv2
      WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'geo_band' AND sv2.active AND sv2.deleted_at IS NULL)
),
lineage AS (
  SELECT kt.keyword_id AS kw_id, kt.topic_id, 0 AS depth
  FROM seo.keyword_topic kt
  WHERE kt.is_primary AND kt.deleted_at IS NULL
  UNION ALL
  SELECT l.kw_id, t.parent_id, l.depth + 1
  FROM lineage l
  JOIN seo.topic t ON t.id = l.topic_id AND t.deleted_at IS NULL
  WHERE t.parent_id IS NOT NULL AND l.depth < 12
),
topic_base AS (
  SELECT DISTINCT ON (l.kw_id)
    l.kw_id, tp.name AS topic_name,
    COALESCE(stv.weight, 50) AS base_weight,
    (stv.lead_quality = 'negative_value'
      OR stv.service_match IN ('not_offered','actively_avoided')) AS negative_guard
  FROM lineage l
  JOIN seo.site_topic_value stv
    ON stv.topic_id = l.topic_id AND stv.site_id = p_site_id AND stv.deleted_at IS NULL
  JOIN seo.topic tp ON tp.id = stv.topic_id
  ORDER BY l.kw_id, l.depth
),
root_kind AS (
  SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type AS root_type
  FROM lineage l
  JOIN seo.topic t ON t.id = l.topic_id
  WHERE t.parent_id IS NULL
  ORDER BY l.kw_id, l.depth DESC
),
vrules AS (
  SELECT r.id, r.name, r.pattern, r.match_kind, r.match_facet, r.match_facet_value, r.value_multiplier
  FROM seo.keyword_class_rule r
  WHERE r.deleted_at IS NULL AND r.value_multiplier IS NOT NULL AND r.site_id = p_site_id
),
rule_hits AS (
  SELECT k.id AS kw_id, r.id AS rule_id, r.name, r.value_multiplier
  FROM seo.keyword k
  JOIN vrules r ON (
    (r.pattern IS NOT NULL AND (
         (r.match_kind = 'contains'    AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
      OR (r.match_kind = 'exact'       AND k.normalized_phrase = lower(r.pattern))
      OR (r.match_kind = 'starts_with' AND k.normalized_phrase LIKE seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
      OR (r.match_kind = 'ends_with'   AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(r.pattern)))
      OR (r.match_kind = 'word'        AND k.normalized_phrase ~ ('\m' || lower(r.pattern) || '\M'))
    ))
    OR
    (r.match_facet IS NOT NULL AND r.match_facet_value IS NOT DISTINCT FROM CASE r.match_facet
        WHEN 'intent_class' THEN k.intent_class
        WHEN 'fulfillment_mode' THEN k.fulfillment_mode
        WHEN 'audience_type' THEN k.audience_type
        WHEN 'funnel_stage' THEN k.funnel_stage
        WHEN 'transaction_direction' THEN k.transaction_direction
        WHEN 'local_intent' THEN k.local_intent
        WHEN 'urgency' THEN k.urgency
        WHEN 'comparison_intent' THEN k.comparison_intent
        WHEN 'price_sensitivity' THEN k.price_sensitivity
        WHEN 'query_form' THEN k.query_form
        WHEN 'specificity' THEN k.specificity
        WHEN 'brand_presence' THEN k.brand_presence
        WHEN 'compliance_framing' THEN k.compliance_framing
      END)
  )
  WHERE k.deleted_at IS NULL
),
rule_agg AS (
  SELECT kw_id,
         exp(sum(ln(value_multiplier))) AS mult,
         jsonb_agg(jsonb_build_object('kind','rule','rule_id',rule_id,'name',name,'multiplier',value_multiplier)) AS rule_reasons
  FROM rule_hits GROUP BY kw_id
),
geo_hits AS (
  SELECT DISTINCT ON (k.id) k.id AS kw_id, g.geo_band, g.label AS geo_label,
         COALESCE(gb.mult, 1) AS mult
  FROM seo.keyword k
  JOIN seo.site_geo_area g ON g.site_id = p_site_id AND g.deleted_at IS NULL
  JOIN LATERAL (
    SELECT 1 FROM jsonb_array_elements_text(g.match_tokens) tok(v)
    WHERE k.normalized_phrase ~ ('\m' || lower(tok.v) || '\M')
    LIMIT 1
  ) m ON true
  LEFT JOIN geo_band_mult gb ON gb.value = g.geo_band
  WHERE k.deleted_at IS NULL
  ORDER BY k.id, COALESCE(gb.mult, 1) ASC
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
floor_band AS (
  SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1
),
scored AS (
  SELECT k.id AS kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    (ra.kw_id IS NOT NULL) AS has_rules,
    (gh.kw_id IS NOT NULL) AS has_geo,
    COALESCE(tb.negative_guard, false) AS negative_guard,
    LEAST(100, GREATEST(0,
      COALESCE(tb.base_weight, 50) * COALESCE(ra.mult, 1) * COALESCE(gh.mult, 1))) AS raw_score,
    tb.topic_name, tb.base_weight, ra.rule_reasons,
    gh.geo_band, gh.geo_label, gh.mult AS geo_mult, rk.root_type
  FROM seo.keyword k
  LEFT JOIN topic_base tb ON tb.kw_id = k.id
  LEFT JOIN rule_agg  ra ON ra.kw_id = k.id
  LEFT JOIN geo_hits  gh ON gh.kw_id = k.id
  LEFT JOIN root_kind rk ON rk.kw_id = k.id
  WHERE k.deleted_at IS NULL
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN NULL
       WHEN s.negative_guard OR s.raw_score = 0 THEN 0
       ELSE round(s.raw_score, 1) END,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN 'unvalued'
       WHEN s.negative_guard OR s.raw_score = 0 THEN 'negative'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= round(s.raw_score, 1)
          ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN 'unvalued'
       ELSE 'computed' END,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override'))
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN '[]'::jsonb
       ELSE
         CASE WHEN s.has_topic
           THEN jsonb_build_array(jsonb_build_object(
             'kind','topic','topic',s.topic_name,'weight',s.base_weight,
             'root',s.root_type,'negative_guard',s.negative_guard))
           ELSE jsonb_build_array(jsonb_build_object('kind','default_base','weight',50)) END
         || COALESCE(s.rule_reasons, '[]'::jsonb)
         || CASE WHEN s.has_geo
           THEN jsonb_build_array(jsonb_build_object(
             'kind','geo','band',s.geo_band,'area',s.geo_label,'multiplier',s.geo_mult))
           ELSE '[]'::jsonb END
  END
FROM scored s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$$;

-- ── 1. Validation — ONE coherence predicate, shared by every write path.
-- Raises with a message written for the human reading it in the editor.
CREATE OR REPLACE FUNCTION seo.gsc_assert_vocabulary_coherent(p_kind text, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $fn$
DECLARE
  r jsonb;
  v text;
  n int;
  ms numeric;
BEGIN
  IF p_kind NOT IN ('value_band','geo_band') THEN
    RAISE EXCEPTION 'gsc_bad_vocab_kind: %', p_kind;
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'gsc_vocab_bad_payload: expected an array of rows';
  END IF;

  n := jsonb_array_length(p_rows);
  IF n < 2 THEN
    RAISE EXCEPTION 'gsc_vocab_too_few: a vocabulary needs at least 2 entries (got %)', n;
  END IF;

  FOR r IN SELECT e FROM jsonb_array_elements(p_rows) e LOOP
    v := btrim(COALESCE(r->>'value', ''));
    IF v = '' THEN
      RAISE EXCEPTION 'gsc_vocab_blank_value: every entry needs an identity';
    END IF;
    IF v !~ '^[a-z0-9][a-z0-9_]*$' THEN
      RAISE EXCEPTION 'gsc_vocab_bad_value: "%" must be lowercase letters, digits and underscores', v;
    END IF;
    IF v = 'unvalued' THEN
      RAISE EXCEPTION 'gsc_vocab_reserved_value: "unvalued" is reserved — it is what the resolver says when no meaning reaches a keyword, so it can never be a band you assign';
    END IF;
    IF btrim(COALESCE(r->>'label','')) = '' THEN
      RAISE EXCEPTION 'gsc_vocab_blank_label: "%" needs a name — the name is what every keyword is labelled with', v;
    END IF;
  END LOOP;

  -- identities unique
  IF (SELECT count(DISTINCT btrim(e->>'value')) FROM jsonb_array_elements(p_rows) e) <> n THEN
    RAISE EXCEPTION 'gsc_vocab_duplicate_value: two entries share the same identity';
  END IF;
  -- names unique (case-insensitive): two bands with one name is unreadable
  IF (SELECT count(DISTINCT lower(btrim(e->>'label'))) FROM jsonb_array_elements(p_rows) e) <> n THEN
    RAISE EXCEPTION 'gsc_vocab_duplicate_label: two entries share the same name — every band must be tellable apart';
  END IF;

  IF p_kind = 'value_band' THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE e->>'value' = 'negative') THEN
      RAISE EXCEPTION 'gsc_vocab_missing_negative: the reserved "negative" band must stay — the resolver emits it for excluded geo, not-offered services and actively-avoided topics. You may rename it, never remove it';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e
               WHERE e->>'value' = 'negative' AND (e->'config') ? 'min_score') THEN
      RAISE EXCEPTION 'gsc_vocab_negative_threshold: the negative band is a guard, not a score range — it carries no threshold';
    END IF;

    FOR r IN SELECT e FROM jsonb_array_elements(p_rows) e WHERE e->>'value' <> 'negative' LOOP
      IF NOT ((r->'config') ? 'min_score') THEN
        RAISE EXCEPTION 'gsc_vocab_missing_threshold: "%" needs a minimum score', r->>'label';
      END IF;
      BEGIN
        ms := (r->'config'->>'min_score')::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'gsc_vocab_bad_threshold: "%" has a minimum score that is not a number', r->>'label';
      END;
      IF ms < 0 OR ms > 100 THEN
        RAISE EXCEPTION 'gsc_vocab_threshold_range: "%" is at %, but scores only run 0-100', r->>'label', ms;
      END IF;
    END LOOP;

    IF (SELECT count(DISTINCT (e->'config'->>'min_score')::numeric)
        FROM jsonb_array_elements(p_rows) e WHERE e->>'value' <> 'negative') <> n - 1 THEN
      RAISE EXCEPTION 'gsc_vocab_duplicate_threshold: two bands start at the same score — a score would land in both';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e
                   WHERE e->>'value' <> 'negative' AND (e->'config'->>'min_score')::numeric = 0) THEN
      RAISE EXCEPTION 'gsc_vocab_no_floor: one band must start at 0, or the lowest-scoring keywords land in no band at all';
    END IF;
  ELSE
    FOR r IN SELECT e FROM jsonb_array_elements(p_rows) e LOOP
      IF NOT ((r->'config') ? 'multiplier') THEN
        RAISE EXCEPTION 'gsc_vocab_missing_multiplier: "%" needs a multiplier', r->>'label';
      END IF;
      BEGIN
        ms := (r->'config'->>'multiplier')::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'gsc_vocab_bad_multiplier: "%" has a multiplier that is not a number', r->>'label';
      END;
      IF ms < 0 OR ms > 10 THEN
        RAISE EXCEPTION 'gsc_vocab_multiplier_range: "%" is x%, but multipliers run 0-10', r->>'label', ms;
      END IF;
    END LOOP;
  END IF;
END;
$fn$;

-- ── 2. Adopt — copy the platform template into the site, once.
-- Idempotent: a site that already governs its own vocabulary is untouched.
CREATE OR REPLACE FUNCTION seo.gsc_adopt_value_vocabulary(p_site_id uuid, p_kind text DEFAULT 'value_band')
RETURNS TABLE (value text, label text, description text, sort int, config jsonb, is_template boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
-- The OUT parameter `value` shadows seo.site_vocabulary.value in the ON
-- CONFLICT target; state the resolution rule for the whole body (42702).
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_uid uuid := auth.uid();
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_kind NOT IN ('value_band','geo_band') THEN
    RAISE EXCEPTION 'gsc_bad_vocab_kind: %', p_kind;
  END IF;
  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  IF NOT EXISTS (
    SELECT 1 FROM seo.site_vocabulary sv
    WHERE sv.site_id = p_site_id AND sv.vocab_kind = p_kind
      AND sv.active AND sv.deleted_at IS NULL
  ) THEN
    INSERT INTO seo.site_vocabulary AS sv
      (organization_id, site_id, vocab_kind, value, label, description, sort, config, active, created_by, updated_by, metadata)
    SELECT v_org, p_site_id, p_kind, c.slug, c.name, c.metadata->>'description',
           COALESCE(c.position, 0), c.metadata - 'description', true, v_uid, v_uid,
           jsonb_build_object('adopted_from', 'platform_template', 'adopted_at', now())
    FROM platform.categories c
    WHERE c.dimension = 'seo_' || p_kind AND c.deleted_at IS NULL
    ON CONFLICT (site_id, vocab_kind, value) WHERE deleted_at IS NULL DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT sv2.value, sv2.label, sv2.description, sv2.sort, sv2.config, false
  FROM seo.site_vocabulary sv2
  WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = p_kind
    AND sv2.active AND sv2.deleted_at IS NULL
  ORDER BY sv2.sort;
END;
$fn$;

-- ── 3. Save — the WHOLE set, replaced. Adopting is implicit: saving a set is
-- how a site takes ownership of its meaning. p_reassign maps a removed
-- identity to a surviving one so an expert's ruling is never silently dropped.
CREATE OR REPLACE FUNCTION seo.gsc_save_value_vocabulary(
  p_site_id uuid,
  p_kind text,
  p_rows jsonb,
  p_reassign jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (value text, label text, description text, sort int, config jsonb, is_template boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
-- Same 42702 class as adopt: the OUT parameter `value` shadows the column.
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_uid uuid := auth.uid();
  v_removed text[];
  v_slug text;
  v_target text;
  v_refs bigint;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  PERFORM seo.gsc_assert_vocabulary_coherent(p_kind, p_rows);
  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  -- identities that exist today (site rows, or the template when adopting now)
  -- and are absent from the incoming set
  SELECT COALESCE(array_agg(DISTINCT cur.slug), '{}')
    INTO v_removed
  FROM (
    SELECT sv.value AS slug FROM seo.site_vocabulary sv
    WHERE sv.site_id = p_site_id AND sv.vocab_kind = p_kind
      AND sv.active AND sv.deleted_at IS NULL
    UNION
    SELECT c.slug FROM platform.categories c
    WHERE c.dimension = 'seo_' || p_kind AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM seo.site_vocabulary sv2
        WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = p_kind
          AND sv2.active AND sv2.deleted_at IS NULL)
  ) cur
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE e->>'value' = cur.slug);

  -- Nothing that carries data disappears without the expert saying where it goes.
  FOREACH v_slug IN ARRAY v_removed LOOP
    v_target := NULLIF(btrim(COALESCE(p_reassign->>v_slug, '')), '');
    IF v_target IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE e->>'value' = v_target) THEN
      RAISE EXCEPTION 'gsc_vocab_bad_reassign: "%" would move to "%", which is not in the new set', v_slug, v_target;
    END IF;

    IF p_kind = 'value_band' THEN
      SELECT count(*) INTO v_refs FROM seo.site_keyword_value skv
      WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier = v_slug;
      IF v_refs > 0 AND v_target IS NULL THEN
        RAISE EXCEPTION 'gsc_vocab_band_in_use: % keyword ruling(s) are set to "%" — choose where they move before removing it', v_refs, v_slug;
      END IF;
      IF v_refs > 0 THEN
        UPDATE seo.site_keyword_value skv SET value_tier = v_target, updated_at = now()
        WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier = v_slug;
      END IF;
    ELSE
      SELECT count(*) INTO v_refs FROM seo.site_geo_area g
      WHERE g.site_id = p_site_id AND g.deleted_at IS NULL AND g.geo_band = v_slug;
      IF v_refs > 0 AND v_target IS NULL THEN
        RAISE EXCEPTION 'gsc_vocab_geo_band_in_use: % geo area(s) are banded "%" — choose where they move before removing it', v_refs, v_slug;
      END IF;
      IF v_refs > 0 THEN
        UPDATE seo.site_geo_area g SET geo_band = v_target, updated_at = now()
        WHERE g.site_id = p_site_id AND g.deleted_at IS NULL AND g.geo_band = v_slug;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO seo.site_vocabulary AS sv
    (organization_id, site_id, vocab_kind, value, label, description, sort, config, active, created_by, updated_by)
  SELECT v_org, p_site_id, p_kind,
         btrim(e->>'value'), btrim(e->>'label'), NULLIF(btrim(COALESCE(e->>'description','')), ''),
         COALESCE((e->>'sort')::int, ord::int), COALESCE(e->'config', '{}'::jsonb), true, v_uid, v_uid
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(e, ord)
  ON CONFLICT (site_id, vocab_kind, value) WHERE deleted_at IS NULL
  DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort = EXCLUDED.sort,
    config = EXCLUDED.config,
    active = true,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  UPDATE seo.site_vocabulary sv2
  SET deleted_at = now(), updated_by = v_uid, updated_at = now()
  WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = p_kind AND sv2.deleted_at IS NULL
    AND NOT (sv2.value = ANY (SELECT btrim(e->>'value') FROM jsonb_array_elements(p_rows) e));

  RETURN QUERY
  SELECT sv3.value, sv3.label, sv3.description, sv3.sort, sv3.config, false
  FROM seo.site_vocabulary sv3
  WHERE sv3.site_id = p_site_id AND sv3.vocab_kind = p_kind
    AND sv3.active AND sv3.deleted_at IS NULL
  ORDER BY sv3.sort;
END;
$fn$;

-- ── 4. Reset — hand the vocabulary back to the platform template.
CREATE OR REPLACE FUNCTION seo.gsc_reset_value_vocabulary(
  p_site_id uuid,
  p_kind text DEFAULT 'value_band',
  p_reassign jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (value text, label text, description text, sort int, config jsonb, is_template boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text;
  v_target text;
  v_refs bigint;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_kind NOT IN ('value_band','geo_band') THEN
    RAISE EXCEPTION 'gsc_bad_vocab_kind: %', p_kind;
  END IF;

  -- Site identities the template does not name would strand their data.
  FOR v_slug IN
    SELECT sv.value FROM seo.site_vocabulary sv
    WHERE sv.site_id = p_site_id AND sv.vocab_kind = p_kind AND sv.active AND sv.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM platform.categories c
        WHERE c.dimension = 'seo_' || p_kind AND c.deleted_at IS NULL AND c.slug = sv.value)
  LOOP
    v_target := NULLIF(btrim(COALESCE(p_reassign->>v_slug, '')), '');
    IF v_target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM platform.categories c
        WHERE c.dimension = 'seo_' || p_kind AND c.deleted_at IS NULL AND c.slug = v_target) THEN
      RAISE EXCEPTION 'gsc_vocab_bad_reassign: "%" would move to "%", which the platform template does not name', v_slug, v_target;
    END IF;
    IF p_kind = 'value_band' THEN
      SELECT count(*) INTO v_refs FROM seo.site_keyword_value skv
      WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier = v_slug;
      IF v_refs > 0 AND v_target IS NULL THEN
        RAISE EXCEPTION 'gsc_vocab_band_in_use: % keyword ruling(s) are set to "%", which the platform template does not have — choose where they move first', v_refs, v_slug;
      END IF;
      IF v_refs > 0 THEN
        UPDATE seo.site_keyword_value SET value_tier = v_target, updated_at = now()
        WHERE site_id = p_site_id AND deleted_at IS NULL AND value_tier = v_slug;
      END IF;
    ELSE
      SELECT count(*) INTO v_refs FROM seo.site_geo_area g
      WHERE g.site_id = p_site_id AND g.deleted_at IS NULL AND g.geo_band = v_slug;
      IF v_refs > 0 AND v_target IS NULL THEN
        RAISE EXCEPTION 'gsc_vocab_geo_band_in_use: % geo area(s) are banded "%", which the platform template does not have — choose where they move first', v_refs, v_slug;
      END IF;
      IF v_refs > 0 THEN
        UPDATE seo.site_geo_area SET geo_band = v_target, updated_at = now()
        WHERE site_id = p_site_id AND deleted_at IS NULL AND geo_band = v_slug;
      END IF;
    END IF;
  END LOOP;

  UPDATE seo.site_vocabulary
  SET deleted_at = now(), updated_by = v_uid, updated_at = now()
  WHERE site_id = p_site_id AND vocab_kind = p_kind AND deleted_at IS NULL;

  RETURN QUERY
  SELECT c.slug, c.name, c.metadata->>'description', COALESCE(c.position, 0), c.metadata, true
  FROM platform.categories c
  WHERE c.dimension = 'seo_' || p_kind AND c.deleted_at IS NULL
  ORDER BY COALESCE(c.position, 0);
END;
$fn$;

-- ── 5. Live preview — what a PROPOSED band set does to this site's real
-- keywords, before anything is saved. Server-side on purpose: a band is never
-- re-derived on the client (value-system.md, law 3).
-- `moved` counts keywords whose band changes under the proposal.
CREATE OR REPLACE FUNCTION seo.gsc_value_band_preview(
  p_site_id uuid,
  p_rows jsonb,
  p_start date,
  p_end date
)
RETURNS TABLE (
  value_band text,
  keywords bigint,
  clicks bigint,
  impressions bigint,
  moved_in bigint,
  moved_out bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  PERFORM seo.gsc_assert_vocabulary_coherent('value_band', p_rows);

  RETURN QUERY
  WITH proposed AS (
    SELECT btrim(e->>'value') AS value, (e->'config'->>'min_score')::numeric AS min_score
    FROM jsonb_array_elements(p_rows) e
    WHERE (e->'config') ? 'min_score'
  ),
  winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  resolved AS (
    SELECT v.kid, v.c, v.i,
           COALESCE(vm.value_band, 'unvalued') AS current_band,
           vm.value_score AS score,
           COALESCE(vm.value_source, 'unvalued') AS src
    FROM vol v
    LEFT JOIN seo.keyword_value_map(p_site_id) vm ON vm.keyword_id = v.kid
  ),
  rebanded AS (
    SELECT r.kid, r.c, r.i, r.current_band,
      CASE
        -- reserved outcomes and expert rulings never re-band on a threshold change
        WHEN r.src = 'override' OR r.current_band IN ('unvalued','negative') THEN r.current_band
        ELSE COALESCE(
          (SELECT p.value FROM proposed p WHERE p.min_score <= r.score ORDER BY p.min_score DESC LIMIT 1),
          (SELECT p.value FROM proposed p ORDER BY p.min_score ASC LIMIT 1))
      END AS next_band
    FROM resolved r
  )
  SELECT b.band,
    COALESCE(inn.n, 0), COALESCE(inn.c, 0), COALESCE(inn.i, 0),
    COALESCE(mi.n, 0), COALESCE(mo.n, 0)
  FROM (
    SELECT DISTINCT next_band AS band FROM rebanded
    UNION SELECT btrim(e->>'value') FROM jsonb_array_elements(p_rows) e
  ) b
  LEFT JOIN (
    SELECT next_band AS band, count(*)::bigint AS n, SUM(c)::bigint AS c, SUM(i)::bigint AS i
    FROM rebanded GROUP BY next_band) inn ON inn.band = b.band
  LEFT JOIN (
    SELECT next_band AS band, count(*)::bigint AS n FROM rebanded
    WHERE next_band <> current_band GROUP BY next_band) mi ON mi.band = b.band
  LEFT JOIN (
    SELECT current_band AS band, count(*)::bigint AS n FROM rebanded
    WHERE next_band <> current_band GROUP BY current_band) mo ON mo.band = b.band
  ORDER BY 3 DESC, 1;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_assert_vocabulary_coherent(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_assert_vocabulary_coherent(text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_adopt_value_vocabulary(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_adopt_value_vocabulary(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_save_value_vocabulary(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_save_value_vocabulary(uuid, text, jsonb, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_reset_value_vocabulary(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_reset_value_vocabulary(uuid, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_value_band_preview(uuid, jsonb, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_value_band_preview(uuid, jsonb, date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
