-- KI-001 — WORTH EXPRESSED AS POINTS, NOT MULTIPLIERS.
--
-- P18: "what a keyword IS" contributes POINTS on an open scale (add ±N); only a
-- RELATIVE QUALIFIER (free, cheap, DIY) scales what the keyword already earned.
-- The resolver already applies both in the ruled order (add → scale → never).
-- What was missing is the way OUT of a migrated corpus that is nearly all scale:
-- a surface that can read every worth a site holds, propose an honest points
-- equivalent for the ones that describe an identity, and prove the proposal on
-- real keywords before a human accepts it.
--
-- P12: nothing here converts anything. These three reads propose and measure;
-- the ONE write stays `seo.site_value_worth_upsert`.
--
-- The equivalence, in full, so nobody has to reverse-engineer it later:
--   score = (baseline + adds) * factor            -- seo.keyword_value_map
--   Let T = baseline + adds  (the summary reason's `total_before_factor`)
--   and f = the multiplier being converted, part of `factor`.
--   Dropping f leaves factor_other = factor / f, so to leave the score where it
--   is, the points added must satisfy  (T + A) * factor/f = T * factor
--   =>  A = T * (f - 1).
-- T varies per keyword, so the proposal is the MEDIAN of T*(f-1) over the
-- keywords that actually carry the stamp and actually have adds today. The
-- ratified pack formula (`seo._pack_convert_rules_to_meaning`) is the same
-- arithmetic with T pinned at 100; it is reported beside the site's own number
-- so the two can never quietly disagree.

-- ── 1. Every worth this site holds, with how much traffic wears it ──────────
--
-- There was no read for this at all: worth was writable (`site_value_worth_upsert`)
-- and readable only one value at a time through a keyword's receipt. A site
-- could not see its own rulebook.
CREATE OR REPLACE FUNCTION seo.gsc_site_worth_list(
  p_site_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE(
  value_id uuid,
  dimension_slug text,
  dimension_label text,
  dimension_scope text,
  dimension_nature text,
  value_key text,
  value_label text,
  effect text,
  amount numeric,
  origin text,
  pack_id uuid,
  notes text,
  updated_at timestamptz,
  stamped_keywords bigint,
  clicks bigint,
  impressions bigint,
  relative_qualifier boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
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
  reach AS (
    SELECT es.value_id AS vid, count(*)::bigint AS kw,
           COALESCE(SUM(v.c), 0)::bigint AS c, COALESCE(SUM(v.i), 0)::bigint AS i
    FROM seo.fn_effective_stamps(p_site_id, (SELECT a FROM ids)) es
    JOIN vol v ON v.kid = es.kw_id
    GROUP BY es.value_id
  )
  SELECT w.value_id,
         COALESCE(cd.slug, ''), COALESCE(cd.name, ''),
         COALESCE(cd.metadata->>'scope', 'platform'),
         COALESCE(cd.metadata->>'nature', 'intrinsic'),
         COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)),
         cv.name,
         w.effect, w.amount, w.origin, w.pack_id, w.notes, w.updated_at,
         COALESCE(r.kw, 0), COALESCE(r.c, 0), COALESCE(r.i, 0),
         seo._pack_is_relative_value(cd.slug, COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)), cv.name)
  FROM seo.site_value_worth w
  JOIN platform.categories cv ON cv.id = w.value_id AND cv.deleted_at IS NULL
  LEFT JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  LEFT JOIN reach r ON r.vid = w.value_id
  WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
  ORDER BY COALESCE(cd.name, ''), cv.name;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_site_worth_list(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_site_worth_list(uuid, date, date) TO authenticated, service_role;


-- ── 2. The honest derivation — the arithmetic, shown ───────────────────────
--
-- Never a guess. Every number the UI prints comes from here, over this site's
-- real keywords, and the UI shows the working rather than the conclusion.
CREATE OR REPLACE FUNCTION seo.gsc_worth_convert_basis(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_value_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_effect text; v_amount numeric; v_out jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  SELECT w.effect, w.amount INTO v_effect, v_amount
  FROM seo.site_value_worth w
  WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NULL;

  IF v_effect IS NULL THEN
    RETURN jsonb_build_object('error', 'no_worth',
      'message', 'This value carries no worth for this site, so there is nothing to convert.');
  END IF;
  IF v_effect <> 'scale' THEN
    RETURN jsonb_build_object('error', 'not_a_multiplier', 'effect', v_effect,
      'message', 'Only a multiplier converts to points.');
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c
    FROM seo.search_performance_daily spd JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  stamped AS (
    SELECT DISTINCT es.kw_id
    FROM seo.fn_effective_stamps(p_site_id, (SELECT a FROM ids)) es
    WHERE es.value_id = p_value_id
  ),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT array_agg(kw_id) FROM stamped))),
  parts AS (
    SELECT m.keyword_id,
           m.value_source AS source,
           COALESCE((SELECT (r->>'total_before_factor')::numeric
                     FROM jsonb_array_elements(m.reasons) r WHERE r->>'kind' = 'summary' LIMIT 1), 0) AS t,
           COALESCE((SELECT (r->>'factor')::numeric
                     FROM jsonb_array_elements(m.reasons) r WHERE r->>'kind' = 'summary' LIMIT 1), 1) AS factor,
           COALESCE((SELECT (r->>'never')::boolean
                     FROM jsonb_array_elements(m.reasons) r WHERE r->>'kind' = 'summary' LIMIT 1), false) AS is_never,
           m.value_score AS score
    FROM vm m
  ),
  -- The keywords the multiplier is actually doing arithmetic on today: it is
  -- stamped, nothing has already killed the keyword, no human has overruled the
  -- machine, and there is something for a multiplier to multiply.
  contributing AS (
    SELECT p.*, p.t * (v_amount - 1) AS equiv
    FROM parts p
    WHERE p.t > 0 AND NOT p.is_never AND p.source <> 'override'
  )
  SELECT jsonb_build_object(
    'effect', v_effect,
    'factor', v_amount,
    'window_keywords', (SELECT count(*) FROM vol),
    'stamped_keywords', (SELECT count(*) FROM stamped),
    'contributing_keywords', (SELECT count(*) FROM contributing),
    -- A multiplier does NOTHING to a keyword with no points yet; points would.
    -- Saying so out loud is the difference between a proposal and a surprise.
    'inert_keywords', (SELECT count(*) FROM parts WHERE t <= 0 AND NOT is_never AND source <> 'override'),
    'protected_keywords', (SELECT count(*) FROM parts WHERE source = 'override'),
    'never_keywords', (SELECT count(*) FROM parts WHERE is_never),
    'total_before_factor', jsonb_build_object(
      'p25', (SELECT round(percentile_cont(0.25) WITHIN GROUP (ORDER BY t)::numeric, 1) FROM contributing),
      'median', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t)::numeric, 1) FROM contributing),
      'p75', (SELECT round(percentile_cont(0.75) WITHIN GROUP (ORDER BY t)::numeric, 1) FROM contributing)),
    'equivalent_add', jsonb_build_object(
      'p25', (SELECT round(percentile_cont(0.25) WITHIN GROUP (ORDER BY equiv)::numeric, 1) FROM contributing),
      'median', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY equiv)::numeric, 1) FROM contributing),
      'p75', (SELECT round(percentile_cont(0.75) WITHIN GROUP (ORDER BY equiv)::numeric, 1) FROM contributing)),
    -- What the multiplier moves the FINAL score by today, for the record.
    'score_delta_now', jsonb_build_object(
      'median', (SELECT round(percentile_cont(0.5) WITHIN GROUP
                   (ORDER BY GREATEST(0, t * factor) - GREATEST(0, t * (factor / NULLIF(v_amount, 0))))::numeric, 1)
                 FROM contributing)),
    -- Rounded to the nearest 5 because a person has to be able to read it back
    -- and reason about it; the unrounded number is right there beside it.
    'proposed_add', (SELECT CASE
        WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY equiv) IS NULL THEN round((v_amount - 1) * 100)
        ELSE round(percentile_cont(0.5) WITHIN GROUP (ORDER BY equiv)::numeric / 5) * 5 END
      FROM contributing),
    -- The ratified pack formula, T pinned at 100. Printed so the site number and
    -- the pack number can never quietly disagree about the same law.
    'pack_reference_add', round((v_amount - 1) * 100),
    'basis', CASE WHEN (SELECT count(*) FROM contributing) = 0 THEN 'pack_formula' ELSE 'site_distribution' END
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_worth_convert_basis(uuid, date, date, uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_worth_convert_basis(uuid, date, date, uuid) TO authenticated, service_role;


-- ── 3. Nothing saves blind — the same preview family, for one value's worth ─
--
-- Modelled on `seo.gsc_value_combo_preview` and finishing through the SAME
-- `seo.gsc_value_preview_summarize`, so a worth proposal and a combination
-- proposal can never band a keyword differently. It swaps THIS value's own
-- current contribution out first, exactly as the combination preview does.
CREATE OR REPLACE FUNCTION seo.gsc_value_worth_preview(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_value_id uuid,
  p_effect text,
  p_amount numeric DEFAULT NULL,
  p_sample integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb; v_window bigint; v_changed bigint; v_summary jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_effect NOT IN ('add', 'scale', 'never', 'clear') THEN
    RAISE EXCEPTION 'seo_worth_effect: worth is add, scale, never or clear — not %', p_effect;
  END IF;
  IF p_effect IN ('add', 'scale') AND p_amount IS NULL THEN
    RAISE EXCEPTION 'seo_worth_amount: % needs an amount', p_effect;
  END IF;
  IF p_effect = 'scale' AND (p_amount < 0.05 OR p_amount > 5) THEN
    RAISE EXCEPTION 'seo_worth_amount: a multiplier is between 0.05 and 5';
  END IF;

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
  hits AS (
    SELECT DISTINCT es.kw_id
    FROM seo.fn_effective_stamps(p_site_id, (SELECT a FROM ids)) es
    WHERE es.value_id = p_value_id
  ),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band, 'unvalued') AS band, COALESCE(m.value_source, 'unvalued') AS source,
           m.value_score AS score, COALESCE(m.reasons, '[]'::jsonb) AS reasons,
           (h.kw_id IS NOT NULL) AS matched
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
    LEFT JOIN vm m ON m.keyword_id = v.kid
    LEFT JOIN hits h ON h.kw_id = v.kid
  ),
  parts AS (
    SELECT b.*,
      -- This value's OWN contribution today, lifted straight out of the receipt.
      COALESCE((SELECT (r->>'total_before_factor')::numeric
                FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind' = 'summary' LIMIT 1), 0)
        - COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(b.reasons) r
                    WHERE r->>'kind' = 'stamp' AND r->>'effect' = 'add'
                      AND r->>'value_id' = p_value_id::text LIMIT 1), 0) AS adds_other,
      COALESCE((SELECT (r->>'factor')::numeric
                FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind' = 'summary' LIMIT 1), 1)
        / COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(b.reasons) r
                    WHERE r->>'kind' = 'stamp' AND r->>'effect' = 'scale'
                      AND r->>'value_id' = p_value_id::text LIMIT 1), 1) AS factor_other,
      EXISTS (SELECT 1 FROM jsonb_array_elements(b.reasons) r
              WHERE r->>'kind' = 'stamp' AND r->>'value_id' = p_value_id::text) AS fired_before,
      -- A `never` that belongs to something else still wins. Say so honestly
      -- rather than promising a movement that cannot happen.
      EXISTS (SELECT 1 FROM jsonb_array_elements(b.reasons) r
              WHERE (r->>'kind' = 'topic' AND (r->>'negative_guard')::boolean)
                 OR (r->>'kind' = 'combo' AND r->>'effect' = 'never')
                 OR (r->>'kind' = 'stamp' AND r->>'effect' = 'never'
                     AND r->>'value_id' <> p_value_id::text)) AS never_other
    FROM base b
  ),
  moved AS (
    SELECT p.*,
      (p.adds_other + CASE WHEN p.matched AND p_effect = 'add' THEN p_amount ELSE 0 END) AS next_adds,
      LEAST(5, GREATEST(0.05, p.factor_other * CASE WHEN p.matched AND p_effect = 'scale' THEN p_amount ELSE 1 END)) AS next_factor
    FROM parts p WHERE p.matched OR p.fired_before
  ),
  shaped AS (
    SELECT m.*, CASE
        WHEN m.source = 'override' OR m.never_other THEN NULL
        WHEN m.matched AND p_effect = 'never' THEN 0
        ELSE GREATEST(0, round(m.next_adds * m.next_factor, 1))
      END AS next_raw
    FROM moved m
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', s.kid, 'keyword', s.normalized_phrase, 'clicks', s.c, 'impressions', s.i,
           'band', s.band, 'source', s.source, 'score', s.score, 'matched', s.matched,
           'stamped_only', (s.matched AND s.source = 'unvalued'),
           'next_raw', s.next_raw)),
         count(*) FILTER (WHERE s.next_raw IS NOT NULL
                            AND round(s.next_raw, 1) IS DISTINCT FROM round(COALESCE(s.score, -1), 1))
    INTO v_window, v_rows, v_changed
  FROM shaped s;

  v_summary := seo.gsc_value_preview_summarize(
    p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);

  RETURN v_summary || jsonb_build_object(
    'changed_score_keywords', COALESCE(v_changed, 0),
    'effect', p_effect,
    'amount', p_amount);
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_value_worth_preview(uuid, date, date, uuid, text, numeric, integer) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_value_worth_preview(uuid, date, date, uuid, text, numeric, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
