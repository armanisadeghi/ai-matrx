-- ONE RESOLVER for keyword placement — the Offering column stops reading other
-- tenants' rulings.
--
-- THE DEFECT (measured live, 2026-09-12, not theoretical).
-- `seo.gsc_keyword_topics_for(p_site_id, p_keyword_ids)` — the function behind
-- the workbench's Offering column — selected EVERY `is_primary` row of
-- `seo.keyword_topic` for the ids it was handed, with NO scope ladder and NO
-- organization filter. It took a site id, asserted access with it, and then
-- never used it again. Live census of `seo.keyword_topic` on that date: 13,624
-- primary rows — 12,306 system tier, 935 organization tier owned by
-- 5dc930e9-bd65-44a1-8369-af773f6e1a5b, 382 organization tier owned by
-- f9cb3e35-2a65-4f2a-8525-088d6551071c, 1 site tier; 1,317 organization-tier
-- primaries have no system row underneath them. So TODAY every site of org
-- f9cb3e35 is handed 935 placements ruled by org 5dc930e9, every site of org
-- 5dc930e9 is handed 382 of f9cb3e35's, and a site of an org with no rulings at
-- all (pixelium.uk, www.reusetek.com) is shown 1,317 foreign ones. A person
-- reading that column is reading another company's opinion of what their own
-- keywords mean.
--
-- THE SECOND HALF of the same defect, in the function that WAS correct.
-- `seo.keyword_placement_resolve` walks the real ladder (site > brand >
-- organization > system, nearest wins) but its candidate set never filtered
-- `is_primary` — the flag was only an ORDER BY tiebreak. `gsc_set_keyword_topic`
-- "removes" a site placement by DEMOTING that row to `is_primary = false`; it
-- never deletes. Through the unfiltered resolver a demoted site row still
-- outranks the organization and system primaries, so a removal was a no-op and
-- the removed topic kept governing. Live count of (site, keyword) pairs the
-- resolver answers with a non-primary row today: 1.
--
-- THE RULING (owner, 2026-09-12): there is ONE ladder, and every reader of a
-- keyword's placement consumes it. `seo.keyword_placement_resolve` is that
-- ladder. `seo.gsc_keyword_topics_for` stops reading `seo.keyword_topic`
-- directly and becomes a presentation layer over the resolver — the recursive
-- chain / root / path / worth CTEs are untouched and its fourteen existing
-- output columns keep their name, order and type, with `scope_tier` and
-- `scope_organization_id` appended so a surface can say WHOSE ruling it is
-- showing. A non-primary row is a demoted prior opinion, never a placement.
--
-- WHAT THIS FILE DOES
--   1. `seo.keyword_placement_resolve` — candidates gain `AND kt.is_primary`;
--      the return shape gains `row_id uuid` (the winning `keyword_topic.id`) and
--      `notes text` (the P24 reason, which the Offering column renders). Access
--      assertion, the 2,000-id cap and its `seo_too_many_keywords` message, the
--      `unnest` LEFT JOIN LATERAL shape (an unplaced keyword still comes back as
--      a row with a NULL topic_id) and the deterministic ORDER BY are unchanged.
--   2. `seo.gsc_keyword_topics_for` — its `placed` CTE becomes a SELECT from the
--      resolver. It keeps its OWN null/empty return and its OWN cap with the
--      existing `gsc_too_many_keywords` wording, checked BEFORE the resolver is
--      called, so the error text the UI already handles does not change. Its
--      search_path gains 'web', 'iam', 'public' because the resolver reads
--      `web.site`.
--   3. `public.__keyword_placement_tenancy_conformance()` — a self-test that
--      PLANTS a multi-organization case on a throwaway keyword, reads it back
--      through both functions as a platform admin, and ROLLS THE PLANT BACK by
--      raising a private exception it catches. It is not client-callable (no
--      door row, EXECUTE for service_role and postgres only) and is read by
--      `pnpm check:keyword-placement-tenancy`.
--
-- Idempotent-safe: DROP FUNCTION IF EXISTS + CREATE (a RETURNS TABLE shape
-- change is refused by CREATE OR REPLACE), and the two door rows are inserted
-- ON CONFLICT DO NOTHING. Applied only by `pnpm db:apply` — no BEGIN/COMMIT
-- here; the applier owns the transaction and the ledger row.

-- ---------------------------------------------------------------------------
-- 0. The doors, declared BEFORE the functions exist.
-- ---------------------------------------------------------------------------
-- `platform.enforce_definer_client_grants` fires on CREATE FUNCTION and on
-- GRANT: a SECURITY DEFINER function with no `platform.client_callable_door`
-- row has its client EXECUTE revoked inside the GRANT that tries to give it.
-- Both functions are client-callable reads and both were only ever grandfathered
-- by argument types — neither has ever carried a declared door. They do now.
INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
VALUES (
  'seo', 'keyword_placement_resolve', 'p_site_id uuid, p_keyword_ids uuid[]',
  'migrations/seo_keyword_placement_one_resolver.sql',
  'READ. THE one keyword-placement ladder (site > brand > organization > system) behind every signed-in SEO keyword surface. Body asserts site access via seo.gsc_assert_site_access, takes no user or organization identity from the caller, and confines reads to the <=2,000 keyword ids passed.'
)
ON CONFLICT (schema_name, function_name, identity_args) DO NOTHING;

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
VALUES (
  'seo', 'gsc_keyword_topics_for', 'p_site_id uuid, p_keyword_ids uuid[]',
  'migrations/seo_keyword_placement_one_resolver.sql',
  'READ. Signed-in SEO keyword surfaces: the workbench Offering column and the keyword dossier. Body asserts site access via seo.gsc_assert_site_access, resolves placement through seo.keyword_placement_resolve, and confines reads to the <=2,000 keyword ids passed.'
)
ON CONFLICT (schema_name, function_name, identity_args) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. THE ladder.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS seo.keyword_placement_resolve(uuid, uuid[]);

CREATE FUNCTION seo.keyword_placement_resolve(p_site_id uuid, p_keyword_ids uuid[])
RETURNS TABLE(
  keyword_id uuid,
  topic_id uuid,
  scope_tier text,
  organization_id uuid,
  confidence smallint,
  assigned_by text,
  row_id uuid,
  notes text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_site_id uuid;
  v_brand_id uuid;
  v_org_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF array_length(p_keyword_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'seo_too_many_keywords: up to 2,000 keywords per read — ask for the page you are showing.';
  END IF;

  SELECT s.id, s.brand_id, s.organization_id
    INTO v_site_id, v_brand_id, v_org_id
    FROM web.site s
   WHERE s.id = p_site_id
     AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT kt.keyword_id, kt.topic_id, kt.scope_tier, kt.organization_id,
           kt.confidence, kt.assigned_by, kt.notes, kt.updated_at, kt.id
      FROM seo.keyword_topic kt
     WHERE kt.keyword_id = ANY (p_keyword_ids)
       AND kt.deleted_at IS NULL
       -- A non-primary row is a DEMOTED PRIOR OPINION, never a placement.
       -- gsc_set_keyword_topic removes a placement by demoting it and never by
       -- deleting it; without this line the removed topic keeps governing from
       -- the nearest rung forever.
       AND kt.is_primary
       AND (
            (kt.scope_tier = 'site' AND kt.scope_site_id = v_site_id)
         OR (kt.scope_tier = 'brand' AND v_brand_id IS NOT NULL AND kt.scope_brand_id = v_brand_id)
         OR (kt.scope_tier = 'organization' AND kt.organization_id = v_org_id)
         OR (kt.scope_tier = 'system')
       )
  )
  SELECT k.kid,
         w.topic_id,
         w.scope_tier,
         w.organization_id,
         w.confidence,
         w.assigned_by,
         w.id,
         w.notes
    FROM unnest(p_keyword_ids) AS k(kid)
    LEFT JOIN LATERAL (
      SELECT c.*
        FROM candidates c
       WHERE c.keyword_id = k.kid
       ORDER BY CASE c.scope_tier
                  WHEN 'site' THEN 0
                  WHEN 'brand' THEN 1
                  WHEN 'organization' THEN 2
                  ELSE 3
                END,
                c.updated_at DESC,
                c.id
       LIMIT 1
    ) w ON true;
END;
$function$;

REVOKE ALL ON FUNCTION seo.keyword_placement_resolve(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.keyword_placement_resolve(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION seo.keyword_placement_resolve(uuid, uuid[]) IS
  'THE one keyword-placement ladder: site > brand > organization > system, nearest wins, primary rows only. Every reader of "what does this keyword mean for this site" consumes this and never seo.keyword_topic directly. Returns one row per requested keyword; an unplaced keyword comes back with a NULL topic_id.';

-- ---------------------------------------------------------------------------
-- 2. The Offering column, over the ladder.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS seo.gsc_keyword_topics_for(uuid, uuid[]);

CREATE FUNCTION seo.gsc_keyword_topics_for(p_site_id uuid, p_keyword_ids uuid[])
RETURNS TABLE(
  keyword_id uuid,
  topic_id uuid,
  topic_name text,
  node_type text,
  root_id uuid,
  root_name text,
  root_type text,
  lineage text,
  assigned_by text,
  confidence smallint,
  notes text,
  has_own_worth boolean,
  worth_from_id uuid,
  worth_from_name text,
  scope_tier text,
  scope_organization_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
-- 'web', 'iam' and 'public' are new: the resolver this now calls reads
-- web.site and asserts through iam/public.
SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  -- THE SCOPE RULE. Ask for the rows you are rendering, never the site. Checked
  -- HERE, before the resolver, so the message the UI already handles is the one
  -- that comes back.
  IF array_length(p_keyword_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 2,000 keywords per read — ask for the page you are showing.';
  END IF;

  RETURN QUERY
  WITH RECURSIVE placed AS (
    -- ONE LADDER. This used to be a bare SELECT over seo.keyword_topic with no
    -- scope filter at all, which handed every site every other tenant's ruling.
    SELECT r.keyword_id AS kid, r.topic_id AS tid,
           r.assigned_by AS aby, r.confidence AS conf, r.notes AS note,
           r.scope_tier AS stier, r.organization_id AS sorg
    FROM seo.keyword_placement_resolve(p_site_id, p_keyword_ids) r
    WHERE r.topic_id IS NOT NULL
  ),
  chain AS (
    SELECT DISTINCT t.id AS start_id, t.id AS node_id, t.name AS node_name,
           t.node_type AS node_kind, t.parent_id AS parent_id, 0 AS depth
    FROM seo.topic t
    WHERE t.deleted_at IS NULL
      AND t.id IN (SELECT p.tid FROM placed p)
    UNION ALL
    SELECT c.start_id, t.id, t.name, t.node_type, t.parent_id, c.depth + 1
    FROM chain c
    JOIN seo.topic t ON t.id = c.parent_id AND t.deleted_at IS NULL
    WHERE c.depth < 32
  ),
  -- The TOPMOST ancestor decides money vs authority (mirrors the resolver's
  -- `root_kind`, ORDER BY depth DESC).
  root AS (
    SELECT DISTINCT ON (c.start_id) c.start_id, c.node_id, c.node_name, c.node_kind
    FROM chain c
    ORDER BY c.start_id, c.depth DESC
  ),
  -- Root › … › parent, for showing where a service sits without a novel.
  path AS (
    SELECT c.start_id,
           string_agg(c.node_name, ' › ' ORDER BY c.depth DESC) AS lineage
    FROM chain c
    WHERE c.depth > 0
    GROUP BY c.start_id
  ),
  -- The NEAREST ancestor-or-self carrying this site's worth ruling (mirrors
  -- the resolver's `topic_base`, ORDER BY depth). Showing it is what keeps an
  -- inherited-worth placement from looking like an unvalued one.
  worth AS (
    SELECT DISTINCT ON (c.start_id) c.start_id, c.node_id, c.node_name, c.depth
    FROM chain c
    JOIN seo.site_topic_value stv
      ON stv.topic_id = c.node_id
     AND stv.site_id = p_site_id
     AND stv.deleted_at IS NULL
    ORDER BY c.start_id, c.depth
  )
  SELECT p.kid,
         p.tid,
         self.node_name,
         self.node_kind,
         r.node_id,
         r.node_name,
         r.node_kind,
         pa.lineage,
         p.aby,
         p.conf,
         p.note,
         COALESCE(w.depth = 0, false),
         w.node_id,
         w.node_name,
         -- WHOSE ruling this is. A surface that cannot say that cannot tell an
         -- inherited platform default from this organization's own decision.
         p.stier,
         p.sorg
  FROM placed p
  JOIN chain self ON self.start_id = p.tid AND self.depth = 0
  LEFT JOIN root r ON r.start_id = p.tid
  LEFT JOIN path pa ON pa.start_id = p.tid
  LEFT JOIN worth w ON w.start_id = p.tid;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_keyword_topics_for(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_topics_for(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION seo.gsc_keyword_topics_for(uuid, uuid[]) IS
  'The Offering column''s data for the page of keywords on screen (THE SCOPE RULE, <=2,000 ids): the winning placement from seo.keyword_placement_resolve, presented with the topic''s name, root, lineage, inherited worth, and the tier and organization whose ruling won.';

-- ---------------------------------------------------------------------------
-- 3. The self-test: plant a multi-tenant case, read it, roll it back.
-- ---------------------------------------------------------------------------
-- NOT client-callable: no door row, EXECUTE for service_role and postgres only.
-- Read by scripts/check-keyword-placement-tenancy.ts. It is VOLATILE because it
-- writes — and every row it writes is undone before it returns, by raising a
-- private error inside a nested block and catching it (PL/pgSQL rolls the
-- block's database changes back and KEEPS the variables, which is what carries
-- the readings out).
DROP FUNCTION IF EXISTS public.__keyword_placement_tenancy_conformance();

CREATE FUNCTION public.__keyword_placement_tenancy_conformance()
RETURNS TABLE(check_key text, ok boolean, severity text, detail jsonb)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'seo', 'web', 'iam', 'pg_temp'
AS $function$
DECLARE
  -- Two REAL organizations that own live sites, and the platform's system org.
  -- Real ones on purpose: a synthetic org would not exercise the tier the live
  -- census actually leaks through.
  c_org_a    CONSTANT uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  c_org_b    CONSTANT uuid := 'f9cb3e35-2a65-4f2a-8525-088d6551071c';
  c_org_sys  CONSTANT uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  c_marker   CONSTANT text := '__tenancy_probe';

  v_admin    uuid;
  v_site_a   uuid;
  v_site_b   uuid;
  v_site_c   uuid;
  v_org_c    uuid;
  v_topic_a  uuid;
  v_topic_b  uuid;
  v_topic_c  uuid;
  v_topic_d  uuid;

  v_phrase   text := c_marker || '_' || replace(gen_random_uuid()::text, '-', '');
  v_kw       uuid;
  v_row_d    uuid;
  v_primaries integer := 0;

  v_tf_a jsonb := '[]'::jsonb;
  v_tf_b jsonb := '[]'::jsonb;
  v_tf_c jsonb := '[]'::jsonb;
  v_rs_a jsonb := '[]'::jsonb;
  v_rs_b jsonb := '[]'::jsonb;
  v_rs_c jsonb := '[]'::jsonb;

  v_fixtures boolean := false;
  v_error    text;
  v_residue_kw integer := 0;
  v_residue_kt integer := 0;
BEGIN
  -- Fixtures. The reads below assert site access, and under a service-role
  -- session auth.uid() is NULL — so the probe borrows a platform admin.
  SELECT cua.user_id
    INTO v_admin
    FROM public.current_user_is_admin cua
    LEFT JOIN auth.users u ON u.id = cua.user_id
   WHERE cua.is_admin IS TRUE
   ORDER BY (u.email = 'admin@admin.com') DESC NULLS LAST, cua.user_id
   LIMIT 1;

  SELECT s.id INTO v_site_a FROM web.site s
   WHERE s.organization_id = c_org_a AND s.deleted_at IS NULL ORDER BY s.id LIMIT 1;
  SELECT s.id INTO v_site_b FROM web.site s
   WHERE s.organization_id = c_org_b AND s.deleted_at IS NULL ORDER BY s.id LIMIT 1;
  SELECT s.id, s.organization_id INTO v_site_c, v_org_c FROM web.site s
   WHERE s.organization_id NOT IN (c_org_a, c_org_b, c_org_sys) AND s.deleted_at IS NULL
   ORDER BY s.id LIMIT 1;

  SELECT t[1], t[2], t[3], t[4]
    INTO v_topic_a, v_topic_b, v_topic_c, v_topic_d
    FROM (SELECT array_agg(x.id ORDER BY x.id) AS t
            FROM (SELECT tp.id FROM seo.topic tp WHERE tp.deleted_at IS NULL ORDER BY tp.id LIMIT 4) x) y;

  v_fixtures := v_admin IS NOT NULL
            AND v_site_a IS NOT NULL AND v_site_b IS NOT NULL AND v_site_c IS NOT NULL
            AND v_topic_d IS NOT NULL;

  IF v_fixtures THEN
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

      INSERT INTO seo.keyword (organization_id, phrase, normalized_phrase, language)
      VALUES (c_org_sys, v_phrase, v_phrase, 'en')
      RETURNING id INTO v_kw;

      -- (a) organization A's own ruling, (b) organization B's, (c) the platform
      -- default, (d) a REMOVED site placement of A's site, demoted and not
      -- deleted — exactly what gsc_set_keyword_topic leaves behind.
      INSERT INTO seo.keyword_topic (organization_id, keyword_id, topic_id, is_primary, scope_tier, assigned_by, confidence)
      VALUES (c_org_a, v_kw, v_topic_a, true, 'organization', c_marker, 50);
      INSERT INTO seo.keyword_topic (organization_id, keyword_id, topic_id, is_primary, scope_tier, assigned_by, confidence)
      VALUES (c_org_b, v_kw, v_topic_b, true, 'organization', c_marker, 50);
      INSERT INTO seo.keyword_topic (organization_id, keyword_id, topic_id, is_primary, scope_tier, assigned_by, confidence)
      VALUES (c_org_sys, v_kw, v_topic_c, true, 'system', c_marker, 50);
      INSERT INTO seo.keyword_topic (organization_id, keyword_id, topic_id, is_primary, scope_tier, scope_site_id, assigned_by, confidence)
      VALUES (c_org_a, v_kw, v_topic_d, false, 'site', v_site_a, c_marker, 50)
      RETURNING id INTO v_row_d;

      SELECT count(*) INTO v_primaries
        FROM seo.keyword_topic kt
       WHERE kt.keyword_id = v_kw AND kt.is_primary AND kt.deleted_at IS NULL;

      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_tf_a
        FROM seo.gsc_keyword_topics_for(v_site_a, ARRAY[v_kw]::uuid[]) x;
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_tf_b
        FROM seo.gsc_keyword_topics_for(v_site_b, ARRAY[v_kw]::uuid[]) x;
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_tf_c
        FROM seo.gsc_keyword_topics_for(v_site_c, ARRAY[v_kw]::uuid[]) x;

      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_rs_a
        FROM seo.keyword_placement_resolve(v_site_a, ARRAY[v_kw]::uuid[]) x;
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_rs_b
        FROM seo.keyword_placement_resolve(v_site_b, ARRAY[v_kw]::uuid[]) x;
      SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_rs_c
        FROM seo.keyword_placement_resolve(v_site_c, ARRAY[v_kw]::uuid[]) x;

      -- Undo everything. The readings above live in PL/pgSQL variables, which
      -- an exception does NOT roll back.
      RAISE EXCEPTION 'keyword placement tenancy probe rollback' USING ERRCODE = 'MX001';
    EXCEPTION
      WHEN SQLSTATE 'MX001' THEN
        NULL;
      WHEN OTHERS THEN
        v_error := SQLSTATE || ': ' || SQLERRM;
    END;
  END IF;

  SELECT count(*) INTO v_residue_kw FROM seo.keyword k WHERE k.phrase = v_phrase;
  SELECT count(*) INTO v_residue_kt FROM seo.keyword_topic kt WHERE kt.assigned_by = c_marker;

  RETURN QUERY
  SELECT 'probe_fixtures_available',
         v_fixtures, 'error',
         jsonb_build_object(
           'why', 'The probe needs a platform admin, one live site in each of two real organizations, one live site in a third organization, and four live topics. Without them nothing was measured — which is not a pass.',
           'admin_found', v_admin IS NOT NULL,
           'site_a', v_site_a, 'site_b', v_site_b, 'site_c', v_site_c,
           'org_c', v_org_c,
           'topics_found', (v_topic_d IS NOT NULL))
  UNION ALL
  SELECT 'probe_ran_clean',
         v_fixtures AND v_error IS NULL, 'error',
         jsonb_build_object(
           'why', 'The plant-read-rollback block finished on its own private error and nothing else. Any other error means the reads below are missing, not passing.',
           'error', v_error)
  UNION ALL
  SELECT 'probe_planted_primaries',
         v_primaries >= 3, 'error',
         jsonb_build_object(
           'why', 'FALSIFIABILITY: a probe that silently planted nothing would find no cross-tenant leak and report green. Three primary rulings on the probe keyword (organization A, organization B, system) must exist while the reads happen.',
           'primary_rows_planted', v_primaries)
  UNION ALL
  SELECT 'one_row_per_site',
         coalesce(jsonb_array_length(v_tf_a) = 1
     AND jsonb_array_length(v_tf_b) = 1
     AND jsonb_array_length(v_tf_c) = 1
     AND jsonb_array_length(v_rs_a) = 1
     AND jsonb_array_length(v_rs_b) = 1
     AND jsonb_array_length(v_rs_c) = 1, false), 'error',
         jsonb_build_object(
           'why', 'One keyword has ONE meaning for a given site. Before the fix each of these sites got three rows for this keyword — its own, the other tenant''s, and the platform default.',
           'topics_for_rows', jsonb_build_array(jsonb_array_length(v_tf_a), jsonb_array_length(v_tf_b), jsonb_array_length(v_tf_c)),
           'resolver_rows', jsonb_build_array(jsonb_array_length(v_rs_a), jsonb_array_length(v_rs_b), jsonb_array_length(v_rs_c)))
  UNION ALL
  SELECT 'site_sees_own_organization_placement',
         coalesce((v_tf_a -> 0 ->> 'topic_id') = v_topic_a::text
     AND (v_rs_a -> 0 ->> 'topic_id') = v_topic_a::text
     AND (v_tf_b -> 0 ->> 'topic_id') = v_topic_b::text
     AND (v_rs_b -> 0 ->> 'topic_id') = v_topic_b::text, false), 'error',
         jsonb_build_object(
           'why', 'A site reads its OWN organization''s ruling and never the other organization''s. This is the defect itself: 935 of one org''s placements were being shown to the other org''s sites, and 382 the other way.',
           'expected_a', v_topic_a, 'got_a', v_tf_a -> 0 ->> 'topic_id',
           'expected_b', v_topic_b, 'got_b', v_tf_b -> 0 ->> 'topic_id')
  UNION ALL
  SELECT 'unplaced_organization_falls_back_to_system',
         coalesce((v_tf_c -> 0 ->> 'topic_id') = v_topic_c::text
     AND (v_rs_c -> 0 ->> 'topic_id') = v_topic_c::text
     AND (v_tf_c -> 0 ->> 'scope_tier') = 'system', false), 'error',
         jsonb_build_object(
           'why', 'An organization with no ruling of its own inherits the platform default — it does not inherit a stranger''s. 1,317 organization-tier primaries have no system row underneath them, and those were what unruled sites were being shown.',
           'expected', v_topic_c, 'got', v_tf_c -> 0 ->> 'topic_id',
           'scope_tier', v_tf_c -> 0 ->> 'scope_tier')
  UNION ALL
  SELECT 'demoted_row_never_wins',
         coalesce((v_tf_a -> 0 ->> 'topic_id') <> v_topic_d::text
     AND (v_rs_a -> 0 ->> 'topic_id') <> v_topic_d::text
     AND coalesce(v_rs_a -> 0 ->> 'row_id', '') <> coalesce(v_row_d::text, ''), false), 'error',
         jsonb_build_object(
           'why', 'gsc_set_keyword_topic removes a site placement by DEMOTING it to is_primary = false. A demoted row is the nearest rung on the ladder, so an unfiltered resolver keeps letting the removed topic govern and the removal is a no-op.',
           'demoted_topic', v_topic_d, 'demoted_row', v_row_d,
           'site_a_topic', v_tf_a -> 0 ->> 'topic_id',
           'site_a_row', v_rs_a -> 0 ->> 'row_id')
  UNION ALL
  SELECT 'topics_for_scope_matches_resolver',
         v_fixtures AND v_error IS NULL
     AND (v_tf_a -> 0 ->> 'scope_tier') IS NOT DISTINCT FROM (v_rs_a -> 0 ->> 'scope_tier')
     AND (v_tf_a -> 0 ->> 'scope_organization_id') IS NOT DISTINCT FROM (v_rs_a -> 0 ->> 'organization_id')
     AND (v_tf_b -> 0 ->> 'scope_tier') IS NOT DISTINCT FROM (v_rs_b -> 0 ->> 'scope_tier')
     AND (v_tf_b -> 0 ->> 'scope_organization_id') IS NOT DISTINCT FROM (v_rs_b -> 0 ->> 'organization_id')
     AND (v_tf_c -> 0 ->> 'scope_tier') IS NOT DISTINCT FROM (v_rs_c -> 0 ->> 'scope_tier')
     AND (v_tf_c -> 0 ->> 'scope_organization_id') IS NOT DISTINCT FROM (v_rs_c -> 0 ->> 'organization_id'), 'error',
         jsonb_build_object(
           'why', 'THERE IS ONE LADDER. gsc_keyword_topics_for is a presentation layer over keyword_placement_resolve; the moment the tier or owning organization it reports disagrees with the resolver, a second ladder has grown back.',
           'topics_for', jsonb_build_array(v_tf_a -> 0 ->> 'scope_tier', v_tf_b -> 0 ->> 'scope_tier', v_tf_c -> 0 ->> 'scope_tier'),
           'resolver', jsonb_build_array(v_rs_a -> 0 ->> 'scope_tier', v_rs_b -> 0 ->> 'scope_tier', v_rs_c -> 0 ->> 'scope_tier'))
  UNION ALL
  SELECT 'probe_left_no_residue',
         v_residue_kw = 0 AND v_residue_kt = 0, 'error',
         jsonb_build_object(
           'why', 'Everything the probe planted is rolled back before it returns. A probe keyword or placement left in seo.keyword / seo.keyword_topic would be a test writing into production data.',
           'probe_keywords_left', v_residue_kw,
           'probe_placements_left', v_residue_kt,
           'probe_phrase', v_phrase);
END;
$function$;

REVOKE ALL ON FUNCTION public.__keyword_placement_tenancy_conformance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.__keyword_placement_tenancy_conformance() FROM anon;
REVOKE ALL ON FUNCTION public.__keyword_placement_tenancy_conformance() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.__keyword_placement_tenancy_conformance() TO service_role;
GRANT EXECUTE ON FUNCTION public.__keyword_placement_tenancy_conformance() TO postgres;

COMMENT ON FUNCTION public.__keyword_placement_tenancy_conformance() IS
  'Liveness for THE one keyword-placement ladder: plants a multi-organization case on a throwaway keyword, reads it back through seo.gsc_keyword_topics_for and seo.keyword_placement_resolve as a platform admin, and rolls the plant back. Read by pnpm check:keyword-placement-tenancy. Not client-callable.';
