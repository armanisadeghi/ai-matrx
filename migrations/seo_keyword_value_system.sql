-- Keyword Value System — the deterministic per-site value-tier layer.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md (D30–D36).
--
-- THE LAW (D30/D31): facts are universal (seo.keyword facets, platform-governed
-- vocabulary rows); meaning is local (site vocabularies, topic weights, rules,
-- geo bands — the business's own ratified arithmetic); the expert override wins.
-- Every computed tier carries machine-readable `reasons`; where no meaning is
-- expressed the keyword is honestly 'unvalued'. Agents never free-type labels —
-- they APPLY registry values (platform.categories dimension='seo_facet…').
--
-- Additive-only: two provisioner-built tables (born certified), nullable column
-- adds, CHECK widenings, vocabulary seed rows, two read functions. No renames,
-- no drops — safe under live traffic.

-- ── 1. seo.site_vocabulary — ONE table for all site-editable meaning vocabularies
DO $do$ BEGIN
  IF to_regclass('seo.site_vocabulary') IS NULL THEN
    PERFORM platform.create_entity_table(
      'seo', 'site_vocabulary', 'seo_site_vocabulary', 'Site Vocabulary',
      ARRAY[
        'site_id uuid NOT NULL REFERENCES web.site(id) ON DELETE CASCADE',
        'vocab_kind text NOT NULL CHECK (vocab_kind IN (''value_band'',''geo_band''))',
        'value text NOT NULL CHECK (btrim(value) <> '''')',
        'label text NOT NULL',
        'description text',
        'sort integer NOT NULL DEFAULT 0',
        'config jsonb NOT NULL DEFAULT ''{}''::jsonb',
        'active boolean NOT NULL DEFAULT true'
      ],
      'component', true, true, 'none', false, false, true, false,
      ARRAY['web_site:site_id']);
  END IF;
END $do$;

CREATE UNIQUE INDEX IF NOT EXISTS site_vocabulary_site_kind_value_key
  ON seo.site_vocabulary (site_id, vocab_kind, value) WHERE deleted_at IS NULL;

-- ── 2. seo.site_geo_area — the site's declared geography, banded
DO $do$ BEGIN
  IF to_regclass('seo.site_geo_area') IS NULL THEN
    PERFORM platform.create_entity_table(
      'seo', 'site_geo_area', 'seo_site_geo_area', 'Site Geo Area',
      ARRAY[
        'site_id uuid NOT NULL REFERENCES web.site(id) ON DELETE CASCADE',
        'label text NOT NULL',
        'area_kind text NOT NULL DEFAULT ''city'' CHECK (area_kind IN (''city'',''county'',''region'',''state'',''country'',''radius'',''other''))',
        'match_tokens jsonb NOT NULL DEFAULT ''[]''::jsonb',
        'geo_band text NOT NULL',
        'notes text'
      ],
      'component', true, true, 'none', false, false, true, false,
      ARRAY['web_site:site_id']);
  END IF;
END $do$;

CREATE UNIQUE INDEX IF NOT EXISTS site_geo_area_site_label_key
  ON seo.site_geo_area (site_id, label) WHERE deleted_at IS NULL;

-- ── 3. keyword_class_rule → ONE rules engine for class AND value (D34)
ALTER TABLE seo.keyword_class_rule
  ADD COLUMN IF NOT EXISTS value_multiplier numeric,
  ADD COLUMN IF NOT EXISTS match_facet text,
  ADD COLUMN IF NOT EXISTS match_facet_value text;
ALTER TABLE seo.keyword_class_rule ALTER COLUMN pattern DROP NOT NULL;
ALTER TABLE seo.keyword_class_rule ALTER COLUMN match_kind DROP NOT NULL;
ALTER TABLE seo.keyword_class_rule ALTER COLUMN target_class DROP NOT NULL;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='keyword_class_rule_matcher_present') THEN
    ALTER TABLE seo.keyword_class_rule ADD CONSTRAINT keyword_class_rule_matcher_present
      CHECK (pattern IS NOT NULL OR match_facet IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='keyword_class_rule_effect_present') THEN
    ALTER TABLE seo.keyword_class_rule ADD CONSTRAINT keyword_class_rule_effect_present
      CHECK (target_class IS NOT NULL OR value_multiplier IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='keyword_class_rule_pattern_needs_kind') THEN
    ALTER TABLE seo.keyword_class_rule ADD CONSTRAINT keyword_class_rule_pattern_needs_kind
      CHECK (pattern IS NULL OR match_kind IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='keyword_class_rule_value_multiplier_range') THEN
    ALTER TABLE seo.keyword_class_rule ADD CONSTRAINT keyword_class_rule_value_multiplier_range
      CHECK (value_multiplier IS NULL OR (value_multiplier > 0 AND value_multiplier <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='keyword_class_rule_facet_pair') THEN
    ALTER TABLE seo.keyword_class_rule ADD CONSTRAINT keyword_class_rule_facet_pair
      CHECK ((match_facet IS NULL) = (match_facet_value IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='keyword_class_rule_match_facet_known') THEN
    ALTER TABLE seo.keyword_class_rule ADD CONSTRAINT keyword_class_rule_match_facet_known
      CHECK (match_facet IS NULL OR match_facet IN (
        'intent_class','fulfillment_mode','audience_type','funnel_stage',
        'transaction_direction','local_intent','urgency','comparison_intent',
        'price_sensitivity','query_form','specificity','brand_presence','compliance_framing'));
  END IF;
END $do$;

-- ── 4. site_keyword_value → explicit tier override + resolution cache
ALTER TABLE seo.site_keyword_value
  ADD COLUMN IF NOT EXISTS value_tier text,
  ADD COLUMN IF NOT EXISTS value_score numeric,
  ADD COLUMN IF NOT EXISTS value_reasons jsonb,
  ADD COLUMN IF NOT EXISTS value_computed_at timestamptz;

-- ── 5. topic root types beyond offerings (D32)
ALTER TABLE seo.topic DROP CONSTRAINT IF EXISTS topic_node_type_check;
ALTER TABLE seo.topic ADD CONSTRAINT topic_node_type_check
  CHECK (node_type IN ('service','product','problem','audience','brand',
                       'authority','existing_customer','recruiting','reputation','partner'));

-- ── 6. Vocabulary seeds in platform.categories (THE controlled-vocab home, db-rules §5)
-- 6a. Universal facet registry: dimension 'seo_facet' — parent per facet, child per value.
DO $do$
DECLARE
  v_org uuid := '39c38960-d30c-4840-b0c1-c9960de95582'; -- Matrx System
  v_facet record; v_parent uuid; v_val record;
BEGIN
  FOR v_facet IN SELECT * FROM (VALUES
    ('intent_class','Intent Class','What the searcher fundamentally wants'),
    ('fulfillment_mode','Fulfillment Mode','Do it themselves vs have it done'),
    ('audience_type','Audience','Who is searching'),
    ('funnel_stage','Funnel Stage','How far along the buying journey'),
    ('transaction_direction','Transaction Direction','Who pays whom'),
    ('local_intent','Geo Intent','Whether the search is location-bound'),
    ('urgency','Urgency','Time pressure in the query'),
    ('comparison_intent','Comparison','Weighing options against each other'),
    ('price_sensitivity','Price Sensitivity','Cost focus in the query'),
    ('query_form','Query Form','Grammatical shape of the query'),
    ('specificity','Specificity','Head term vs long tail'),
    ('brand_presence','Brand Presence','Whether a brand is named'),
    ('compliance_framing','Compliance Framing','Regulatory / certification signals')
  ) f(slug, name, descr) LOOP
    INSERT INTO platform.categories (organization_id, dimension, name, slug, is_system, metadata)
    SELECT v_org, 'seo_facet', v_facet.name, v_facet.slug, true,
           jsonb_build_object('description', v_facet.descr)
    WHERE NOT EXISTS (SELECT 1 FROM platform.categories
      WHERE dimension='seo_facet' AND slug=v_facet.slug AND parent_id IS NULL AND deleted_at IS NULL);
    SELECT id INTO v_parent FROM platform.categories
      WHERE dimension='seo_facet' AND slug=v_facet.slug AND parent_id IS NULL AND deleted_at IS NULL;
    FOR v_val IN
      SELECT * FROM (VALUES
        ('intent_class','informational'),('intent_class','commercial_investigation'),
        ('intent_class','transactional'),('intent_class','navigational'),
        ('fulfillment_mode','diy'),('fulfillment_mode','done_for_you'),('fulfillment_mode','ambiguous'),
        ('audience_type','consumer'),('audience_type','business'),('audience_type','practitioner'),('audience_type','ambiguous'),
        ('funnel_stage','problem_aware'),('funnel_stage','solution_aware'),
        ('funnel_stage','vendor_evaluation'),('funnel_stage','purchase_ready'),
        ('transaction_direction','searcher_pays'),('transaction_direction','searcher_gets_paid'),
        ('transaction_direction','free_expected'),('transaction_direction','none'),
        ('local_intent','explicit_local'),('local_intent','implicit_local'),('local_intent','non_local'),
        ('urgency','immediate'),('urgency','time_sensitive'),('urgency','none'),
        ('comparison_intent','brand_vs_brand'),('comparison_intent','category_best'),
        ('comparison_intent','alternatives_seeking'),('comparison_intent','none'),
        ('price_sensitivity','cost_research'),('price_sensitivity','budget_seeking'),
        ('price_sensitivity','free_seeking'),('price_sensitivity','none'),
        ('query_form','question'),('query_form','phrase'),('query_form','command'),
        ('specificity','head'),('specificity','mid'),('specificity','long_tail'),
        ('brand_presence','unbranded'),('brand_presence','branded'),('brand_presence','product_branded'),
        ('compliance_framing','regulated'),('compliance_framing','certification_seeking'),('compliance_framing','none')
      ) vv(facet, val) WHERE vv.facet = v_facet.slug
    LOOP
      -- child slug is facet-namespaced ('audience_type:ambiguous') — categories
      -- slugs are unique per (org, dimension), and values repeat across facets
      INSERT INTO platform.categories (organization_id, dimension, name, slug, parent_id, is_system, metadata)
      SELECT v_org, 'seo_facet', replace(initcap(replace(v_val.val,'_',' ')),' Vs ',' vs '),
             v_facet.slug || ':' || v_val.val, v_parent, true,
             jsonb_build_object('value', v_val.val)
      WHERE NOT EXISTS (SELECT 1 FROM platform.categories
        WHERE dimension='seo_facet' AND slug=v_facet.slug || ':' || v_val.val AND deleted_at IS NULL);
    END LOOP;
  END LOOP;
END $do$;

-- 6b. Value-band starter template (site adopts/overrides via seo.site_vocabulary)
DO $do$
DECLARE v_org uuid := '39c38960-d30c-4840-b0c1-c9960de95582'; b record;
BEGIN
  FOR b IN SELECT * FROM (VALUES
    ('platinum','Platinum',85,1,'{"min_score":85,"color":"violet"}'::jsonb),
    ('gold','Gold',65,2,'{"min_score":65,"color":"amber"}'::jsonb),
    ('silver','Silver',40,3,'{"min_score":40,"color":"slate"}'::jsonb),
    ('bronze','Bronze',15,4,'{"min_score":15,"color":"orange"}'::jsonb),
    ('minimal','Minimal',0,5,'{"min_score":0,"color":"zinc"}'::jsonb),
    ('negative','Negative',NULL,6,'{"negative":true,"color":"red"}'::jsonb)
  ) t(slug,name,ms,pos,meta) LOOP
    INSERT INTO platform.categories (organization_id, dimension, name, slug, is_system, position, metadata)
    SELECT v_org, 'seo_value_band', b.name, b.slug, true, b.pos, b.meta
    WHERE NOT EXISTS (SELECT 1 FROM platform.categories
      WHERE dimension='seo_value_band' AND slug=b.slug AND deleted_at IS NULL);
  END LOOP;
  FOR b IN SELECT * FROM (VALUES
    ('ideal','Ideal area',1,'{"multiplier":1.0,"color":"emerald"}'::jsonb),
    ('acceptable','Acceptable area',2,'{"multiplier":0.85,"color":"sky"}'::jsonb),
    ('expansion','Expansion target',3,'{"multiplier":0.5,"color":"amber"}'::jsonb),
    ('excluded','Not served',4,'{"multiplier":0,"color":"red"}'::jsonb)
  ) t(slug,name,pos,meta) LOOP
    INSERT INTO platform.categories (organization_id, dimension, name, slug, is_system, position, metadata)
    SELECT v_org, 'seo_geo_band', b.name, b.slug, true, b.pos, b.meta
    WHERE NOT EXISTS (SELECT 1 FROM platform.categories
      WHERE dimension='seo_geo_band' AND slug=b.slug AND deleted_at IS NULL);
  END LOOP;
END $do$;

NOTIFY pgrst, 'reload schema';
