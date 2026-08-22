-- ============================================================================
-- RETIRING A DIMENSION OR A VALUE  (D37 follow-up)
--
-- D37 made dimensions creatable and deliberately shipped no delete: a category
-- row can vanish, but the classifications naming it cannot, and a screen that
-- offers a delete which silently orphans 1,900 facts is worse than no delete.
-- This is the missing half, built the same way the band editor handles a
-- removed band: you are told what the removal costs, and where the orphans go
-- travels WITH the removal instead of being a second step you might not take.
--
-- The rules:
--   * You may never retire something still named by a value rule.  A rule
--     pointing at a dead dimension is a silent no-op, which is the exact
--     failure class this whole feature exists to prevent -- so it raises, and
--     names the rules.
--   * Facts are never orphaned.  Reassign them to a surviving value, or say
--     explicitly that they should be dropped.
--   * Platform dimensions: super admins.  Site dimensions: site access.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Retire ONE VALUE.  p_reassign_to = another value key on the same dimension
-- that inherits its facts; NULL means drop them (and you must say so).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.facet_value_archive(
  p_dimension    text,
  p_value        text,
  p_reassign_to  text DEFAULT NULL,
  p_drop_facts   boolean DEFAULT false,
  p_site_id      uuid DEFAULT NULL
) RETURNS TABLE (facts_moved bigint, facts_dropped bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_dim record;
  v_val_id uuid;
  v_target_id uuid;
  v_facts bigint;
  v_rules text;
  v_moved bigint := 0;
  v_dropped bigint := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;

  SELECT c.id AS id, COALESCE(c.metadata->>'scope','platform') AS scope,
         (c.metadata->>'site_id')::uuid AS site_id, c.name AS name
    INTO v_dim
  FROM platform.categories c
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
    AND c.slug = p_dimension AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_unknown_facet: there is no dimension named "%"', p_dimension;
  END IF;

  IF v_dim.scope = 'platform' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" is a platform dimension — its values are shared by every site. Only super admins retire them.', p_dimension;
    END IF;
  ELSE
    IF p_site_id IS DISTINCT FROM v_dim.site_id THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" belongs to another site', p_dimension;
    END IF;
    PERFORM seo.gsc_assert_site_access(p_site_id);
  END IF;

  SELECT c.id INTO v_val_id FROM platform.categories c
   WHERE c.parent_id = v_dim.id AND c.deleted_at IS NULL
     AND c.slug = p_dimension || ':' || p_value;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_unknown_value: "%" is not a value of "%"', p_value, p_dimension;
  END IF;

  -- A rule naming it must be dealt with FIRST, by a person.
  SELECT string_agg(r.name, ', ' ORDER BY r.name) INTO v_rules
  FROM seo.keyword_class_rule r
  WHERE r.deleted_at IS NULL AND r.match_facet = p_dimension
    AND r.match_facet_value = p_value;
  IF v_rules IS NOT NULL THEN
    RAISE EXCEPTION 'seo_registry_value_in_use: these rules still read "% = %": %. Point them somewhere else before retiring it — a rule on a retired value stops doing anything and says nothing.',
      p_dimension, p_value, v_rules;
  END IF;

  SELECT count(*) INTO v_facts FROM seo.keyword_facet kf
   WHERE kf.category_id = v_val_id AND kf.deleted_at IS NULL;

  IF p_reassign_to IS NOT NULL THEN
    SELECT c.id INTO v_target_id FROM platform.categories c
     WHERE c.parent_id = v_dim.id AND c.deleted_at IS NULL
       AND c.slug = p_dimension || ':' || p_reassign_to;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_registry_unknown_value: "%" is not a value of "%", so nothing can move there', p_reassign_to, p_dimension;
    END IF;
    IF v_target_id = v_val_id THEN
      RAISE EXCEPTION 'seo_registry_bad_reassign: "%" cannot inherit from itself', p_value;
    END IF;
    -- Move only where the keyword does not already hold the target value;
    -- the rest are redundant and are retired instead. Either way nothing is
    -- orphaned and the unique index is never violated.
    WITH moved AS (
      UPDATE seo.keyword_facet kf
         SET category_id = v_target_id, updated_by = v_uid, updated_at = now()
       WHERE kf.category_id = v_val_id AND kf.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM seo.keyword_facet e
                          WHERE e.keyword_id = kf.keyword_id
                            AND e.category_id = v_target_id AND e.deleted_at IS NULL)
      RETURNING 1)
    SELECT count(*) INTO v_moved FROM moved;
    WITH dropped AS (
      UPDATE seo.keyword_facet kf
         SET deleted_at = now(), updated_by = v_uid, updated_at = now()
       WHERE kf.category_id = v_val_id AND kf.deleted_at IS NULL
      RETURNING 1)
    SELECT count(*) INTO v_dropped FROM dropped;
  ELSIF v_facts > 0 THEN
    IF NOT p_drop_facts THEN
      RAISE EXCEPTION 'seo_registry_value_carries_facts: % keywords are marked "% = %". Choose a value they move to, or confirm that these answers should be dropped.',
        v_facts, p_dimension, p_value;
    END IF;
    WITH dropped AS (
      UPDATE seo.keyword_facet kf
         SET deleted_at = now(), updated_by = v_uid, updated_at = now()
       WHERE kf.category_id = v_val_id AND kf.deleted_at IS NULL
      RETURNING 1)
    SELECT count(*) INTO v_dropped FROM dropped;
  END IF;

  UPDATE platform.categories
     SET deleted_at = now(), updated_by = v_uid, updated_at = now()
   WHERE id = v_val_id;

  RETURN QUERY SELECT v_moved, v_dropped;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Retire a WHOLE DIMENSION.  Refuses while any rule reads it; otherwise
-- retires every value (dropping their facts, which p_drop_facts must confirm)
-- and then the dimension itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.facet_dimension_archive(
  p_dimension  text,
  p_drop_facts boolean DEFAULT false,
  p_site_id    uuid DEFAULT NULL
) RETURNS TABLE (values_retired bigint, facts_dropped bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_dim record;
  v_rules text;
  v_facts bigint;
  v_vals bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;

  SELECT c.id AS id, COALESCE(c.metadata->>'scope','platform') AS scope,
         (c.metadata->>'site_id')::uuid AS site_id, c.name AS name
    INTO v_dim
  FROM platform.categories c
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
    AND c.slug = p_dimension AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_unknown_facet: there is no dimension named "%"', p_dimension;
  END IF;

  IF v_dim.scope = 'platform' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" is a platform dimension — every site depends on it. Only super admins retire it.', p_dimension;
    END IF;
  ELSE
    IF p_site_id IS DISTINCT FROM v_dim.site_id THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" belongs to another site', p_dimension;
    END IF;
    PERFORM seo.gsc_assert_site_access(p_site_id);
  END IF;

  SELECT string_agg(r.name, ', ' ORDER BY r.name) INTO v_rules
  FROM seo.keyword_class_rule r
  WHERE r.deleted_at IS NULL AND r.match_facet = p_dimension;
  IF v_rules IS NOT NULL THEN
    RAISE EXCEPTION 'seo_registry_dimension_in_use: these rules still read "%": %. Point them somewhere else first — a rule on a retired dimension stops doing anything and says nothing.',
      p_dimension, v_rules;
  END IF;

  SELECT count(*) INTO v_facts
  FROM seo.keyword_facet kf
  JOIN platform.categories v ON v.id = kf.category_id AND v.parent_id = v_dim.id
  WHERE kf.deleted_at IS NULL;

  IF v_facts > 0 AND NOT p_drop_facts THEN
    RAISE EXCEPTION 'seo_registry_dimension_carries_facts: % keywords have an answer on "%". Confirm that retiring it drops those answers.',
      v_facts, p_dimension;
  END IF;

  WITH dropped AS (
    UPDATE seo.keyword_facet kf
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE kf.deleted_at IS NULL
       AND kf.category_id IN (SELECT v.id FROM platform.categories v
                               WHERE v.parent_id = v_dim.id AND v.deleted_at IS NULL)
    RETURNING 1)
  SELECT count(*) INTO v_facts FROM dropped;

  WITH retired AS (
    UPDATE platform.categories
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE parent_id = v_dim.id AND deleted_at IS NULL
    RETURNING 1)
  SELECT count(*) INTO v_vals FROM retired;

  UPDATE platform.categories
     SET deleted_at = now(), updated_by = v_uid, updated_at = now()
   WHERE id = v_dim.id;

  RETURN QUERY SELECT v_vals, v_facts;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.facet_value_archive(text,text,text,boolean,uuid) FROM public, anon;
REVOKE ALL ON FUNCTION seo.facet_dimension_archive(text,boolean,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION seo.facet_value_archive(text,text,text,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.facet_dimension_archive(text,boolean,uuid) TO authenticated;
