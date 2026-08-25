-- MSR-26: list the content_ir_kind_instance ids bound (via platform.associations)
-- to a site's saved keyword research. The generic assoc_for_targets RPC gates
-- reads on iam.org_readable(edge.organization_id) — plain ORG membership —
-- which is exactly the permissions-follow-the-org shape Arman's ruling
-- rejected ("permissions need to follow the site... automatically comes from
-- the parent"). This RPC instead gates on seo.fn_is_site_editor(p_site_id),
-- the SAME site-based authorization every other keyword-plane site read/write
-- in this feature already uses (site_keyword_value RLS, site_meaning_copy,
-- site_keyword_value_copy) — so a site editor never needs separate org
-- membership to see their own site's saved research.
CREATE OR REPLACE FUNCTION seo.fn_list_site_research_instance_ids(p_site_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  IF NOT seo.fn_is_site_editor(p_site_id) THEN
    RAISE EXCEPTION 'seo_research_site_denied: you do not have access to this site''s research'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(a.source_id) INTO v_ids
    FROM platform.associations_live a
   WHERE a.source_type = 'content_ir_kind_instance'
     AND a.target_type = 'web_site'
     AND a.target_id = p_site_id;

  RETURN coalesce(v_ids, '{}'::uuid[]);
END;
$function$;

GRANT EXECUTE ON FUNCTION seo.fn_list_site_research_instance_ids(uuid) TO authenticated, service_role;
