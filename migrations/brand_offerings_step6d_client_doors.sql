-- Brand-offerings cutover, step 6d: the canonical offering reads and writes
-- are reachable by a signed-in site member.
--
-- Plan of record: docs/db_rebuild/proposals/brand-offerings-cutover.md.
--
-- The 2026-08-25 migrations granted EXECUTE on these SECURITY DEFINER
-- functions, but none was declared in platform.client_callable_door, so the
-- client-grant guard (DD-169 / B-63) took the grant back. Measured 2026-09-14:
-- `authenticated` could execute none of the eight below. The screens cannot
-- move onto the canonical model until they can. Every one of them already
-- gates itself inside: reads call seo.gsc_assert_site_access, writes call
-- seo.gsc_assert_site_editor, and every write also checks the caller-supplied
-- organization against the site. None is reachable without an account.

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, reason, anonymous_callers, anonymous_purpose, declared_by)
SELECT d.schema_name, d.function_name, d.identity_args, d.reason, false, NULL, 'brand-offerings cutover 6d'
FROM (VALUES
  ('seo', 'gsc_keyword_offerings_for', 'p_site_id uuid, p_keyword_ids uuid[]',
   'SIGNED-IN door. The keyword workbench''s Offering column: this site''s own placements for the keywords on screen. Gated by seo.gsc_assert_site_access.'),
  ('web', 'site_offerings', 'p_site_id uuid',
   'SIGNED-IN door. The offerings this site explicitly exposes (D2). Gated by seo.gsc_assert_site_access.'),
  ('seo', 'gsc_set_keyword_offering', 'p_organization_id uuid, p_site_id uuid, p_keyword_ids uuid[], p_offering_id uuid, p_notes text',
   'SIGNED-IN door. The one keyword placement write (through seo.write_site_keyword_offering). Gated by seo.gsc_assert_site_editor plus organization and availability checks.'),
  ('web', 'offering_templates_for_site', 'p_site_id uuid, p_search text',
   'SIGNED-IN door. Platform offering suggestions, reachable only inside Add offering (D6). Gated by seo.gsc_assert_site_access.'),
  ('web', 'move_site_offering', 'p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_parent_id uuid, p_sibling_order uuid[]',
   'SIGNED-IN door. Reparent / reorder a brand offering the site exposes. Gated by seo.gsc_assert_site_editor plus organization and availability checks.'),
  ('web', 'site_offering_delete_impact', 'p_site_id uuid, p_offering_id uuid',
   'SIGNED-IN door. What removing an offering from this site would change, before anything is written. Gated by seo.gsc_assert_site_access.'),
  ('web', 'remove_site_offering', 'p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_replacement_offering_id uuid',
   'SIGNED-IN door. Remove an offering from this site, optionally moving its keywords to another. Gated by seo.gsc_assert_site_editor plus organization and availability checks.'),
  ('seo', 'gsc_offering_stats', 'p_site_id uuid, p_start date, p_end date',
   'SIGNED-IN door. Keywords, clicks and impressions per offering and value band for this site. Gated by seo.gsc_assert_site_access.')
) AS d(schema_name, function_name, identity_args, reason)
WHERE NOT EXISTS (
  SELECT 1 FROM platform.client_callable_door x
  WHERE x.schema_name = d.schema_name AND x.function_name = d.function_name
);

GRANT EXECUTE ON FUNCTION seo.gsc_keyword_offerings_for(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION web.site_offerings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_offering(uuid, uuid, uuid[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION web.offering_templates_for_site(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION web.move_site_offering(uuid, uuid, uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION web.site_offering_delete_impact(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION web.remove_site_offering(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_offering_stats(uuid, date, date) TO authenticated;

DO $do$
DECLARE r record; v_missing text := '';
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'seo.gsc_keyword_offerings_for(uuid,uuid[])',
      'web.site_offerings(uuid)',
      'seo.gsc_set_keyword_offering(uuid,uuid,uuid[],uuid,text)',
      'web.offering_templates_for_site(uuid,text)',
      'web.move_site_offering(uuid,uuid,uuid,uuid,uuid[])',
      'web.site_offering_delete_impact(uuid,uuid)',
      'web.remove_site_offering(uuid,uuid,uuid,uuid)',
      'seo.gsc_offering_stats(uuid,date,date)']) AS sig
  LOOP
    IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      v_missing := v_missing || ' ' || r.sig;
    END IF;
    IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'offering_door_anon: % is executable without an account', r.sig;
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'offering_door_grant_did_not_stick:%', v_missing;
  END IF;
END
$do$;
