-- Topic Tree Builder — parent-child ancestor pinning + per-topic worth.
--
-- WHY: `seo.keyword_value_map` already walks a keyword's PRIMARY topic upward
-- and takes `COALESCE(stv.weight, 50)` from the nearest ancestor carrying a
-- `seo.site_topic_value` row, reporting the topmost ancestor's `node_type` as
-- the keyword's `root`. Everything the resolver needs was in the DB; there was
-- no way for a human to BUILD that tree, pin a parent, value a node, or link a
-- keyword to one. This migration is that write surface plus the two reads that
-- make the tree pay off.
--
-- 🚨 THE 8s LAW (see the header of seo_keyword_value_map_windowed.sql): the
-- authenticated role dies at 8s and anything that scans the keyword corpus has
-- already been killed by it once on this exact feature. Both reads here are
-- SECURITY DEFINER + seo.gsc_assert_site_access, and both hand
-- keyword_value_map only the keyword ids they are about to report on — never
-- the corpus.
--
-- Authorization anchor: seo.topic is a GLOBAL, shared tree (no site_id), but a
-- person only reaches it through a site they can edit, so every write asserts
-- seo.gsc_assert_site_editor(site). Worth (`seo.site_topic_value`) is per-site
-- by construction.
--
-- Idempotent. No DDL on tables — `topic_node_type_check` was verified live on
-- 2026-08-21 to already accept all ten root types (service, product, problem,
-- audience, brand, authority, existing_customer, recruiting, reputation,
-- partner), so no CHECK needed widening.

-- ───────────────────────────────────────────────────────────── READS ──

-- Per-topic payoff: how many of this site's keywords resolve through each
-- topic (by their PRIMARY link) and which bands they land in. Rows are
-- (topic_id, value_band) pairs; the caller rolls them up the tree.
DROP FUNCTION IF EXISTS seo.gsc_topic_stats(uuid, date, date);
CREATE FUNCTION seo.gsc_topic_stats(
  p_site_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE (
  topic_id uuid,
  value_band text,
  keywords bigint,
  clicks bigint,
  impressions bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH site_kw AS MATERIALIZED (
    SELECT DISTINCT spd.keyword_id AS kw_id
    FROM seo.search_performance_daily spd
    WHERE spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
  ),
  win AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    WHERE spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
      AND spd.date BETWEEN p_start AND p_end
    GROUP BY 1
  ),
  linked AS MATERIALIZED (
    SELECT sk.kw_id, kt.topic_id AS tid,
           COALESCE(w.clicks, 0) AS clicks,
           COALESCE(w.impressions, 0) AS impressions
    FROM site_kw sk
    JOIN seo.keyword_topic kt
      ON kt.keyword_id = sk.kw_id AND kt.is_primary AND kt.deleted_at IS NULL
    LEFT JOIN win w ON w.kw_id = sk.kw_id
  ),
  -- THE SCOPE RULE: only the topic-linked keywords, never the corpus.
  vm AS MATERIALIZED (
    SELECT m.keyword_id AS kw_id, m.value_band AS band
    FROM seo.keyword_value_map(
           p_site_id,
           (SELECT array_agg(DISTINCT l.kw_id) FROM linked l)
         ) m
  )
  SELECT l.tid,
         COALESCE(vm.band, 'unvalued'),
         count(*)::bigint,
         sum(l.clicks)::bigint,
         sum(l.impressions)::bigint
  FROM linked l
  LEFT JOIN vm ON vm.kw_id = l.kw_id
  GROUP BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION seo.gsc_topic_stats(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_stats(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION seo.gsc_topic_stats(uuid, date, date) IS
  'Per-topic × value-band decomposition of a site''s keywords, by PRIMARY topic link. Window drives clicks/impressions only; a linked keyword with no traffic in the window still counts. SECURITY DEFINER + gsc_assert_site_access.';


-- THE HEADLINE Arman asked the tree for: how much of this site''s search
-- traffic traces up to something it actually SELLS, versus traffic that can
-- only ever build authority, versus traffic no one has placed yet.
--
-- Bucketing is the root `node_type` of the keyword''s primary-topic lineage —
-- the same walk keyword_value_map does, so the split can never disagree with
-- the band a keyword renders with.
DROP FUNCTION IF EXISTS seo.gsc_topic_offering_split(uuid, date, date);
CREATE FUNCTION seo.gsc_topic_offering_split(
  p_site_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE (
  bucket text,
  root_type text,
  keywords bigint,
  clicks bigint,
  impressions bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH RECURSIVE
  win AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    WHERE spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
      AND spd.date BETWEEN p_start AND p_end
    GROUP BY 1
  ),
  lineage AS (
    SELECT w.kw_id, kt.topic_id AS tid, 0 AS depth
    FROM win w
    JOIN seo.keyword_topic kt
      ON kt.keyword_id = w.kw_id AND kt.is_primary AND kt.deleted_at IS NULL
    UNION ALL
    SELECT l.kw_id, t.parent_id, l.depth + 1
    FROM lineage l
    JOIN seo.topic t ON t.id = l.tid AND t.deleted_at IS NULL
    WHERE t.parent_id IS NOT NULL AND l.depth < 12
  ),
  roots AS (
    SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type
    FROM lineage l
    JOIN seo.topic t ON t.id = l.tid
    WHERE t.parent_id IS NULL
    ORDER BY l.kw_id, l.depth DESC
  )
  SELECT CASE
           WHEN r.node_type IS NULL THEN 'unassigned'
           WHEN r.node_type IN ('service', 'product', 'problem', 'audience', 'brand')
             THEN 'offering'
           ELSE 'authority'
         END AS bucket,
         COALESCE(r.node_type, 'none') AS root_type,
         count(*)::bigint,
         sum(w.clicks)::bigint,
         sum(w.impressions)::bigint
  FROM win w
  LEFT JOIN roots r ON r.kw_id = w.kw_id
  GROUP BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION seo.gsc_topic_offering_split(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_offering_split(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION seo.gsc_topic_offering_split(uuid, date, date) IS
  'The headline read: a site''s windowed GSC traffic split into offering-rooted (can become money), authority-rooted (can only build authority), and unassigned (no primary topic yet). SECURITY DEFINER + gsc_assert_site_access.';


-- ──────────────────────────────────────────────────────────── WRITES ──

-- THE PINNING. NULL parent makes the topic a root. Guards against cycles in
-- both directions and refuses a self-parent.
DROP FUNCTION IF EXISTS seo.gsc_topic_set_parent(uuid, uuid, uuid);
CREATE FUNCTION seo.gsc_topic_set_parent(
  p_site_id uuid,
  p_topic_id uuid,
  p_parent_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
DECLARE
  v_name text;
  v_parent_name text;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT t.name INTO v_name FROM seo.topic t
  WHERE t.id = p_topic_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_topic_id USING ERRCODE = 'P0002';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    IF p_parent_id = p_topic_id THEN
      RAISE EXCEPTION 'seo_topic_cycle: "%" cannot be its own parent', v_name;
    END IF;

    SELECT t.name INTO v_parent_name FROM seo.topic t
    WHERE t.id = p_parent_id AND t.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_parent_id USING ERRCODE = 'P0002';
    END IF;

    -- Walking UP from the proposed parent must never reach this topic.
    IF EXISTS (
      WITH RECURSIVE up AS (
        SELECT t.id, t.parent_id, 0 AS depth
        FROM seo.topic t WHERE t.id = p_parent_id
        UNION ALL
        SELECT t.id, t.parent_id, up.depth + 1
        FROM seo.topic t JOIN up ON t.id = up.parent_id
        WHERE up.depth < 24
      )
      SELECT 1 FROM up WHERE up.id = p_topic_id
    ) THEN
      RAISE EXCEPTION
        'seo_topic_cycle: "%" already sits under "%" — pinning it as the parent would make a loop',
        v_parent_name, v_name;
    END IF;
  END IF;

  UPDATE seo.topic
  SET parent_id = p_parent_id, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE id = p_topic_id;

  RETURN p_topic_id;
END;
$$;

REVOKE ALL ON FUNCTION seo.gsc_topic_set_parent(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_set_parent(uuid, uuid, uuid) TO authenticated;


-- Create a topic, or rename / retype / redescribe one. Parent is NOT set here
-- on update — pinning is its own named act (gsc_topic_set_parent); on create
-- the parent travels with the new node so it never flashes as a root.
DROP FUNCTION IF EXISTS seo.gsc_topic_save(uuid, uuid, text, text, text, uuid, boolean);
CREATE FUNCTION seo.gsc_topic_save(
  p_site_id uuid,
  p_topic_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_node_type text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_slug text;
  v_base text;
  v_n int := 1;
  v_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  IF p_topic_id IS NULL THEN
    IF v_name = '' THEN
      RAISE EXCEPTION 'seo_topic_name_required: a topic needs a name';
    END IF;
    IF p_node_type IS NULL THEN
      RAISE EXCEPTION 'seo_topic_type_required: choose what this topic is — that is what decides whether its traffic can ever become money';
    END IF;

    v_base := regexp_replace(
      regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)',
      '',
      'g'
    );
    IF v_base = '' THEN v_base := 'topic'; END IF;
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM seo.topic t WHERE t.slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;

    INSERT INTO seo.topic
      (organization_id, created_by, name, slug, node_type, description, is_builtin, metadata)
    VALUES
      (v_org, (SELECT auth.uid()), v_name, v_slug, p_node_type,
       NULLIF(btrim(COALESCE(p_description, '')), ''), false,
       jsonb_build_object('authored', jsonb_build_object(
         'origin', 'human', 'surface', 'topic-tree-builder', 'site_id', p_site_id,
         'created_at', now())))
    RETURNING id INTO v_id;

    IF p_parent_id IS NOT NULL THEN
      PERFORM seo.gsc_topic_set_parent(p_site_id, v_id, p_parent_id);
    END IF;
    RETURN v_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_topic_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE seo.topic t
  SET name = CASE WHEN v_name <> '' THEN v_name ELSE t.name END,
      node_type = COALESCE(p_node_type, t.node_type),
      description = CASE
        WHEN p_description IS NULL THEN t.description
        ELSE NULLIF(btrim(p_description), '') END,
      updated_at = now(),
      updated_by = (SELECT auth.uid())
  WHERE t.id = p_topic_id;

  RETURN p_topic_id;
END;
$$;

REVOKE ALL ON FUNCTION seo.gsc_topic_save(uuid, uuid, text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_save(uuid, uuid, text, text, text, uuid) TO authenticated;


-- Per-site worth for one topic. p_clear removes the site's ruling entirely,
-- which is NOT the same as weight 0 — it hands the node back to whatever its
-- nearest valued ancestor says.
DROP FUNCTION IF EXISTS seo.gsc_set_topic_value(uuid, uuid, numeric, text, text, text, boolean);
CREATE FUNCTION seo.gsc_set_topic_value(
  p_site_id uuid,
  p_topic_id uuid,
  p_weight numeric DEFAULT NULL,
  p_lead_quality text DEFAULT NULL,
  p_service_match text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_clear boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF NOT EXISTS (SELECT 1 FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_topic_id USING ERRCODE = 'P0002';
  END IF;

  IF p_clear THEN
    UPDATE seo.site_topic_value
    SET deleted_at = now(), updated_at = now(), updated_by = (SELECT auth.uid())
    WHERE site_id = p_site_id AND topic_id = p_topic_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  IF p_weight IS NOT NULL AND (p_weight < 0 OR p_weight > 100) THEN
    RAISE EXCEPTION 'seo_topic_weight_range: worth is 0–100, got %', p_weight;
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  INSERT INTO seo.site_topic_value AS stv
    (organization_id, created_by, site_id, topic_id, weight, lead_quality, service_match, notes)
  VALUES
    (v_org, (SELECT auth.uid()), p_site_id, p_topic_id, p_weight,
     p_lead_quality, p_service_match, NULLIF(btrim(COALESCE(p_notes, '')), ''))
  ON CONFLICT (site_id, topic_id) DO UPDATE SET
    weight = EXCLUDED.weight,
    lead_quality = EXCLUDED.lead_quality,
    service_match = EXCLUDED.service_match,
    notes = EXCLUDED.notes,
    deleted_at = NULL,
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  RETURNING stv.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION seo.gsc_set_topic_value(uuid, uuid, numeric, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_set_topic_value(uuid, uuid, numeric, text, text, text, boolean) TO authenticated;


-- Pin a keyword to the tree: set (or clear) its PRIMARY topic. Returns the
-- band each keyword lands in AFTER the change, so the payoff is the response,
-- not a second round trip. Mirrors gsc_set_keyword_value's shape.
DROP FUNCTION IF EXISTS seo.gsc_set_keyword_topic(uuid, uuid[], uuid);
CREATE FUNCTION seo.gsc_set_keyword_topic(
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_topic_id uuid DEFAULT NULL
)
RETURNS TABLE (keyword_id uuid, value_band text, value_source text, value_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
DECLARE
  v_org uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;

  IF p_topic_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_topic_id USING ERRCODE = 'P0002';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  -- Demote whatever was primary; the partial unique index allows exactly one.
  UPDATE seo.keyword_topic kt
  SET is_primary = false, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE kt.keyword_id = ANY (p_keyword_ids) AND kt.is_primary
    AND (p_topic_id IS NULL OR kt.topic_id <> p_topic_id);

  IF p_topic_id IS NULL THEN
    RETURN QUERY
    SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
    FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
    RETURN;
  END IF;

  INSERT INTO seo.keyword_topic AS kt
    (organization_id, created_by, keyword_id, topic_id, is_primary, assigned_by)
  SELECT v_org, (SELECT auth.uid()), kid, p_topic_id, true, 'human'
  FROM unnest(p_keyword_ids) AS kid
  ON CONFLICT (keyword_id, topic_id) DO UPDATE SET
    is_primary = true,
    deleted_at = NULL,
    assigned_by = 'human',
    updated_at = now(),
    updated_by = (SELECT auth.uid());

  RETURN QUERY
  SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
END;
$$;

REVOKE ALL ON FUNCTION seo.gsc_set_keyword_topic(uuid, uuid[], uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_topic(uuid, uuid[], uuid) TO authenticated;


-- The unplaced work queue: this site's windowed keywords with NO primary
-- topic, demand-ordered. This is what the tree is missing, in the order that
-- placing it pays.
DROP FUNCTION IF EXISTS seo.gsc_topic_unassigned_keywords(uuid, date, date, text, integer, integer);
CREATE FUNCTION seo.gsc_topic_unassigned_keywords(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  keyword_id uuid,
  phrase text,
  clicks bigint,
  impressions bigint,
  value_band text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH win AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    WHERE spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
      AND spd.date BETWEEN p_start AND p_end
    GROUP BY 1
  ),
  unplaced AS MATERIALIZED (
    SELECT w.kw_id, k.normalized_phrase AS phrase, w.clicks, w.impressions
    FROM win w
    JOIN seo.keyword k ON k.id = w.kw_id AND k.deleted_at IS NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM seo.keyword_topic kt
      WHERE kt.keyword_id = w.kw_id AND kt.is_primary AND kt.deleted_at IS NULL)
      AND (p_search IS NULL OR btrim(p_search) = ''
           OR k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(btrim(p_search))) || '%')
  ),
  page AS MATERIALIZED (
    SELECT u.* FROM unplaced u
    ORDER BY u.clicks DESC, u.impressions DESC, u.phrase
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  ),
  -- THE SCOPE RULE: only the page being rendered.
  vm AS MATERIALIZED (
    SELECT m.keyword_id AS kw_id, m.value_band AS band
    FROM seo.keyword_value_map(p_site_id, (SELECT array_agg(pg.kw_id) FROM page pg)) m
  )
  SELECT p.kw_id, p.phrase, p.clicks, p.impressions,
         COALESCE(vm.band, 'unvalued'),
         (SELECT count(*) FROM unplaced)::bigint
  FROM page p
  LEFT JOIN vm ON vm.kw_id = p.kw_id
  ORDER BY p.clicks DESC, p.impressions DESC, p.phrase;
END;
$$;

REVOKE ALL ON FUNCTION seo.gsc_topic_unassigned_keywords(uuid, date, date, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_unassigned_keywords(uuid, date, date, text, integer, integer) TO authenticated;
