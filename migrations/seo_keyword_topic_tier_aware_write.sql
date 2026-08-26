-- KI-050 / P30: make seo.gsc_set_keyword_topic tier-aware.
--
-- The read side (seo.keyword_placement_resolve) and the per-tier uniqueness
-- indexes (uq_keyword_primary_site/_brand/_org/_system) already shipped and
-- support four coexisting opinions on one keyword (site > brand > org >
-- system, nearest wins). But nothing WRITES a lower rung: this RPC — the
-- keyword workbench's one placement write — still wrote a tier-less row, so
-- a human working a SITE could never actually create that site's own
-- override of a higher-tier default.
--
-- This migration:
--   1. Adds a partial unique index scoping (keyword_id, topic_id,
--      scope_site_id) to scope_tier='site' rows only, so the RPC's
--      ON CONFLICT arbiter can NEVER match a brand/organization/system row
--      for the same keyword+topic. The old table-wide
--      keyword_topic_keyword_id_topic_id_key constraint stays (gsc_topic_delete
--      still upserts through it when merging topics) — untouched, and out of
--      this migration's scope.
--   2. Rewrites seo.gsc_set_keyword_topic so a placement made while working a
--      site writes scope_tier='site' + scope_site_id=<site>, owned by the
--      site's organization; demotion (the "replace my own prior opinion"
--      step) is scoped to this site's own rows only, so a site placement
--      never demotes or mutates a brand/organization/system row. Signature,
--      return shape, and reason (P24) behavior are unchanged.

-- 1. Tier-scoped uniqueness for the write path's ON CONFLICT arbiter.
CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_topic_site_scope
  ON seo.keyword_topic (keyword_id, topic_id, scope_site_id)
  WHERE (scope_tier = 'site');

-- 2. Tier-aware placement write.
CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_topic(p_site_id uuid, p_keyword_ids uuid[], p_topic_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(keyword_id uuid, value_band text, value_source text, value_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
-- The OUT parameter `keyword_id` shadows the column in ON CONFLICT without
-- this — the same pragma gsc_set_keyword_value already carries.
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;
  -- The same ceiling `gsc_set_keyword_stamps` carries, said the same way.
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;

  IF p_topic_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_topic_id USING ERRCODE = 'P0002';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  -- P30: placing a keyword while working a SITE states THAT SITE's opinion.
  -- Demotion (freeing the one-primary-per-scope index before the insert
  -- below) is scoped to this site's own rows only — a site placement can
  -- never demote, and therefore never overwrite, a brand/organization/system
  -- row for the same keyword.
  UPDATE seo.keyword_topic kt
  SET is_primary = false, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE kt.keyword_id = ANY (p_keyword_ids) AND kt.is_primary
    AND kt.scope_tier = 'site' AND kt.scope_site_id = p_site_id
    AND (p_topic_id IS NULL OR kt.topic_id <> p_topic_id);

  IF p_topic_id IS NULL THEN
    RETURN QUERY
    SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
    FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
    RETURN;
  END IF;

  -- The ON CONFLICT arbiter is uq_keyword_topic_site_scope
  -- (keyword_id, topic_id, scope_site_id) WHERE scope_tier='site' — it can
  -- only ever match another scope_tier='site' row for THIS site, so this
  -- upsert can never touch a higher tier's row even when that tier chose the
  -- exact same topic for the exact same keyword.
  INSERT INTO seo.keyword_topic AS kt
    (organization_id, created_by, keyword_id, topic_id, is_primary, assigned_by,
     notes, scope_tier, scope_site_id)
  SELECT v_org, (SELECT auth.uid()), kid, p_topic_id, true, 'human',
         v_notes, 'site', p_site_id
  FROM unnest(p_keyword_ids) AS kid
  ON CONFLICT (keyword_id, topic_id, scope_site_id) WHERE (scope_tier = 'site')
  DO UPDATE SET
    is_primary = true,
    deleted_at = NULL,
    assigned_by = 'human',
    -- A new reason replaces the old one; placing again WITHOUT a reason never
    -- erases the sentence someone already wrote.
    notes = COALESCE(EXCLUDED.notes, kt.notes),
    updated_at = now(),
    updated_by = (SELECT auth.uid());

  RETURN QUERY
  SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
EXCEPTION
  WHEN unique_violation THEN
    -- The table-wide keyword_id+topic_id constraint (kept for
    -- gsc_topic_delete's cross-tier merge) is the only other unique key that
    -- could still fire here — only when a higher tier already claimed the
    -- exact same topic for this exact keyword. Fail loud rather than let the
    -- upsert silently mutate that tier's row.
    RAISE EXCEPTION 'seo_topic_tier_conflict: keyword % already carries topic % at another tier — place it under a different Offering, or edit that tier''s placement directly', p_keyword_ids, p_topic_id
      USING ERRCODE = '23505';
END;
$function$;
