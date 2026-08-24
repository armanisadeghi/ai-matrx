-- DELETING A THING REMOVES WHAT IT WAS KEEPING — in the same operation.
--
-- ARMAN'S RULING (2026-08-24): *"when I delete the matcher, the matches for it
-- are not getting removed so they remain — but if that was the only thing
-- keeping them, then it should have automatically removed them… Make sure you
-- can delete the entire thing and for everything delete by default = remove
-- matches (One thing)."*
--
-- This OVERRULES the prior design recorded in `DimensionCard.tsx` ("there is no
-- delete… a row can disappear, the classifications that name it cannot").
-- That reasoning was sound about ORPHANING and wrong about the remedy: the
-- answer to "a delete would leave stamps behind" is to take the stamps with it,
-- not to withhold the button. What survives from the old rule is the honesty
-- requirement — every delete states its blast radius in counts before it runs,
-- and the UI shows those counts in the confirm.
--
-- THE ENGINE STAYS THE ONE AUTHORITY. Nothing here re-implements "what should
-- be stamped". Each delete removes its own row, then re-derives the affected
-- keywords through `seo.fn_evaluate_matchers_internal` — so a stamp another
-- live matcher still produces SURVIVES, and only what the deleted thing alone
-- was keeping goes. A second copy of that logic is how the two would drift.

-- ── 1. A matcher takes its own stamps with it ──────────────────────────────
-- Was: soft-delete the row and return true, leaving every keyword it had
-- stamped wearing an answer whose only reason no longer existed — visible
-- nowhere, and corrected only if someone happened to press "Run matchers now".
DROP FUNCTION IF EXISTS seo.dimension_matcher_delete(uuid);

CREATE FUNCTION seo.dimension_matcher_delete(p_matcher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_site  uuid;
  v_kw    uuid[];
  v_eval  jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_matcher_unauthenticated';
  END IF;

  SELECT m.site_id INTO v_site FROM seo.dimension_value_matcher m
   WHERE m.id = p_matcher_id AND m.deleted_at IS NULL;
  IF v_site IS NULL THEN
    RETURN jsonb_build_object('deleted', false, 'keywords_touched', 0, 'answers_removed', 0);
  END IF;
  PERFORM seo.gsc_assert_site_editor(v_site);

  -- Read the reach BEFORE the delete: after it, nothing on the stamp says
  -- which matcher put it there that is still worth trusting.
  SELECT COALESCE(array_agg(DISTINCT kf.keyword_id), '{}'::uuid[]) INTO v_kw
    FROM seo.keyword_facet kf
   WHERE kf.matcher_id = p_matcher_id AND kf.deleted_at IS NULL;

  UPDATE seo.dimension_value_matcher m
     SET deleted_at = now(), updated_by = v_uid, updated_at = now()
   WHERE m.id = p_matcher_id AND m.deleted_at IS NULL;

  IF COALESCE(array_length(v_kw, 1), 0) > 0 THEN
    -- Scoped to the touched keywords, not the whole site: a delete must not
    -- quietly re-stamp 8,000 unrelated rows as a side effect.
    v_eval := seo.fn_evaluate_matchers_internal(v_site, v_kw);
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'keywords_touched', COALESCE(array_length(v_kw, 1), 0),
    'answers_removed', COALESCE((v_eval->>'removed')::int, 0),
    'answers_restamped', COALESCE((v_eval->>'stamped')::int, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION seo.dimension_matcher_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.dimension_matcher_delete(uuid) TO authenticated, service_role;

-- ── 2. An ANSWER can be deleted at all — and takes its matchers and stamps ──
-- There was no value-level delete anywhere in the system. A site could add a
-- qualifier and never remove it.
CREATE OR REPLACE FUNCTION seo.facet_value_archive(
  p_value_id uuid,
  p_site_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_val       record;
  v_scope     text;
  v_dim_site  uuid;
  v_siblings  bigint;
  v_matchers  bigint := 0;
  v_facts     bigint := 0;
  v_kw        uuid[];
  v_eval      jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;

  SELECT cv.id, cv.name, cv.parent_id AS dim_id, cd.name AS dim_name, cd.slug AS dim_slug,
         COALESCE(cv.metadata->>'abstain','false') = 'true' AS abstain,
         COALESCE(cd.metadata->>'scope','platform') AS scope,
         (cd.metadata->>'site_id')::uuid AS dim_site
    INTO v_val
  FROM platform.categories cv
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  WHERE cv.id = p_value_id AND cv.deleted_at IS NULL AND cd.dimension = 'seo_facet';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_unknown_value: that answer does not exist, or it was already removed.';
  END IF;
  v_scope := v_val.scope;
  v_dim_site := v_val.dim_site;

  IF v_scope = 'platform' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" belongs to the shared vocabulary every site uses. Only a super admin can retire it.', v_val.name;
    END IF;
  ELSE
    IF p_site_id IS DISTINCT FROM v_dim_site THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" belongs to another site', v_val.name;
    END IF;
    PERFORM seo.gsc_assert_site_editor(p_site_id);
  END IF;

  -- THE HONEST-DECLINE OPTION IS NOT DELETABLE. It is what the AI picks
  -- instead of guessing; removing it forces a guess on every unclear phrase.
  IF v_val.abstain THEN
    RAISE EXCEPTION 'seo_registry_abstain_protected: "%" is the "not clear" option on %. It is what the AI picks instead of guessing — retire the whole dimension if you no longer want it asked.',
      v_val.name, v_val.dim_name;
  END IF;

  SELECT count(*) INTO v_siblings
  FROM platform.categories v
  WHERE v.parent_id = v_val.dim_id AND v.deleted_at IS NULL AND v.id <> p_value_id
    AND COALESCE(v.metadata->>'abstain','false') <> 'true';
  IF v_siblings = 0 THEN
    RAISE EXCEPTION 'seo_registry_last_value: "%" is the only real answer left on %. A question with no answers cannot be asked — retire the dimension instead.',
      v_val.name, v_val.dim_name;
  END IF;

  -- Everything this answer was holding, before it goes.
  SELECT COALESCE(array_agg(DISTINCT kf.keyword_id), '{}'::uuid[]) INTO v_kw
    FROM seo.keyword_facet kf
   WHERE kf.category_id = p_value_id AND kf.deleted_at IS NULL
     AND (p_site_id IS NULL OR kf.site_id = p_site_id OR kf.site_id IS NULL);

  WITH dropped_m AS (
    UPDATE seo.dimension_value_matcher dm
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE dm.value_id = p_value_id AND dm.deleted_at IS NULL
       AND (p_site_id IS NULL OR dm.site_id = p_site_id)
    RETURNING 1)
  SELECT count(*) INTO v_matchers FROM dropped_m;

  WITH dropped_f AS (
    UPDATE seo.keyword_facet kf
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE kf.category_id = p_value_id AND kf.deleted_at IS NULL
       AND (p_site_id IS NULL OR kf.site_id = p_site_id OR kf.site_id IS NULL)
    RETURNING 1)
  SELECT count(*) INTO v_facts FROM dropped_f;

  UPDATE platform.categories
     SET deleted_at = now(), updated_by = v_uid, updated_at = now()
   WHERE id = p_value_id;

  -- Re-derive the touched keywords: on a single-answer dimension, a keyword
  -- that was only wearing THIS answer because it outranked another matcher is
  -- now free to take that other answer. Leaving it blank would be a second,
  -- quieter wrong.
  IF p_site_id IS NOT NULL AND COALESCE(array_length(v_kw, 1), 0) > 0 THEN
    v_eval := seo.fn_evaluate_matchers_internal(p_site_id, v_kw);
  END IF;

  RETURN jsonb_build_object(
    'archived', true,
    'value', v_val.name,
    'dimension', v_val.dim_name,
    'matchers_removed', v_matchers,
    'answers_removed', v_facts,
    'keywords_touched', COALESCE(array_length(v_kw, 1), 0),
    'answers_restamped', COALESCE((v_eval->>'stamped')::int, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION seo.facet_value_archive(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.facet_value_archive(uuid, uuid) TO authenticated;

-- ── 3. Retiring a DIMENSION takes its matchers too ─────────────────────────
-- It already dropped the values and the stamps; it left every matcher pointing
-- at those values alive and un-runnable — rows the engine would skip forever
-- and no screen would ever show again.
DROP FUNCTION IF EXISTS seo.facet_dimension_archive(text, boolean, uuid);

CREATE FUNCTION seo.facet_dimension_archive(
  p_dimension  text,
  p_drop_facts boolean DEFAULT true,
  p_site_id    uuid DEFAULT NULL
)
RETURNS TABLE(values_retired bigint, facts_dropped bigint, matchers_removed bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_dim record;
  v_rules text;
  v_facts bigint;
  v_vals bigint;
  v_matchers bigint;
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

  -- `p_drop_facts` now DEFAULTS TRUE (Arman 2026-08-24: delete = remove
  -- matches, one thing). Passing false explicitly still turns the count into a
  -- refusal, which is what a caller wanting a dry run should do.
  IF v_facts > 0 AND NOT p_drop_facts THEN
    RAISE EXCEPTION 'seo_registry_dimension_carries_facts: % keywords have an answer on "%". Confirm that retiring it drops those answers.',
      v_facts, p_dimension;
  END IF;

  WITH dropped_m AS (
    UPDATE seo.dimension_value_matcher dm
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE dm.deleted_at IS NULL
       AND dm.value_id IN (SELECT v.id FROM platform.categories v
                            WHERE v.parent_id = v_dim.id AND v.deleted_at IS NULL)
    RETURNING 1)
  SELECT count(*) INTO v_matchers FROM dropped_m;

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

  RETURN QUERY SELECT v_vals, v_facts, v_matchers;
END;
$function$;

REVOKE ALL ON FUNCTION seo.facet_dimension_archive(text, boolean, uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.facet_dimension_archive(text, boolean, uuid) TO authenticated;
