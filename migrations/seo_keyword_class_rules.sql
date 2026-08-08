-- Keyword-classification PATTERN RULES + provenance metadata (2026-08-08) —
-- round 2 of the classification workbench. Arman's spec: pattern-based batch
-- classification ("how to" → educational) with preprogrammed clue templates
-- AND user-defined rules; review-then-apply by default; per-rule opt-in
-- auto-apply; anything applied without a human eyeballing it carries a
-- visible unconfirmed flag until confirmed.
--
-- Architecture mirrors seo.gsc_dig_rule EXACTLY (seo_gsc_dig_watch_launch.sql):
-- world-readable ownerless system templates (is_template + fixed UUIDs,
-- edits ship as re-seeds), owned user rules (org-shared read), copy-insert
-- adoption client-side, soft delete, no DELETE grant.
--
-- Rule preview is STATELESS reuse: `gsc_keyword_class_review` gains
-- p_pattern/p_match so a rule's live matches ARE the ordinary review table
-- (volume, current class, provenance) — never a second match engine.
-- Match kinds: contains | exact | starts_with | ends_with | word
-- (word-boundary contains). Regex is deliberately excluded v1 (injection/
-- DoS surface; the five kinds beat Excel's filter vocabulary already).
--
-- Provenance: `gsc_set_keyword_class` gains p_origin/p_rule_id/p_confirmed
-- (appended with defaults — aidream's site-intake caller is named-args and
-- unaffected) and stamps site_keyword_value.metadata.classification =
-- {origin, rule_id, confirmed, applied_at}. The review RPC surfaces
-- origin+confirmed; `gsc_confirm_keyword_class` flips confirmed=true.
-- CSV/workbook import runs through `gsc_class_import` (dry-run diff first,
-- then apply through the SAME per-class write path — one mapping, one home).

CREATE TABLE IF NOT EXISTS seo.keyword_class_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  pattern text NOT NULL CHECK (btrim(pattern) <> ''),
  match_kind text NOT NULL DEFAULT 'contains'
    CHECK (match_kind IN ('contains', 'exact', 'starts_with', 'ends_with', 'word')),
  target_class text NOT NULL
    CHECK (target_class IN ('money', 'educational', 'brand', 'mismatch')),
  -- Reasoning stamped onto every ruling this rule applies (mismatch rules
  -- MUST carry it — enforced at apply time by gsc_set_keyword_class).
  notes text,
  -- Opt-in per rule. Auto-applied rulings write confirmed=false and render
  -- flagged until a human confirms. The UI suppresses offering auto-apply
  -- when the user pruned matches during review (a pruned rule is a bad
  -- auto-candidate — Arman, 2026-08-08).
  auto_apply boolean NOT NULL DEFAULT false,
  is_template boolean NOT NULL DEFAULT false,
  site_id uuid REFERENCES web.site(id) ON DELETE CASCADE,
  organization_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  last_applied_at timestamptz,
  CONSTRAINT keyword_class_rule_owned CHECK (is_template OR created_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_seo_keyword_class_rule_owner
  ON seo.keyword_class_rule (created_by) WHERE deleted_at IS NULL;

ALTER TABLE seo.keyword_class_rule ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'seo.keyword_class_rule'::regclass AND polname = 'std_select') THEN
    CREATE POLICY std_select ON seo.keyword_class_rule FOR SELECT TO authenticated
      USING (deleted_at IS NULL AND (
        is_template
        OR created_by = (SELECT auth.uid())
        OR (organization_id IS NOT NULL AND iam.has_org_access(organization_id))
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'seo.keyword_class_rule'::regclass AND polname = 'std_insert') THEN
    CREATE POLICY std_insert ON seo.keyword_class_rule FOR INSERT TO authenticated
      WITH CHECK (
        NOT is_template
        AND created_by = (SELECT auth.uid())
        AND (organization_id IS NULL OR iam.has_org_access(organization_id))
        AND (site_id IS NULL OR site_id IN (SELECT s.id FROM web.site s))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'seo.keyword_class_rule'::regclass AND polname = 'std_update') THEN
    CREATE POLICY std_update ON seo.keyword_class_rule FOR UPDATE TO authenticated
      USING (NOT is_template AND created_by = (SELECT auth.uid()))
      WITH CHECK (
        NOT is_template
        AND created_by = (SELECT auth.uid())
        AND (organization_id IS NULL OR iam.has_org_access(organization_id))
        AND (site_id IS NULL OR site_id IN (SELECT s.id FROM web.site s))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'seo.keyword_class_rule'::regclass AND polname = 'svc_all') THEN
    CREATE POLICY svc_all ON seo.keyword_class_rule FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON seo.keyword_class_rule TO authenticated;
GRANT ALL ON seo.keyword_class_rule TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'seo.keyword_class_rule'::regclass AND tgname = '_touch_row'
  ) THEN
    CREATE TRIGGER _touch_row BEFORE UPDATE ON seo.keyword_class_rule
      FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
  END IF;
END $$;

-- System clue templates — fixed UUIDs, ownerless, world-readable; edits ship
-- as re-seeds. Deliberately conservative: every template defaults to
-- review-then-apply (auto_apply=false); descriptions state the assumption so
-- the human knows what they are confirming. "vs"/"before and after"-style
-- COMPARISON clues are excluded — they point at a sub-class layer the class
-- system does not have yet (documented in FEATURE.md § next round).
INSERT INTO seo.keyword_class_rule
  (id, name, description, pattern, match_kind, target_class, notes, is_template)
VALUES
  ('a1d18001-0000-4000-8000-000000000001', 'How-to questions', 'Queries starting with "how to" are almost always informational.', 'how to', 'starts_with', 'educational', 'Pattern rule: starts with "how to" — informational intent.', true),
  ('a1d18001-0000-4000-8000-000000000002', 'What-is questions', 'Definition-seeking queries — informational.', 'what is', 'starts_with', 'educational', 'Pattern rule: starts with "what is" — definition-seeking.', true),
  ('a1d18001-0000-4000-8000-000000000003', 'Why questions', 'Explanations and causes — informational.', 'why', 'starts_with', 'educational', 'Pattern rule: starts with "why" — explanatory intent.', true),
  ('a1d18001-0000-4000-8000-000000000004', 'Guides and tutorials', 'Queries containing "guide" or naming a tutorial format.', 'guide', 'word', 'educational', 'Pattern rule: contains the word "guide".', true),
  ('a1d18001-0000-4000-8000-000000000005', 'DIY intent', 'Do-it-yourself searchers are learning, not buying.', 'diy', 'word', 'educational', 'Pattern rule: contains "diy" — self-service intent.', true),
  ('a1d18001-0000-4000-8000-000000000006', 'Near-me searches', '"Near me" is a buyer looking for a local provider.', 'near me', 'ends_with', 'money', 'Pattern rule: ends with "near me" — local purchase intent.', true),
  ('a1d18001-0000-4000-8000-000000000007', 'Cost and price checks', 'Queries containing "cost" — buyers pricing the service.', 'cost', 'word', 'money', 'Pattern rule: contains "cost" — pricing intent.', true),
  ('a1d18001-0000-4000-8000-000000000008', 'Price checks', 'Queries containing "price"/"prices"/"pricing".', 'pric', 'contains', 'money', 'Pattern rule: contains "pric" (price/prices/pricing).', true),
  ('a1d18001-0000-4000-8000-000000000009', 'Quote requests', 'Someone asking for a quote is ready to buy.', 'quote', 'word', 'money', 'Pattern rule: contains "quote" — purchase-ready intent.', true),
  ('a1d18001-0000-4000-8000-000000000010', 'Service seekers', 'Queries containing "service"/"services" name the offering itself.', 'service', 'contains', 'money', 'Pattern rule: contains "service" — offering-seeking intent.', true),
  ('a1d18001-0000-4000-8000-000000000011', 'Company seekers', 'Queries containing "company"/"companies" — provider shopping.', 'compan', 'contains', 'money', 'Pattern rule: contains "compan" (company/companies).', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  pattern = EXCLUDED.pattern,
  match_kind = EXCLUDED.match_kind,
  target_class = EXCLUDED.target_class,
  notes = EXCLUDED.notes,
  is_template = true,
  deleted_at = NULL,
  updated_at = now();


-- ── Review RPC: add pattern matching + provenance columns ─────────────────
-- Signature change (added p_pattern/p_match + origin/confirmed outputs) —
-- drop the previous signature so PostgREST resolves exactly one.
DROP FUNCTION IF EXISTS seo.gsc_keyword_class_review(uuid, date, date, text[], text[], text, text, text, int, int);

CREATE OR REPLACE FUNCTION seo.gsc_keyword_class_review(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_classes text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'impressions',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_pattern text DEFAULT NULL,
  p_match text DEFAULT NULL,
  p_confirmed boolean DEFAULT NULL
) RETURNS TABLE (
  keyword_id uuid,
  query text,
  traffic_class text,
  class_source text,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  intent_class text,
  override_class text,
  content_role text,
  service_match text,
  suppression_reason text,
  lead_quality text,
  notes text,
  ruling_origin text,
  ruling_confirmed boolean,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $function$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
  v_pattern text := NULLIF(btrim(lower(p_pattern)), '');
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
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
  IF v_pattern IS NOT NULL AND (p_match IS NULL OR p_match NOT IN ('contains', 'exact', 'starts_with', 'ends_with', 'word')) THEN
    RAISE EXCEPTION 'gsc_match_kind_unknown: %', COALESCE(p_match, '(missing)');
  END IF;
  IF p_sort NOT IN ('impressions', 'clicks', 'ctr', 'query') THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  agg AS (
    SELECT spd.keyword_id AS kid,
           MIN(spd.query) AS q,
           SUM(spd.clicks)::bigint AS s_clicks,
           SUM(spd.impressions)::bigint AS s_imps
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
      AND spd.query IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  classed AS (
    SELECT a.kid, a.q, a.s_clicks, a.s_imps,
           COALESCE(cm.traffic_class, 'unclassified') AS cls,
           COALESCE(cm.class_source, 'none') AS src,
           kw.intent_class AS kw_intent,
           skv.traffic_class AS skv_class,
           skv.content_role AS skv_role,
           skv.service_match AS skv_service,
           skv.suppression_reason AS skv_suppression,
           skv.lead_quality AS skv_lead,
           skv.notes AS skv_notes,
           skv.metadata->'classification'->>'origin' AS skv_origin,
           COALESCE((skv.metadata->'classification'->>'confirmed')::boolean, true) AS skv_confirmed
    FROM agg a
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = a.kid
    LEFT JOIN seo.keyword kw ON kw.id = a.kid
    LEFT JOIN seo.site_keyword_value skv
      ON skv.keyword_id = a.kid AND skv.site_id = p_site_id AND skv.deleted_at IS NULL
    WHERE (p_classes IS NULL OR COALESCE(cm.traffic_class, 'unclassified') = ANY (p_classes))
      AND (p_sources IS NULL OR COALESCE(cm.class_source, 'none') = ANY (p_sources))
      AND (v_search IS NULL OR a.q ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%')
      AND (v_pattern IS NULL OR CASE p_match
            WHEN 'contains' THEN a.q ILIKE '%' || seo.gsc_perf_like_escape(v_pattern) || '%'
            WHEN 'exact' THEN lower(a.q) = v_pattern
            WHEN 'starts_with' THEN a.q ILIKE seo.gsc_perf_like_escape(v_pattern) || '%'
            WHEN 'ends_with' THEN a.q ILIKE '%' || seo.gsc_perf_like_escape(v_pattern)
            WHEN 'word' THEN v_pattern = ANY (string_to_array(lower(a.q), ' '))
          END)
      AND (p_confirmed IS NULL OR (
            skv.traffic_class IS NOT NULL
            AND COALESCE((skv.metadata->'classification'->>'confirmed')::boolean, true) = p_confirmed
          ))
  )
  SELECT c.kid,
         c.q,
         c.cls,
         c.src,
         c.s_clicks,
         c.s_imps,
         CASE WHEN c.s_imps > 0 THEN round(c.s_clicks::numeric / c.s_imps, 6) END,
         c.kw_intent,
         c.skv_class,
         c.skv_role,
         c.skv_service,
         c.skv_suppression,
         c.skv_lead,
         c.skv_notes,
         c.skv_origin,
         c.skv_confirmed,
         COUNT(*) OVER ()::bigint
  FROM classed c
  ORDER BY
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'desc' THEN c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'asc' THEN c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'desc' THEN c.s_clicks END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'asc' THEN c.s_clicks END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'desc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'asc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'desc' THEN c.q END) DESC,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'asc' THEN c.q END) ASC,
    c.s_imps DESC,
    c.kid ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_keyword_class_review(uuid, date, date, text[], text[], text, text, text, int, int, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_class_review(uuid, date, date, text[], text[], text, text, text, int, int, text, text, boolean) TO authenticated, service_role;


-- ── Write RPC: provenance params (appended with defaults) ─────────────────
DROP FUNCTION IF EXISTS seo.gsc_set_keyword_class(uuid, uuid[], text, text);

CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_class(
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_class text,
  p_notes text DEFAULT NULL,
  p_origin text DEFAULT 'manual',
  p_rule_id uuid DEFAULT NULL,
  p_confirmed boolean DEFAULT true
) RETURNS TABLE (keyword_id uuid, traffic_class text, class_source text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, web, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_notes text := NULLIF(btrim(p_notes), '');
  v_org uuid;
  v_uid uuid := (SELECT auth.uid());
  v_meta jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'clear') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_class;
  END IF;
  IF p_origin NOT IN ('manual', 'rule', 'import', 'ai') THEN
    RAISE EXCEPTION 'gsc_origin_unknown: %', p_origin;
  END IF;
  IF p_class = 'mismatch' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'gsc_mismatch_needs_notes: a mismatch ruling must carry its reasoning';
  END IF;
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords: pass at least one keyword id';
  END IF;
  IF array_length(p_keyword_ids, 1) > 1000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: max 1000 per call';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;
  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'origin', p_origin,
    'rule_id', p_rule_id,
    'confirmed', p_confirmed,
    'applied_at', now()
  ));

  IF p_class = 'clear' THEN
    UPDATE seo.site_keyword_value skv SET
      traffic_class = NULL,
      content_role = CASE WHEN skv.content_role IN ('money_page', 'supporting_content') THEN NULL ELSE skv.content_role END,
      service_match = CASE WHEN skv.service_match IN ('not_offered', 'actively_avoided') THEN NULL ELSE skv.service_match END,
      lead_quality = CASE WHEN skv.lead_quality = 'negative_value' THEN NULL ELSE skv.lead_quality END,
      suppression_reason = NULL,
      workflow_status = CASE WHEN skv.workflow_status = 'suppressed' THEN 'candidate' ELSE skv.workflow_status END,
      notes = COALESCE(v_notes, skv.notes),
      metadata = skv.metadata - 'classification',
      updated_at = now(),
      updated_by = v_uid,
      version = skv.version + 1
    WHERE skv.site_id = p_site_id
      AND skv.keyword_id = ANY (p_keyword_ids)
      AND skv.deleted_at IS NULL;
  ELSE
    INSERT INTO seo.site_keyword_value AS skv
      (organization_id, site_id, keyword_id, traffic_class, content_role,
       service_match, notes, metadata, created_by, updated_by)
    SELECT v_org, p_site_id, kw.id, p_class,
           CASE p_class WHEN 'money' THEN 'money_page'
                        WHEN 'educational' THEN 'supporting_content' END,
           CASE p_class WHEN 'mismatch' THEN 'not_offered' END,
           v_notes,
           jsonb_build_object('classification', v_meta),
           v_uid, v_uid
    FROM seo.keyword kw
    WHERE kw.id = ANY (p_keyword_ids) AND kw.deleted_at IS NULL
    ON CONFLICT (site_id, keyword_id) DO UPDATE SET
      traffic_class = EXCLUDED.traffic_class,
      content_role = CASE
        WHEN EXCLUDED.traffic_class IN ('money', 'educational') THEN EXCLUDED.content_role
        WHEN skv.content_role IN ('money_page', 'supporting_content') THEN NULL
        ELSE skv.content_role END,
      service_match = CASE
        WHEN EXCLUDED.traffic_class = 'mismatch' THEN 'not_offered'
        WHEN skv.service_match IN ('not_offered', 'actively_avoided') THEN NULL
        ELSE skv.service_match END,
      lead_quality = CASE
        WHEN EXCLUDED.traffic_class = 'mismatch' THEN skv.lead_quality
        WHEN skv.lead_quality = 'negative_value' THEN NULL
        ELSE skv.lead_quality END,
      suppression_reason = CASE
        WHEN EXCLUDED.traffic_class = 'mismatch' THEN skv.suppression_reason
        ELSE NULL END,
      workflow_status = CASE
        WHEN EXCLUDED.traffic_class <> 'mismatch' AND skv.workflow_status = 'suppressed'
        THEN 'candidate' ELSE skv.workflow_status END,
      notes = COALESCE(EXCLUDED.notes, skv.notes),
      metadata = skv.metadata || EXCLUDED.metadata,
      deleted_at = NULL,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by,
      version = skv.version + 1;
  END IF;

  IF p_rule_id IS NOT NULL THEN
    UPDATE seo.keyword_class_rule r SET last_applied_at = now()
    WHERE r.id = p_rule_id;
  END IF;

  RETURN QUERY
  SELECT cm.keyword_id, cm.traffic_class, cm.class_source
  FROM seo.gsc_keyword_class_map(p_site_id) cm
  WHERE cm.keyword_id = ANY (p_keyword_ids);
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_set_keyword_class(uuid, uuid[], text, text, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_class(uuid, uuid[], text, text, text, uuid, boolean) TO authenticated, service_role;


-- ── Confirm auto-applied rulings ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.gsc_confirm_keyword_class(
  p_site_id uuid,
  p_keyword_ids uuid[]
) RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $function$
DECLARE
  v_count int;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords: pass at least one keyword id';
  END IF;
  UPDATE seo.site_keyword_value skv
  SET metadata = jsonb_set(skv.metadata, '{classification,confirmed}', 'true'::jsonb),
      updated_at = now(),
      updated_by = (SELECT auth.uid()),
      version = skv.version + 1
  WHERE skv.site_id = p_site_id
    AND skv.keyword_id = ANY (p_keyword_ids)
    AND skv.deleted_at IS NULL
    AND skv.traffic_class IS NOT NULL
    AND COALESCE((skv.metadata->'classification'->>'confirmed')::boolean, true) = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_confirm_keyword_class(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_confirm_keyword_class(uuid, uuid[]) TO authenticated, service_role;


-- ── CSV / workbook import: dry-run diff, then apply through the ONE path ──
-- p_rows: [{"query": text, "class": text, "notes": text|null}, ...]
-- Dry run returns one row per input with status:
--   change | unchanged | cleared | unknown_keyword | invalid_class | missing_notes
-- Apply (p_dry_run=false) executes changes by calling gsc_set_keyword_class
-- per (class, notes) group — the mapping logic exists ONCE.
CREATE OR REPLACE FUNCTION seo.gsc_class_import(
  p_site_id uuid,
  p_rows jsonb,
  p_dry_run boolean DEFAULT true
) RETURNS TABLE (
  query text,
  keyword_id uuid,
  status text,
  current_class text,
  new_class text,
  notes text
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $function$
DECLARE
  v_group record;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'gsc_import_rows_invalid: rows must be a json array';
  END IF;
  IF jsonb_array_length(p_rows) > 20000 THEN
    RAISE EXCEPTION 'gsc_import_too_large: max 20000 rows per import';
  END IF;

  CREATE TEMP TABLE _import_rows ON COMMIT DROP AS
  WITH raw AS (
    SELECT lower(btrim(r->>'query')) AS q,
           lower(btrim(COALESCE(r->>'class', ''))) AS cls,
           NULLIF(btrim(r->>'notes'), '') AS row_notes
    FROM jsonb_array_elements(p_rows) r
    WHERE NULLIF(btrim(r->>'query'), '') IS NOT NULL
  ),
  matched AS (
    SELECT raw.q, raw.cls, raw.row_notes,
           kw.id AS kid,
           cm.traffic_class AS cur_cls
    FROM raw
    LEFT JOIN seo.keyword kw
      ON kw.normalized_phrase = raw.q AND kw.deleted_at IS NULL
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = kw.id
  )
  SELECT m.q, m.cls, m.row_notes, m.kid, COALESCE(m.cur_cls, 'unclassified') AS cur_cls,
         CASE
           WHEN m.kid IS NULL THEN 'unknown_keyword'
           WHEN m.cls NOT IN ('money', 'educational', 'brand', 'mismatch', 'clear', '') THEN 'invalid_class'
           WHEN m.cls = 'mismatch' AND m.row_notes IS NULL THEN 'missing_notes'
           WHEN m.cls = '' OR m.cls = COALESCE(m.cur_cls, 'unclassified') THEN 'unchanged'
           WHEN m.cls = 'clear' THEN 'cleared'
           ELSE 'change'
         END AS status
  FROM matched m;

  IF NOT p_dry_run THEN
    FOR v_group IN
      SELECT i.cls, i.row_notes, array_agg(i.kid) AS kids
      FROM _import_rows i
      WHERE i.status IN ('change', 'cleared')
      GROUP BY i.cls, i.row_notes
    LOOP
      PERFORM seo.gsc_set_keyword_class(
        p_site_id, v_group.kids, v_group.cls, v_group.row_notes,
        'import', NULL, true);
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT i.q, i.kid, i.status, i.cur_cls,
         NULLIF(i.cls, ''), i.row_notes
  FROM _import_rows i
  ORDER BY CASE i.status
             WHEN 'unknown_keyword' THEN 0
             WHEN 'invalid_class' THEN 1
             WHEN 'missing_notes' THEN 2
             WHEN 'change' THEN 3
             WHEN 'cleared' THEN 4
             ELSE 5 END,
           i.q;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_class_import(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_class_import(uuid, jsonb, boolean) TO authenticated, service_role;
