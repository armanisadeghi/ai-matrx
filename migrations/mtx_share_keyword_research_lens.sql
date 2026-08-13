-- Pilot 1 of the sharing experience: keyword research shares as a presentation
-- lens (common-docs/projects/sharing-experience/PLAN.md).
--
-- Two changes, both idempotent:
--
-- 1. `content_ir_kind_instance` becomes link-shareable with a real public
--    projection. The artifact IS the `data` JSONB (`{primary_keyword,
--    keyword_lists[]}` for keyword research), so `data` must ride the token
--    payload; `title` + `created_at` carry the report header. The
--    `url_path_template` stays `/shapes/instances/{id}` — that route now
--    dispatches on the instance's kind and renders the report for a signed-in
--    grantee instead of dead-ending in the shape studio.
--
-- 2. `public.share_token_keyword_metrics(token)` — the anon lane for the market
--    metrics. The artifact stores PHRASES only; volume/CPC/trend/intent live in
--    `seo.keyword` + `seo.keyword_market`, which anon cannot read (no schema
--    grant, deliberately — that plane is paid provider data). Rather than
--    granting anon the whole keyword plane, this SECURITY DEFINER function
--    exposes exactly the rows for the phrases inside the shared artifact, and
--    only while the presented token is valid. Same authorization conditions as
--    `resolve_share_token`, minus the view consumption (reading metrics is not
--    a second view).

UPDATE platform.shareable_resource_registry
   SET is_link_shareable = true,
       public_columns = ARRAY['id', 'title', 'data', 'created_at'],
       url_path_template = '/shapes/instances/{id}'
 WHERE resource_type = 'content_ir_kind_instance';

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
               'intent_class', k.intent_class,
               'funnel_stage', k.funnel_stage,
               'audience_type', k.audience_type,
               'fulfillment_mode', k.fulfillment_mode,
               'local_intent', k.local_intent,
               'specificity', k.specificity,
               'brand_presence', k.brand_presence,
               'urgency', k.urgency,
               'comparison_intent', k.comparison_intent,
               'price_sensitivity', k.price_sensitivity,
               'query_form', k.query_form,
               'transaction_direction', k.transaction_direction,
               'compliance_framing', k.compliance_framing,
               'classification_confidence', k.classification_confidence,
               'classifier_version', k.classifier_version,
               'keyword_market', COALESCE(m.markets, '[]'::jsonb)
             ) AS row_json
        FROM seo.keyword k
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

GRANT EXECUTE ON FUNCTION public.share_token_keyword_metrics(text) TO anon, authenticated;
