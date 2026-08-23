-- ============================================================================
-- KEYWORD INTELLIGENCE CONVERGENCE — PHASE C7 (2026-08-23)
-- COMBINATIONS — "two strikes against you"
--
-- SoR: common-docs/projects/keyword-intelligence-convergence/PLAN.md (C7)
--      common-docs/systems/marketing/seo/seo-keywords/value-system.md
--
-- Arman: "if a keyword is not an enterprise keyword, and it also happens to
-- then carry, let's say, New York with it, well, then that's dead in the water
-- because it's two strikes against you … it's not a point system. It's just
-- not a good keyword. But if it's Los Angeles, it's still not great if it's a
-- consumer keyword, but it's worth something."
--
-- A combo is worth hung on a SET of values instead of one value. It fires only
-- when EVERY value in the set is among the keyword's EFFECTIVE stamps (the
-- single-cardinality precedence already applied), and it then contributes in
-- the SAME fixed order as every other contribution: adds, then factors, then
-- never. There is still ONE resolver and ONE arithmetic.
--
--   seo.site_value_combo        the combination table (component of web.site)
--   seo.fn_effective_stamps     THE ONE definition of "this keyword's stamps"
--                               (extracted from the resolver so the resolver
--                               and the preview can never disagree)
--   seo.gsc_value_combo_set     the ONE write path (site-editor guarded)
--   seo.gsc_value_combo_list    the one list read
--   seo.gsc_value_combo_preview the what-if, same shape as every other preview
--   seo.keyword_value_map       extended: combos contribute + appear in reasons
-- ============================================================================

-- ── 1. The combination table ────────────────────────────────────────────────
DO $do$
BEGIN
  IF to_regclass('seo.site_value_combo') IS NULL THEN
    PERFORM platform.create_entity_table(
      p_schema     => 'seo',
      p_table      => 'site_value_combo',
      p_token      => 'seo_site_value_combo',
      p_label      => 'Site Value Combination',
      p_fields     => array[
        'site_id uuid NOT NULL',
        'value_ids uuid[] NOT NULL',
        'effect text NOT NULL',
        'amount numeric',
        'label text',
        'notes text',
        'origin text NOT NULL DEFAULT ''human''',
        'enabled boolean NOT NULL DEFAULT true'
      ],
      p_variant    => 'component',
      p_versioned  => true,
      p_soft_delete=> true,
      p_visibility => 'none',
      p_category   => false,
      p_listed     => true,
      p_org_default=> true,
      p_gin_jsonb  => false,
      p_parents    => array['web_site:site_id']
    );
  END IF;
END $do$;

ALTER TABLE seo.site_value_combo
  DROP CONSTRAINT IF EXISTS svc_effect_check,
  ADD CONSTRAINT svc_effect_check CHECK (
    (effect = 'add'   AND amount IS NOT NULL)
    OR (effect = 'scale' AND amount IS NOT NULL AND amount >= 0.05 AND amount <= 5)
    OR (effect = 'never' AND amount IS NULL)
  ),
  DROP CONSTRAINT IF EXISTS svc_origin_check,
  ADD CONSTRAINT svc_origin_check CHECK (origin IN ('human','pack','agent','migration')),
  -- 2–4 values, all-of. One value is a worth row (seo.site_value_worth); five
  -- conditions is a rule nobody can read, and neither is this system's job.
  DROP CONSTRAINT IF EXISTS svc_arity_check,
  ADD CONSTRAINT svc_arity_check CHECK (
    array_length(value_ids, 1) BETWEEN 2 AND 4
    AND array_position(value_ids, NULL) IS NULL
  );

-- Canonical form: sorted + de-duplicated, so identity is the array itself.
CREATE OR REPLACE FUNCTION seo.svc_canonicalize()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  SELECT array_agg(v ORDER BY v) INTO NEW.value_ids
  FROM (SELECT DISTINCT unnest(NEW.value_ids) AS v) d;
  NEW.label := NULLIF(btrim(COALESCE(NEW.label, '')), '');
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS _canonicalize ON seo.site_value_combo;
CREATE TRIGGER _canonicalize BEFORE INSERT OR UPDATE ON seo.site_value_combo
  FOR EACH ROW EXECUTE FUNCTION seo.svc_canonicalize();

CREATE UNIQUE INDEX IF NOT EXISTS svc_site_values_uniq
  ON seo.site_value_combo (site_id, value_ids) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS svc_site_idx
  ON seo.site_value_combo (site_id) WHERE deleted_at IS NULL AND enabled;

COMMENT ON TABLE seo.site_value_combo IS
  'THE COMBINATION layer (C7). Worth hung on a SET of dimension values (all-of, 2-4, any dimensions) instead of one: "consumer AND New York = never". Fires only when EVERY value is among the keyword''s effective stamps; contributes in the same fixed order as single-value worth (adds, then factors, then never) and appears in the receipt as a {kind:''combo''} row. Component of web.site.';

-- ── 2. THE ONE definition of "this keyword's effective stamps" ──────────────
-- Extracted verbatim out of seo.keyword_value_map (C2) so the resolver and
-- every previewer read the SAME precedence. A combo asks about values that
-- carry no worth of their own, so it cannot be answered from the receipt.
DROP FUNCTION IF EXISTS seo.fn_effective_stamps(uuid, uuid[]);
CREATE FUNCTION seo.fn_effective_stamps(p_site_id uuid, p_keyword_ids uuid[])
RETURNS TABLE(kw_id uuid, value_id uuid, dim_id uuid, dim_slug text, dim_label text,
              value_key text, value_label text, source text, matcher_id uuid,
              nature text, as_of timestamptz)
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
WITH stamps AS (
  SELECT kf.keyword_id AS kw_id, kf.category_id AS value_id, cv.parent_id AS dim_id,
         cd.slug AS dim_slug, cd.name AS dim_label,
         COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS value_key,
         cv.name AS value_label, kf.source, kf.matcher_id,
         -- situational fields (C5): the dimension's nature and when the stamp was true
         COALESCE(cd.metadata->>'nature','intrinsic') AS nature, kf.as_of,
         COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card,
         -- pinned = human-grade > human > site matcher/pack/rule/import > universal AI
         CASE WHEN kf.pinned THEN 0 ELSE CASE kf.source
              WHEN 'human' THEN 1 WHEN 'matcher' THEN 3 WHEN 'pack' THEN 3
              WHEN 'rule' THEN 3 WHEN 'import' THEN 3 WHEN 'classifier' THEN 5 ELSE 6 END END
           + CASE WHEN kf.site_id IS NULL THEN 1 ELSE 0 END AS prio
  FROM seo.keyword_facet kf
  JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  WHERE kf.deleted_at IS NULL
    AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
    AND kf.keyword_id = ANY (p_keyword_ids)
),
ranked AS (
  SELECT s.*, row_number() OVER (PARTITION BY s.kw_id, s.dim_id ORDER BY s.prio, s.value_id) AS rn
  FROM stamps s
)
SELECT r.kw_id, r.value_id, r.dim_id, r.dim_slug, r.dim_label,
       r.value_key, r.value_label, r.source, r.matcher_id, r.nature, r.as_of
FROM ranked r
WHERE (NOT r.single_card) OR r.rn = 1;
$$;

COMMENT ON FUNCTION seo.fn_effective_stamps(uuid, uuid[]) IS
  'The stamps that COUNT for a site: universal + site-scoped, with single-cardinality dimensions collapsed to one winner (pinned > human > site matcher/pack/rule/import > universal AI). ONE definition — seo.keyword_value_map and every combo preview read it, so they can never disagree about what a keyword is stamped.';

GRANT EXECUTE ON FUNCTION seo.fn_effective_stamps(uuid, uuid[]) TO authenticated, service_role;

-- ── 3. Shape guard shared by the write path and the preview ─────────────────
CREATE OR REPLACE FUNCTION seo.assert_combo_shape(p_site_id uuid, p_value_ids uuid[], p_effect text, p_amount numeric)
RETURNS void LANGUAGE plpgsql STABLE
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $fn$
DECLARE v_n int; v_known int; v_bad text;
BEGIN
  SELECT count(DISTINCT v) INTO v_n FROM unnest(COALESCE(p_value_ids, '{}'::uuid[])) v WHERE v IS NOT NULL;
  IF v_n < 2 OR v_n > 4 THEN
    RAISE EXCEPTION 'seo_combo_bad_arity: a combination needs between 2 and 4 different values. One value on its own is ordinary worth — set that on the value itself.';
  END IF;

  SELECT count(*) INTO v_known
  FROM platform.categories c
  WHERE c.id = ANY (p_value_ids) AND c.deleted_at IS NULL
    AND c.dimension = 'seo_facet' AND c.parent_id IS NOT NULL;
  IF v_known <> v_n THEN
    RAISE EXCEPTION 'seo_combo_unknown_value: one of the chosen values is not a dimension value any more. Reopen the combination and pick it again.';
  END IF;

  -- A value belonging to a dimension scoped to a DIFFERENT site can never be
  -- stamped here, so a combination using it would silently never fire.
  SELECT string_agg(DISTINCT cd.name, ', ') INTO v_bad
  FROM platform.categories cv
  JOIN platform.categories cd ON cd.id = cv.parent_id
  WHERE cv.id = ANY (p_value_ids)
    AND COALESCE(cd.metadata->>'scope','platform') = 'site'
    AND COALESCE(cd.metadata->>'site_id','') <> p_site_id::text;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'seo_combo_foreign_dimension: "%" belongs to another site, so this combination could never fire here.', v_bad;
  END IF;

  IF p_effect = 'add' THEN
    IF p_amount IS NULL THEN
      RAISE EXCEPTION 'seo_combo_no_amount: choose how much this combination adds.';
    END IF;
  ELSIF p_effect = 'scale' THEN
    IF p_amount IS NULL OR p_amount < 0.05 OR p_amount > 5 THEN
      RAISE EXCEPTION 'seo_combo_bad_amount: a scale factor is between 0.05 and 5. It multiplies whatever the keyword already earned — it never invents value. For "worthless" use never.';
    END IF;
  ELSIF p_effect = 'never' THEN
    IF p_amount IS NOT NULL THEN
      RAISE EXCEPTION 'seo_combo_never_has_no_amount: never is a flag, not a number — it forces the score to zero on its own.';
    END IF;
  ELSE
    RAISE EXCEPTION 'seo_combo_bad_effect: a combination adds, scales, or is never.';
  END IF;
END $fn$;

GRANT EXECUTE ON FUNCTION seo.assert_combo_shape(uuid, uuid[], text, numeric) TO authenticated, service_role;

-- ── 4. THE ONE write path ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.gsc_value_combo_set(
  p_site_id uuid,
  p_value_ids uuid[] DEFAULT NULL,
  p_effect text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_enabled boolean DEFAULT true,
  p_combo_id uuid DEFAULT NULL,
  p_archive boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $fn$
DECLARE
  v_org uuid; v_uid uuid := auth.uid(); v_id uuid; v_label text; v_ids uuid[];
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF p_archive THEN
    IF p_combo_id IS NULL THEN
      RAISE EXCEPTION 'seo_combo_missing_id: nothing to archive.';
    END IF;
    UPDATE seo.site_value_combo
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE id = p_combo_id AND site_id = p_site_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_combo_not_found: that combination is already gone.';
    END IF;
    RETURN jsonb_build_object('id', p_combo_id, 'archived', true);
  END IF;

  PERFORM seo.assert_combo_shape(p_site_id, p_value_ids, p_effect, p_amount);
  SELECT array_agg(DISTINCT v) INTO v_ids FROM unnest(p_value_ids) v;
  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  v_label := NULLIF(btrim(COALESCE(p_label, '')), '');
  IF v_label IS NULL THEN
    SELECT string_agg(c.name, ' + ' ORDER BY c.name) INTO v_label
    FROM platform.categories c WHERE c.id = ANY (v_ids);
  END IF;

  IF p_combo_id IS NULL THEN
    INSERT INTO seo.site_value_combo
      (organization_id, site_id, value_ids, effect, amount, label, notes, enabled, origin, created_by, updated_by)
    VALUES (v_org, p_site_id, v_ids, p_effect, p_amount, v_label,
            NULLIF(btrim(COALESCE(p_notes,'')), ''), COALESCE(p_enabled, true), 'human', v_uid, v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE seo.site_value_combo
       SET value_ids = v_ids, effect = p_effect, amount = p_amount, label = v_label,
           notes = NULLIF(btrim(COALESCE(p_notes,'')), ''), enabled = COALESCE(p_enabled, true),
           updated_by = v_uid, updated_at = now()
     WHERE id = p_combo_id AND site_id = p_site_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'seo_combo_not_found: that combination no longer exists.';
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'label', v_label, 'archived', false);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'seo_combo_duplicate: this site already has a combination on exactly those values. Edit that one instead of adding a second.';
END $fn$;

GRANT EXECUTE ON FUNCTION seo.gsc_value_combo_set(uuid, uuid[], text, numeric, text, text, boolean, uuid, boolean)
  TO authenticated, service_role;

-- ── 5. The one list read ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.gsc_value_combo_list(p_site_id uuid)
RETURNS TABLE(id uuid, value_ids uuid[], combo_values jsonb, effect text, amount numeric,
              label text, notes text, origin text, enabled boolean, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  SELECT c.id, c.value_ids,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'value_id', cv.id, 'dimension', cd.slug, 'dimension_label', cd.name,
                    'value', COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)),
                    'value_label', cv.name)
                  ORDER BY cd.slug, cv.slug)
           FROM platform.categories cv
           JOIN platform.categories cd ON cd.id = cv.parent_id
           WHERE cv.id = ANY (c.value_ids)), '[]'::jsonb) AS combo_values,
         c.effect, c.amount, c.label, c.notes, c.origin, c.enabled, c.updated_at
  FROM seo.site_value_combo c
  WHERE c.site_id = p_site_id AND c.deleted_at IS NULL
  ORDER BY c.enabled DESC, c.label;
END $fn$;

GRANT EXECUTE ON FUNCTION seo.gsc_value_combo_list(uuid) TO authenticated, service_role;

-- ── 6. The resolver learns combinations ─────────────────────────────────────
-- Same arithmetic, same fixed order (adds → factors → never), one more source
-- of contributions. `effective_stamps` now comes from the extracted function.
CREATE OR REPLACE FUNCTION seo.keyword_value_map(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
WITH RECURSIVE
site_keywords AS MATERIALIZED (
  SELECT sk.kw_id FROM (
    SELECT unnest(p_keyword_ids) AS kw_id WHERE p_keyword_ids IS NOT NULL
    UNION
    SELECT spd.keyword_id FROM seo.search_performance_daily spd
    WHERE p_keyword_ids IS NULL AND spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
    UNION
    SELECT skv.keyword_id FROM seo.site_keyword_value skv
    WHERE p_keyword_ids IS NULL AND skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.keyword_id IS NOT NULL
  ) sk WHERE sk.kw_id IS NOT NULL
),
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
floor_band AS (SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1),
-- ── topic: the hierarchical exception ───────────────────────────────────────
lineage AS (
  SELECT kt.keyword_id AS kw_id, kt.topic_id, 0 AS depth
  FROM seo.keyword_topic kt JOIN site_keywords sk ON sk.kw_id = kt.keyword_id
  WHERE kt.is_primary AND kt.deleted_at IS NULL
  UNION ALL
  SELECT l.kw_id, t.parent_id, l.depth + 1
  FROM lineage l JOIN seo.topic t ON t.id = l.topic_id AND t.deleted_at IS NULL
  WHERE t.parent_id IS NOT NULL AND l.depth < 12
),
topic_base AS (
  SELECT DISTINCT ON (l.kw_id)
    l.kw_id, tp.name AS topic_name, COALESCE(stv.weight, 50) AS base_weight,
    (stv.lead_quality = 'negative_value' OR stv.service_match IN ('not_offered','actively_avoided')) AS negative_guard
  FROM lineage l
  JOIN seo.site_topic_value stv ON stv.topic_id = l.topic_id AND stv.site_id = p_site_id AND stv.deleted_at IS NULL
  JOIN seo.topic tp ON tp.id = stv.topic_id
  ORDER BY l.kw_id, l.depth
),
root_kind AS (
  SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type AS root_type
  FROM lineage l JOIN seo.topic t ON t.id = l.topic_id
  WHERE t.parent_id IS NULL ORDER BY l.kw_id, l.depth DESC
),
-- ── stamps + worth + combinations: the ONE system ───────────────────────────
worth AS MATERIALIZED (
  SELECT w.value_id, w.effect, w.amount, w.notes
  FROM seo.site_value_worth w WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
),
effective_stamps AS MATERIALIZED (
  SELECT es.* FROM seo.fn_effective_stamps(
    p_site_id, (SELECT array_agg(sk.kw_id) FROM site_keywords sk)) es
),
combos AS MATERIALIZED (
  SELECT c.id, c.value_ids, c.effect, c.amount, c.label, c.notes,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'value_id', cv.id, 'dimension', cd.slug, 'dimension_label', cd.name,
                    'value', COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)),
                    'value_label', cv.name)
                  ORDER BY cd.slug, cv.slug)
           FROM platform.categories cv
           JOIN platform.categories cd ON cd.id = cv.parent_id
           WHERE cv.id = ANY (c.value_ids)), '[]'::jsonb) AS values_json
  FROM seo.site_value_combo c
  WHERE c.site_id = p_site_id AND c.deleted_at IS NULL AND c.enabled
),
-- ALL-OF: every value in the combination must be an effective stamp.
combo_hits AS (
  SELECT es.kw_id, cb.id AS combo_id, cb.label, cb.effect, cb.amount, cb.notes, cb.values_json
  FROM combos cb
  JOIN effective_stamps es ON es.value_id = ANY (cb.value_ids)
  GROUP BY es.kw_id, cb.id, cb.label, cb.effect, cb.amount, cb.notes, cb.values_json, cb.value_ids
  HAVING count(DISTINCT es.value_id) = cardinality(cb.value_ids)
),
contrib AS (
  SELECT es.kw_id, w.effect, w.amount, 0 AS kind_rank,
         es.dim_slug AS sort_a, es.value_key AS sort_b,
         jsonb_build_object(
           'kind','stamp','dimension',es.dim_slug,'dimension_label',es.dim_label,
           'value',es.value_key,'value_label',es.value_label,'value_id',es.value_id,
           'effect',w.effect,'amount',w.amount,'source',es.source,'matcher_id',es.matcher_id,
           'nature',es.nature,'as_of',es.as_of,'notes',w.notes) AS reason
  FROM effective_stamps es JOIN worth w ON w.value_id = es.value_id
  UNION ALL
  SELECT ch.kw_id, ch.effect, ch.amount, 1 AS kind_rank,
         COALESCE(ch.label,'') AS sort_a, ch.combo_id::text AS sort_b,
         jsonb_build_object(
           'kind','combo','combo_id',ch.combo_id,'label',ch.label,'values',ch.values_json,
           'effect',ch.effect,'amount',ch.amount,'notes',ch.notes) AS reason
  FROM combo_hits ch
),
per_kw AS (
  SELECT c.kw_id,
         COALESCE(SUM(c.amount) FILTER (WHERE c.effect = 'add'), 0) AS adds,
         COALESCE(exp(SUM(ln(GREATEST(c.amount, 0.0001))) FILTER (WHERE c.effect = 'scale')), 1) AS factor,
         bool_or(c.effect = 'never') AS any_never,
         count(*) FILTER (WHERE c.effect = 'scale') AS n_factors,
         jsonb_agg(c.reason ORDER BY
           CASE c.effect WHEN 'add' THEN 1 WHEN 'scale' THEN 2 ELSE 3 END,
           c.kind_rank, c.sort_a, c.sort_b) AS stamp_reasons
  FROM contrib c GROUP BY c.kw_id
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
scored AS MATERIALIZED (
  SELECT sk.kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    COALESCE(tb.negative_guard, false) OR COALESCE(pk.any_never, false) AS is_never,
    COALESCE(tb.base_weight, 0) + COALESCE(pk.adds, 0) AS adds_total,
    LEAST(10, GREATEST(0.01, COALESCE(pk.factor, 1))) AS factor_total,
    COALESCE(pk.n_factors, 0) AS n_factors,
    tb.topic_name, tb.base_weight, tb.negative_guard, rk.root_type,
    COALESCE(pk.stamp_reasons, '[]'::jsonb) AS stamp_reasons
  FROM site_keywords sk
  LEFT JOIN topic_base tb ON tb.kw_id = sk.kw_id
  LEFT JOIN root_kind rk ON rk.kw_id = sk.kw_id
  LEFT JOIN per_kw pk ON pk.kw_id = sk.kw_id
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN s.is_never THEN 0
       WHEN s.adds_total <= 0 THEN NULL
       ELSE round(s.adds_total * s.factor_total, 1) END AS value_score,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN s.is_never THEN 'negative'
       WHEN s.adds_total <= 0 THEN 'unvalued'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= round(s.adds_total * s.factor_total, 1) ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END AS value_band,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN s.is_never THEN 'computed'
       WHEN s.adds_total <= 0 THEN 'unvalued'
       ELSE 'computed' END AS value_source,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override','level',o.value_tier))
       ELSE
         jsonb_build_array(jsonb_build_object('kind','summary','adds',round(s.adds_total,1),'factor',round(s.factor_total,4),
                                              'n_factors',s.n_factors,'never',s.is_never,
                                              'score', CASE WHEN s.is_never THEN 0 WHEN s.adds_total <= 0 THEN NULL ELSE round(s.adds_total * s.factor_total,1) END))
         || CASE WHEN s.has_topic THEN jsonb_build_array(jsonb_build_object(
              'kind','topic','topic',s.topic_name,'weight',s.base_weight,'effect','add','amount',s.base_weight,
              'root',s.root_type,'negative_guard',COALESCE(s.negative_guard,false))) ELSE '[]'::jsonb END
         || CASE WHEN NOT s.has_topic AND s.adds_total <= 0 AND NOT s.is_never AND jsonb_array_length(s.stamp_reasons) > 0
              THEN jsonb_build_array(jsonb_build_object('kind','no_base','pending_base',true)) ELSE '[]'::jsonb END
         || s.stamp_reasons
  END AS reasons
FROM scored s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$function$;

COMMENT ON FUNCTION seo.keyword_value_map(uuid, uuid[]) IS
  'THE ONE value resolver. Sum every adding worth (topic base + value stamps + combinations), multiply every scaling factor (capped 0.01-10), then never wins outright. Combinations (seo.site_value_combo) fire only when EVERY value in the set is an effective stamp and contribute in the same fixed order. Receipt: a summary row, the topic, then every contribution as {kind:stamp} / {kind:combo}. THE SCOPE RULE: pass the keyword set you are about to render.';

-- ── 7. The what-if — same report as every other preview ─────────────────────
CREATE OR REPLACE FUNCTION seo.gsc_value_combo_preview(
  p_site_id uuid, p_start date, p_end date,
  p_value_ids uuid[], p_effect text, p_amount numeric DEFAULT NULL,
  p_combo_id uuid DEFAULT NULL, p_sample integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb; v_window bigint; v_n int;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  PERFORM seo.assert_combo_shape(p_site_id, p_value_ids, p_effect, p_amount);
  SELECT count(DISTINCT v) INTO v_n FROM unnest(p_value_ids) v;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  -- ALL-OF against the SAME effective stamps the resolver uses.
  hits AS (
    SELECT es.kw_id
    FROM seo.fn_effective_stamps(p_site_id, (SELECT a FROM ids)) es
    WHERE es.value_id = ANY (p_value_ids)
    GROUP BY es.kw_id
    HAVING count(DISTINCT es.value_id) = v_n
  ),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band,'unvalued') AS band, COALESCE(m.value_source,'unvalued') AS source,
           m.value_score AS score, COALESCE(m.reasons,'[]'::jsonb) AS reasons,
           (h.kw_id IS NOT NULL) AS matched
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
    LEFT JOIN vm m ON m.keyword_id = v.kid
    LEFT JOIN hits h ON h.kw_id = v.kid
  ),
  parts AS (
    SELECT b.*,
      -- this combination's CURRENT contribution, swapped out before the what-if
      (p_combo_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(b.reasons) r
         WHERE r->>'kind' = 'combo' AND r->>'combo_id' = p_combo_id::text)) AS fired_before,
      COALESCE((SELECT (r->>'adds')::numeric FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 0)
        - COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(b.reasons) r
                     WHERE r->>'kind'='combo' AND r->>'effect'='add'
                       AND p_combo_id IS NOT NULL AND r->>'combo_id' = p_combo_id::text LIMIT 1), 0) AS adds_other,
      COALESCE((SELECT (r->>'factor')::numeric FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 1)
        / COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(b.reasons) r
                     WHERE r->>'kind'='combo' AND r->>'effect'='scale'
                       AND p_combo_id IS NOT NULL AND r->>'combo_id' = p_combo_id::text LIMIT 1), 1) AS factor_other,
      -- a never that is NOT this combination still wins, so nothing can move
      (EXISTS (SELECT 1 FROM jsonb_array_elements(b.reasons) r
                WHERE (r->>'kind'='topic' AND (r->>'negative_guard')::boolean)
                   OR (r->>'kind'='stamp' AND r->>'effect'='never')
                   OR (r->>'kind'='combo' AND r->>'effect'='never'
                       AND (p_combo_id IS NULL OR r->>'combo_id' <> p_combo_id::text)))) AS never_other
    FROM base b
  ),
  moved AS (
    SELECT p.*,
      (p.adds_other + CASE WHEN p.matched AND p_effect = 'add' THEN p_amount ELSE 0 END) AS next_adds,
      LEAST(10, GREATEST(0.01, p.factor_other * CASE WHEN p.matched AND p_effect = 'scale' THEN p_amount ELSE 1 END)) AS next_factor
    FROM parts p WHERE p.matched OR p.fired_before
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', m.kid, 'keyword', m.normalized_phrase, 'clicks', m.c, 'impressions', m.i,
           'band', m.band, 'source', m.source, 'score', m.score, 'matched', m.matched,
           'stamped_only', (m.matched AND m.next_adds <= 0 AND m.source <> 'override' AND NOT m.never_other AND p_effect <> 'never'),
           'next_raw', CASE
             WHEN m.source = 'override' OR m.never_other THEN NULL
             WHEN m.matched AND p_effect = 'never' THEN 0
             WHEN m.next_adds <= 0 THEN NULL
             ELSE round(m.next_adds * m.next_factor, 1)
           END))
    INTO v_window, v_rows
  FROM moved m;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$function$;

COMMENT ON FUNCTION seo.gsc_value_combo_preview(uuid, date, date, uuid[], text, numeric, uuid, integer) IS
  'What a PROPOSED combination does to this site''s real keywords, measured server-side before anything is saved. Same report as every other preview (matched / moved / stamped-only, via seo.gsc_value_preview_summarize) and the same ALL-OF matching the resolver uses (seo.fn_effective_stamps). THE SCOPE RULE: it takes its GSC window.';

GRANT EXECUTE ON FUNCTION seo.gsc_value_combo_preview(uuid, date, date, uuid[], text, numeric, uuid, integer)
  TO authenticated, service_role;
