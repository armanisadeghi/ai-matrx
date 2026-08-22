-- ============================================================================
-- A DIMENSION MUST LET THE AI SAY "NOT CLEAR"  (D37 follow-up 2)
--
-- FOUND BY DRIVING IT.  A half-authored dimension made the classifier lie.
-- `equipment_class` was created with a single value, `crt_monitor`, and because
-- the structured-output contract requires one of the declared values, the model
-- stamped crt_monitor onto keywords that had nothing to do with a CRT. It was
-- not hallucinating -- it was obeying a vocabulary that gave it no honest move.
--
-- That is exactly Arman's law: "Logical things that are wrong are the worst
-- types of things." A confident wrong answer is worse than no answer, and the
-- system already knows this everywhere else -- a keyword with no expressed
-- meaning is honestly `unvalued`, never a guessed middle tier.
--
-- The first fix was a sentence in the classifier's prompt. Prompt text is not a
-- rule -- it is the agent's opinion, which is the thing D37 exists to replace.
-- So the abstention is made STRUCTURAL:
--
--   1. Creating a dimension seeds an abstain value automatically. Nobody has to
--      know to do it, so the default path is the correct one.
--   2. The catalogue reports `is_ready`, and says in plain words what is
--      missing. A dimension that cannot be answered honestly is not offered to
--      the classifier at all.
--   3. The last abstain value cannot be retired out from under a dimension.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Mark the abstain value on the platform dimensions that already have one.
--    Every one of the 13 shipped with a "none"/"ambiguous"/"unknown" member --
--    the concept was right from the start, it just was not named or enforced.
-- ---------------------------------------------------------------------------
UPDATE platform.categories cv
   SET metadata = cv.metadata || jsonb_build_object('abstain', true)
  FROM platform.categories cd
 WHERE cd.id = cv.parent_id
   AND cd.dimension = 'seo_facet' AND cd.parent_id IS NULL AND cd.deleted_at IS NULL
   AND cv.deleted_at IS NULL
   AND NOT (cv.metadata ? 'abstain')
   AND COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2))
       IN ('none','ambiguous','unknown','not_clear');

-- ---------------------------------------------------------------------------
-- 2. Seed an abstain value whenever a dimension is CREATED.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.facet_dimension_seed_abstain(
  p_dimension_id uuid, p_org uuid, p_is_system boolean, p_uid uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = seo, platform, pg_temp
AS $fn$
DECLARE
  v_slug text;
  v_id uuid;
BEGIN
  SELECT c.slug INTO v_slug FROM platform.categories c WHERE c.id = p_dimension_id;
  INSERT INTO platform.categories
    (dimension, slug, name, parent_id, organization_id, is_system, visibility, position, metadata, created_by, updated_by)
  VALUES
    ('seo_facet', v_slug || ':not_clear', 'Not clear', p_dimension_id, p_org, p_is_system,
     'internal', 9999,
     jsonb_build_object('value','not_clear','abstain',true,
       'description','The query does not say. The AI picks this instead of guessing — never delete it.'),
     p_uid, p_uid)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Readiness, reported by the catalogue.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS seo.facet_dimension_readiness(uuid);
CREATE OR REPLACE FUNCTION seo.facet_dimension_readiness(p_dimension_id uuid)
RETURNS TABLE (is_ready boolean, can_abstain boolean, readiness_note text)
LANGUAGE sql STABLE
SET search_path = seo, platform, pg_temp
AS $$
  -- TWO different questions, deliberately not merged.
  --   is_ready    -- a HARD gate. Fewer than two real choices is the garbage
  --                  case: the model is forced to stamp the only value it has
  --                  on everything. Such a dimension is not offered at all.
  --   can_abstain -- a QUALITY flag, reported and never enforced. Six of the
  --                  13 platform dimensions have no "not clear" member, and
  --                  gating on it would silently switch off classification
  --                  that has worked for months. Whether each of those SHOULD
  --                  gain one is a judgement about the vocabulary, which
  --                  belongs to the person who owns it -- not to this function.
  WITH v AS (
    SELECT count(*) FILTER (WHERE COALESCE((c.metadata->>'abstain')::boolean, false)) AS abstains,
           count(*) FILTER (WHERE NOT COALESCE((c.metadata->>'abstain')::boolean, false)) AS real_vals
    FROM platform.categories c
    WHERE c.parent_id = p_dimension_id AND c.deleted_at IS NULL
  )
  SELECT v.real_vals >= 2,
         v.abstains > 0,
         CASE
           WHEN v.real_vals < 2 THEN
             'Needs at least two real choices. With only one, the AI is forced to stamp it on everything — so this dimension is not being applied yet.'
           WHEN v.abstains = 0 THEN
             'Working, but it has no "not clear" choice — so the AI must pick something even when the words do not say. Consider adding one.'
           ELSE 'Ready — the AI can answer this honestly, including declining to.'
         END
  FROM v;
$$;

-- ---------------------------------------------------------------------------
-- 4. The catalogue now reports readiness, and every value says whether it is
--    the honest-decline option.  Creating a dimension seeds that option.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS seo.facet_dimension_catalog(uuid);

CREATE OR REPLACE FUNCTION seo.facet_dimension_catalog(p_site_id uuid DEFAULT NULL)
RETURNS TABLE (
  dimension_id uuid, slug text, label text, description text,
  scope text, cardinality text, site_id uuid, is_system boolean,
  value_count bigint, keyword_count bigint, rule_count bigint,
  facet_values jsonb,
  is_ready boolean,
  can_abstain boolean,
  readiness_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_site_id IS NOT NULL THEN
    PERFORM seo.gsc_assert_site_access(p_site_id);
  END IF;

  RETURN QUERY
  WITH dims AS (
    SELECT c.id, c.slug, c.name, c.metadata, c.is_system
    FROM platform.categories c
    WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.deleted_at IS NULL
      AND (
        COALESCE(c.metadata->>'scope','platform') = 'platform'
        OR (p_site_id IS NOT NULL AND (c.metadata->>'site_id')::uuid = p_site_id)
      )
  ),
  vals AS (
    SELECT cv.parent_id AS dim_id, cv.id AS value_id, cv.slug AS value_slug,
           COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS value_key,
           cv.name AS value_label, cv.metadata->>'description' AS value_description,
           COALESCE((cv.metadata->>'abstain')::boolean, false) AS is_abstain,
           cv.position,
           (SELECT count(*) FROM seo.keyword_facet kf
             WHERE kf.category_id = cv.id AND kf.deleted_at IS NULL) AS kw_count
    FROM platform.categories cv
    JOIN dims d ON d.id = cv.parent_id
    WHERE cv.deleted_at IS NULL
  )
  SELECT d.id, d.slug, d.name, d.metadata->>'description',
         COALESCE(d.metadata->>'scope','platform'),
         COALESCE(d.metadata->>'cardinality','single'),
         (d.metadata->>'site_id')::uuid,
         d.is_system,
         COALESCE(count(v.value_id), 0)::bigint,
         COALESCE(sum(v.kw_count), 0)::bigint,
         (SELECT count(*) FROM seo.keyword_class_rule r
           WHERE r.match_facet = d.slug AND r.deleted_at IS NULL
             AND (p_site_id IS NULL OR r.site_id = p_site_id OR r.site_id IS NULL)),
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'value_id', v.value_id, 'slug', v.value_slug, 'key', v.value_key,
             'label', v.value_label, 'description', v.value_description,
             'abstain', COALESCE(v.is_abstain, false),
             'keyword_count', v.kw_count)
           ORDER BY v.position NULLS LAST, v.value_label
         ) FILTER (WHERE v.value_id IS NOT NULL), '[]'::jsonb),
         (SELECT r.is_ready FROM seo.facet_dimension_readiness(d.id) r),
         (SELECT r.can_abstain FROM seo.facet_dimension_readiness(d.id) r),
         (SELECT r.readiness_note FROM seo.facet_dimension_readiness(d.id) r)
  FROM dims d
  LEFT JOIN vals v ON v.dim_id = d.id
  GROUP BY d.id, d.slug, d.name, d.metadata, d.is_system
  ORDER BY COALESCE(d.metadata->>'scope','platform') DESC, d.name;
END;
$fn$;

CREATE OR REPLACE FUNCTION seo.facet_dimension_upsert(
  p_slug        text,
  p_label       text,
  p_description text DEFAULT NULL,
  p_site_id     uuid DEFAULT NULL,
  p_cardinality text DEFAULT 'single'
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, iam, pg_temp
AS $fn$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_org  uuid;
  v_id   uuid;
  v_scope text := CASE WHEN p_site_id IS NULL THEN 'platform' ELSE 'site' END;
  v_existing_scope text;
  v_existing_site  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_slug !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'seo_registry_bad_value: "%" must be lowercase letters, digits and underscores, starting with a letter', p_slug;
  END IF;
  IF coalesce(btrim(p_label),'') = '' THEN
    RAISE EXCEPTION 'seo_registry_blank_label: a dimension must have a name';
  END IF;
  IF p_cardinality NOT IN ('single','multi') THEN
    RAISE EXCEPTION 'seo_registry_bad_cardinality: cardinality is "single" or "multi", not "%"', p_cardinality;
  END IF;

  IF p_site_id IS NULL THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: platform dimensions are facts every site shares, so only super admins create them. Create it on this site instead and it is yours to shape.';
    END IF;
    -- The org that already owns the platform facets, read from the data rather
    -- than from a guessed flag: self-consistent, and correct even if the
    -- system org is ever renamed or replaced.
    SELECT c.organization_id INTO v_org
    FROM platform.categories c
    WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
      AND c.is_system AND c.deleted_at IS NULL
    ORDER BY c.created_at LIMIT 1;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'seo_registry_no_platform_org: no platform facet exists to inherit an owner from';
    END IF;
  ELSE
    PERFORM seo.gsc_assert_site_access(p_site_id);
    SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;
  END IF;

  SELECT c.id, COALESCE(c.metadata->>'scope','platform'), (c.metadata->>'site_id')::uuid
    INTO v_id, v_existing_scope, v_existing_site
  FROM platform.categories c
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
    AND c.slug = p_slug AND c.deleted_at IS NULL;

  IF FOUND THEN
    -- A site may never edit a platform dimension, and never another site's.
    IF v_existing_scope = 'platform' AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" is a platform dimension — its label is shared by every site. Only super admins change it.', p_slug;
    END IF;
    IF v_existing_scope = 'site' AND v_existing_site IS DISTINCT FROM p_site_id THEN
      RAISE EXCEPTION 'seo_registry_duplicate: another site already owns a dimension named "%". Pick a different name.', p_slug;
    END IF;
    UPDATE platform.categories
       SET name = btrim(p_label),
           metadata = metadata
                      || jsonb_build_object('cardinality', p_cardinality)
                      || CASE WHEN p_description IS NULL THEN '{}'::jsonb
                              ELSE jsonb_build_object('description', btrim(p_description)) END,
           updated_by = v_uid, updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO platform.categories
    (dimension, slug, name, parent_id, organization_id, is_system, visibility, metadata, created_by, updated_by)
  VALUES
    ('seo_facet', p_slug, btrim(p_label), NULL, v_org, p_site_id IS NULL, 'internal',
     jsonb_strip_nulls(jsonb_build_object(
       'scope', v_scope, 'cardinality', p_cardinality,
       'site_id', p_site_id::text,
       'description', NULLIF(btrim(COALESCE(p_description,'')), ''))),
     v_uid, v_uid)
  RETURNING id INTO v_id;

  -- A new dimension is born able to be answered honestly (D37 follow-up 2).
  PERFORM seo.facet_dimension_seed_abstain(v_id, v_org, p_site_id IS NULL, v_uid);

  RETURN v_id;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. The last abstain value cannot be retired out from under a dimension.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.facet_value_assert_keeps_abstain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = seo, platform, pg_temp
AS $fn$
DECLARE
  v_dim_slug text;
BEGIN
  IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT COALESCE((NEW.metadata->>'abstain')::boolean, false) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM platform.categories s
              WHERE s.parent_id = NEW.parent_id AND s.deleted_at IS NULL
                AND s.id <> NEW.id
                AND COALESCE((s.metadata->>'abstain')::boolean, false)) THEN
    RETURN NEW;
  END IF;
  SELECT d.slug INTO v_dim_slug FROM platform.categories d WHERE d.id = NEW.parent_id;
  RAISE EXCEPTION 'seo_registry_last_abstain: "%" is the only way the AI can say it does not know on "%". Removing it forces a guess on every keyword. Add another before retiring this one.',
    NEW.name, v_dim_slug;
END;
$fn$;

DROP TRIGGER IF EXISTS categories_keep_abstain ON platform.categories;
CREATE TRIGGER categories_keep_abstain
  BEFORE UPDATE OF deleted_at ON platform.categories
  FOR EACH ROW WHEN (NEW.dimension = 'seo_facet' AND NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION seo.facet_value_assert_keeps_abstain();

REVOKE ALL ON FUNCTION seo.facet_dimension_catalog(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION seo.facet_dimension_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.facet_dimension_readiness(uuid) TO authenticated;
