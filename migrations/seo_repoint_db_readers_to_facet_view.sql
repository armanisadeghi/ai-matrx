-- ============================================================================
-- KI-035 step 2 — REPOINT THE DB READERS to the canonical stamp-backed view.
-- Bodies are otherwise byte-identical to the live definitions; the only change
-- is a LEFT JOIN to `seo.keyword_universal_facet` and the 13 facet references
-- moving from the mirror columns to it. Output equality was proven per
-- function on live data before and after (see the migration's verification
-- notes in the commit). After this, the frontend readers (chip) and aidream's
-- mirror-write are the only things standing between us and the drop.
-- ============================================================================

CREATE OR REPLACE FUNCTION seo.gsc_keyword_class_review(p_site_id uuid, p_start date, p_end date, p_classes text[] DEFAULT NULL::text[], p_sources text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_sort text DEFAULT 'impressions'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_pattern text DEFAULT NULL::text, p_match text DEFAULT NULL::text, p_confirmed boolean DEFAULT NULL::boolean, p_brand_alias text DEFAULT NULL::text, p_filters jsonb DEFAULT '[]'::jsonb, p_search_mode text DEFAULT 'contains'::text)
 RETURNS TABLE(keyword_id uuid, query text, traffic_class text, class_source text, clicks bigint, impressions bigint, ctr numeric, intent_class text, override_class text, content_role text, offering_match text, suppression_reason text, lead_quality text, notes text, ruling_origin text, ruling_confirmed boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
  v_pattern text := NULLIF(btrim(lower(p_pattern)), '');
  v_brand_alias text := NULLIF(btrim(lower(p_brand_alias)), '');
  v_filters jsonb := COALESCE(p_filters, '[]'::jsonb);
  v_search_mode text := lower(COALESCE(NULLIF(btrim(p_search_mode), ''), 'contains'));
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF v_search_mode NOT IN ('contains', 'whole_words') THEN
    RAISE EXCEPTION 'gsc_search_mode_unknown: %', v_search_mode;
  END IF;

  IF p_classes IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_classes) c
    WHERE c NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified')
  ) THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', array_to_string(p_classes, ',');
  END IF;
  IF p_sources IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_sources) s
    WHERE s NOT IN ('site_value', 'brand_match', 'intent_class', 'none')
  ) THEN
    RAISE EXCEPTION 'gsc_class_source_unknown: %', array_to_string(p_sources, ',');
  END IF;
  IF v_pattern IS NOT NULL AND (
    p_match IS NULL
    OR p_match NOT IN ('contains', 'exact', 'starts_with', 'ends_with', 'word')
  ) THEN
    RAISE EXCEPTION 'gsc_match_kind_unknown: %', COALESCE(p_match, '(missing)');
  END IF;
  IF p_sort NOT IN (
    'impressions', 'clicks', 'ctr', 'query',
    'traffic_class', 'class_source', 'intent_class'
  ) THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  IF jsonb_typeof(v_filters) <> 'array' THEN
    RAISE EXCEPTION 'gsc_filters_invalid: expected an array';
  END IF;
  IF jsonb_array_length(v_filters) > 20 THEN
    RAISE EXCEPTION 'gsc_filters_invalid: at most 20 layers are allowed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE jsonb_typeof(f.rule) <> 'object'
      OR COALESCE(f.rule->>'field', '') NOT IN (
        'query', 'traffic_class', 'class_source', 'impressions', 'clicks',
        'ctr', 'intent_class', 'notes', 'ruling_origin', 'ruling_confirmed'
      )
      OR COALESCE(f.rule->>'operator', '') NOT IN (
        'contains', 'not_contains', 'equals', 'not_equals', 'starts_with',
        'ends_with', 'word', 'not_word', 'is_empty', 'is_not_empty',
        'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal',
        'between'
      )
      OR jsonb_typeof(f.rule->'value') <> 'string'
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: malformed field, operator, or value';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE (
      f.rule->>'field' IN ('impressions', 'clicks', 'ctr')
      AND f.rule->>'operator' NOT IN (
        'equals', 'not_equals', 'greater_than', 'greater_or_equal',
        'less_than', 'less_or_equal', 'between', 'is_empty', 'is_not_empty'
      )
    ) OR (
      f.rule->>'field' IN (
        'traffic_class', 'class_source', 'ruling_origin', 'ruling_confirmed'
      )
      AND f.rule->>'operator' NOT IN (
        'equals', 'not_equals', 'is_empty', 'is_not_empty'
      )
    ) OR (
      f.rule->>'field' IN ('query', 'intent_class', 'notes')
      AND f.rule->>'operator' NOT IN (
        'contains', 'not_contains', 'equals', 'not_equals', 'starts_with',
        'ends_with', 'word', 'not_word', 'is_empty', 'is_not_empty'
      )
    )
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: operator is not valid for its field';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
      AND btrim(f.rule->>'value') = ''
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: a filter value is required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE f.rule->>'field' IN ('impressions', 'clicks', 'ctr')
      AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
      AND (
        btrim(f.rule->>'value') !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
        OR (
          f.rule->>'operator' = 'between'
          AND COALESCE(btrim(f.rule->>'valueTo'), '')
            !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
        )
      )
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: numeric filters require valid numbers';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE (f.rule->>'field' = 'traffic_class' AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
      AND f.rule->>'value' NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified'))
      OR (f.rule->>'field' = 'class_source' AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
        AND f.rule->>'value' NOT IN ('site_value', 'brand_match', 'intent_class', 'none'))
      OR (f.rule->>'field' = 'ruling_origin' AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
        AND f.rule->>'value' NOT IN ('manual', 'rule', 'import', 'ai'))
      OR (f.rule->>'field' = 'ruling_confirmed' AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
        AND f.rule->>'value' NOT IN ('true', 'false'))
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: unknown select value';
  END IF;

  RETURN QUERY
  WITH requested_alias AS MATERIALIZED (
    SELECT ba.joined
    FROM seo.gsc_brand_aliases(p_site_id) ba
    WHERE v_brand_alias IS NOT NULL
      AND ba.raw_name = v_brand_alias
    LIMIT 1
  ), requested_hits AS MATERIALIZED (
    SELECT h.keyword_id, h.strong
    FROM seo.gsc_brand_hits(p_site_id) h
    JOIN requested_alias ra ON ra.joined = h.joined
  ), requested_hit_count AS (
    SELECT count(*)::bigint AS n FROM requested_hits
  ), effective_requested_hits AS MATERIALIZED (
    SELECT rh.keyword_id
    FROM requested_hits rh
    CROSS JOIN requested_hit_count hc
    WHERE rh.strong OR hc.n <= seo.gsc_brand_generic_threshold()
  ), winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ), agg AS (
    SELECT spd.keyword_id AS kid,
           min(spd.query) AS q,
           sum(spd.clicks)::bigint AS s_clicks,
           sum(spd.impressions)::bigint AS s_imps
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
      AND spd.query IS NOT NULL
    GROUP BY spd.keyword_id
  ), classed AS (
    SELECT a.kid, a.q, a.s_clicks, a.s_imps,
           COALESCE(cm.traffic_class, 'unclassified') AS cls,
           COALESCE(cm.class_source, 'none') AS src,
           ukw.intent_class AS kw_intent,
           skv.traffic_class AS skv_class,
           skv.content_role AS skv_role,
           skv.offering_match AS skv_service,
           skv.suppression_reason AS skv_suppression,
           skv.lead_quality AS skv_lead,
           skv.notes AS skv_notes,
           skv.metadata->'classification'->>'origin' AS skv_origin,
           COALESCE(
             (skv.metadata->'classification'->>'confirmed')::boolean,
             true
           ) AS skv_confirmed
    FROM agg a
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = a.kid
    LEFT JOIN seo.keyword kw ON kw.id = a.kid
  LEFT JOIN seo.keyword_universal_facet ukw ON ukw.keyword_id = a.kid
    LEFT JOIN seo.site_keyword_value skv
      ON skv.keyword_id = a.kid
     AND skv.site_id = p_site_id
     AND skv.deleted_at IS NULL
    WHERE (
        p_classes IS NULL
        OR COALESCE(cm.traffic_class, 'unclassified') = ANY (p_classes)
      )
      AND (
        p_sources IS NULL
        OR COALESCE(cm.class_source, 'none') = ANY (p_sources)
      )
      AND (
        v_search IS NULL
        OR CASE v_search_mode
          WHEN 'contains' THEN
            a.q ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%'
          WHEN 'whole_words' THEN
            cardinality(array_remove(
              regexp_split_to_array(lower(v_search), '[^[:alnum:]]+'),
              ''
            )) > 0
            AND NOT EXISTS (
              SELECT 1
              FROM unnest(regexp_split_to_array(
                lower(v_search),
                '[^[:alnum:]]+'
              )) term(word)
              WHERE term.word <> ''
                AND NOT (
                  term.word = ANY (regexp_split_to_array(
                    lower(a.q),
                    '[^[:alnum:]]+'
                  ))
                )
            )
        END
      )
      AND (
        v_pattern IS NULL
        OR CASE p_match
          WHEN 'contains' THEN
            a.q ILIKE '%' || seo.gsc_perf_like_escape(v_pattern) || '%'
          WHEN 'exact' THEN lower(a.q) = v_pattern
          WHEN 'starts_with' THEN
            a.q ILIKE seo.gsc_perf_like_escape(v_pattern) || '%'
          WHEN 'ends_with' THEN
            a.q ILIKE '%' || seo.gsc_perf_like_escape(v_pattern)
          WHEN 'word' THEN v_pattern = ANY (string_to_array(lower(a.q), ' '))
        END
      )
      AND (
        p_confirmed IS NULL
        OR (
          skv.traffic_class IS NOT NULL
          AND COALESCE(
            (skv.metadata->'classification'->>'confirmed')::boolean,
            true
          ) = p_confirmed
        )
      )
      AND (
        v_brand_alias IS NULL
        OR EXISTS (
          SELECT 1
          FROM effective_requested_hits erh
          WHERE erh.keyword_id = a.kid
        )
      )
  ), layered AS (
    SELECT c.*
    FROM classed c
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_filters) f(rule)
      CROSS JOIN LATERAL (
        SELECT
          CASE f.rule->>'field'
            WHEN 'query' THEN c.q
            WHEN 'traffic_class' THEN c.cls
            WHEN 'class_source' THEN c.src
            WHEN 'intent_class' THEN c.kw_intent
            WHEN 'notes' THEN c.skv_notes
            WHEN 'ruling_origin' THEN c.skv_origin
            WHEN 'ruling_confirmed' THEN
              CASE WHEN c.skv_class IS NULL THEN NULL ELSE c.skv_confirmed::text END
          END AS text_value,
          CASE f.rule->>'field'
            WHEN 'impressions' THEN c.s_imps::numeric
            WHEN 'clicks' THEN c.s_clicks::numeric
            WHEN 'ctr' THEN
              CASE WHEN c.s_imps > 0 THEN c.s_clicks::numeric * 100 / c.s_imps END
          END AS number_value
      ) actual
      WHERE NOT CASE
        WHEN f.rule->>'field' IN ('impressions', 'clicks', 'ctr') THEN
          CASE f.rule->>'operator'
            WHEN 'equals' THEN COALESCE(actual.number_value = (f.rule->>'value')::numeric, false)
            WHEN 'not_equals' THEN COALESCE(actual.number_value <> (f.rule->>'value')::numeric, false)
            WHEN 'greater_than' THEN COALESCE(actual.number_value > (f.rule->>'value')::numeric, false)
            WHEN 'greater_or_equal' THEN COALESCE(actual.number_value >= (f.rule->>'value')::numeric, false)
            WHEN 'less_than' THEN COALESCE(actual.number_value < (f.rule->>'value')::numeric, false)
            WHEN 'less_or_equal' THEN COALESCE(actual.number_value <= (f.rule->>'value')::numeric, false)
            WHEN 'between' THEN COALESCE(
              actual.number_value BETWEEN (f.rule->>'value')::numeric AND (f.rule->>'valueTo')::numeric,
              false
            )
            WHEN 'is_empty' THEN actual.number_value IS NULL
            WHEN 'is_not_empty' THEN actual.number_value IS NOT NULL
          END
        ELSE
          CASE f.rule->>'operator'
            WHEN 'contains' THEN COALESCE(actual.text_value, '') ILIKE
              '%' || seo.gsc_perf_like_escape(btrim(f.rule->>'value')) || '%'
            WHEN 'not_contains' THEN COALESCE(actual.text_value, '') NOT ILIKE
              '%' || seo.gsc_perf_like_escape(btrim(f.rule->>'value')) || '%'
            WHEN 'equals' THEN lower(COALESCE(actual.text_value, '')) = lower(btrim(f.rule->>'value'))
            WHEN 'not_equals' THEN lower(COALESCE(actual.text_value, '')) <> lower(btrim(f.rule->>'value'))
            WHEN 'starts_with' THEN COALESCE(actual.text_value, '') ILIKE
              seo.gsc_perf_like_escape(btrim(f.rule->>'value')) || '%'
            WHEN 'ends_with' THEN COALESCE(actual.text_value, '') ILIKE
              '%' || seo.gsc_perf_like_escape(btrim(f.rule->>'value'))
            WHEN 'word' THEN lower(btrim(f.rule->>'value')) = ANY (
              regexp_split_to_array(lower(COALESCE(actual.text_value, '')), '[^[:alnum:]]+')
            )
            WHEN 'not_word' THEN NOT (
              lower(btrim(f.rule->>'value')) = ANY (
                regexp_split_to_array(lower(COALESCE(actual.text_value, '')), '[^[:alnum:]]+')
              )
            )
            WHEN 'is_empty' THEN COALESCE(btrim(actual.text_value), '') = ''
            WHEN 'is_not_empty' THEN COALESCE(btrim(actual.text_value), '') <> ''
          END
      END
    )
  )
  SELECT c.kid,
         c.q,
         c.cls,
         c.src,
         c.s_clicks,
         c.s_imps,
         CASE
           WHEN c.s_imps > 0
             THEN round(c.s_clicks::numeric / c.s_imps, 6)
         END,
         c.kw_intent,
         c.skv_class,
         c.skv_role,
         c.skv_service,
         c.skv_suppression,
         c.skv_lead,
         c.skv_notes,
         c.skv_origin,
         c.skv_confirmed,
         count(*) OVER ()::bigint
  FROM layered c
  ORDER BY
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'desc' THEN c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'asc' THEN c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'desc' THEN c.s_clicks END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'asc' THEN c.s_clicks END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'desc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'asc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'desc' THEN c.q END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'asc' THEN c.q END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'traffic_class' AND p_sort_dir = 'desc' THEN c.cls END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'traffic_class' AND p_sort_dir = 'asc' THEN c.cls END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'class_source' AND p_sort_dir = 'desc' THEN c.src END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'class_source' AND p_sort_dir = 'asc' THEN c.src END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'intent_class' AND p_sort_dir = 'desc' THEN c.kw_intent END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'intent_class' AND p_sort_dir = 'asc' THEN c.kw_intent END) ASC NULLS LAST,
    c.s_imps DESC,
    c.kid ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.share_token_keyword_metrics(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link record;
  v_data jsonb;
  v_phrases text[];
  v_rows jsonb;
BEGIN
  SELECT * INTO v_link FROM platform.share_links WHERE token = p_token;
  IF NOT FOUND OR NOT v_link.is_active THEN RETURN '[]'::jsonb; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN '[]'::jsonb;
  END IF;
  IF v_link.max_uses IS NOT NULL AND v_link.use_count > v_link.max_uses THEN
    RETURN '[]'::jsonb;
  END IF;
  IF v_link.resource_type <> 'content_ir_kind_instance' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT ki.data INTO v_data
    FROM content_ir.kind_instance ki
   WHERE ki.id = v_link.resource_id AND ki.deleted_at IS NULL;
  IF v_data IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT array_agg(DISTINCT seo.fn_normalize_phrase(phrase))
    INTO v_phrases
    FROM (
      SELECT v_data->>'primary_keyword' AS phrase
      UNION ALL
      SELECT keyword
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(v_data->'keyword_lists') = 'array'
                    THEN v_data->'keyword_lists' ELSE '[]'::jsonb END) AS lists(list)
        CROSS JOIN LATERAL jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(list->'keywords') = 'array'
                    THEN list->'keywords' ELSE '[]'::jsonb END) AS kw(keyword)
    ) src
   WHERE phrase IS NOT NULL AND btrim(phrase) <> '';
  IF v_phrases IS NULL OR array_length(v_phrases, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Explicit projection: the report's columns only. Never `to_jsonb(k)` —
  -- that would hand an anonymous visitor the plane's org/user ids.
  SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT jsonb_build_object(
               'id', k.id,
               'phrase', k.phrase,
               'normalized_phrase', k.normalized_phrase,
               'intent_class', uf.intent_class,
               'funnel_stage', uf.funnel_stage,
               'audience_type', uf.audience_type,
               'fulfillment_mode', uf.fulfillment_mode,
               'local_intent', uf.local_intent,
               'specificity', uf.specificity,
               'brand_presence', uf.brand_presence,
               'urgency', uf.urgency,
               'comparison_intent', uf.comparison_intent,
               'price_sensitivity', uf.price_sensitivity,
               'query_form', uf.query_form,
               'transaction_direction', uf.transaction_direction,
               'compliance_framing', uf.compliance_framing,
               'classification_confidence', k.classification_confidence,
               'classifier_version', k.classifier_version,
               'keyword_market', COALESCE(m.markets, '[]'::jsonb)
             ) AS row_json
        FROM seo.keyword k
      LEFT JOIN seo.keyword_universal_facet uf ON uf.keyword_id = k.id
        LEFT JOIN LATERAL (
               SELECT jsonb_agg(jsonb_build_object(
                        'id', km.id,
                        'keyword_id', km.keyword_id,
                        'location_code', km.location_code,
                        'search_volume', km.search_volume,
                        'competition', km.competition,
                        'competition_index', km.competition_index,
                        'cpc', km.cpc,
                        'monthly_searches', km.monthly_searches,
                        'demand_trajectory', km.demand_trajectory,
                        'growth_rate', km.growth_rate)) AS markets
                 FROM seo.keyword_market km
                WHERE km.keyword_id = k.id AND km.deleted_at IS NULL
             ) m ON true
       WHERE k.normalized_phrase = ANY(v_phrases)
         AND k.deleted_at IS NULL
    ) projected;

  RETURN v_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_corpus(p_site_ids uuid[], p_days integer DEFAULT 365, p_top_n integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'public', 'pg_temp'
AS $function$
declare
  v_site uuid; v_end date; v_start date; v_sites jsonb := '[]'::jsonb;
begin
  if p_site_ids is null or array_length(p_site_ids, 1) is null then
    raise exception 'seo_pack_corpus_no_sites';
  end if;
  -- The Library curates ACROSS tenants: platform admins read any sample site's demand;
  -- everyone else reads only sites they can access.
  if not public.is_platform_admin() then
    foreach v_site in array p_site_ids loop
      perform seo.gsc_assert_site_access(v_site);
    end loop;
  end if;
  select max(d.date) into v_end from seo.search_performance_daily d
   where d.site_id = any(p_site_ids) and d.provider = 'gsc' and d.dimension_profile = 'query';
  if v_end is null then
    raise exception 'seo_pack_corpus_no_performance_data';
  end if;
  v_start := v_end - make_interval(days => greatest(p_days, 28));
  with per_kw as (
    select d.site_id, d.keyword_id, sum(d.clicks)::bigint clicks, sum(d.impressions)::bigint impressions,
           round((sum(d.average_position * d.impressions) / nullif(sum(d.impressions), 0))::numeric, 1) position
    from seo.search_performance_daily d
    where d.site_id = any(p_site_ids) and d.provider = 'gsc' and d.dimension_profile = 'query'
      and d.query is not null and d.date between v_start and v_end
    group by d.site_id, d.keyword_id
  ),
  totals as (
    select site_id, count(*)::int distinct_keywords, sum(clicks)::bigint clicks, sum(impressions)::bigint impressions
    from per_kw group by site_id
  ),
  ranked as (
    select *, row_number() over (partition by site_id order by clicks desc, impressions desc) rk_clicks,
              row_number() over (partition by site_id order by impressions desc, clicks desc) rk_impr
    from per_kw
  ),
  picked as (
    select r.*, k.phrase, uf.intent_class, uf.audience_type, uf.funnel_stage, uf.price_sensitivity, uf.local_intent, uf.compliance_framing
    from ranked r join seo.keyword k on k.id = r.keyword_id and k.deleted_at is null
    left join seo.keyword_universal_facet uf on uf.keyword_id = k.id
    where r.rk_clicks <= p_top_n or r.rk_impr <= p_top_n
  ),
  kw_json as (
    select site_id,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object('q', phrase, 'clicks', clicks, 'impressions', impressions, 'position', position,
        'intent', intent_class, 'audience', audience_type, 'funnel', funnel_stage, 'price', price_sensitivity, 'local', local_intent,
        'compliance', compliance_framing)) order by clicks desc, impressions desc) filter (where rk_clicks <= p_top_n) as top_by_clicks,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object('q', phrase, 'clicks', clicks, 'impressions', impressions, 'position', position,
        'intent', intent_class, 'audience', audience_type)) order by impressions desc)
        filter (where rk_impr <= p_top_n and rk_clicks > p_top_n) as top_by_impressions
    from picked group by site_id
  )
  select jsonb_agg(jsonb_build_object(
    'domain', s.domain, 'name', s.name, 'distinct_keywords', t.distinct_keywords, 'clicks', t.clicks, 'impressions', t.impressions,
    'top_by_clicks', coalesce(j.top_by_clicks, '[]'::jsonb), 'top_by_impressions', coalesce(j.top_by_impressions, '[]'::jsonb),
    'kw_guidelines', nullif(s.settings -> 'kw_guidelines' ->> 'text', '')) order by t.clicks desc)
  into v_sites
  from totals t join web.site s on s.id = t.site_id left join kw_json j on j.site_id = t.site_id;
  return jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end),
    'sites', coalesce(v_sites, '[]'::jsonb),
    'facet_vocabulary', (select jsonb_object_agg(facet, vals) from (
        select split_part(c.slug, ':', 1) facet, jsonb_agg(split_part(c.slug, ':', 2) order by c.slug) vals
        from platform.categories c where c.dimension = 'seo_facet' and c.deleted_at is null and c.slug like '%:%' group by 1) f),
    'value_band_defaults', (select jsonb_agg(jsonb_build_object('value', c.slug, 'label', c.name, 'min_score', c.metadata->>'min_score') order by c.position)
      from platform.categories c where c.dimension = 'seo_value_band' and c.deleted_at is null),
    'geo_band_defaults', (select jsonb_agg(jsonb_build_object('value', c.slug, 'label', c.name, 'multiplier', c.metadata->>'multiplier') order by c.position)
      from platform.categories c where c.dimension = 'seo_geo_band' and c.deleted_at is null),
    'node_types', to_jsonb(array['service','product','problem','audience','brand','authority','existing_customer','recruiting','reputation','partner']),
    'existing_topics', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'node_type', t.node_type,
             'parent_slug', (select p.slug from seo.topic p where p.id = t.parent_id)) order by t.slug)
      from seo.topic t where t.deleted_at is null), '[]'::jsonb),
    'universal_rule_templates', coalesce((select jsonb_agg(jsonb_build_object('name', r.name, 'pattern', r.pattern, 'match_kind', r.match_kind, 'target_class', r.target_class) order by r.name)
      from seo.keyword_class_rule r where r.is_template and r.pack_id is null and r.deleted_at is null), '[]'::jsonb)
  );
end;
$function$;
