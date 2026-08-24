-- ============================================================================
-- THE GUARD MAY NOT BE STRICTER THAN THE POLICY (2026-08-24)
--
-- `seo.gsc_assert_site_access` / `gsc_assert_site_editor` are the one-shot
-- gates every SECURITY DEFINER GSC read/write asserts (they exist because
-- per-row RLS on 14M fact rows cost 12.8s and timed out — see
-- seo_gsc_rpc_security_definer.sql). They were written with only two allows:
-- the site's creator, or org access.
--
-- But EVERY table they stand in front of — seo.search_performance_daily,
-- seo.site_keyword_value, seo.keyword_topic, seo.site_geo_area — carries a
-- `platform_admin_all` policy AND `is_platform_admin()` as the first clause of
-- `std_select`. So a platform admin may read the raw rows and is REFUSED by the
-- guarded RPC over the same rows. The guard is stricter than the policy it
-- stands in for, which db-rules §6 names a defect: over-tightening is a defect,
-- and access never depends on the active org.
--
-- Found by an agent unable to open All Green Recycling (site d0aff5b6-…, an org
-- the admin account is not a member of): the workbench answered "0 keywords"
-- and a wall of 403s on the site the owner talks about most. This adds NO new
-- capability — it restores the bypass the tables already grant, in the ONE
-- place the fast path skipped.
-- ============================================================================

CREATE OR REPLACE FUNCTION seo.gsc_assert_site_access(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_created_by uuid;
BEGIN
  SELECT s.organization_id, s.created_by INTO v_org, v_created_by
  FROM web.site s WHERE s.id = p_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  -- Same first clause as every std_select on the tables behind this guard.
  IF public.is_platform_admin()
     OR v_created_by = (SELECT auth.uid())
     OR iam.has_org_access(v_org) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'gsc_site_access_denied: no access to site %', p_site_id
    USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_assert_site_editor(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_created_by uuid;
BEGIN
  SELECT s.created_by INTO v_created_by
  FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  -- Mirrors `platform_admin_all` + std_update on the same tables.
  IF public.is_platform_admin()
     OR v_created_by = (SELECT auth.uid())
     OR iam.has_access('web_site', p_site_id, 'editor'::public.permission_level) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'gsc_site_edit_denied: no editor access to site %', p_site_id
    USING ERRCODE = '42501';
END;
$function$;
