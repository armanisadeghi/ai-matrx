-- chair-step: inverse of nightwindow0930_custom_anon_hit_read_policy_carries_the_member_knob_guard.sql — puts back every policy on custom.anon_hit exactly as the clone (production's copy of 2026-09-29) held them, without the member-knob guard.
-- lane: NIGHT-WINDOW-0930
-- window-class: drops and recreates the eight policies on custom.anon_hit; ACCESS EXCLUSIVE plus the 23-relation supautils set, held to COMMIT; apply only with Arman watching
--
-- inverse of nightwindow0930_custom_anon_hit_read_policy_carries_the_member_knob_guard.sql

set local lock_timeout = '3s';

-- custom.anon_hit: 8 policies, byte-for-byte from the clone (copy of production 2026-09-29)
select iam.take_sign_in_freeze('custom.anon_hit'::regclass, 'inverse: restore custom.anon_hit policies');
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname = 'custom' and tablename = 'anon_hit' loop execute format('drop policy %I on custom.anon_hit', p.policyname); end loop; end $$;
create policy org_open_gate on custom.anon_hit as restrictive for all to anon, authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids)))));
create policy platform_admin_all on custom.anon_hit as permissive for all to authenticated
  using (((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)))
  with check (( SELECT is_platform_admin() AS is_platform_admin));
create policy platform_admin_read on custom.anon_hit as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
create policy std_delete on custom.anon_hit as permissive for delete to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_hit'::text, id, 'admin'::permission_level))));
create policy std_insert on custom.anon_hit as permissive for insert to authenticated
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND ( SELECT is_super_admin() AS is_super_admin))))));
create policy std_select on custom.anon_hit as permissive for select to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_admin_orgs() AS my_admin_orgs))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((organization_id IS NOT NULL) AND ((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND ((NOT custom.store_is_open(organization_id)) OR iam.member_lane_open(organization_id))) OR ((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id
   FROM iam.system_orgs so
  WHERE so.global_readable))) OR ((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('anon_hit'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids
UNION
 SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'anon_hit'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'anon_hit'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'anon_hit'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'anon_hit'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'anon_hit'::text))) AND iam.has_access('anon_hit'::text, id, 'viewer'::permission_level)))));
create policy std_update on custom.anon_hit as permissive for update to authenticated
  using ((((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_hit'::text, id, 'editor'::permission_level))))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) OR iam.has_access('anon_hit'::text, id, 'editor'::permission_level))));
create policy svc_all on custom.anon_hit as permissive for all to service_role
  using (true)
  with check (true);

