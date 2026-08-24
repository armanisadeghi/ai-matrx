-- CORRECTION to `seo_delete_removes_its_matches.sql`, same session.
--
-- That migration added a NEW `seo.facet_value_archive(uuid, uuid)` without
-- finding the `seo.facet_value_archive(text, text, text, boolean, uuid)` that
-- already existed — leaving two functions with one name, which is the
-- duplication this codebase forbids and an overload-resolution trap besides.
-- The pre-existing one is also the better function: it refuses while a rule
-- still reads the value, and it can REASSIGN the answers to another value
-- instead of only dropping them.
--
-- So: the overload is dropped, and the real one gains the three things Arman's
-- ruling requires (2026-08-24, *"delete by default = remove matches (One
-- thing)"*).
--
--  1. IT TAKES ITS MATCHERS. Retiring an answer left every matcher pointing at
--     it alive — rows the engine skips forever (it joins live categories) and
--     no screen ever shows again, because the value they hang on is gone.
--  2. `p_drop_facts` DEFAULTS TRUE. The confirm belongs in the UI, stating the
--     count, not in a second call the user has to discover. Passing false is
--     still how a caller asks for a dry-run refusal.
--  3. IT RE-DERIVES THE TOUCHED KEYWORDS through `fn_evaluate_matchers_internal`
--     — the ONE engine. On a single-answer dimension a keyword that wore this
--     value only because it outranked another matcher is now free to take that
--     other answer; leaving it blank would be a second, quieter wrong.
--
-- Also protects the honest-decline ("not clear") option from deletion, which is
-- what the value's own description already promises the reader: *"The AI picks
-- this instead of guessing — never delete it."*

DROP FUNCTION IF EXISTS seo.facet_value_archive(uuid, uuid);
-- The return type gains `matchers_removed`, so the old body cannot be replaced
-- in place. It has exactly zero frontend callers today (the delete UI is what
-- this session is building), so dropping it costs nothing.
DROP FUNCTION IF EXISTS seo.facet_value_archive(text, text, text, boolean, uuid);

CREATE FUNCTION seo.facet_value_archive(
  p_dimension    text,
  p_value        text,
  p_reassign_to  text DEFAULT NULL,
  p_drop_facts   boolean DEFAULT true,
  p_site_id      uuid DEFAULT NULL
)
RETURNS TABLE(facts_moved bigint, facts_dropped bigint, matchers_removed bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_dim record;
  v_val_id uuid;
  v_target_id uuid;
  v_facts bigint;
  v_rules text;
  v_moved bigint := 0;
  v_dropped bigint := 0;
  v_matchers bigint := 0;
  v_abstain boolean;
  v_siblings bigint;
  v_kw uuid[];
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
    -- A DELETE is an editor act, not a viewer act. The prior version asserted
    -- only `_site_access`, which a read-only member also passes.
    PERFORM seo.gsc_assert_site_editor(p_site_id);
  END IF;

  SELECT c.id, COALESCE(c.metadata->>'abstain','false') = 'true'
    INTO v_val_id, v_abstain
  FROM platform.categories c
   WHERE c.parent_id = v_dim.id AND c.deleted_at IS NULL
     AND c.slug = p_dimension || ':' || p_value;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_unknown_value: "%" is not a value of "%"', p_value, p_dimension;
  END IF;

  IF v_abstain THEN
    RAISE EXCEPTION 'seo_registry_abstain_protected: "%" is the "not clear" option on %. It is what the AI picks instead of guessing — retire the whole dimension if you no longer want the question asked.',
      p_value, v_dim.name;
  END IF;

  SELECT count(*) INTO v_siblings
  FROM platform.categories v
  WHERE v.parent_id = v_dim.id AND v.deleted_at IS NULL AND v.id <> v_val_id
    AND COALESCE(v.metadata->>'abstain','false') <> 'true';
  IF v_siblings = 0 THEN
    RAISE EXCEPTION 'seo_registry_last_value: "%" is the only real answer left on %. A question with no answers cannot be asked — retire the dimension instead.',
      p_value, v_dim.name;
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

  -- Every keyword this answer touches, captured before anything moves.
  SELECT COALESCE(array_agg(DISTINCT kf.keyword_id), '{}'::uuid[]) INTO v_kw
    FROM seo.keyword_facet kf
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

  -- THE MATCHERS GO WITH IT. Without this they survive pointing at a retired
  -- value: invisible on every screen, skipped by the engine, and resurrected
  -- as live rules the moment anyone un-deletes the value.
  WITH dropped_m AS (
    UPDATE seo.dimension_value_matcher dm
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE dm.value_id = v_val_id AND dm.deleted_at IS NULL
       AND (p_site_id IS NULL OR dm.site_id = p_site_id)
    RETURNING 1)
  SELECT count(*) INTO v_matchers FROM dropped_m;

  UPDATE platform.categories
     SET deleted_at = now(), updated_by = v_uid, updated_at = now()
   WHERE id = v_val_id;

  -- Re-derive ONLY the touched keywords, through THE engine. Scoped, so a
  -- delete never quietly re-stamps the rest of the site as a side effect.
  IF p_site_id IS NOT NULL AND COALESCE(array_length(v_kw, 1), 0) > 0 THEN
    PERFORM seo.fn_evaluate_matchers_internal(p_site_id, v_kw);
  END IF;

  RETURN QUERY SELECT v_moved, v_dropped, v_matchers;
END;
$function$;

REVOKE ALL ON FUNCTION seo.facet_value_archive(text, text, text, boolean, uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.facet_value_archive(text, text, text, boolean, uuid) TO authenticated;
