-- KW business guidelines — the per-site prose document every classification /
-- valuation agent MUST read before it rules on a keyword (D35, ratified
-- 2026-08-21: "the agent wouldn't know CRT is a horrible keyword unless
-- there's some document that guides it and we keep these things up to date").
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
--
-- Storage is a jsonb key on the site the whole marketing system already
-- anchors to (D24): web.site.settings.kw_guidelines. NOT a new table — there
-- is exactly one document per site, it has no lifecycle of its own, and the
-- intake wizard already proves the site row is where durable per-site business
-- truth lands (brand aliases on web.brand.profile, topic worth on
-- seo.site_topic_value). A table would buy nothing and fork the store.
--
-- ONE write path (D35). The write RPC merges the single key server-side, so a
-- guidelines save can never clobber a concurrent cms / content_plan /
-- media_standards settings write — the read-modify-write the client would
-- otherwise have to do (features/marketing/data/media-library.ts does exactly
-- that) is structurally impossible here.
--
-- Payload shape, versioned in place:
--   {"text": "...", "version": 3, "updated_at": "...", "updated_by": "<uuid>"}
-- updated_at/updated_by are stamped INSIDE the payload by the RPC — never by
-- the caller, never trusted from the client.

-- ── Read ───────────────────────────────────────────────────────────────────
-- Viewer-level: anyone who can see the site's keywords must be able to read
-- the doctrine those keywords were ruled under (a tier without its why must
-- never render — the same law, one level up).
CREATE OR REPLACE FUNCTION seo.gsc_site_kw_guidelines(p_site_id uuid)
RETURNS TABLE (
  guidelines text,
  guidelines_version int,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, web, auth, pg_temp
AS $fn$
DECLARE
  v_payload jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  SELECT s.settings -> 'kw_guidelines' INTO v_payload
  FROM web.site s
  WHERE s.id = p_site_id AND s.deleted_at IS NULL;

  IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object' THEN
    RETURN QUERY SELECT NULL::text, 0, NULL::timestamptz, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    NULLIF(v_payload ->> 'text', ''),
    COALESCE((v_payload ->> 'version')::int, 1),
    (v_payload ->> 'updated_at')::timestamptz,
    ids.uid,
    COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', au.email)
  FROM (SELECT (v_payload ->> 'updated_by')::uuid AS uid) ids
  LEFT JOIN auth.users au ON au.id = ids.uid;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_site_kw_guidelines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_site_kw_guidelines(uuid) TO authenticated, service_role;


-- ── Write — THE one path ───────────────────────────────────────────────────
-- Editor gate: the SAME predicate every other keyword-truth write uses. Not a
-- new security layer. Empty/blank text CLEARS the document (removes the key)
-- rather than storing an empty string that would inject a meaningless block
-- into every agent call.
CREATE OR REPLACE FUNCTION seo.gsc_set_site_kw_guidelines(
  p_site_id uuid,
  p_guidelines text
) RETURNS TABLE (
  guidelines text,
  guidelines_version int,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_name text
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, web, auth, pg_temp
AS $fn$
DECLARE
  v_text text := NULLIF(btrim(COALESCE(p_guidelines, '')), '');
  v_prev jsonb;
  v_next jsonb;
  v_now timestamptz := now();
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF v_text IS NOT NULL AND length(v_text) > 40000 THEN
    RAISE EXCEPTION 'gsc_guidelines_too_long: % characters (limit 40000)', length(v_text);
  END IF;

  SELECT s.settings -> 'kw_guidelines' INTO v_prev
  FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;

  IF v_text IS NULL THEN
    UPDATE web.site s
       SET settings = COALESCE(s.settings, '{}'::jsonb) - 'kw_guidelines',
           updated_at = v_now,
           updated_by = COALESCE(v_uid, s.updated_by)
     WHERE s.id = p_site_id AND s.deleted_at IS NULL;
    RETURN QUERY SELECT NULL::text, 0, NULL::timestamptz, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  v_next := jsonb_build_object(
    'text', v_text,
    'version', COALESCE((v_prev ->> 'version')::int, 0) + 1,
    'updated_at', to_jsonb(v_now),
    'updated_by', to_jsonb(v_uid)
  );

  UPDATE web.site s
     SET settings = jsonb_set(COALESCE(s.settings, '{}'::jsonb), '{kw_guidelines}', v_next, true),
         updated_at = v_now,
         updated_by = COALESCE(v_uid, s.updated_by)
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT v_text, (v_next ->> 'version')::int, v_now, v_uid,
         COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', au.email)
  FROM (SELECT v_uid AS uid) ids
  LEFT JOIN auth.users au ON au.id = ids.uid;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_set_site_kw_guidelines(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_set_site_kw_guidelines(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
