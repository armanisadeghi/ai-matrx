-- ============================================================================
-- KEYWORD INTELLIGENCE — THE ASSIGNMENT LAYER (2026-08-23)
--
-- Arman's ruling, verbatim: "We have to annihilate the UIs that offer options
-- but don't allow custom entry because those are the ones that lose the
-- platform the best users… the moment I went in to assign a tier, I got a
-- pop up that forced me to choose from the shitty options I had in front of
-- me. So instead of our system getting significantly better because I took
-- the initiative to add something, our system was too arrogant."  → P23.
--
-- This migration gives every picker in the keyword system the two things it
-- needs to obey P23 and to capture WHY a person ruled the way they did:
--
--   seo.gsc_quick_add_value   — THE "+ Add" behind every dimension picker:
--                               create the value (and the dimension, if the
--                               user is inventing one) in ONE call, from
--                               plain typed text, and get back ids to select.
--   seo.gsc_set_keyword_stamps— THE one human write path for stamps: single
--                               or bulk, with `notes` — the rationale the
--                               expert types while assigning, stored per
--                               stamp so AI can later learn the pattern.
--   seo.gsc_keyword_stamps_for— the DYNAMIC COLUMNS read: for the rows on
--                               screen and the dimensions the user chose,
--                               every effective stamp (SCOPE RULE).
--
-- Same-slug-on-two-sites defect (found in C1): `facet_value_upsert` /
-- `facet_dimension_upsert` keyed values by a global slug, so a second site
-- inventing "Equipment class" collided with the first. Site dimensions are
-- now namespaced `site:<site8>:<slug>` internally while the LABEL stays the
-- user's words — the UI never shows the slug.
-- ============================================================================

-- ── 1. Site-scoped dimension slugs (the collision fix) ─────────────────────
CREATE OR REPLACE FUNCTION seo.facet_site_slug(p_site_id uuid, p_slug text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_site_id IS NULL THEN p_slug
              ELSE 'site_' || replace(left(p_site_id::text, 8), '-', '') || '_' || p_slug END;
$$;

CREATE OR REPLACE FUNCTION seo.facet_slugify(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(regexp_replace(lower(btrim(p_text)), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), '');
$$;

-- ── 2. THE "+ Add" primitive (P23) ─────────────────────────────────────────
-- Takes what a person typed. Creates the dimension if they are inventing one,
-- creates the value, and answers with the ids so the picker can select it
-- immediately. Idempotent: typing an existing label returns the existing row.
CREATE OR REPLACE FUNCTION seo.gsc_quick_add_value(
  p_site_id uuid,
  p_value_label text,
  p_dimension_id uuid DEFAULT NULL,
  p_new_dimension_label text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_nature text DEFAULT 'intrinsic'
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_org uuid; v_uid uuid := (SELECT auth.uid());
  v_dim uuid := p_dimension_id; v_dim_slug text; v_dim_scope text; v_dim_site uuid;
  v_val uuid; v_val_key text; v_label text := btrim(p_value_label);
  v_created_dimension boolean := false; v_created_value boolean := false;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF v_label IS NULL OR v_label = '' THEN
    RAISE EXCEPTION 'seo_value_label_required: type what you want to call it.';
  END IF;
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  IF v_dim IS NULL THEN
    IF NULLIF(btrim(p_new_dimension_label), '') IS NULL THEN
      RAISE EXCEPTION 'seo_dimension_required: choose a dimension, or name a new one.';
    END IF;
    v_dim_slug := seo.facet_site_slug(p_site_id, seo.facet_slugify(p_new_dimension_label));
    SELECT id INTO v_dim FROM platform.categories
      WHERE dimension='seo_facet' AND parent_id IS NULL AND slug = v_dim_slug AND deleted_at IS NULL;
    IF v_dim IS NULL THEN
      INSERT INTO platform.categories (dimension, slug, name, parent_id, organization_id, is_system, visibility, created_by, updated_by, metadata)
      VALUES ('seo_facet', v_dim_slug, btrim(p_new_dimension_label), NULL, v_org, false, 'internal', v_uid, v_uid,
              jsonb_build_object('scope','site','site_id',p_site_id::text,'cardinality','single',
                                 'nature', CASE WHEN p_nature = 'situational' THEN 'situational' ELSE 'intrinsic' END,
                                 'description', NULLIF(btrim(COALESCE(p_description,'')), '')))
      RETURNING id INTO v_dim;
      PERFORM seo.facet_dimension_seed_abstain(v_dim, v_org, false, v_uid);
      v_created_dimension := true;
    END IF;
  END IF;

  SELECT c.slug, COALESCE(c.metadata->>'scope','platform'), NULLIF(c.metadata->>'site_id','')::uuid
    INTO v_dim_slug, v_dim_scope, v_dim_site
  FROM platform.categories c WHERE c.id = v_dim AND c.parent_id IS NULL AND c.deleted_at IS NULL;
  IF v_dim_slug IS NULL THEN
    RAISE EXCEPTION 'seo_dimension_unknown: that dimension no longer exists.';
  END IF;
  -- A site may only add values to its OWN dimensions. Platform vocabularies
  -- are shared across every tenant, so widening them is a super-admin act
  -- (P11) — the UI offers "make this a dimension of yours" instead.
  IF v_dim_scope <> 'site' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'seo_platform_dimension_readonly: "%" is a shared dimension every business uses, so its choices are platform-governed. Create your own dimension for this — your values, your rules.',
      (SELECT name FROM platform.categories WHERE id = v_dim);
  END IF;
  IF v_dim_scope = 'site' AND v_dim_site IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION 'seo_dimension_other_site: that dimension belongs to another site.';
  END IF;

  -- A value inherits its dimension's organization: a platform dimension's
  -- values belong to the platform org (the category-shape trigger enforces it),
  -- a site dimension's values belong to the site's org.
  SELECT c.organization_id INTO v_org FROM platform.categories c WHERE c.id = v_dim;

  v_val_key := seo.facet_slugify(v_label);
  IF v_val_key IS NULL THEN
    RAISE EXCEPTION 'seo_value_label_unusable: give it a name with letters or numbers in it.';
  END IF;
  SELECT id INTO v_val FROM platform.categories
   WHERE dimension='seo_facet' AND parent_id = v_dim AND deleted_at IS NULL
     AND (slug = v_dim_slug || ':' || v_val_key OR lower(name) = lower(v_label));
  IF v_val IS NULL THEN
    INSERT INTO platform.categories (dimension, slug, name, parent_id, organization_id, is_system, visibility, position, created_by, updated_by, metadata)
    VALUES ('seo_facet', v_dim_slug || ':' || v_val_key, v_label, v_dim, v_org, false, 'internal',
            (SELECT COALESCE(max(position),0)+1 FROM platform.categories WHERE parent_id = v_dim), v_uid, v_uid,
            jsonb_build_object('value', v_val_key, 'description', NULLIF(btrim(COALESCE(p_description,'')), ''), 'origin','human'))
    RETURNING id INTO v_val;
    v_created_value := true;
  END IF;

  RETURN jsonb_build_object(
    'dimension_id', v_dim, 'dimension_slug', v_dim_slug,
    'dimension_label', (SELECT name FROM platform.categories WHERE id = v_dim),
    'value_id', v_val, 'value_key', v_val_key, 'value_label', (SELECT name FROM platform.categories WHERE id = v_val),
    'created_dimension', v_created_dimension, 'created_value', v_created_value);
END $fn$;
REVOKE ALL ON FUNCTION seo.gsc_quick_add_value(uuid, text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_quick_add_value(uuid, text, uuid, text, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_quick_add_value(uuid, text, uuid, text, text, text) IS
  'P23 — THE "+ Add" behind every dimension picker. Turns typed text into a real dimension value (creating the site dimension too when the user is inventing one) and answers with ids so the picker selects it at once. A picker that cannot call this is a defect.';

-- ── 3. THE human stamp write path — single, bulk, and WHY ──────────────────
CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_stamps(
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_value_id uuid,
  p_notes text DEFAULT NULL,
  p_clear boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $fn$
DECLARE
  v_org uuid; v_uid uuid := (SELECT auth.uid());
  v_dim uuid; v_single boolean; v_notes text := NULLIF(btrim(p_notes), '');
  v_written int := 0; v_replaced int := 0;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords: pick at least one keyword.';
  END IF;
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;
  SELECT cv.parent_id, COALESCE(cd.metadata->>'cardinality','single') = 'single'
    INTO v_dim, v_single
  FROM platform.categories cv JOIN platform.categories cd ON cd.id = cv.parent_id
  WHERE cv.id = p_value_id AND cv.deleted_at IS NULL AND cd.deleted_at IS NULL;
  IF v_dim IS NULL THEN
    RAISE EXCEPTION 'seo_value_unknown: that value no longer exists.';
  END IF;
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  IF p_clear THEN
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now(), updated_by = v_uid
    WHERE kf.site_id = p_site_id AND kf.keyword_id = ANY(p_keyword_ids)
      AND kf.category_id = p_value_id AND kf.deleted_at IS NULL;
    GET DIAGNOSTICS v_replaced = ROW_COUNT;
    RETURN jsonb_build_object('cleared', v_replaced, 'written', 0);
  END IF;

  -- A single-choice dimension holds ONE stamp per keyword: retire the others.
  IF v_single THEN
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now(), updated_by = v_uid
    FROM platform.categories cv
    WHERE cv.id = kf.category_id AND cv.parent_id = v_dim AND cv.id <> p_value_id
      AND kf.site_id = p_site_id AND kf.keyword_id = ANY(p_keyword_ids) AND kf.deleted_at IS NULL;
    GET DIAGNOSTICS v_replaced = ROW_COUNT;
  END IF;

  WITH up AS (
    INSERT INTO seo.keyword_facet
      (keyword_id, category_id, site_id, source, confidence, organization_id, visibility, pinned, notes, as_of, created_by, updated_by, metadata)
    SELECT k.id, p_value_id, p_site_id, 'human', 100, v_org, 'internal', true, v_notes, now(), v_uid, v_uid,
           jsonb_build_object('assigned_at', now(), 'assigned_by', v_uid)
    FROM seo.keyword k WHERE k.id = ANY(p_keyword_ids) AND k.deleted_at IS NULL
    ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
    DO UPDATE SET source = 'human', pinned = true,
                  notes = COALESCE(EXCLUDED.notes, seo.keyword_facet.notes),
                  as_of = now(), updated_at = now(), updated_by = EXCLUDED.updated_by
    RETURNING 1
  ) SELECT count(*) INTO v_written FROM up;

  RETURN jsonb_build_object('written', v_written, 'replaced', v_replaced,
                            'dimension_id', v_dim, 'value_id', p_value_id, 'notes_saved', v_notes IS NOT NULL);
END $fn$;
REVOKE ALL ON FUNCTION seo.gsc_set_keyword_stamps(uuid, uuid[], uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_stamps(uuid, uuid[], uuid, text, boolean) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_set_keyword_stamps(uuid, uuid[], uuid, text, boolean) IS
  'THE one human stamp write path — single row, right-click quick-assign, and bulk all call this. `notes` is the expert''s REASON, stored on the stamp because it is the training material an AI later learns the pattern from. Human stamps are pinned: the matcher engine never touches them.';

-- ── 4. Dynamic columns: the stamps for the rows on screen ──────────────────
CREATE OR REPLACE FUNCTION seo.gsc_keyword_stamps_for(
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_dimension_slugs text[] DEFAULT NULL
) RETURNS TABLE(keyword_id uuid, dimension text, dimension_label text, value text, value_label text, value_id uuid, source text, pinned boolean, notes text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids,1) IS NULL THEN RETURN; END IF;
  IF array_length(p_keyword_ids,1) > 2000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: max 2000 per call (THE SCOPE RULE — ask for the rows you are showing).';
  END IF;
  RETURN QUERY
  SELECT es.keyword_id, es.dimension, es.dimension_label, es.value, es.value_label, es.value_id,
         es.source, es.pinned,
         (SELECT kf.notes FROM seo.keyword_facet kf
           WHERE kf.keyword_id = es.keyword_id AND kf.category_id = es.value_id
             AND (kf.site_id = p_site_id OR kf.site_id IS NULL) AND kf.deleted_at IS NULL
           ORDER BY kf.site_id NULLS LAST LIMIT 1)
  FROM seo.gsc_effective_stamps(p_site_id, p_keyword_ids) es
  WHERE p_dimension_slugs IS NULL OR es.dimension = ANY(p_dimension_slugs);
END $fn$;
REVOKE ALL ON FUNCTION seo.gsc_keyword_stamps_for(uuid, uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_stamps_for(uuid, uuid[], text[]) TO authenticated, service_role;

-- ── 5. Saved views (the tabs) ──────────────────────────────────────────────
DO $do$
BEGIN
  IF to_regclass('seo.keyword_saved_view') IS NULL THEN
    PERFORM platform.create_entity_table(
      p_schema     => 'seo',
      p_table      => 'keyword_saved_view',
      p_token      => 'seo_keyword_saved_view',
      p_label      => 'Keyword Saved View',
      p_fields     => array[
        'site_id uuid NOT NULL',
        'name text NOT NULL',
        'surface text NOT NULL DEFAULT ''keyword_workbench''',
        'state jsonb NOT NULL DEFAULT ''{}''::jsonb',
        'position integer',
        'shared boolean NOT NULL DEFAULT false'
      ],
      p_variant    => 'component',
      p_versioned  => true,
      p_soft_delete=> true,
      p_visibility => 'none',
      p_category   => false,
      p_listed     => true,
      p_org_default=> true,
      p_gin_jsonb  => false,
      p_parents    => array['web_site:site_id']
    );
  END IF;
END $do$;
CREATE INDEX IF NOT EXISTS keyword_saved_view_site_idx ON seo.keyword_saved_view (site_id, surface) WHERE deleted_at IS NULL;
COMMENT ON TABLE seo.keyword_saved_view IS
  'A named view on a keyword surface: filters, chosen dimension columns, sort, page size — the tabs a user keeps. `state` is the surface''s own URL state, so a saved view IS a shareable link. `shared=false` means only its creator sees it.';
