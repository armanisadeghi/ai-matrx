-- DD-209 (V-102 F1's oracle, first live catch) — the SEO vocabulary door is never
-- wider than its table.
--
-- FOUND BY THE NEW DISCLOSURE ORACLE, on its first full run over the blocking lane.
-- `seo.vocabulary_registry_list(p_dimension)` is `SECURITY DEFINER` and reads
-- `platform.categories` with NO scoping at all: it checks that a caller is signed in,
-- checks the dimension word, and then returns every organization's SEO facet, value-band
-- and geo-band vocabulary — parent and value ids, slugs, LABELS, descriptions and the
-- whole `metadata` jsonb.
--
-- Measured live as test@test.com, rolled back. Rows that caller provably cannot SELECT in
-- `platform.categories` came back through the door, among many others:
--
--   value_label "Orange County"        (platform.categories c80184ec-…, slug site_geo_0fdcd5ea:orange_county)
--   value_label "Greater Los Angeles"  (0d664994-…, site_geo_d0aff5b6:greater_los_angeles)
--   value_label "San Diego County"     (d8490336-…, site_geo_d0aff5b6:san_diego_county)
--   value_label "Primary catchment"    (48c16ded-…, site_geo_f8e332bb:primary_catchment)
--   parent_label "Geo" / parent_slug   site_geo_f8e332bb, site_geo_0fdcd5ea, site_geo_d0aff5b6
--
-- Those slugs are per-site (`site_geo_<hash>`), so this is a TENANT'S OWN vocabulary — the
-- catchment areas somebody's SEO strategy is built on — not shared platform content. No row
-- id the caller could not read was needed to see it; the disclosure is the LABEL, which is
-- why the uuid-only oracle read this door as clean for as long as it has existed.
--
-- THE FIX IS THE ONE DD-208 ESTABLISHED: a door is never wider than its table, and the way
-- to say that is to let the table's own policy decide. Nothing here needs definer rights —
-- `authenticated` already holds a table-level SELECT grant on `platform.categories`, the
-- table carries a full `std_select` policy, and the helper this body calls
-- (`seo.facet_check_values`) is already SECURITY INVOKER and reads the same table. The
-- definer bit was buying exactly one thing: the RLS bypass that is the defect. So the
-- function becomes SECURITY INVOKER and the body is otherwise untouched, which makes what
-- the door can list exactly what the caller can open — the same test `agent.shortcut`'s own
-- policy already applies to `agx_duplicate_shortcut` (DD-192 class 3).
--
-- based-on: seo.vocabulary_registry_list(text) 379635db04c9b124d124d3e13c22942dc8cdfdd3ea1bb2b744fd29e80eedb0c5
create or replace function seo.vocabulary_registry_list(p_dimension text default 'seo_facet'::text)
returns table(parent_id uuid, parent_slug text, parent_label text, parent_description text, value_id uuid, value_slug text, value_key text, value_label text, value_description text, value_config jsonb, enforced boolean, sort_order integer)
language plpgsql
stable
security invoker
set search_path to 'seo', 'platform', 'pg_temp'
as $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_dimension NOT IN ('seo_facet','seo_value_band','seo_geo_band') THEN
    RAISE EXCEPTION 'seo_registry_bad_dimension: %', p_dimension;
  END IF;

  -- 🚨 DD-209. SECURITY INVOKER, so `platform.categories.std_select` decides what this
  -- door may list. Before 2026-09-14 this ran as a definer and handed every signed-in
  -- caller every tenant's SEO vocabulary — labels, slugs, descriptions and metadata.
  IF p_dimension = 'seo_facet' THEN
    RETURN QUERY
    SELECT p.id, p.slug, p.name, p.metadata->>'description',
           c.id, c.slug, COALESCE(c.metadata->>'value', c.slug), c.name, c.metadata->>'description',
           c.metadata,
           COALESCE(c.metadata->>'value', c.slug) = ANY (seo.facet_check_values(p.slug)),
           COALESCE(c.position, 0)
    FROM platform.categories p
    JOIN platform.categories c
      ON c.parent_id = p.id AND c.dimension = p.dimension AND c.deleted_at IS NULL
    WHERE p.dimension = p_dimension AND p.parent_id IS NULL AND p.deleted_at IS NULL
    ORDER BY p.name, c.name;
  ELSE
    RETURN QUERY
    SELECT NULL::uuid, p_dimension, NULL::text, NULL::text,
           c.id, c.slug, c.slug, c.name, c.metadata->>'description',
           c.metadata, true, COALESCE(c.position, 0)
    FROM platform.categories c
    WHERE c.dimension = p_dimension AND c.deleted_at IS NULL
    ORDER BY COALESCE(c.position, 0);
  END IF;
END;
$function$;

comment on function seo.vocabulary_registry_list(text) is
  'DD-209. Lists the SEO facet / value-band / geo-band vocabulary. SECURITY INVOKER on purpose: platform.categories'' own std_select policy decides what this door may list, so it is never wider than its table. Before 2026-09-14 it was SECURITY DEFINER with no scoping and handed every signed-in caller every tenant''s vocabulary — including per-site geo catchment LABELS such as "Orange County" and "Greater Los Angeles" — which the uuid-only door oracle could not see because the disclosure was a label, not a row id.';
