-- KI-043: brand_aliases (the FACT, web.brand.profile->'brand_aliases') and the
-- brand_identity dimension_value_matcher (the MEANING) were disconnected —
-- editing a brand's aliases never created/updated the site's matcher, so a
-- brand added after the one-time 2026-08-23 migration (or a site created
-- since) silently had NO brand_identity matcher at all: 8 of 17 sites with a
-- brand_id had none. Fix = the geo precedent (seo.fn_geo_area_sync_meaning):
-- saving the fact mints the meaning.
--
-- brand_identity is architecturally UNLIKE geo: `dvm_target_check` forces
-- pattern/place_id/fact_value_id/condition_rule_id all NULL for this kind, so
-- there is no per-alias pattern row to mint — ONE dynamic matcher row per
-- site (pattern NULL) is the whole shape, and `seo.fn_evaluate_matchers_internal`
-- already re-reads `seo.gsc_brand_hits` (which reads brand_aliases LIVE) every
-- time it runs. So there is nothing to keep in sync at the ALIAS level — the
-- gap is purely EXISTENCE: does this site have its one brand_identity matcher
-- row at all. This migration mints/revives it whenever the fact changes
-- (brand profile saved, or a site's brand_id/domain/name/deleted_at changes)
-- and never touches a matcher a human created/pinned directly (origin='human').
--
-- Idempotent: safe to re-run. Ledger: public._schema_migrations (source
-- 'matrx-frontend').

CREATE OR REPLACE FUNCTION seo.fn_brand_identity_sync_meaning(p_site_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  s record;
  v_val uuid;
  v_org uuid;
  v_existing record;
BEGIN
  SELECT * INTO s FROM web.site WHERE id = p_site_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_such_site'); END IF;

  SELECT id INTO v_val
    FROM platform.categories
   WHERE slug = 'traffic_class:brand' AND dimension = 'seo_facet' AND deleted_at IS NULL;
  IF v_val IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_brand_value_registered');
  END IF;

  v_org := s.organization_id;

  SELECT dm.id, dm.origin, dm.deleted_at INTO v_existing
    FROM seo.dimension_value_matcher dm
   WHERE dm.site_id = p_site_id AND dm.value_id = v_val AND dm.kind = 'brand_identity'
   ORDER BY dm.created_at LIMIT 1;

  -- ARCHIVED SITE → retire the matcher rather than orphaning it (never a
  -- human-pinned one; a human's decision to keep/drop brand matching for a
  -- site survives the site's own lifecycle).
  IF s.deleted_at IS NOT NULL THEN
    IF v_existing.id IS NOT NULL AND v_existing.deleted_at IS NULL AND v_existing.origin <> 'human' THEN
      UPDATE seo.dimension_value_matcher SET deleted_at = now(), updated_at = now()
       WHERE id = v_existing.id;
      RETURN jsonb_build_object('ok', true, 'action', 'retired', 'matcher_id', v_existing.id);
    END IF;
    RETURN jsonb_build_object('ok', true, 'action', 'none', 'archived', true);
  END IF;

  IF v_existing.id IS NULL THEN
    -- Nothing has ever existed for this site — mint it.
    INSERT INTO seo.dimension_value_matcher
      (site_id, organization_id, value_id, kind, origin, notes)
    VALUES
      (p_site_id, v_org, v_val, 'brand_identity', 'migration',
       'This site''s brand identity (domain, site name, brand name, custom aliases) — derived by seo.gsc_brand_aliases with the genericity guard')
    RETURNING id INTO v_existing.id;
    RETURN jsonb_build_object('ok', true, 'action', 'minted', 'matcher_id', v_existing.id);
  END IF;

  IF v_existing.deleted_at IS NOT NULL THEN
    -- A row exists but is retired. Revive it UNLESS a human retired it —
    -- that is a standing decision, not a stale artifact.
    IF v_existing.origin = 'human' THEN
      RETURN jsonb_build_object('ok', true, 'action', 'none', 'reason', 'human_retired');
    END IF;
    UPDATE seo.dimension_value_matcher SET deleted_at = NULL, enabled = true, updated_at = now()
     WHERE id = v_existing.id;
    RETURN jsonb_build_object('ok', true, 'action', 'revived', 'matcher_id', v_existing.id);
  END IF;

  -- Already live — nothing to do (the matcher reads brand_aliases live on
  -- every seo.fn_evaluate_matchers_internal pass; there is no pattern to
  -- resync per alias).
  RETURN jsonb_build_object('ok', true, 'action', 'none', 'matcher_id', v_existing.id);
END;
$function$;

-- Trigger side A: the FACT lives on the SITE too (domain, name, brand_id all
-- feed seo.gsc_brand_aliases) — a new site, a re-domained site, or a site
-- moved to a different brand must mint/refresh its matcher.
CREATE OR REPLACE FUNCTION seo.site_brand_identity_sync_meaning_tg()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM seo.fn_brand_identity_sync_meaning(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS site_brand_identity_sync_meaning ON web.site;
CREATE TRIGGER site_brand_identity_sync_meaning
  AFTER INSERT OR UPDATE OF brand_id, domain, name, deleted_at ON web.site
  FOR EACH ROW EXECUTE FUNCTION seo.site_brand_identity_sync_meaning_tg();

-- Trigger side B: the FACT of custom aliases lives on the BRAND
-- (profile->'brand_aliases'). Saving it must mint/refresh the matcher for
-- EVERY site under that brand — this is the actual KI-043 gap.
CREATE OR REPLACE FUNCTION seo.brand_identity_sync_meaning_tg()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  r record;
BEGIN
  IF NEW.profile->'brand_aliases' IS DISTINCT FROM OLD.profile->'brand_aliases'
     OR NEW.name IS DISTINCT FROM OLD.name THEN
    FOR r IN SELECT id FROM web.site WHERE brand_id = NEW.id AND deleted_at IS NULL LOOP
      PERFORM seo.fn_brand_identity_sync_meaning(r.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS brand_identity_sync_meaning ON web.brand;
CREATE TRIGGER brand_identity_sync_meaning
  AFTER UPDATE OF profile, name ON web.brand
  FOR EACH ROW EXECUTE FUNCTION seo.brand_identity_sync_meaning_tg();

-- Idempotent one-time backfill: every live site with a brand gets its
-- brand_identity matcher minted if missing.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM web.site WHERE deleted_at IS NULL AND brand_id IS NOT NULL LOOP
    PERFORM seo.fn_brand_identity_sync_meaning(r.id);
  END LOOP;
END $$;
