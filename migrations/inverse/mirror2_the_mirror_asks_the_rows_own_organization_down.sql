-- MIRROR-2, the inverse of file 2: the std_select policy on custom.record put back, character
-- for character, to the text it carried before this lane — taken from the live catalogue at
-- 2026-09-20 14:5xZ and checked here by its own md5. Run it and the mirror computes the record
-- visible set for EVERY organization on the database again: a member's read of 100 records of
-- one organization costs 6.7 s instead of 0.96 s.
do $mirror2_down$
declare
  v_was constant text := $q$(((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT om.organization_id
   FROM iam.organization_member om
  WHERE ((om.user_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role])))))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('record'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'record'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'record'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'record'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'record'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'record'::text))) AND iam.has_access('record'::text, id, 'viewer'::permission_level))))$q$;
  v_qual text;
begin
  if pg_catalog.md5(v_was) <> 'a040a84df93b3ff2e8ebdbb0d260823f' then
    raise exception 'MIRROR-2 down: the text this inverse carries is not the text it was taken from.';
  end if;
  select p.qual into v_qual from pg_catalog.pg_policies p
   where p.schemaname = 'custom' and p.tablename = 'record' and p.policyname = 'std_select';
  if v_qual is null then
    raise exception 'MIRROR-2 down: custom.record has no std_select policy.';
  end if;
  if v_qual !~ 'record_visible_in_org' then
    raise exception 'MIRROR-2 down: this policy does not carry the MIRROR-2 arm; nothing to undo.';
  end if;
  execute pg_catalog.format('alter policy std_select on custom.record using (%s)', v_was);
end
$mirror2_down$;
